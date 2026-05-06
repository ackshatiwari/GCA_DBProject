import { useState } from 'react'
import { useAuthenticatedFetch } from '../api/client'

function ManualEntryForm() {
    const authenticatedFetch = useAuthenticatedFetch()
    const [form, setForm] = useState({
        survey_id: '',
        site_id: '',
        site_name: '',
        site_desc: '',
        stream_name: '',
        name: '',
        weather: '',
        date: '',
        latitude: '',
        longitude: '',
        stream_width: '',
        stream_depth: '',
        flow_rate: '',
        collection_time_1: '',
        collection_time_2: '',
        collection_time_3: '',
        collection_time_4: '',
        sampling_notes: '',
        worms: '',
        flatworms: '',
        leeches: '',
        crayfish: '',
        sowbugs: '',
        scuds: '',
        stoneflies: '',
        mayflies: '',
        dragonflies: '',
        damselflies: '',
        hellgrammites: '',
        fishflies: '',
        alderflies: '',
        common_netspinners: '',
        most_caddisflies: '',
        beetles: '',
        midges: '',
        blackflies: '',
        most_true_flies: '',
        gilled_snails: '',
        lunged_snails: '',
        clams: '',
        metric_1: '',
        metric_2: '',
        metric_3: '',
        metric_4: '',
        metric_5: '',
        metric_6: '',
    })
    const [submitResponse, setSubmitResponse] = useState('')
    const responseTone = submitResponse.startsWith('Success')
        ? 'success'
        : submitResponse.startsWith('Error')
            ? 'error'
            : 'info'

    function onInputChange(e) {
        const { name, value } = e.target
        setForm((prev) => ({ ...prev, [name]: value }))
    }

    async function onSubmit(e) {
        e.preventDefault()
        setSubmitResponse('Submitting...')

        try {
            const response = await authenticatedFetch('/api/submit-data-manual', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(form),
            })

            const result = await response.json()
            if (!response.ok) {
                setSubmitResponse(`Error: ${JSON.stringify(result.detail || result)}`)
                return
            }

            const submittedName = result?.data?.name || form.name || 'Survey'
            setSubmitResponse(`Success: ${submittedName} entry submitted!`)
        } catch (error) {
            setSubmitResponse(`Error: ${error.message}`)
        }
    }

    return (
        <form onSubmit={onSubmit} className="form-grid">
            <section className="field-group">
                <h3>Survey Details</h3>
                <div className="grid-two">
                    <label> Survey ID <input name="survey_id" type="text" value={form.survey_id} onChange={onInputChange} /> </label>
                    <label> Site ID <input name="site_id" type="text" value={form.site_id} onChange={onInputChange} required /> </label>
                    <label> Site Name <input name="site_name" type="text" value={form.site_name} onChange={onInputChange} /> </label>
                    <label> Description <input name="site_desc" type="text" value={form.site_desc} onChange={onInputChange} /> </label>
                    <label> Name of Stream <input name="stream_name" type="text" value={form.stream_name} onChange={onInputChange} /> </label>
                    <label> Certified Monitor Name <input name="name" type="text" value={form.name} onChange={onInputChange} required /> </label>
                    <label> Weather Conditions <input name="weather" type="text" value={form.weather} onChange={onInputChange} required /> </label>
                    <label> Survey Date <input name="date" type="date" value={form.date} onChange={onInputChange} required /> </label>
                    <label> Latitude <input name="latitude" type="number" step="any" value={form.latitude} onChange={onInputChange} /> </label>
                    <label> Longitude <input name="longitude" type="number" step="any" value={form.longitude} onChange={onInputChange} /> </label>
                    <label> Avg. Stream Width <input name="stream_width" type="text" value={form.stream_width} onChange={onInputChange} /> </label>
                    <label> Avg. Stream Depth <input name="stream_depth" type="text" value={form.stream_depth} onChange={onInputChange} /> </label>
                    <label> Flow Rate <input name="flow_rate" type="text" value={form.flow_rate} onChange={onInputChange} /> </label>
                    <label> Collection Time Net 1 <input name="collection_time_1" type="text" value={form.collection_time_1} onChange={onInputChange} /> </label>
                    <label> Collection Time Net 2 <input name="collection_time_2" type="text" value={form.collection_time_2} onChange={onInputChange} /> </label>
                    <label> Collection Time Net 3 <input name="collection_time_3" type="text" value={form.collection_time_3} onChange={onInputChange} /> </label>
                    <label> Collection Time Net 4 <input name="collection_time_4" type="text" value={form.collection_time_4} onChange={onInputChange} /> </label>
                    <label className="span-two"> Sampling Notes <textarea name="sampling_notes" value={form.sampling_notes} onChange={onInputChange} /> </label>
                </div>
            </section>

            <section className="field-group">
                <h3>Taxa Counts</h3>
                <div className="grid-three">
                    <label> Worms <input name="worms" type="number" min="0" value={form.worms} onChange={onInputChange} /> </label>
                    <label> Flatworms <input name="flatworms" type="number" min="0" value={form.flatworms} onChange={onInputChange} /> </label>
                    <label> Leeches <input name="leeches" type="number" min="0" value={form.leeches} onChange={onInputChange} /> </label>
                    <label> Crayfish <input name="crayfish" type="number" min="0" value={form.crayfish} onChange={onInputChange} /> </label>
                    <label> Sowbugs <input name="sowbugs" type="number" min="0" value={form.sowbugs} onChange={onInputChange} /> </label>
                    <label> Scuds <input name="scuds" type="number" min="0" value={form.scuds} onChange={onInputChange} /> </label>
                    <label> Stoneflies <input name="stoneflies" type="number" min="0" value={form.stoneflies} onChange={onInputChange} /> </label>
                    <label> Mayflies <input name="mayflies" type="number" min="0" value={form.mayflies} onChange={onInputChange} /> </label>
                    <label> Dragonflies <input name="dragonflies" type="number" min="0" value={form.dragonflies} onChange={onInputChange} /> </label>
                    <label> Damselflies <input name="damselflies" type="number" min="0" value={form.damselflies} onChange={onInputChange} /> </label>
                    <label> Hellgrammites <input name="hellgrammites" type="number" min="0" value={form.hellgrammites} onChange={onInputChange} /> </label>
                    <label> Fishflies <input name="fishflies" type="number" min="0" value={form.fishflies} onChange={onInputChange} /> </label>
                    <label> Alderflies <input name="alderflies" type="number" min="0" value={form.alderflies} onChange={onInputChange} /> </label>
                    <label> Common Netspinners <input name="common_netspinners" type="number" min="0" value={form.common_netspinners} onChange={onInputChange} /> </label>
                    <label> Most Caddisflies <input name="most_caddisflies" type="number" min="0" value={form.most_caddisflies} onChange={onInputChange} /> </label>
                    <label> Beetles <input name="beetles" type="number" min="0" value={form.beetles} onChange={onInputChange} /> </label>
                    <label> Midges <input name="midges" type="number" min="0" value={form.midges} onChange={onInputChange} /> </label>
                    <label> Blackflies <input name="blackflies" type="number" min="0" value={form.blackflies} onChange={onInputChange} /> </label>
                    <label> Most True Flies <input name="most_true_flies" type="number" min="0" value={form.most_true_flies} onChange={onInputChange} /> </label>
                    <label> Gilled Snails <input name="gilled_snails" type="number" min="0" value={form.gilled_snails} onChange={onInputChange} /> </label>
                    <label> Lunged Snails <input name="lunged_snails" type="number" min="0" value={form.lunged_snails} onChange={onInputChange} /> </label>
                    <label> Clams <input name="clams" type="number" min="0" value={form.clams} onChange={onInputChange} /> </label>
                </div>
            </section>

            <section className="field-group">
                <h3>Metrics</h3>
                <div className="grid-three">
                    <label> Metric 1 <input name="metric_1" type="number" step="any" value={form.metric_1} onChange={onInputChange} /> </label>
                    <label> Metric 2 <input name="metric_2" type="number" step="any" value={form.metric_2} onChange={onInputChange} /> </label>
                    <label> Metric 3 <input name="metric_3" type="number" step="any" value={form.metric_3} onChange={onInputChange} /> </label>
                    <label> Metric 4 <input name="metric_4" type="number" step="any" value={form.metric_4} onChange={onInputChange} /> </label>
                    <label> Metric 5 <input name="metric_5" type="number" step="any" value={form.metric_5} onChange={onInputChange} /> </label>
                    <label> Metric 6 <input name="metric_6" type="number" step="any" value={form.metric_6} onChange={onInputChange} /> </label>
                </div>
            </section>

            <div className="form-actions">
                <button type="submit">Submit Survey</button>
                {submitResponse ? <p className={`status-message ${responseTone}`}>{submitResponse}</p> : null}
            </div>
        </form>
    )
}

export default ManualEntryForm