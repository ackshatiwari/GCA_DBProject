import { useState } from 'react'
import '../styles/DataImport.css'
import ManualEntryForm from './ManualEntryForm'
import CsvImportForm from './CsvImportForm'

function DataImport() {
    const [activeForm, setActiveForm] = useState('manual')

    return (
        <section className="data-import-shell">
            <header className="import-header">
                <h1>Data Import</h1>
                <p>Choose how you want to add survey records to the GCA database.</p>
            </header>

            <div className="import-switcher" role="tablist" aria-label="Data entry options">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeForm === 'manual'}
                    className={`switcher-tab ${activeForm === 'manual' ? 'active' : ''}`}
                    onClick={() => setActiveForm('manual')}
                >
                    Manual Entry
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeForm === 'csv'}
                    className={`switcher-tab ${activeForm === 'csv' ? 'active' : ''}`}
                    onClick={() => setActiveForm('csv')}
                >
                    CSV Import
                </button>
            </div>

            <div className="form-section" role="tabpanel">
                {activeForm === 'manual' ? <ManualEntryForm /> : <CsvImportForm />}
            </div>
        </section>
    )
}

export default DataImport;