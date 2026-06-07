import { useAuth0 } from '@auth0/auth0-react'
import '../styles/App.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function Auth() {
    const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0()

    if (isAuthenticated) {
        return (
            <div className="auth-status auth-status--signed-in">
                <span className="auth-status__text">Signed in as {user?.name || user?.email || 'user'}</span>
                <button
                    type="button"
                    className="auth-status__button"
                    onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                >
                    Logout
                </button>
            </div>
        )
    }

    return (
        <div className="auth-status auth-status--signed-out">
            <button type="button" className="auth-status__button" onClick={() => loginWithRedirect()}>
                Login
            </button>
        </div>
    )
}

export default Auth