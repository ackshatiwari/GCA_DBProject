import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

export default function Dashboard() {
  const { isAuthenticated, getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0()
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [message, setMessage] = useState(null)
  const [surveysByMonth, setSurveysByMonth] = useState([])
  const [page, setPage] = useState(1)
  const pageSize = 6
  const [allCoords, setAllCoords] = useState([])
  const [selectedSiteId, setSelectedSiteId] = useState(null)
  const [organism, setOrganism] = useState('worms')
  const [distribution, setDistribution] = useState([])

  const MACRO_TAXA_OPTIONS = [
    'worms', 'flatworms', 'leeches', 'crayfish', 'sowbugs', 'scuds', 'stoneflies', 'mayflies', 'dragonflies', 'damselflies', 'hellgrammites', 'fishflies', 'alderflies', 'common_netspinners', 'most_caddisflies', 'beetles', 'midges', 'blackflies', 'most_true_flies', 'gilled_snails', 'lunged_snails', 'clams'
  ]

  const PIE_COLORS = ['#2d6cdf','#f97316','#10b981','#a78bfa','#ef4444','#f59e0b','#06b6d4','#ec4899','#64748b','#065f46']

  useEffect(() => {
    const fetchSites = async () => {
      if (!isAuthenticated) {
        setSites([])
        setLoading(false)
        return
      }

      try {
        let token
        try {
          token = await getAccessTokenSilently({
            authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
          })
        } catch (err) {
          if (err?.error === 'consent_required' || err?.error === 'interaction_required') {
            token = await getAccessTokenWithPopup({
              authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
            })
          } else {
            throw err
          }
        }

        const res = await fetch('/api/sites', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('Failed to load sites')
        const data = await res.json()
        setSites(data.sites || [])

        // also fetch surveys to build simple graphs
        const res2 = await fetch('/api/surveys/coords', { headers: { Authorization: `Bearer ${token}` } })
        if (res2.ok) {
          const d2 = await res2.json()
          const coords = d2.survey_coords || []
          setAllCoords(coords)
          // default selected site to first site if available
          if (!selectedSiteId && data.sites && data.sites.length > 0) {
            setSelectedSiteId(data.sites[0].site_id)
          }
        }
      } catch (e) {
        console.error(e)
        setSites([])
      } finally {
        setLoading(false)
      }
    }
    fetchSites()
  }, [])

  // fetch distribution for selected organism
  useEffect(() => {
    const fetchDist = async () => {
      if (!isAuthenticated) return
      try {
        let token
        try {
          token = await getAccessTokenSilently({ authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE } })
        } catch (err) {
          if (err?.error === 'consent_required' || err?.error === 'interaction_required') {
            token = await getAccessTokenWithPopup({ authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE } })
          } else {
            throw err
          }
        }

        const res = await fetch(`/api/organism-distribution?organism=${encodeURIComponent(organism)}`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('Failed to load distribution')
        const data = await res.json()
        setDistribution(data.distribution || [])
      } catch (e) {
        console.error(e)
        setDistribution([])
      }
    }
    fetchDist()
  }, [organism, isAuthenticated, getAccessTokenSilently, getAccessTokenWithPopup])

  // helper to build monthly counts for a site from macro_taxa_trends
  const buildMonthlyTrendsData = (macroTaxaTrends, selectedMacro) => {
    const groupedData = {}
    macroTaxaTrends.forEach((entry) => {
      const month = entry.survey_date ? String(entry.survey_date).slice(0, 7) : 'unknown'
      const count = Number(entry.count || 0)

      if (!groupedData[month]) groupedData[month] = 0
      if (!selectedMacro) {
        groupedData[month] += count
      } else if (entry.organism_name === selectedMacro) {
        groupedData[month] += count
      }
    })

    return Object.entries(groupedData)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  // when selectedSiteId or organism changes, fetch site details and build trends
  useEffect(() => {
    const fetchSiteDetails = async () => {
      if (!selectedSiteId || !isAuthenticated) {
        setSurveysByMonth([])
        return
      }

      try {
        let token
        try {
          token = await getAccessTokenSilently({ authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE } })
        } catch (err) {
          if (err?.error === 'consent_required' || err?.error === 'interaction_required') {
            token = await getAccessTokenWithPopup({ authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE } })
          } else {
            throw err
          }
        }

        const res = await fetch(`/api/surveys/site/${encodeURIComponent(selectedSiteId)}/details`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('Failed to load site details')
        const data = await res.json()
        const trends = data.macro_taxa_trends || []
        const monthly = buildMonthlyTrendsData(trends, organism)
        setSurveysByMonth(monthly)
      } catch (e) {
        console.error(e)
        setSurveysByMonth([])
      }
    }

    fetchSiteDetails()
  }, [selectedSiteId, organism, isAuthenticated, getAccessTokenSilently, getAccessTokenWithPopup])

  // build surveysByMonth for selected site or default
  useEffect(() => {
    if (!allCoords || allCoords.length === 0) {
      setSurveysByMonth([])
      return
    }

    let coords = []
    if (selectedSiteId) {
      coords = allCoords.filter((c) => c.site_id === selectedSiteId)
    } else if (sites && sites.length > 0) {
      coords = allCoords.filter((c) => c.site_id === sites[0].site_id)
    } else {
      coords = allCoords
    }

    const agg = {}
    coords.forEach((c) => {
      const month = c.survey_date ? String(c.survey_date).slice(0, 7) : 'unknown'
      agg[month] = (agg[month] || 0) + 1
    })
    const arr = Object.entries(agg)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
    setSurveysByMonth(arr)
  }, [allCoords, selectedSiteId, sites])

  const triggerScrape = async () => {
    if (!isAuthenticated) {
      setMessage('Please log in to trigger scraping')
      return
    }

    setScraping(true)
    setMessage(null)
    try {
      let token
      try {
        token = await getAccessTokenSilently({
          authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
        })
      } catch (err) {
        if (err?.error === 'consent_required' || err?.error === 'interaction_required') {
          token = await getAccessTokenWithPopup({
            authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
          })
        } else {
          throw err
        }
      }

      const res = await fetch('/api/trigger-web-scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.message || 'Failed')
      setMessage(data.message || 'Triggered')
    } catch (e) {
      console.error(e)
      setMessage('Error: ' + e.message)
    } finally {
      setScraping(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil((sites.length || 0) / pageSize))
  const pagedSites = sites.slice((page - 1) * pageSize, page * pageSize)

  return (
    <section className="dashboard-page">
      <h1 className="dashboard-title">Goose Creek Association</h1>

      {}

      <div className="dashboard-columns">
        <aside className="sites-column">
          <div className="sites-card">
            <h2>Sites</h2>
            {loading ? (
              <p>Loading sites...</p>
            ) : (
              <>
                <table className="sites-table">
                  <thead>
                    <tr>
                      <th>Site Name</th>
                      <th>Site Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSites.map((s) => (
                      <tr key={s.site_id} className={s.site_id === selectedSiteId ? 'selected' : ''} onClick={() => setSelectedSiteId(s.site_id)}>
                        <td>{s.site_name}</td>
                        <td className="site-desc-cell">{s.site_desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pagination">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Prev
                  </button>
                  <span className="page-indicator">Page {page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>

        <main className="graphs-column">
          <div className="kpi-cards">
            <div className="kpi-card">
              <div className="kpi-value">{sites.length}</div>
              <div className="kpi-label">Total Sites</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{surveysByMonth.reduce((s, v) => s + v.count, 0)}</div>
              <div className="kpi-label">Surveys (all time)</div>
            </div>
          </div>
          <div className="controls-row">
            <div className="controls-left">
              <label htmlFor="organism-select">Select bug:</label>
              <select id="organism-select" value={organism} onChange={(e) => setOrganism(e.target.value)}>
                {MACRO_TAXA_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="controls-right">
              <div>Selected site: {selectedSiteId || 'All'}</div>
            </div>
          </div>

          <section className="graphs-panel">
            <h2>Number of {organism.replaceAll('_', ' ').charAt(0).toUpperCase() + organism.replaceAll('_', ' ').slice(1)}</h2>
            {surveysByMonth.length === 0 ? (
              <p>No survey data available for charts.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={surveysByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2d6cdf" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
            
            <section className="pie-panel">
              <h3>Site Distribution of {organism.replaceAll('_', ' ').charAt(0).toUpperCase() + organism.replaceAll('_', ' ').slice(1)}</h3>
              <div className="pie-chart-wrap">
                {distribution.length === 0 ? (
                  <p>No data for selected bug.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={distribution} dataKey="count" nameKey="site_name" cx="50%" cy="50%" outerRadius={80} >
                        {distribution.map((entry, idx) => (
                          <Cell key={entry.site_id} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <div className="more-actions-panel">
              <h3>More Actions</h3>
              <div className="actions-row">
                <button onClick={triggerScrape} disabled={scraping} className="btn-primary">
                  {scraping ? 'Scraping...' : 'Scrape & Upload New Data'}
                </button>
                {message && <div className="dashboard-message">{message}</div>}
              </div>
            </div>
          </section>
        </main>
      </div>
    </section>
  )
}
