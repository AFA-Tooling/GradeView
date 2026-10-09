import React, { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import apiv2 from '../utils/apiv2';
import Loader from './Loader';

// Same keys as the NavBar's logout.
function clearSession() {
    localStorage.setItem('token', '');
    localStorage.setItem('email', '');
}

export default function PrivateRoutes() {
    const [loaded, setLoaded] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || token === '') {
            setAuthorized(false);
            setLoaded(true);
            return;
        }
        let mounted = true;
        apiv2.get('/login')
            .then((res) => {
                if (res?.data?.status !== true) {
                    // The Google token is valid, but the user is not (or no longer) on the
                    // roster, for example while the grade data is being reloaded. /login sends
                    // anyone with a token straight back here, which looped between / and
                    // /login and used up the login rate limit. Drop the token and reload
                    // /login: App decides at page load whether it shows the sign-in page.
                    clearSession();
                    window.location.replace('/login');
                    return;
                }
                if (mounted) {
                    setAuthorized(true);
                    setLoaded(true);
                }
            })
            .catch((err) => {
                // 401 is handled by apiv2 (it clears the token). For other errors (API down,
                // rate limit) show the error page instead of /login, which would redirect back.
                console.error('Login verification failed:', err);
                if (mounted) {
                    setFailed(true);
                    setLoaded(true);
                }
            });
        return () => {
            mounted = false;
        };
    }, []);

    if (!loaded) {
        return <Loader />;
    }
    if (authorized) {
        return <Outlet />;
    }
    return <Navigate to={failed ? '/serverError' : '/login'} />;
}
