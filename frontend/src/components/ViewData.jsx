import { useEffect, useRef, useState } from 'react'
import { RechartsDevtools } from '@recharts/devtools';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import MultiSelect from './Multi-Select'
import { createRoot } from 'react-dom/client'
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
  const chartRootRef = useRef(null)
  const activeSiteMacroTrendsRef = useRef([])
  const [coordinates, setCoordinates] = useState([])
  const [mapError, setMapError] = useState(null)
  const [selectedSpecies, setSelectedSpecies] = useState([])
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState(false)
  const authenticatedFetch = useAuthenticatedFetch()


  // applies the multi-select filters to trend charts
  const handleApplyFilters = () => {
    console.log('Selected species:', selectedSpecies)

    const chartContainer = document.getElementById('macro-trends')
    const chartTitle = document.getElementById('macro-trends-title')
    if (!chartContainer || !chartTitle) {
      return
    }

    // Build combined data structure with all selected species
    const groupedData = {}
    activeSiteMacroTrendsRef.current.forEach((entry) => {
      const year = String(entry.survey_date).slice(0, 4)
      if (!groupedData[year]) {
        groupedData[year] = { year }
        selectedSpecies.forEach(species => {
          groupedData[year][species] = 0
        })
      }
      if (selectedSpecies.includes(entry.organism_name)) {
        groupedData[year][entry.organism_name] += Number(entry.count || 0)
      }
    })

    const trendsData = Object.values(groupedData).sort((a, b) => Number(a.year) - Number(b.year))
    console.log('Combined trends data:', trendsData)

    chartTitle.textContent = `Bugs counted per year for ${selectedSpecies.map(s => s.replaceAll('_', ' ')).join(', ')}`

    // Unmount old root and clear
    if (chartRootRef.current) {
      chartRootRef.current.unmount()
      chartRootRef.current = null
    }

    chartContainer.innerHTML = ''
    chartRootRef.current = createRoot(chartContainer)

    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffa726', '#66bb6a', '#ec407a', '#29b6f6']
    
    const lineChart = (
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={trendsData}>
          <XAxis dataKey="year" />
          <YAxis allowDecimals={false} />
          <CartesianGrid stroke="#aaa" strokeDasharray="5 5" />
          {selectedSpecies.map((species, idx) => (
            <Line key={species} type="monotone" dataKey={species} stroke={colors[idx % colors.length]} name={species.replaceAll('_', ' ')} />
          ))}
          <Tooltip />
        </LineChart>
      </ResponsiveContainer>
    )

    chartRootRef.current.render(lineChart)
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
      chartRootRef.current?.unmount()
      chartRootRef.current = null
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

    // Helper function to extract year from survey date
    const getSurveyYear = (surveyDate) => {
      if (!surveyDate) {
        return 'Unknown'
      }

      return String(surveyDate).slice(0, 4)
    }

    // Function to build trends data for the selected macroinvertebrate
    const buildYearlyTrendsData = (macroTaxaTrends, selectedMacro) => {
      const groupedData = {}
      // Group counts by year and macroinvertebrate
      macroTaxaTrends.forEach((entry) => {
        const year = getSurveyYear(entry.survey_date)
        const count = Number(entry.count || 0)

        if (!groupedData[year]) {
          groupedData[year] = {
            total: 0,
            byMacro: {},
          }
        }

        groupedData[year].total += count
        groupedData[year].byMacro[entry.organism_name] = (groupedData[year].byMacro[entry.organism_name] || 0) + count
      })

      // Transform grouped data into an array sorted by year
      return Object.entries(groupedData)
        .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB)) // Sort by year ascending
        .map(([year, counts]) => ({
          year,
          count: selectedMacro ? (counts.byMacro[selectedMacro] || 0) : counts.total,
        }))
    }

    // Function to render the trends chart for the selected macroinvertebrate
    const renderTrendsChart = (trendsData, selectedMacro) => {
      const chartContainer = document.getElementById('macro-trends')
      const chartTitle = document.getElementById('macro-trends-title')

      console.log("Rendering trends chart with data:", trendsData)
      if (!chartContainer || !chartTitle) {
        return
      }

      const titleText = selectedMacro
        ? `Bugs counted per year for ${selectedMacro.replaceAll('_', ' ')}`
        : 'Total bugs counted per year (all bug types)'
      chartTitle.textContent = titleText

      // Unmount the old root if it exists
      if (chartRootRef.current) {
        chartRootRef.current.unmount()
        chartRootRef.current = null
      }

      // Clear container and create fresh root
      chartContainer.innerHTML = ''
      chartRootRef.current = createRoot(chartContainer)

      if (trendsData.length === 0) {
        chartRootRef.current.render(<p>No macroinvertebrate data available for this site.</p>)
        return
      }

      const lineChart = (
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={trendsData}>
            <XAxis dataKey="year" />
            <YAxis allowDecimals={false} />
            <CartesianGrid stroke="#aaa" strokeDasharray="5 5" />
            <Line type="monotone" dataKey="count" stroke="#8884d8" />
            <Tooltip defaultIndex={2} />
          </LineChart>
        </ResponsiveContainer>
      )

      chartRootRef.current.render(lineChart)
    }

    const macroSelectElement = document.getElementById('macro-select')

    const handleMacroSelectChange = (event) => {
      const selectedMacro = event.target.value
      const trendsData = buildYearlyTrendsData(activeSiteMacroTrendsRef.current, selectedMacro)
      console.log("Trends data for selected macro:", trendsData)
      renderTrendsChart(trendsData, selectedMacro)
    }



    macroSelectElement?.addEventListener('change', handleMacroSelectChange)

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
            const selectedMacro = document.getElementById('macro-select')?.value || ''
            const trendsData = buildYearlyTrendsData(activeSiteMacroTrendsRef.current, selectedMacro)
            renderTrendsChart(trendsData, selectedMacro)
          } catch (error) {
            console.error('Error fetching site details:', error)
          }
        }

        fetchSiteDetails()
      })

      markersRef.current.push(marker)
    })
    

    return () => {
      macroSelectElement?.removeEventListener('change', handleMacroSelectChange)
    }
  }, [coordinates])


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
          <div id="macro-trends-title" className="macro-trends-title"></div>
          <div id="macro-trends" className="macro-trends-graph" aria-live="polite"></div>
        </div>
      </section>

    </section>
  )
}

export default ViewData