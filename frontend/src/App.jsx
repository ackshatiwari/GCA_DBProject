import { useState } from 'react'
import './styles/App.css'
import DataImport from './components/DataImport'
import ViewData from './components/ViewData'

function App() {
  const [activeNav, setActiveNav] = useState('enter-data')

  const navItems = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'enter-data', label: 'Enter Data' },
    { key: 'view-data', label: 'View Data' },
  ]

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
          <DataImport />
        ) : activeNav === 'view-data' ? (
          <ViewData />
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
