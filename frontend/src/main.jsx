import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import './styles/index.css'
import App from './App.jsx'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE
const auth0RedirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      cacheLocation="localstorage"
      useRefreshTokens={true}
      authorizationParams={{
        redirect_uri: auth0RedirectUri,
        audience: auth0Audience,
        scope: 'openid profile email write:manual_submit write:csv_upload',
      }}
    >
      <App />
    </Auth0Provider>
  </StrictMode>,
)