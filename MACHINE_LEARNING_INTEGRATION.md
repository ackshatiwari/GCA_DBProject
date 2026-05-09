# Machine Learning Integration Guide

## Linear Regression & ARIMA Forecasting for Macroinvertebrate Trends

This document outlines how to integrate time-series forecasting models (Linear Regression and ARIMA) into the Goose Creek Association database to predict future organism population trends and identify ecological patterns.

---

## 1. Data Preparation Pipeline

### 1.1 Aggregation Strategy

The current database stores individual surveys with organism counts. To build a time-series model, data must be aggregated into regular intervals:

**Temporal Grouping Options:**
- **By Site + Species + Year**: `(site_id, organism_name, survey_year) → count`
  - Use for single-site, single-species forecasts
  - Typical time series: 5–15 annual data points per site/species pair
  
- **By Site + Year**: `(site_id, survey_year) → total_organism_count`
  - Use for overall site health trends
  - More data points, less noise

- **By Species + Year**: `(organism_name, survey_year) → count_across_all_sites`
  - Regional species trend (aggregate health indicator)

**Query Pattern (PostgreSQL / Neon):**
```sql
SELECT 
  site_id,
  organism_name,
  EXTRACT(YEAR FROM survey_date)::INT AS year,
  SUM(count) AS total_count
FROM survey_organisms
GROUP BY site_id, organism_name, EXTRACT(YEAR FROM survey_date)
ORDER BY site_id, organism_name, year;
```

### 1.2 Handling Missing Data

Time-series models assume regular intervals. After aggregation, gaps will appear (e.g., missing 2015 for Site X):

**Strategies:**
- **Forward fill**: Replicate last known value
- **Interpolation**: Linear interpolation between years
- **Zero-fill**: Assume zero count if no surveys that year (risky for population analysis)
- **Drop short series**: Exclude site/species pairs with <3 data points

**Implementation in Python:**
```python
import pandas as pd

# After aggregation query
df = pd.read_sql(query, conn)
df = df.pivot_table(index='year', columns=['site_id', 'organism_name'], 
                     values='total_count', fill_value=0)
df = df.interpolate(method='linear', axis=0)  # Linear fill for gaps
```

### 1.3 Stationarity Check

ARIMA requires stationary time-series (mean/variance constant over time). Linear regression is flexible but better with stationary data.

**Test stationarity (Augmented Dickey-Fuller):**
```python
from statsmodels.tsa.stattools import adfuller

def check_stationarity(series):
    result = adfulter(series.dropna())
    print(f"ADF p-value: {result[1]}")
    if result[1] <= 0.05:
        print("✓ Series is stationary")
    else:
        print("✗ Series is non-stationary; apply differencing")
        return series.diff().dropna()
```

**If non-stationary, apply differencing:**
```python
# First-order differencing
df_diff = df.diff().dropna()
```

---

## 2. Linear Regression Forecasting

### 2.1 Model Architecture

Linear regression predicts counts as a linear function of time, optionally including covariates.

**Basic univariate model:**
```
count(t) = β₀ + β₁ * year + ε
```

**With covariates:**
```
count(t) = β₀ + β₁ * year + β₂ * flow_rate(t) + β₃ * temperature(t) + ε
```

### 2.2 Implementation

**Minimal scikit-learn example:**
```python
from sklearn.linear_model import LinearRegression
import numpy as np

# Single site, single species
X = np.array(years).reshape(-1, 1)  # Features: year
y = np.array(counts)                 # Target: organism count

model = LinearRegression()
model.fit(X, y)

# Forecast next 3 years
future_years = np.array([2024, 2025, 2026]).reshape(-1, 1)
predictions = model.predict(future_years)
```

**With lag features & covariates:**
```python
import pandas as pd

# Build feature matrix
features = pd.DataFrame({
    'year': df['year'],
    'lag_1': df['count'].shift(1),      # Previous year count
    'lag_2': df['count'].shift(2),
    'flow_rate': df['flow_rate'],       # Covariate
})
features = features.dropna()

X = features.iloc[:, 1:]  # Exclude year for features
y = df['count'].iloc[2:]  # Align with features

model = LinearRegression()
model.fit(X, y)
```

### 2.3 Evaluation Metrics

**For regression forecasts:**
- **Mean Absolute Error (MAE)**: Average absolute difference between predicted & actual
  ```
  MAE = (1/n) * Σ|y_true - y_pred|
  ```
- **Root Mean Squared Error (RMSE)**: Penalizes large errors more
  ```
  RMSE = √[(1/n) * Σ(y_true - y_pred)²]
  ```
- **R² Score**: Proportion of variance explained (0–1, higher is better)
  ```
  R² = 1 - (SS_res / SS_tot)
  ```

**Implementation:**
```python
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

mae = mean_absolute_error(y_test, predictions)
rmse = np.sqrt(mean_squared_error(y_test, predictions))
r2 = r2_score(y_test, predictions)
```

---

## 3. ARIMA Forecasting

### 3.1 ARIMA Components

ARIMA(p, d, q) combines three components:
- **p (AR)**: Auto-Regressive order (past values influence future)
- **d (I)**: Differencing order (make series stationary)
- **q (MA)**: Moving-Average order (past errors influence future)

**Common parameter ranges:**
- p: 0–3 (typical: 1–2)
- d: 0–2 (0 if stationary, 1–2 if non-stationary)
- q: 0–3 (typical: 0–2)

### 3.2 Parameter Selection

**Auto-selection using AIC:**
```python
from pmdarima import auto_arima

# Find best ARIMA parameters
auto_model = auto_arima(
    series, 
    start_p=0, 
    max_p=3,
    start_q=0, 
    max_q=3,
    start_d=0, 
    max_d=2,
    seasonal=False,
    stepwise=True,
    trace=True,
    error_action='ignore'
)
print(auto_model.order)  # Returns (p, d, q)
```

**Manual grid search:**
```python
from itertools import product
from statsmodels.tsa.arima.model import ARIMA

best_aic = np.inf
best_order = None

for p, d, q in product(range(4), range(3), range(3)):
    try:
        model = ARIMA(series, order=(p, d, q))
        fitted = model.fit()
        if fitted.aic < best_aic:
            best_aic = fitted.aic
            best_order = (p, d, q)
    except:
        continue

print(f"Best order: {best_order}, AIC: {best_aic}")
```

### 3.3 Model Training & Forecasting

**Fit and forecast:**
```python
from statsmodels.tsa.arima.model import ARIMA

model = ARIMA(series, order=(1, 1, 1))
fitted_model = model.fit()

# Forecast 5 periods ahead
forecast = fitted_model.get_forecast(steps=5)
forecast_df = forecast.conf_int(alpha=0.05)  # 95% CI
forecast_df['forecast'] = forecast.predicted_mean

print(forecast_df)
```

**With seasonal component (SARIMA):**
```python
from statsmodels.tsa.statespace.sarimax import SARIMAX

# SARIMA(p,d,q)(P,D,Q,s)
# s = seasonal period (e.g., 12 for monthly, 4 for quarterly)
model = SARIMAX(
    series, 
    order=(1, 1, 1), 
    seasonal_order=(1, 1, 1, 4)
)
fitted = model.fit()
forecast = fitted.get_forecast(steps=8)
```

### 3.4 Diagnostics

**Check model residuals for randomness:**
```python
fitted_model.plot_diagnostics(figsize=(12, 8))
plt.show()

# Check for autocorrelation
from statsmodels.stats.diagnostic import acorr_ljungbox
print(acorr_ljungbox(fitted_model.resid, lags=[10]))  # p > 0.05 = good
```

---

## 4. Backend Integration

### 4.1 New FastAPI Endpoints

**Forecast endpoint:**
```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import numpy as np
from statsmodels.tsa.arima.model import ARIMA

router = APIRouter(prefix="/api", tags=["forecasting"])

class ForecastRequest(BaseModel):
    site_id: int
    organism_name: str
    steps: int = 5  # years to forecast
    method: str = "linear"  # or "arima"

class ForecastResponse(BaseModel):
    site_id: int
    organism_name: str
    forecast: list[float]
    confidence_lower: list[float] | None = None
    confidence_upper: list[float] | None = None
    model_params: dict
    rmse: float

@router.post("/forecast", response_model=ForecastResponse)
def forecast_trends(
    req: ForecastRequest,
    claims: dict = Depends(require_permission("read:surveys"))
):
    # Fetch historical data from DB
    # Aggregate by year
    # Train model
    # Generate forecast
    # Return results
    pass
```

### 4.2 Database Query for Aggregation

**Create a helper function in `backend/services/ml_service.py`:**
```python
import psycopg2
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
from sklearn.linear_model import LinearRegression

def fetch_aggregated_trends(conn, site_id, organism_name):
    """Fetch & aggregate counts by year for forecasting."""
    query = """
    SELECT 
      EXTRACT(YEAR FROM survey_date)::INT AS year,
      SUM(count) AS total_count
    FROM survey_organisms
    WHERE site_id = %s AND organism_name = %s
    GROUP BY EXTRACT(YEAR FROM survey_date)
    ORDER BY year;
    """
    df = pd.read_sql(query, conn, params=(site_id, organism_name))
    return df

def forecast_linear(df, steps=5):
    """Simple linear regression forecast."""
    X = df['year'].values.reshape(-1, 1)
    y = df['total_count'].values
    
    model = LinearRegression()
    model.fit(X, y)
    
    future_years = np.arange(df['year'].max() + 1, 
                             df['year'].max() + steps + 1).reshape(-1, 1)
    predictions = model.predict(future_years)
    
    return predictions, None, None

def forecast_arima(df, steps=5, order=(1, 1, 1)):
    """ARIMA forecast with confidence intervals."""
    series = df.set_index('year')['total_count']
    
    model = ARIMA(series, order=order)
    fitted = model.fit()
    
    forecast = fitted.get_forecast(steps=steps)
    forecast_df = forecast.conf_int(alpha=0.05)
    
    return (forecast_df['mean'].values, 
            forecast_df.iloc[:, 0].values,  # Lower CI
            forecast_df.iloc[:, 1].values)  # Upper CI
```

### 4.3 Endpoint Implementation

```python
@router.post("/forecast", response_model=ForecastResponse)
def forecast_trends(
    req: ForecastRequest,
    claims: dict = Depends(require_permission("read:surveys"))
):
    database_url = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(database_url)
    
    try:
        # Fetch data
        df = fetch_aggregated_trends(conn, req.site_id, req.organism_name)
        
        if len(df) < 3:
            raise HTTPException(status_code=400, 
                detail=f"Insufficient data: {len(df)} years available, need ≥3")
        
        # Forecast
        if req.method == "linear":
            forecast, ci_lower, ci_upper = forecast_linear(df, req.steps)
            model_params = {"method": "linear"}
        else:
            forecast, ci_lower, ci_upper = forecast_arima(df, req.steps)
            model_params = {"method": "arima"}
        
        # Calculate RMSE on training data
        from sklearn.metrics import mean_squared_error
        rmse = np.sqrt(mean_squared_error(df['total_count'], 
                                          fitted.fittedvalues))
        
        return ForecastResponse(
            site_id=req.site_id,
            organism_name=req.organism_name,
            forecast=forecast.tolist(),
            confidence_lower=ci_lower.tolist() if ci_lower else None,
            confidence_upper=ci_upper.tolist() if ci_upper else None,
            model_params=model_params,
            rmse=rmse
        )
    finally:
        conn.close()
```

---

## 5. Frontend Integration

### 5.1 New Chart Component for Forecasts

**Create `frontend/src/components/ForecastChart.jsx`:**
```jsx
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
         ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts'
import { useAuthenticatedFetch } from '../api/client'

function ForecastChart({ siteId, organismName }) {
  const [forecastData, setForecastData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const authenticatedFetch = useAuthenticatedFetch()

  useEffect(() => {
    const fetchForecast = async () => {
      setLoading(true)
      try {
        const response = await authenticatedFetch('/api/forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_id: siteId,
            organism_name: organismName,
            steps: 5,
            method: 'arima'
          })
        })
        if (!response.ok) throw new Error('Forecast failed')
        
        const data = await response.json()
        setForecastData(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (siteId && organismName) fetchForecast()
  }, [siteId, organismName])

  if (loading) return <p>Loading forecast...</p>
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>
  if (!forecastData) return null

  const chartData = [
    ...forecastData.historical,  // Past data from DB
    ...forecastData.forecast.map((val, i) => ({
      year: new Date().getFullYear() + i + 1,
      forecast: val,
      lower: forecastData.confidence_lower?.[i],
      upper: forecastData.confidence_upper?.[i],
      isForecasted: true
    }))
  ]

  return (
    <div>
      <h3>Forecast: {organismName.replaceAll('_', ' ')}</h3>
      <p>RMSE: {forecastData.rmse.toFixed(2)}</p>
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="year" />
          <YAxis />
          <CartesianGrid strokeDasharray="3 3" />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="count" stroke="#8884d8" 
                name="Observed" />
          {forecastData.forecast && (
            <>
              <Line type="monotone" dataKey="forecast" stroke="#82ca9d" 
                    strokeDasharray="5 5" name="Forecast (ARIMA)" />
              <Area type="monotone" dataKey="upper" fill="url(#colorForecast)" 
                    stroke="none" name="95% CI" />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default ForecastChart
```

### 5.2 Integration into ViewData Component

**Add forecast toggle to site details panel:**
```jsx
const [showForecast, setShowForecast] = useState(false)

// In JSX:
{showForecast && selectedSiteId && (
  <ForecastChart 
    siteId={selectedSiteId} 
    organismName={selectedOrganismName}
  />
)}
```

---

## 6. Model Persistence & Versioning

### 6.1 Save Trained Models

**Pickle models for production use (avoid retraining per request):**
```python
import pickle
import os

def save_model(model, site_id, organism_name, method):
    """Save trained model to disk."""
    model_dir = 'backend/ml_models'
    os.makedirs(model_dir, exist_ok=True)
    
    path = f"{model_dir}/{method}_{site_id}_{organism_name}.pkl"
    with open(path, 'wb') as f:
        pickle.dump(model, f)
    return path

def load_model(site_id, organism_name, method):
    """Load pre-trained model."""
    path = f"backend/ml_models/{method}_{site_id}_{organism_name}.pkl"
    if os.path.exists(path):
        with open(path, 'rb') as f:
            return pickle.load(f)
    return None
```

### 6.2 Model Metadata Database Table

**Track model performance & retraining dates:**
```sql
CREATE TABLE ml_models (
  id SERIAL PRIMARY KEY,
  site_id INT,
  organism_name VARCHAR(50),
  method VARCHAR(20),  -- 'linear' or 'arima'
  model_params JSONB,
  rmse FLOAT,
  r2_score FLOAT,
  trained_on TIMESTAMP,
  data_points INT,
  path VARCHAR(255)
);
```

---

## 7. Scheduled Retraining

### 7.1 Celery / APScheduler Task

**Set up background job to retrain models monthly:**
```python
from apscheduler.schedulers.background import BackgroundScheduler
import psycopg2

def retrain_all_models():
    """Retrain all ARIMA/Linear models with latest data."""
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    
    # Get all active site/organism pairs
    query = """
    SELECT DISTINCT site_id, organism_name 
    FROM survey_organisms 
    WHERE count > 0
    """
    df = pd.read_sql(query, conn)
    
    for _, row in df.iterrows():
        agg_data = fetch_aggregated_trends(conn, row['site_id'], 
                                           row['organism_name'])
        if len(agg_data) >= 3:
            _, _, _, rmse = forecast_arima(agg_data)
            save_model_metadata(row['site_id'], row['organism_name'], 
                              'arima', rmse)

scheduler = BackgroundScheduler()
scheduler.add_job(retrain_all_models, 'cron', day_of_week='mon', hour=2)
scheduler.start()
```

---

## 8. Error Handling & Edge Cases

### 8.1 Insufficient Data

```python
if len(df) < 3:
    raise HTTPException(status_code=400, 
        detail=f"Need ≥3 data points; {len(df)} available")
```

### 8.2 Non-Converging Models

```python
try:
    fitted = model.fit()
except:
    logger.warning(f"ARIMA failed for {site_id}/{organism_name}; " +
                   "falling back to linear regression")
    forecast, _, _ = forecast_linear(df, steps)
```

### 8.3 Extreme Predictions

```python
# Cap unrealistic forecasts
max_historical = df['total_count'].max()
forecast = np.clip(forecast, 0, max_historical * 2)
```

