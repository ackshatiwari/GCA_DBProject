import pandas as pd
import numpy as np

from backend.services.ml_service import forecast_linear


def test_forecast_linear_basic():
    """Basic linear regression unit test: ensure forecast shape, RMSE and metadata are returned."""
    years = list(range(2010, 2019))  # 9 yearly points
    counts = [50, 55, 53, 60, 58, 62, 65, 63, 66]

    df = pd.DataFrame({
        "year": years,
        "total_count": counts,
    })

    forecast, lower, upper, rmse, meta = forecast_linear(df, steps=3)

    # Forecast length
    assert hasattr(forecast, '__len__')
    assert len(forecast) == 3

    # Linear regression does not return confidence intervals
    assert lower is None
    assert upper is None

    # RMSE should be a float and non-negative
    assert isinstance(rmse, float)
    assert rmse >= 0

    # Model metadata
    assert isinstance(meta, dict)
    assert meta.get('method') == 'linear'
    assert 'coef' in meta
    assert 'intercept' in meta


def test_forecast_linear_monotonic():
    """Test that linear regression handles monotonic increasing trend."""
    years = list(range(2015, 2023))  # 8 points, steady increase
    counts = [10, 15, 20, 25, 30, 35, 40, 45]

    df = pd.DataFrame({
        "year": years,
        "total_count": counts,
    })

    forecast, lower, upper, rmse, meta = forecast_linear(df, steps=2)

    # Forecast should continue the trend (increasing)
    assert forecast[0] > counts[-1]
    assert forecast[1] > forecast[0]

    # RMSE should be very low for a perfect linear trend
    assert rmse < 1.0
