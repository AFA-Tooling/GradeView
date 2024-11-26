import React, {
    createContext,
    useEffect,
    useReducer,
    useState,
} from 'react';
import { jwtDecode } from 'jwt-decode';

import apiv2 from '../utils/apiv2';

const defaultState = {
    isLoggedIn: false,
    isAdmin: false,
    email: '',
    pfpUrl: '',
    isAdmin: false,
};

const userContext = createContext({
    ...defaultState,
    dispatchUserStateUpdate: () => { },
});
userContext.displayName = 'UserContext';

function reducer(state, action) {
    console.debug('userContextUpdate:', action);
    switch (action.type) {
        case 'login':
            return { ...state, isLoggedIn: true };
        case 'logout':
            localStorage.removeItem('token');
            return defaultState;
        case 'setIsAdmin':
            return { ...state, isAdmin: action.payload };
        case 'setEmail':
            return { ...state, email: action.payload };
        case 'setPfpUrl':
            return { ...state, pfpUrl: action.payload };
        default:
            throw new Error('Invalid action dispatched on user context');
    }
}

export function UserContextProvider({ children }) {
    const token = localStorage.getItem('token');

    const [isLoading, setIsLoading] = useState(false);
    const [state, dispatch] = useReducer(reducer, defaultState, (state) => {
        if (!token) return state;
        setIsLoading(true);
        const localState = { ...state, isLoggedIn: true };
        const { email, picture } = jwtDecode(token);
        if (email) localState.email = email;
        if (picture) localState.pfpUrl = picture;
        return localState;
    });

    useEffect(() => {
        if (!state.isLoggedIn || !token) return;

        const abortController = new AbortController();
        setIsLoading(true);
        apiv2
            .get('/login', {
                signal: abortController.signal
            })
            .then((res) => {
                if (!res.data?.status) {
                    dispatch({ type: 'logout' });
                    return;
                }
                dispatch({ type: 'setIsAdmin', payload: res.data.isAdmin });
                const { email, picture } = jwtDecode(token);
                if (email && email !== state.email) {
                    dispatch({ type: 'setEmail', payload: email });
                }
                if (picture && picture !== state.pfpUrl) {
                    dispatch({ type: 'setPfpUrl', payload: picture });
                }
                dispatch({ type: 'login' });
                setIsLoading(false);
            })
            .catch((err) => {
                if (!err.name === 'AbortError') {
                    console.error(err);
                    dispatch({ type: 'logout' });
                    setIsLoading(false);
                }
            })

        return () => abortController.abort();
    }, [state.isLoggedIn]);

    return (
        <userContext.Provider
            value={{ isLoading, ...state, dispatchUserStateUpdate: dispatch }}
        >
            {children}
        </userContext.Provider>
    );
}

export default userContext;
