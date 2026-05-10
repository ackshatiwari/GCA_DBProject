import pandas as pd
import numpy as np

from backend.services.ml_service import forecast_arima

def test_forecast_arima_basic():
    """Basic ARIMA unit test: ensure forecast shape, CI and rmse are returned."""
    years = list(range(2010, 2019))  # 9 yearly points
    counts = [50, 55, 53, 60, 58, 62, 65, 63, 66]

    df = pd.DataFrame({
        "year": years,
        "total_count": counts,
    })

    forecast, lower, upper, rmse, meta = forecast_arima(df, steps=3)


    # Forecast length
    assert hasattr(forecast, '__len__')
    assert len(forecast) == 3

    # Confidence intervals present and correct length
    assert lower is not None and len(lower) == 3
    assert upper is not None and len(upper) == 3

    # RMSE should be a float and non-negative
    assert isinstance(rmse, float)
    assert rmse >= 0

    # Model metadata
    assert isinstance(meta, dict)
    assert meta.get('method') == 'arima'
