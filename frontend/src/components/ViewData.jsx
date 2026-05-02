import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useAuthenticatedFetch } from '../api/client'
import '../styles/ViewData.css'
import 'mapbox-gl/dist/mapbox-gl.css'


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

    coordinates.forEach((point) => {
      if (point.latitude == null || point.longitude == null) {
        return
      }

      const marker = new mapboxgl.Marker()
        .setLngLat([Number(point.longitude), Number(point.latitude)])
        .addTo(mapRef.current)

      // Placeholder for marker click event to show site details in the side panel
      marker.getElement().addEventListener('click', () => {
        alert(
          `Site ID: ${point.site_id}\nSite Name: ${point.site_name || ''}\nDescription: ${point.site_desc || ''}\nName of Stream: ${point.stream_name || ''}\nLatitude: ${point.latitude}\nLongitude: ${point.longitude}`,
        )
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
          <p>This panel will display the selected site, coordinates, recent readings, and chart summaries.</p>
        </div>
      </div>
    </section>
  )
}

export default ViewData