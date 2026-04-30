import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import './styles/App.css'
import DataImport from './components/DataImport'
import ViewData from './components/ViewData'
import Auth from './components/Auth'

function App() {
  const { isAuthenticated, isLoading, getAccessTokenSilently, getAccessTokenWithPopup, user } = useAuth0()
  const [activeNav, setActiveNav] = useState('enter-data')
  const [permissions, setPermissions] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setPermissions([])
      return
    }

    const loadPermissions = async () => {
      try {
        let token
        try {
          token = await getAccessTokenSilently({
            authorizationParams: {
              audience: import.meta.env.VITE_AUTH0_AUDIENCE,
            },
          })
        } catch (err) {
          if (err?.error === 'consent_required' || err?.error === 'interaction_required') {
            token = await getAccessTokenWithPopup({
              authorizationParams: {
                audience: import.meta.env.VITE_AUTH0_AUDIENCE,
              },
            })
          } else {
            throw err
          }
        }

        if (!token) {
          setPermissions([])
          return
        }

        const payload = JSON.parse(atob(token.split('.')[1]))
        setPermissions(payload.permissions || [])
      } catch (e) {
        console.error('Failed to load permissions:', e)
        setPermissions([])
      }
    }

    loadPermissions()
  }, [isAuthenticated, getAccessTokenSilently, getAccessTokenWithPopup])
  const navItems = []
  if (permissions && (permissions.includes('write:manual_submit') || permissions.includes('write:csv_upload'))) {
    navItems.push({ key: 'enter-data', label: 'Enter Data', })
  }
  if (permissions && permissions.includes('read:view_data')) {
    navItems.push({ key: 'view-data', label: 'View Data' })
  }
    navItems.push({ key: 'login', label: 'Login' })

  // console logs the auth state, the user it is logged in as, and the permissions
  console.log('Auth State:', { isAuthenticated, isLoading })
  console.log('User:', user)
  console.log('Permissions:', permissions)

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="dashboard-placeholder">
          <h1>Loading</h1>
          <p>Checking your login status...</p>
        </section>
      </main>
    )
  }

  return (
    <>
      <header className="top-navbar">
        <div className="brand">GCA Database Project</div>
        <nav className="nav-columns" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${activeNav === item.key ? 'active' : ''}`}
              onClick={() => setActiveNav(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-shell">
        {activeNav === 'enter-data' ? (
          // wait until permissions are loaded; require at least one relevant permission
          isAuthenticated && permissions !== null && (permissions.includes('write:manual_submit') || permissions.includes('write:csv_upload')) ? (
            <DataImport />
          ) : (
            // does not show anything
            console.log('User is authenticated but does not have permissions to enter data.')
          )
        ) : activeNav === 'view-data' ? (
          <ViewData />
        ) : activeNav === 'login' ? (
          <Auth />
        ) : (
          <section className="dashboard-placeholder">
            <h1>Dashboard</h1>
            <p>Welcome to the GCA Database Project! Use the navigation above to enter data or view data.</p>
          </section>
        )}
      </main>
    </>
  )
}

export default App
