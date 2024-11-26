import React, { useContext, useMemo } from 'react';
import { Outlet, Navigate } from 'react-router-dom';

import Loader from './Loader';
import userContext from '../contexts/userContext';

export default function PrivateRoutes({ access }) {
    const { isLoading, isLoggedIn, isAdmin } = useContext(userContext);
    const isAuthorized = useMemo(() => {
        switch (access) {
            case 'admin':
                return isAdmin;
            default:
                return isLoggedIn;
        }
    }, [access, isAdmin, isLoggedIn]);
    if (isLoading) return <Loader />;
    if (!isAuthorized) return <Navigate to='/login' />;
    return <Outlet />;
}
