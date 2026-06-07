import { useAuth0 } from '@auth0/auth0-react'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export function useAuthenticatedFetch() {
  const { getAccessTokenSilently, getAccessTokenWithPopup } = useAuth0()
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE
  const scope = 'write:manual_submit write:csv_upload read:view_data'

  const authenticatedFetch = async (url, options = {}) => {
    try {
      const tokenRequest = {
        authorizationParams: {
          audience,
          scope,
        },
      }

      let token
      try {
        token = await getAccessTokenSilently(tokenRequest)
      } catch (error) {
        const recoverableAuthErrors = new Set([
          'consent_required',
          'interaction_required',
          'login_required',
          'missing_refresh_token',
        ])

        const shouldUsePopup =
          recoverableAuthErrors.has(error?.error) ||
          error?.message?.toLowerCase().includes('missing refresh token')

        if (shouldUsePopup) {
          token = await getAccessTokenWithPopup(tokenRequest)
        } else {
          throw error
        }
      }

      const headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      }

      return fetch(`${API_BASE}${url}`, { ...options, headers })
    } catch (error) {
      console.error('Auth error:', error)
      throw error
    }
  }

  return authenticatedFetch
}