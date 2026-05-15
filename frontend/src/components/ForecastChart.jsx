import { useEffect, useState } from 'react'
import {
    Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, Area, AreaChart
} from 'recharts'
import { useAuthenticatedFetch } from '../api/client'

function ForecastChart({ siteId, organismName, onForecast }) {

    // forecast data, loading, and error states
    const [forecastData, setForecastData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const authenticatedFetch = useAuthenticatedFetch()

    // Fetch forecast when siteId or organismName changes
    useEffect(() => {
        const fetchForecast = async () => {
            setError(null)
            setLoading(true)
            try {
                // Call the forecast API endpoint
                // changes the selected bug in the "Macroinvertibares Trends graph"


                const response = await authenticatedFetch('/api/forecast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        site_id: siteId,
                        organism_name: organismName,
                        steps: 5,
                        method: 'auto'
                    })
                })
                if (!response.ok) throw new Error('Forecast failed: ' + response.statusText)

                const data = await response.json()
                // store forecast data and pass to parent callback if provided
                setForecastData(data)

                // Call the onForecast callback with the raw data if it's a function
                if (typeof onForecast === 'function') {
                    try {
                        // This lets the parent react only after the forecast is actually ready.
                        onForecast(data, organismName)
                    } catch (e) {
                        // swallow errors from parent callback
                        console.warn('onForecast callback error', e)
                    }
                }
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        // reset forecast data when inputs change to avoid showing stale data during loading
        setForecastData(null)

        if (siteId && organismName) {
            // only fetch if we have both required inputs
            fetchForecast()
        }
    }, [siteId, organismName])

    if (loading) return <p>Loading...</p>
    if (error) return <p style={{ color: 'red' }}>Error: {error}</p>
    if (!forecastData) return null

    // prepare data for recharts, ensuring we have arrays to map over and handling missing confidence intervals gracefully
    const forecastSeries = Array.isArray(forecastData.forecast) ? forecastData.forecast : []
    const lowerSeries = Array.isArray(forecastData.confidence_lower) ? forecastData.confidence_lower : []
    const upperSeries = Array.isArray(forecastData.confidence_upper) ? forecastData.confidence_upper : []

    // create a unified data structure for the chart, filling in nulls for any missing confidence
    //  interval values so the chart can render without errors
    const chartData = forecastSeries.map((value, index) => ({
        step: `Month +${index + 1}`,
        forecast: value,
        lower: lowerSeries[index] ?? null,
        upper: upperSeries[index] ?? null,
    }))

    const modelName = forecastData.model_params?.method ?? 'unknown'
    const hasConfidenceBand = lowerSeries.length === forecastSeries.length && upperSeries.length === forecastSeries.length

    return (
        <div className="forecast-chart-shell">
            <h3>Forecast: {organismName.replaceAll('_', ' ')}</h3>
            <p>
                Model: {modelName} {forecastData.rmse != null ? `| RMSE: ${forecastData.rmse.toFixed(2)}` : ''}
            </p>
            <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#e31313" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#e31313" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="step" />
                    <YAxis allowDecimals={false} />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip
                        formatter={(value, name) => [value, name === 'forecast' ? 'Forecast' : name === 'upper' ? 'Upper CI' : 'Lower CI']}
                    />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="forecast"
                        stroke="#e31313"
                        strokeDasharray="5 5"
                        name={`Forecast () (${modelName.toUpperCase()})`}
                    />
                    {hasConfidenceBand ? (
                        <Area
                            type="monotone"
                            dataKey="upper"
                            fill="url(#colorForecast)"
                            stroke="none"
                            name="95% CI"
                        />
                    ) : null}
                </AreaChart>
            </ResponsiveContainer>
            
        </div>
    )
}

export default ForecastChart