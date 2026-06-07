from fastapi import APIRouter, Depends, HTTPException
import psycopg2
from api.auth import require_permission
from pydantic import BaseModel
from app.logging_utils import get_file_logger


import os
import sys

from services.ml_service import fetch_aggregated_trends, forecast_linear, forecast_ets

router = APIRouter(prefix="/api", tags=["forecasting"])
logger = get_file_logger("backend.api.forecasting", "forecasts.log")

# Pydantic model for the forecasting request
class ForecastRequest(BaseModel):
    site_id: int
    organism_name: str
    steps: int = 5  # months to forecast
    method: str = "auto"  # 'auto' (default), or 'linear' or 'ets' (admin override)

class ForecastResponse(BaseModel):
    site_id: int
    organism_name: str
    forecast: list[float]
    confidence_lower: list[float] | None = None
    confidence_upper: list[float] | None = None
    model_params: dict | None = None # parameters of the fitted model
    rmse: float | None = None # Root Mean Square Error of the model fit

@router.post("/forecast", response_model=ForecastResponse)
def forecast_trends(
    request: ForecastRequest,
    claims: dict = Depends(require_permission("read:view_data")),
):
    site_id = request.site_id
    organism_name = request.organism_name
    database_url = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(database_url)
    method = request.method.lower()

    try:
        # fetch data via helper function
        df = fetch_aggregated_trends(conn, site_id, organism_name)
        logger.info(f"Data fetched for site {site_id}, organism {organism_name}: {len(df)} months")
        # if the length of the data is less than 3, we can't do a meaningful forecast
        if len(df) < 3:
            raise HTTPException(status_code=400, 
            detail=f"Insufficient data: {len(df)} months available, need ≥3")
        
        # Decide model selection
        if method == 'auto':
            chosen = 'linear' if len(df) < 10 else 'ets'
        elif method in ('linear', 'ets'):
            chosen = method
        else:
            raise HTTPException(status_code=400, detail="Invalid method. Choose 'linear', 'ets', or 'auto'.")

        # Run selected forecast function (each returns forecast, lower, upper, rmse, model_meta)
        if chosen == 'linear':
            forecast, confidence_lower, confidence_upper, rmse, model_meta = forecast_linear(df, steps=request.steps)
        else:
            forecast, confidence_lower, confidence_upper, rmse, model_meta = forecast_ets(df, steps=request.steps)

        # If ETS failed, fall back to linear
        if chosen == 'ets' and (model_meta is None or model_meta.get('failed')):
            forecast, confidence_lower, confidence_upper, rmse, model_meta = forecast_linear(df, steps=request.steps)

        
        # Log the forecast details
        logger.info(f"Forecast for site {site_id}, organism {organism_name} using {chosen.upper()}: forecast={forecast}, rmse={rmse}, model_meta={model_meta}")
    

        return ForecastResponse(
            site_id=request.site_id,
            organism_name=request.organism_name,
            forecast=forecast.tolist() if hasattr(forecast, 'tolist') else list(forecast),
            confidence_lower=confidence_lower.tolist() if hasattr(confidence_lower, 'tolist') else (list(confidence_lower) if confidence_lower is not None else None),
            confidence_upper=confidence_upper.tolist() if hasattr(confidence_upper, 'tolist') else (list(confidence_upper) if confidence_upper is not None else None),
            model_params=model_meta,
            rmse=float(rmse) if rmse is not None else None
        )

    finally:
        conn.close()

        

@router.post("/forecast/retrain-forecast-models")
def retrain_forecast_models(
    claims: dict = Depends(require_permission("write:csv_upload")),
):
    """Retrains each of the forecast models for all sites to ensure latest data"""
    import subprocess
    from pathlib import Path
    
    script_path = Path(__file__).parent.parent / "scripts" / "retrain_forecast_models.py"
    if not script_path.exists():
        logger.error(f"Retrain script not found at {script_path}")
        raise HTTPException(status_code=500, detail="Retrain script not found")
    
    try:
        # launch the script in the background
        subprocess.Popen([sys.executable, str(script_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        logger.info("Launched retrain_forecast_models.py script in background")
    except Exception as e:
        logger.error(f"Failed to launch retrain script: {e}")
        raise HTTPException(status_code=500, detail="Failed to launch retrain script")
    
    return {"message": "Retraining of forecast models has been initiated."}

    