import { useState } from 'react'
import './styles/App.css'
import ManualEntryForm from './components/ManualEntryForm'
import CsvImportForm from './components/CsvImportForm'

function App() {
  return (
    <main className="app-shell">
      <h1>Goose Creek Association Database Project</h1>
      <div className="forms-container">
        <div>
          <button onClick={() => {
            const manualDiv = document.getElementById('manual-entry-div')
            const csvDiv = document.getElementById('csv-import-div')
            if (manualDiv.style.display === 'none') {
              manualDiv.style.display = 'block'
              csvDiv.style.display = 'none'
            } else {
              manualDiv.style.display = 'none'
              csvDiv.style.display = 'block'
            }
          }}>
            Toggle Forms
          </button>
        </div>
        <div className="form-section" id='manual-entry-div'>
          <ManualEntryForm></ManualEntryForm>
        </div>
        <div className="form-section" id='csv-import-div'>
          <CsvImportForm></CsvImportForm>
        </div>
      </div>
    </main>
  )
}

export default App
