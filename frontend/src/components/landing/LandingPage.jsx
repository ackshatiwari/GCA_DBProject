import React from 'react'
import '../../styles/LandingPage.css'

export default function LandingPage() {
    return (
        <div className='landing-page'>
            <div className='header-container'>
                <div className='header'>
                    <h2>Dedicated to protecting and preserving the environment and quality of life in the Goose Creek Watershed in Fauquier and Loudoun Counties, VA</h2>
                </div>
            </div>

            <div className='features-list'>

                <div className='card'>
                    <h4>Data Entry</h4>
                    <p>Submit water quality data through a user-friendly interface, either <strong>manually</strong> or via <strong>CSV</strong> upload.</p>
                    <img src='csv_upload.png'></img>
                </div>
                <div className='card'>
                    <h4>Data Visualization</h4>
                    <p>View and analyze water quality data through <strong>interactive charts and maps</strong>. Paired with <strong>AI</strong> for forecasting future water quality trends based on historical data</p>
                    <img src='Macro_Tends_EXAMPLE.png'></img>
                </div>
                <div className='card'>
                    <h4>Data Export</h4>
                    <p>Download water quality data as <strong>PDFs</strong> for offline analysis and reporting.</p>
                    <img src='download.png'></img>
                </div>

            </div>

            {/* 18 different sites, with nearly 250 + data points
                Forecast training data based on historical data < 1 month old
                
            */}
            <div className='stats-section'>
                <div className='stat-card'>
                    <div className='stat-number'>18</div>
                    <div className='stat-label'>Monitoring Sites</div>
                </div>
                <div className='stat-card'>
                    <div className='stat-number'>250+</div>
                    <div className='stat-label'>Data Points</div>
                </div>
                <div className='stat-card'>
                    <div className='stat-number'>1 mo</div>
                    <div className='stat-label'>Forecast Training Window</div>
                </div>
            </div>

            <div className="map-row">
                <div className="map-container">
                    <img src="ViewDataMap.png" alt="View data map example" className="landing-map-image" />
                </div>

                <div className="info-box">
                    <div className="forecast-demo">
                        <h4>Example Forecast</h4>
                        <img src="flatworms_chartdemo.png" alt="forecast demo" />
                    </div>
                </div>
            </div>

            <div className="get-started-wrap">
                <button
                    type="button"
                    className="get-started-btn"
                    onClick={() => {
                        const navButtons = Array.from(document.querySelectorAll('.nav-item'))
                        const target = navButtons.find(b => /login|profile|admin profile/i.test(b.textContent))
                        if (target) {
                            target.click()
                            return
                        }
                        window.location.href = '/'
                    }}
                >
                    Get Started
                </button>
            </div>

            <footer className="landing-footer">
                <h3>Contact Us</h3>
                <div className="footer-contact-list">
                    <p>
                        <strong>Ackshat Tiwari</strong> - Creator of this website -{' '}
                        <a href="mailto:ackshat.tiwari@gmail.com">ackshat.tiwari@gmail.com</a>
                    </p>
                    <p>
                        <strong>Alyson</strong> - Executive Director of Goose Creek Association -{' '}
                        <a href="mailto:alyson@goosecreek.org">alyson@goosecreek.org</a>
                    </p>
                    <p>
                        <strong>River Steward</strong> - Goose Creek Association -{' '}
                        <a href="mailto:riversteward@goosecreek.org">riversteward@goosecreek.org</a>
                    </p>
                </div>
            </footer>
        </div>

    )
}