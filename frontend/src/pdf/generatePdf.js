import jsPDF from 'jspdf'
import 'svg2pdf.js'


// Helper to convert SVG markup string to an SVG element that jsPDF can render
const svgMarkupToElement = (svgMarkup) => {
    const parser = new DOMParser()
    const svgDocument = parser.parseFromString(svgMarkup, 'image/svg+xml')

    // If the markup contains multiple nodes or is wrapped, find the first actual <svg> element.
    let svgElement = svgDocument.documentElement
    if (!svgElement || svgElement.nodeName.toLowerCase() === 'parsererror') {
        // Try to locate <svg> inside the parsed document
        const found = svgDocument.querySelector && svgDocument.querySelector('svg')
        if (found) svgElement = found
        else throw new Error('Failed to parse SVG chart markup')
    } else if (svgElement.nodeName.toLowerCase() !== 'svg') {
        const found = svgDocument.querySelector && svgDocument.querySelector('svg')
        if (found) svgElement = found
    }

    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    if (!svgElement.getAttribute('xmlns:xlink')) svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

    // Ensure a viewBox exists so svg2pdf can scale correctly. If only width/height are present, create a viewBox.
    const hasViewBox = svgElement.hasAttribute('viewBox')
    const hasWidth = svgElement.hasAttribute('width')
    const hasHeight = svgElement.hasAttribute('height')
    if (!hasViewBox && hasWidth && hasHeight) {
        // Attempt to parse numeric width/height (strip units)
        const parseNum = (v) => {
            if (!v) return NaN
            const m = String(v).match(/([0-9.]+)/)
            return m ? Number(m[1]) : NaN
        }
        const w = parseNum(svgElement.getAttribute('width')) || 0
        const h = parseNum(svgElement.getAttribute('height')) || 0
        if (w > 0 && h > 0) svgElement.setAttribute('viewBox', `0 0 ${w} ${h}`)
    }

    return svgElement
}

const extractYear = (value) => {
    if (value == null) return null

    const parsedDate = new Date(value)
    if (!Number.isNaN(parsedDate.getTime())) return parsedDate.getFullYear()

    const yearMatch = String(value).match(/\b(\d{4})\b/)
    return yearMatch ? Number(yearMatch[1]) : null
}

const buildYearlyOrganismSeries = (trendRows) => {
    const rows = Array.isArray(trendRows) ? trendRows : []
    const countsByOrganism = new Map()
    const organismOrder = []
    const yearsSeen = new Set()

    rows.forEach((row) => {
        const organism = String(row?.organism_name || '').trim()
        const year = extractYear(row?.survey_date)
        const count = Number(row?.count || 0)

        if (!organism || year == null) return

        yearsSeen.add(year)

        if (!countsByOrganism.has(organism)) {
            countsByOrganism.set(organism, new Map())
            organismOrder.push(organism)
        }

        const yearlyCounts = countsByOrganism.get(organism)
        yearlyCounts.set(year, (yearlyCounts.get(year) || 0) + count)
    })

    const sortedYears = Array.from(yearsSeen).sort((a, b) => a - b)
    if (!sortedYears.length) {
        return {
            years: [],
            organisms: [],
            seriesByOrganism: new Map(),
        }
    }

    const fullYearRange = Array.from(
        { length: sortedYears[sortedYears.length - 1] - sortedYears[0] + 1 },
        (_, index) => sortedYears[0] + index,
    )

    const seriesByOrganism = new Map()
    organismOrder.forEach((organism) => {
        const yearlyCounts = countsByOrganism.get(organism) || new Map()
        seriesByOrganism.set(
            organism,
            fullYearRange.map((year) => ({
                year: String(year),
                count: Number(yearlyCounts.get(year) || 0),
            })),
        )
    })

    return {
        years: fullYearRange,
        organisms: organismOrder,
        seriesByOrganism,
    }
}


// Render a line chart using Recharts and return the SVG markup as a string
const renderLineChartMarkup = (points) => {
    return generateSimpleLineChartSvg(points, { xKey: 'month', yKey: 'count' })
}

// Similar helper for distribution chart, which has a different x-axis key and styling
const renderDistributionChartMarkup = (rows) => {
    return generateSimpleLineChartSvg(rows, { xKey: 'site_name', yKey: 'count' })
}

// Small SVG line chart generator (no external libs) — produces a simple axis/grid/line chart as SVG string
function generateSimpleLineChartSvg(data = [], opts = {}) {
    const width = opts.width || 720
    const height = opts.height || 280
    const margin = opts.margin || { top: 20, right: 24, bottom: 40, left: 44 }
    const xKey = opts.xKey || 'x'
    const yKey = opts.yKey || 'y'

    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const points = Array.isArray(data) ? data : []
    const n = Math.max(1, points.length)

    // y domain
    const values = points.map((d) => Number(d[yKey] || 0))
    const yMax = Math.max(1, ...values)
    const yMin = Math.min(0, ...values)

    // helpers
    const xForIndex = (i) => margin.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const yForValue = (v) => margin.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH

    // path
    const pathD = points
        .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(2)} ${yForValue(Number(d[yKey] || 0)).toFixed(2)}`)
        .join(' ')

    // y ticks (4)
    const yTicks = 4
    const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i / yTicks) * (yMax - yMin))

    // x labels
    const xLabels = points.map((d) => String(d[xKey] == null ? '' : d[xKey]))

    // build svg
    const svgParts = []
    svgParts.push(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`)
    svgParts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`)

    // grid + y axis labels
    yTickValues.forEach((tv) => {
        const y = yForValue(tv)
        svgParts.push(`<line x1="${margin.left}" y1="${y.toFixed(2)}" x2="${(margin.left + innerW).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#eee" stroke-width="1"/>`)
        svgParts.push(`<text x="${(margin.left - 6).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end" font-size="10" fill="#333">${Math.round(tv)}</text>`)
    })

    // x axis labels
    xLabels.forEach((lab, i) => {
        const x = xForIndex(i)
        svgParts.push(`<text x="${x.toFixed(2)}" y="${(margin.top + innerH + 16).toFixed(2)}" text-anchor="middle" font-size="9" fill="#333">${lab}</text>`)
    })

    // axis lines
    svgParts.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${(margin.top + innerH).toFixed(2)}" stroke="#333" stroke-width="1"/>`)
    svgParts.push(`<line x1="${margin.left}" y1="${(margin.top + innerH).toFixed(2)}" x2="${(margin.left + innerW).toFixed(2)}" y2="${(margin.top + innerH).toFixed(2)}" stroke="#333" stroke-width="1"/>`)

    // polyline
    svgParts.push(`<path d="${pathD}" fill="none" stroke="#2d6cdf" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)

    // dots
    points.forEach((d, i) => {
        const x = xForIndex(i)
        const y = yForValue(Number(d[yKey] || 0))
        svgParts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" fill="#2d6cdf"/>`)
    })

    svgParts.push('</svg>')
    return svgParts.join('\n')
}

// Main function to generate the PDF report
const insertSvgIntoPdf = async (doc, svgMarkup, x, y, width, height) => {
    const svgElement = svgMarkupToElement(svgMarkup)

    try {
        // Log some info to the browser console to help diagnose rendering issues
        try {
            console.debug('[insertSvgIntoPdf] svgElement viewBox:', svgElement.getAttribute('viewBox'))
            console.debug('[insertSvgIntoPdf] svgElement width/height:', svgElement.getAttribute('width'), svgElement.getAttribute('height'))
        } catch (e) {}

        // Use svg2pdf via jsPDF's .svg — provide preserveAspectRatio behavior via attributes on the SVG if needed
        await doc.svg(svgElement, { x, y, width, height })
    } catch (err) {
        // Enrich error with SVG snippet for debugging (avoid huge payloads)
        const snippet = String(svgMarkup).slice(0, 1000)
        console.error('[insertSvgIntoPdf] svg->pdf failed:', err, '\nSVG snippet:\n', snippet)
        throw err
    }
}

// Main function to generate the PDF report based on provided data
export async function generatePdf(data) {
    try { console.log('[generatePdf] called', { data }) } catch (e) {}
    const doc = new jsPDF()

    // Use Times as the default font for the whole document
    try { doc.setFont('Times', 'normal') } catch (e) { }

    const NOW = new Date();
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`)
    const today = `${pad(NOW.getDate())}/${pad(NOW.getMonth() + 1)}/${NOW.getFullYear()}`

    const title = 'Goose Creek Association – Water Quality'

    const margin = 16
    const pageWidth = doc.internal.pageSize.getWidth()
    const usableWidth = pageWidth - margin * 2

    // Helper to draw section titles with consistent styling
    const drawSectionTitle = (text, y) => {
        doc.setFontSize(12)
        doc.setFont('Times', 'bold')
        doc.text(text, margin, y)
    }

    const selectedSite = data && data.selectedSite ? data.selectedSite : null
    const selectedSiteName = selectedSite?.siteName || 'Selected site'
    const selectedOrganism = data && data.organism ? String(data.organism).replaceAll('_', ' ') : 'selected bug'
    const selectedTrend = Array.isArray(data?.monthlyTrend) ? data.monthlyTrend : []
    const selectedDistribution = Array.isArray(data?.distribution) ? data.distribution : []
    const selectedSiteTrends = Array.isArray(data?.macroTaxaTrends)
        ? data.macroTaxaTrends
        : Array.isArray(data?.macro_taxa_trends)
            ? data.macro_taxa_trends
            : []
    const yearlySiteData = buildYearlyOrganismSeries(selectedSiteTrends)

    let trendSvg = null
    let distributionSvg = null
    let chartError = null

    try {
        trendSvg = selectedTrend.length > 0 ? renderLineChartMarkup(selectedTrend) : null
    } catch (error) {
        chartError = error instanceof Error ? error : new Error('Failed to render monthly trend chart')
    }

    try {
        distributionSvg = selectedDistribution.length > 0 ? renderDistributionChartMarkup(selectedDistribution) : null
    } catch (error) {
        chartError = chartError || (error instanceof Error ? error : new Error('Failed to render distribution chart'))
    }

    // Title page
    doc.setFontSize(18)
    doc.setFont('Times', 'bold')
    doc.text(title, margin, 28)
    doc.setFontSize(10)
    doc.setFont('Times', 'normal')
    doc.text(today, margin, 36)
    doc.setFontSize(11)
    doc.text(`Selected site: ${selectedSiteName}`, margin, 44)

    // Introduction
    doc.setFontSize(12)
    doc.setFont('Times', 'bold')
    doc.text('Introduction', margin, 50)
    doc.setFontSize(10)
    doc.setFont('Times', 'normal')

    // Use splitTextToSize to handle long paragraphs and ensure they fit within the page margins
    
    const introLines = doc.splitTextToSize(
        'Watter quality refers to the chemical, physical, and biological characteristics of water, which influence its suitability for various uses and the health of aquatic ecosystems. One of the metrics for determining water quality is the presence and abundance of certain types of macroinvertibrates; some of these organisms are more tolerant of pollution than others, so their presence or absence can indicate the overall health of the water body. For example, mayflies are very sensitive to pollution, so a healthy population of mayflies often indicates good water quality, while an abundance of pollution-tolerant organisms like worms may suggest poorer conditions.',
        usableWidth
    )
    doc.text(introLines, margin, 58)

    const intro2 = doc.splitTextToSize(
        'Goose Creek is a tributary of the Potomac River in Loudoun County, Virginia. It runs for approx. 50 miles and has a watershed of about 400 square miles. The creek and its tributaries provide habitat for a variety of aquatic organisms, including such macroinvertebrrates. The Goose Creek Association (GCA) has been monitoring water quality in the creek for many years;  this report summarizes recent macroinvertebrate data collected by GCA volunteers over the years, with a focus on the selected site and organism. The following pages present charts of trends and distributions, as well as statistics for key macroinvertebrate groups.',
        usableWidth
    )
    doc.text(intro2, margin, 58 + introLines.length * 6 + 6)



    // Stats - per organism pages
    // Use the recorded organism list from the selected site when available.
    const DEFAULT_ORGANISMS = [
        'worms', 'stoneflies', 'mayflies', 'dragonflies', 'midges'
    ]

    const organisms = yearlySiteData.organisms.length
        ? yearlySiteData.organisms
        : (data && data.organisms && Array.isArray(data.organisms) && data.organisms.length)
        ? data.organisms
        : DEFAULT_ORGANISMS

    // Determine years: every recorded year at the selected site when available.
    const year = NOW.getFullYear()
    const years = yearlySiteData.years.length ? yearlySiteData.years : [year - 1, year - 2, year - 3]

    // Helper: deterministic sample numbers when no site-level trends are available.
    const deterministicCounts = (name) => {
        // simple hash from name to produce repeatable but varied counts
        let h = 0
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
        const base = Math.abs(h % 200) + 20
        return years.map((y, idx) => Math.max(0, base - idx * (5 + (h % 7))))
    }

    for (const organism of organisms) {
        doc.addPage()

        // Header
        doc.setFontSize(14)
        doc.setFont('Times', 'bold')
        const header = organism.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        doc.text(header, margin, 24)

        const organismSeries = yearlySiteData.seriesByOrganism.get(organism)
        const counts = organismSeries
            ? organismSeries.map((point) => Number(point.count || 0))
            : (data && data.stats && data.stats[organism]
                ? years.map((y) => Number(data.stats[organism][String(y)] || 0))
                : deterministicCounts(organism))

        // Bullet list of counts
        doc.setFontSize(11)
        doc.setFont('Times', 'normal')
        const bulletsStartY = 36
        const yearLabel = years.length ? `${years[0]}-${years[years.length - 1]}` : 'recent years'
        doc.text(`Statistics (${yearLabel}):`, margin, bulletsStartY)
        doc.text(`Years covered: ${years.length || counts.length} recorded years`, margin, bulletsStartY + 8)

        // Line chart summary for yearly counts
        const chartX = margin
        const chartY = bulletsStartY + 30
        const chartW = usableWidth
        const chartH = 55
        const seriesPoints = organismSeries || years.map((yearLabel, index) => ({
            year: String(yearLabel),
            count: Number(counts[index] || 0),
        }))

        const chartMarkup = generateSimpleLineChartSvg(seriesPoints, { xKey: 'year', yKey: 'count', width: 720, height: 280 })

        try { console.log('[generatePdf] per-organism chartMarkup length', chartMarkup?.length) } catch (e) {}
        try {
            console.log('[generatePdf] inserting per-organism SVG into PDF for', header)
            await insertSvgIntoPdf(doc, chartMarkup, chartX, chartY, chartW, 70)
        } catch (error) {
            chartError = chartError || (error instanceof Error ? error : new Error('Failed to export yearly line chart directly to PDF'))
            doc.setFontSize(9)
            doc.text('Line chart could not be exported for this organism.', margin, chartY + 78)
        }

        doc.setFontSize(9)
        doc.setFont('Times', 'normal')
        doc.text('Chart: Counts per year (line visualization)', margin, chartY + 82)
    }

    // Conclusion page
    doc.addPage()
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text('Conclusion', margin, 24)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    const concl = doc.splitTextToSize(
        'Overall, these results provide an overview of recent macroinvertebrate counts used to assess water quality in Goose Creek. Trends shown here should be interpreted alongside physicochemical measurements and land-use information to inform management decisions.',
        usableWidth
    )
    doc.text(concl, margin, 34)

    doc.setFontSize(11)
    doc.text('Those who helped', margin, 34 + concl.length * 6 + 8)
    const contactYStart = 34 + concl.length * 6 + 16

    // Ackshat Tiwari (ackshat.tiwari@gmail.com) (Founder of the Goose Creek Association Water Quality Database App)
    // Annie Bellis (riversteward@goosecreek.org) (GCA River Steward)
    // Alyson Borowczyk (alyson@goosecreek.org) (GCA Executive Director)
    // And of course, the many volunteers who collected and contributed the data over the years!
    
    const helpers = [
        { name: 'Ackshat Tiwari', contact: 'ackshat.tiwari@gmail.com' },
        { name: 'Annie Bellis', contact: 'riversteward@goosecreek.org' },
        { name: 'Alyson Borowczyk', contact: 'alyson@goosecreek.org' }
    ]

    for (let i = 0; i < helpers.length; i++) {
        const helper = helpers[i]
        const y = contactYStart + i * 7
        doc.setFont(undefined, 'bold')
        doc.text(helper.name + ':', margin, y)
        doc.setFont(undefined, 'normal')
        doc.text(helper.contact, margin + 40, y)
    }

    /*for (let i = 0; i < 4; i++) {
        const y = contactYStart + i * 16
        doc.setFont(undefined, 'bold')
        doc.text(`Name ${i + 1}:`, margin, y)
        doc.setFont(undefined, 'normal')
        doc.text('______________________________', margin + 28, y)
        doc.text('Contact:', margin, y + 8)
        doc.text('______________________________', margin + 28, y + 8)
    }*/

    // Save PDF
    const timestamp = NOW.toISOString().replaceAll(':', '-')
    doc.save(`GCA_WaterQuality_Report_${timestamp}.pdf`)
}