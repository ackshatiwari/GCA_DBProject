import pandas as pd

from backend.services.ml_service import forecast_ets


def test_forecast_ets_basic():
    """Basic ETS unit test: ensure forecast shape, CI and rmse are returned."""
    years = list(range(2010, 2019))  # 9 yearly points
    counts = [50, 55, 53, 60, 58, 62, 65, 63, 66]

    df = pd.DataFrame({
        "year": years,
        "total_count": counts,
    })

    forecast, lower, upper, rmse, meta = forecast_ets(df, steps=3)

    # Forecast length
    assert hasattr(forecast, '__len__')
    assert len(forecast) == 3

    # Confidence intervals are not returned for ETS in this implementation
    assert lower is None
    assert upper is None

    # RMSE should be a float and non-negative
    assert isinstance(rmse, float)
    assert rmse >= 0

    # Model metadata
    assert isinstance(meta, dict)
    assert meta.get('method') == 'ets'
