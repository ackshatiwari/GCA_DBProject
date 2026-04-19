import { useState } from 'react'

function CsvImportForm() {
    const [csvFile, setCsvFile] = useState(null)
    const [statusMessage, setStatusMessage] = useState('')

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
            const response = await fetch('/api/submit-data-csv', {
                method: 'POST',
                body: formData,
            })
            const result = await response.json()
            if (response.ok) {  
                setStatusMessage('Survey file uploaded successfully!')
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
            <label>
                Choose a CSV or .xlsx file
                <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
            </label>
            <button type="submit">Upload File</button>
        </form>
    )
}

export default CsvImportForm
