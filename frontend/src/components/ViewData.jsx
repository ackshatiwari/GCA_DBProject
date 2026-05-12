import { useEffect, useRef, useState } from 'react'
import { RechartsDevtools } from '@recharts/devtools';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import MultiSelect from './Multi-Select'
import ForecastChart from './ForecastChart'
import mapboxgl from 'mapbox-gl'
import { useAuthenticatedFetch } from '../api/client'
import '../styles/ViewData.css'
import 'mapbox-gl/dist/mapbox-gl.css'

const MACRO_TAXA_OPTIONS = [
  'worms',
  'flatworms',
  'leeches',
  'crayfish',
  'sowbugs',
  'scuds',
  'stoneflies',
  'mayflies',
  'dragonflies',
  'damselflies',
  'hellgrammites',
  'fishflies',
  'alderflies',
  'common_netspinners',
  'most_caddisflies',
  'beetles',
  'midges',
  'blackflies',
  'most_true_flies',
  'gilled_snails',
  'lunged_snails',
  'clams',
]


function ViewData() {
  const mapRef = useRef(null)
  const mapContainerRef = useRef(null)
  const markersRef = useRef([])
  const activeSiteMacroTrendsRef = useRef([])
  const [trendsDataState, setTrendsDataState] = useState([])
  const [trendsTitle, setTrendsTitle] = useState('')
  const [selectedMacro, setSelectedMacro] = useState('')
  const [selectedSiteId, setSelectedSiteId] = useState(null)
  const [forecastOrganism, setForecastOrganism] = useState('')
  const [coordinates, setCoordinates] = useState([])
  const [mapError, setMapError] = useState(null)
  const [selectedSpecies, setSelectedSpecies] = useState([])
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState(false)
  const [showForecast, setShowForecast] = useState(false)
  const authenticatedFetch = useAuthenticatedFetch()


  // Helper function to extract month from survey date
  const getSurveyMonth = (surveyDate) => {
    if (!surveyDate) {
      return 'Unknown'
    }
    return String(surveyDate).slice(0, 7)
  }

  // Function to build trends data for the selected macroinvertebrate
  const buildMonthlyTrendsData = (macroTaxaTrends, selectedMacro) => {
    const groupedData = {}
    // Group counts by month and macroinvertebrate
    macroTaxaTrends.forEach((entry) => {
      const month = getSurveyMonth(entry.survey_date)
      const count = Number(entry.count || 0)

      if (!groupedData[month]) {
        groupedData[month] = {
          total: 0,
          byMacro: {},
        }
      }

      groupedData[month].total += count
      groupedData[month].byMacro[entry.organism_name] = (groupedData[month].byMacro[entry.organism_name] || 0) + count
    })

    // Transform grouped data into an array sorted by month
    return Object.entries(groupedData)
      .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
      .map(([month, counts]) => ({
        month,
        count: selectedMacro ? (counts.byMacro[selectedMacro] || 0) : counts.total,
      }))
  }

  // applies the multi-select filters to trend charts
  const handleApplyFilters = () => {
    console.log('Selected species:', selectedSpecies)

    // Build combined data structure with all selected species and update state for declarative rendering
    const groupedData = {}
    activeSiteMacroTrendsRef.current.forEach((entry) => {
      const month = String(entry.survey_date).slice(0, 7)
      if (!groupedData[month]) {
        groupedData[month] = { month }
        selectedSpecies.forEach(species => {
          groupedData[month][species] = 0
        })
      }
      if (selectedSpecies.includes(entry.organism_name)) {
        groupedData[month][entry.organism_name] += Number(entry.count || 0)
      }
    })

    const trendsData = Object.values(groupedData).sort((a, b) => a.month.localeCompare(b.month))
    console.log('Combined trends data:', trendsData)

    setTrendsDataState(trendsData)
    setTrendsTitle(`Bugs counted per month for ${selectedSpecies.map(s => s.replaceAll('_', ' ')).join(', ')}`)
  }

  // Load site coordinates on component mount
  useEffect(() => {
    let isMounted = true

    const loadCoordinates = async () => {
      try {
        const response = await authenticatedFetch('/api/surveys/coords')
        if (!response.ok) {
          throw new Error('Failed to load site coordinates')
        }

        const data = await response.json()
        if (isMounted) {
          setCoordinates(data.survey_coords || [])
        }
      } catch {
        if (isMounted) {
          setMapError('Failed to load site coordinates.')
        }
      }
    }

    loadCoordinates()

    return () => {
      isMounted = false
    }
  }, [authenticatedFetch])


  // Initialize Mapbox map
  useEffect(() => {
    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

    if (!accessToken) {
      setMapError('Missing VITE_MAPBOX_ACCESS_TOKEN. Add it to frontend/.env before loading the map.')
      return undefined
    }

    mapboxgl.accessToken = accessToken
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-77.5726, 39.0595],
      zoom: 8,
    })

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      mapRef.current?.remove()
    }
  }, [])

  // Update markers when coordinates change
  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    coordinates.forEach((point) => {
      if (point.latitude == null || point.longitude == null) {
        return
      }

      const marker = new mapboxgl.Marker()
        .setLngLat([Number(point.longitude), Number(point.latitude)])
        .addTo(mapRef.current)

      marker.getElement().addEventListener('click', () => {


        // call the /surveys/site/{site_id}/details endpoint
            const fetchSiteDetails = async () => {
          try {
            const response = await authenticatedFetch(`/api/surveys/site/${point.site_id}/details`)
            if (!response.ok) {
              throw new Error('Failed to load site details')
            }
            const data = await response.json()
            document.getElementById('site-name').textContent = `Site Name: ${data.site_name || 'N/A'}`
            document.getElementById('site-description').textContent = `Description: ${data.site_desc || 'N/A'}`
            document.getElementById('site-stream-name').textContent = `Name of Stream: ${data.stream_name || 'N/A'}`
            document.getElementById('site-coordinates').textContent = `Coordinates: ${point.latitude}, ${point.longitude}`
            document.getElementById('site-survey-metadata').textContent = `Survey Metadata: Flow Rate - ${data.survey_metadata.flow_rate || 'N/A'}, Stream Depth - ${data.survey_metadata.stream_depth || 'N/A'}, Stream Width - ${data.survey_metadata.stream_width || 'N/A'}, Survey Date - ${data.survey_metadata.survey_date || 'N/A'}`;
            activeSiteMacroTrendsRef.current = data.macro_taxa_trends || []
                // compute trends for the currently selected macro (React state)
                const trendsData = buildMonthlyTrendsData(activeSiteMacroTrendsRef.current, selectedMacro)
                const titleText = selectedMacro
                  ? `Bugs counted per month for ${selectedMacro.replaceAll('_', ' ')}`
                  : 'Total bugs counted per month (all bug types)'
                setTrendsTitle(titleText)
                setTrendsDataState(trendsData)
                // set currently selected site id for forecast component
                setSelectedSiteId(point.site_id)
          } catch (error) {
            console.error('Error fetching site details:', error)
          }
        }

        fetchSiteDetails()
      })

      markersRef.current.push(marker)
    })
    

    return () => {}
  }, [coordinates])

  // When selected macro changes, recalculate trends
  useEffect(() => {
    if (activeSiteMacroTrendsRef.current.length === 0) {
      return
    }
    const trendsData = buildMonthlyTrendsData(activeSiteMacroTrendsRef.current, selectedMacro)
    const titleText = selectedMacro
      ? `Bugs counted per month for ${selectedMacro.replaceAll('_', ' ')}`
      : 'Total bugs counted per month (all bug types)'
    setTrendsTitle(titleText)
    setTrendsDataState(trendsData)
  }, [selectedMacro])


  return (
    <section className="view-data-shell">
      <header className="view-data-header">
        <h1>View Data</h1>
        <p>Click a site marker to open its water quality summary and charts.</p>
      </header>
      <div className="view-data-content">
        <div className="map-panel">
          <div className="map-canvas" id="map-container" ref={mapContainerRef} />
          {mapError ? <p className="map-error">{mapError}</p> : null}
        </div>
        <div className="data-panel-placeholder">
          <h2>Site Details</h2>
          <div className="site-row">
            <div className="site-label">Site</div>
            <div id="site-name" className="site-value"></div>
          </div>
          <div className="site-row">
            <div className="site-label">Stream</div>
            <div id="site-stream-name" className="site-value"></div>
          </div>
          <div className="site-row">
            <div className="site-label">Coordinates</div>
            <div id="site-coordinates" className="site-value"></div>
          </div>
          <div className="site-row">
            <div className="site-label">Description</div>
            <div id="site-description" className="site-value site-desc"></div>
          </div>
          <div className="site-row">
            <div className="site-label">Survey</div>
            <div id="site-survey-metadata" className="site-value"></div>
          </div>
          {/** Div for graphs for each macro organism, with a select dropdown for the water bug you want to view, with trends */}

        </div>
        <div className='forecast-panel'>
          <h2>View Forecasts</h2>
          <p>Click the button below to view a 5-month forecast for the selected site and macroinvertebrate.</p>
          <select id="forecast-macro-select" name="forecast-macro-select" className="forecast-macro-select" value={forecastOrganism} onChange={(e) => setForecastOrganism(e.target.value)}>
            <option value="">Select macroinvertebrate</option>
            {MACRO_TAXA_OPTIONS.map((macro) => (
              <option key={macro} value={macro}>
                {macro.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="view-forecast-btn"
            onClick={() => {
              const siteId = selectedSiteId || (coordinates.length > 0 ? coordinates[0].site_id : null)
              const organismName = forecastOrganism || null
              if (siteId && organismName) {
                setShowForecast(true)
              } else {
                alert('Please select a site and macroinvertebrate to view the forecast.')
              }
            }}
          >
            View Forecast
          </button>
          <div id="forecast-container" className="forecast-container">
            {showForecast && selectedSiteId && forecastOrganism && (
              <ForecastChart siteId={selectedSiteId} organismName={forecastOrganism} />
            )}
          </div>
        </div>
      </div>

      <section className="macro-trends-fullwidth">
        <div className="macro-trends-card">
          <div className="macro-header">
            <h2>Macroinvertebrate Trends</h2>
            <div className="macro-controls">
              <label htmlFor="macro-select" className="macro-select-label">Select Macroinvertebrate</label>
              <div className="macro-select-wrapper">
                <select
                  id="macro-select"
                  name="macro-select"
                  className="macro-select"
                  style={{ display: isMultiSelectOpen ? 'none' : 'block' }}
                  value={selectedMacro}
                  onChange={(e) => setSelectedMacro(e.target.value)}
                >
                  <option value="">All species (total)</option>
                  {MACRO_TAXA_OPTIONS.map((macro) => (
                    <option key={macro} value={macro}>
                      {macro.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>

                {isMultiSelectOpen && (
                  <MultiSelect
                    options={MACRO_TAXA_OPTIONS}
                    value={selectedSpecies}
                    onChange={setSelectedSpecies}
                  />

                )}
                {isMultiSelectOpen && (
                  <button
                    type="button"
                    className="apply-filters-btn"
                    onClick={handleApplyFilters}
                  >
                    Apply Filters
                  </button>
                  )}

                <p
                  className="macro-select-description"
                  onClick={() => setIsMultiSelectOpen(!isMultiSelectOpen)}
                  style={{ cursor: 'pointer' }}
                >
                  {isMultiSelectOpen ? 'Single-select' : 'Multi-select'}
                </p>
              </div>
            </div>
          </div>
          <div className="macro-trends-title">{trendsTitle || 'Total bugs counted per month (all bug types)'}</div>
          <div className="macro-trends-graph" aria-live="polite">
            {trendsDataState && trendsDataState.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={trendsDataState}>
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <CartesianGrid stroke="#aaa" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="count" stroke="#8884d8" />
                  <Tooltip />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p>No macroinvertebrate data available for this site.</p>
            )}
          </div>
        </div>
      </section>

    </section>
  )
}

export default ViewData