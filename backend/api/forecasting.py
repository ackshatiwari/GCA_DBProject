from fastapi import APIRouter, Depends, HTTPException
import psycopg2
from backend.api.auth import require_permission
from pydantic import BaseModel
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from sklearn.metrics import mean_squared_error
from backend.app.logging_utils import get_file_logger


import os

from backend.services.ml_service import fetch_aggregated_trends, forecast_linear, forecast_arima

router = APIRouter(prefix="/api", tags=["forecasting"])
logger = get_file_logger("backend.api.forecasting", "forecasts.log")

# Pydantic model for the forecasting request
class ForecastRequest(BaseModel):
    site_id: int
    organism_name: str
    steps: int = 5  # years to forecast
    method: str = "auto"  # 'auto' (default), or 'linear' or 'arima' (admin override)

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
        logger.info(f"Data fetched for site {site_id}, organism {organism_name}: {len(df)} years")
        # if the length of the data is less than 3, we can't do a meaningful forecast
        if len(df) < 3:
            raise HTTPException(status_code=400, 
                detail=f"Insufficient data: {len(df)} years available, need ≥3")
        
        # Decide model selection
        if method == 'auto':
            chosen = 'linear' if len(df) < 8 else 'arima'
        elif method in ('linear', 'arima'):
            chosen = method
        else:
            raise HTTPException(status_code=400, detail="Invalid method. Choose 'linear', 'arima', or 'auto'.")

        # Run selected forecast function (each returns forecast, lower, upper, rmse, model_meta)
        if chosen == 'linear':
            forecast, confidence_lower, confidence_upper, rmse, model_meta = forecast_linear(df, steps=request.steps)
        else:
            forecast, confidence_lower, confidence_upper, rmse, model_meta = forecast_arima(df, steps=request.steps)

        # If ARIMA failed, fall back to linear
        if chosen == 'arima' and (model_meta is None or model_meta.get('failed')):
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

        
