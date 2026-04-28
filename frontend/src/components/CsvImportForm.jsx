import { useState } from 'react'
import { useAuthenticatedFetch } from '../api/client'

function CsvImportForm() {
    const authenticatedFetch = useAuthenticatedFetch()
    const [csvFile, setCsvFile] = useState(null)
    const [statusMessage, setStatusMessage] = useState('')
    const statusTone = statusMessage.startsWith('Survey file uploaded successfully')
        ? 'success'
        : statusMessage.startsWith('Error')
            ? 'error'
            : 'info'

    function handleFileChange(event) {
        const file = event.target.files?.[0] || null
        setCsvFile(file)
        setStatusMessage('')
    }

    async function handleSubmit(event) {
        event.preventDefault()

        if (!csvFile) {
            setStatusMessage('Please choose a CSV or .xlsx file first.')
            return
        }

        const formData = new FormData()
        formData.append('file', csvFile)

        setStatusMessage(`Uploading ${csvFile.name}...`)
        try {
            const response = await authenticatedFetch('/api/submit-data-csv', {
                method: 'POST',
                body: formData,
            })
            const result = await response.json()
            if (!response.ok) {
                setStatusMessage(`Error: ${JSON.stringify(result.detail || result)}`)
                return
            }

            setStatusMessage(`Response: ${JSON.stringify(result)}`)
            setCsvFile(null) 
        } catch (error) {
            setStatusMessage('Error uploading survey file.')
        }
    }

    return (
        <form onSubmit={handleSubmit} className="csv-import-form">
            <h3>Import CSV or Excel</h3>
            <p className="helper-text">Upload a single survey spreadsheet to process and insert records.</p>
            <label>
                Choose a CSV or .xlsx file
                <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
            </label>
            {csvFile ? <p className="selected-file">Selected: {csvFile.name}</p> : null}
            <div className="form-actions">
                <button type="submit">Upload File</button>
                {statusMessage ? <p className={`status-message ${statusTone}`}>{statusMessage}</p> : null}
            </div>
        </form>
    )
}

export default CsvImportForm
