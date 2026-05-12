import { useEffect, useState } from 'react'
import {
    Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, Area, AreaChart
} from 'recharts'
import { useAuthenticatedFetch } from '../api/client'

function ForecastChart({ siteId, organismName }) {
    const [forecastData, setForecastData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const authenticatedFetch = useAuthenticatedFetch()

    useEffect(() => {
        const fetchForecast = async () => {
            setError(null)
            setLoading(true)
            try {
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
                setForecastData(data)
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        setForecastData(null)

        if (siteId && organismName) {
            fetchForecast()
        }
    }, [siteId, organismName])

    if (loading) return <p>Loading...</p>
    if (error) return <p style={{ color: 'red' }}>Error: {error}</p>
    if (!forecastData) return null

    const forecastSeries = Array.isArray(forecastData.forecast) ? forecastData.forecast : []
    const lowerSeries = Array.isArray(forecastData.confidence_lower) ? forecastData.confidence_lower : []
    const upperSeries = Array.isArray(forecastData.confidence_upper) ? forecastData.confidence_upper : []

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
                            <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
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
                        stroke="#82ca9d"
                        strokeDasharray="5 5"
                        name={`Forecast (${modelName.toUpperCase()})`}
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
            <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#555' }}>
                Forecasted values are shown by month because the current API does not return historical series with the forecast payload.
            </p>
        </div>
    )
}

export default ForecastChart