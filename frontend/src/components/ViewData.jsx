import { useEffect, useRef, useState } from 'react'
import { RechartsDevtools } from '@recharts/devtools';
import { Line, LineChart } from 'recharts';
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
  const [coordinates, setCoordinates] = useState([])
  const [mapError, setMapError] = useState(null)
  const authenticatedFetch = useAuthenticatedFetch()

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

    // defines a method that groups macro taxa data by survey date
    const groupMacroTaxaByDate = (macroTaxaTrends) => {
      const groupedData = {}
      macroTaxaTrends.forEach((entry) => {
        const date = entry.survey_date
        if (!groupedData[date]) {
          groupedData[date] = []
        }
        groupedData[date].push(entry)
      })
      return groupedData
    }

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
            // right now just print the JSON response fpor the macro taxa trends to the console, we can add a chart later
            console.log('Macro Taxa Trends:', groupMacroTaxaByDate(data.macro_taxa_trends))
          } catch (error) {
            console.error('Error fetching site details:', error)
          }
        }

        fetchSiteDetails()
      })


      markersRef.current.push(marker)
    })
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
          <div className="site-row">
            <div className="site-label">Macroinvertebrate Trends</div>
            <div className='site-label'>Select Macroinvertebrate:
              <select id="macro-select" name="macro-select">
                <option value="">-- Select --</option>
                {MACRO_TAXA_OPTIONS.map((macro) => (
                  <option key={macro} value={macro}>
                    {macro.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div id="macro-trends" className="site-value">
              {/* Placeholder for macroinvertebrate trends graph */}

            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ViewData