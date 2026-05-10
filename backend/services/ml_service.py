import psycopg2
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
from sklearn.linear_model import LinearRegression
import numpy as np
from pmdarima import auto_arima
from sklearn.metrics import mean_squared_error


def fetch_aggregated_trends(conn, site_id, organism_name):
    """Fetch & aggregate counts by year for forecasting."""
    
    query = """
    SELECT 
      EXTRACT(YEAR FROM survey_date)::INT AS year,
      SUM(count) AS total_count
    FROM public.macro_taxa
    WHERE site_id = %s AND organism_name = %s
    GROUP BY EXTRACT(YEAR FROM survey_date)
    ORDER BY year;
    """

    df = pd.read_sql(query, conn, params=(site_id, organism_name))
    return df

def forecast_linear(df, steps=5):
    X = df['year'].values.reshape(-1, 1)
    y = df['total_count'].values

    model = LinearRegression()
    model.fit(X, y)

    # Forecast future years
    future_years = np.arange(
        df['year'].max() + 1,
        df['year'].max() + steps + 1
    ).reshape(-1, 1)

    predictions = model.predict(future_years)

    insample_preds = model.predict(X)
    rmse = np.sqrt(mean_squared_error(y, insample_preds))

    model_meta = {
        'method': 'linear',
        'coef': model.coef_.tolist() if hasattr(model, 'coef_') else None,
        'intercept': float(model.intercept_) if hasattr(model, 'intercept_') else None,
    }

    return predictions, None, None, float(rmse), model_meta

def forecast_arima(df, steps=5):
    series = df.set_index('year')['total_count']

    try:
        auto = auto_arima(series, seasonal=False, trace=False, error_action='ignore', suppress_warnings=True)
        order = getattr(auto, 'order', (1, 1, 1))
    except Exception:
        order = (1, 1, 1)

    try:
        sm_model = ARIMA(series, order=order)
        fitted = sm_model.fit()

        # In-sample predictions and RMSE
        insample_preds = fitted.predict(start=series.index[0], end=series.index[-1])
        rmse = np.sqrt(mean_squared_error(series.values, insample_preds.values))

        forecast_res = fitted.get_forecast(steps=steps)
        forecast_mean = forecast_res.predicted_mean
        ci = forecast_res.conf_int(alpha=0.05)

        model_meta = {'method': 'arima', 'order': order}

        return (forecast_mean.values,
                ci.iloc[:, 0].values,
                ci.iloc[:, 1].values,
                float(rmse),
                model_meta)
    except Exception:
        # Fallback: return empty forecast and indicate failure via model_meta
        return (np.array([]), None, None, None, {'method': 'arima', 'order': order, 'failed': True})

