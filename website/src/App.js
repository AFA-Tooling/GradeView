import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import { Route, BrowserRouter, Routes, Navigate } from 'react-router-dom';

import Buckets from './views/buckets';
import ConceptMap from './views/conceptMap';
import Home from './views/home';
import HTTPError from './views/httpError';
import Login from './views/login';
import NavBar from './components/NavBar';
import PrivateRoutes from './components/PrivateRoutes';
import StudentSelectionWrapper from './components/StudentSelectionWrapper';
import { UserContextProvider } from './contexts/userContext';

import './css/app.css';

const theme = createTheme({
    palette: {
        primary: {
            main: '#00284e',
        },
        secondary: {
            main: '#e3a83b',
        },
    },
    typography: {
        fontFamily: ['Roboto'],
    },
});

console.log(
    '%cGradeView',
    'color: #e3a83b; -webkit-text-stroke: 2px black; font-size: 72px; font-weight: bold; font-family: monospace;',
);
console.log(
    '%cDeveloped by Connor Bernard at UC Berkeley under professor Daniel Garcia for use by CS10 and CS61C.',
    'color:#2299bb; font-size: 12px; font-family: monospace',
);

function AppProvider({ children }) {
    return (
        <UserContextProvider>
            <StudentSelectionWrapper>
                <ThemeProvider theme={theme}>{children}</ThemeProvider>
            </StudentSelectionWrapper>
        </UserContextProvider>
    );
}

export default function App() {
    // TODO: set up admin check functionality.
    return (
        <AppProvider>
            <div className='app'>
                <div className='content'>
                    <BrowserRouter>
                        <div className='nav'>
                            <NavBar />
                        </div>
                        <Routes>
                            <Route
                                exact
                                path='/login'
                                element={
                                    localStorage.getItem('token') ? (
                                        <Navigate to='/' />
                                    ) : (
                                        <Login />
                                    )
                                }
                            />
                            <Route
                                exact
                                path='/buckets'
                                element={<Buckets />}
                            />
                            <Route element={<PrivateRoutes />}>
                                <Route exact path='/' element={<Home />} />
                            </Route>
                            <Route
                                exact
                                path='/conceptmap'
                                element={<ConceptMap />}
                            />
                            <Route
                                exact
                                path='/serverError'
                                element={<HTTPError errorCode={500} />}
                            />
                            <Route
                                exact
                                path='/clientError'
                                element={<HTTPError errorCode={400} />}
                            />
                            <Route
                                exact
                                path='*'
                                element={<HTTPError errorCode={404} />}
                            />
                        </Routes>
                    </BrowserRouter>
                </div>
            </div>
        </AppProvider>
    );
}
