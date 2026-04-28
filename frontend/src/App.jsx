import { useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import './styles/App.css'
import DataImport from './components/DataImport'
import ViewData from './components/ViewData'
import Auth from './components/Auth'

function App() {
  const { isAuthenticated, isLoading } = useAuth0()
  const [activeNav, setActiveNav] = useState('enter-data')

  const navItems = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'enter-data', label: 'Enter Data' },
    { key: 'view-data', label: 'View Data' },
    { key: 'login', label: isAuthenticated ? 'Account' : 'Login' },
  ]

  // console logs the auth state, the user it is logged in as, and the role of the user
  console.log('Auth State:', { isAuthenticated, isLoading })
  console.log('User:', useAuth0().user)
  

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
              type="button"
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
          isAuthenticated ? (
            <DataImport />
          ) : (
            <section className="dashboard-placeholder">
              <h1>Sign In Required</h1>
              <p>Please log in to submit manual entries or upload CSV files.</p>
              <Auth />
            </section>
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
