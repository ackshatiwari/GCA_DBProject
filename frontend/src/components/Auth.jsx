import { useAuth0 } from '@auth0/auth0-react'

function Auth() {
    const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0()

    if (isAuthenticated) {
        return (
            <div>
                <span>Signed in as {user?.name || user?.email || 'user'}</span>
                <button
                    type="button"
                    onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                >
                    Logout
                </button>
            </div>
        )
    }

    return (
        <button type="button" onClick={() => loginWithRedirect()}>
            Login
        </button>
    )
}

export default Auth