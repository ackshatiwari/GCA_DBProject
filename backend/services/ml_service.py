import psycopg2
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from sklearn.linear_model import LinearRegression
import numpy as np
from sklearn.metrics import mean_squared_error
from backend.app.logging_utils import get_file_logger


logger = get_file_logger("backend.services.ml_service", "forecasts.log")


def fetch_aggregated_trends(conn, site_id, organism_name):
    """Fetch and aggregate counts by month for forecasting."""

    query = """
    SELECT
      DATE_TRUNC('month', s.survey_date)::DATE AS month,
      SUM(m.count) AS total_count
    FROM public.macro_taxa m
    JOIN public.surveys s ON m.survey_id = s.id
    WHERE s.site_id::INTEGER = %s AND m.organism_name = %s
    GROUP BY DATE_TRUNC('month', s.survey_date)::DATE
    ORDER BY month;
    """

    df = pd.read_sql(query, conn, params=(site_id, organism_name))
    logger.info(f"Fetched {len(df)} aggregated monthly points for site_id {site_id}, organism {organism_name}")

    if df.empty:
        return df

    df["month"] = pd.to_datetime(df["month"])
    df = df.sort_values("month").set_index("month")
    full_month_index = pd.date_range(df.index.min(), df.index.max(), freq="MS")
    df = df.reindex(full_month_index)
    df["total_count"] = df["total_count"].interpolate(method="linear", limit_direction="both")
    df = df.reset_index().rename(columns={"index": "month"})

    return df


def forecast_linear(df, steps=5):
    X = np.arange(len(df)).reshape(-1, 1)
    y = df["total_count"].values

    model = LinearRegression()
    model.fit(X, y)

    future_months = np.arange(len(df), len(df) + steps).reshape(-1, 1)
    predictions = model.predict(future_months)

    insample_preds = model.predict(X)
    rmse = np.sqrt(mean_squared_error(y, insample_preds))

    model_meta = {
        "method": "linear",
        "coef": model.coef_.tolist() if hasattr(model, "coef_") else None,
        "intercept": float(model.intercept_) if hasattr(model, "intercept_") else None,
    }

    return predictions, None, None, float(rmse), model_meta


def forecast_ets(df, steps=5):
    months = pd.PeriodIndex(pd.to_datetime(df["month"]), freq="M")
    series = pd.Series(df["total_count"].values, index=months).sort_index()

    if len(series) < 2:
        return (
            np.array([]),
            None,
            None,
            None,
            {"method": "ets", "failed": True, "reason": "insufficient_data"},
        )

    try:
        model = ExponentialSmoothing(
            series,
            trend="add",
            seasonal=None,
            initialization_method="estimated",
        )
        fitted = model.fit(optimized=True)

        insample_preds = fitted.fittedvalues
        rmse = np.sqrt(mean_squared_error(series.values, insample_preds.values))

        forecast_mean = fitted.forecast(steps)

        model_meta = {
            "method": "ets",
            "trend": "add",
            "seasonal": None,
        }

        return (
            forecast_mean.values,
            None,
            None,
            float(rmse),
            model_meta,
        )
    except Exception:
        return (np.array([]), None, None, None, {"method": "ets", "failed": True})


# Backward-compatible alias for any code that still imports the old name.
forecast_arima = forecast_ets



