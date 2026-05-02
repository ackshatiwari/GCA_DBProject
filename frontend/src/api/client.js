import { useAuth0 } from '@auth0/auth0-react'


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

      return fetch(url, { ...options, headers })
    } catch (error) {
      console.error('Auth error:', error)
      throw error
    }
  }

  return authenticatedFetch
}