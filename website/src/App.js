import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './css/app.css';
import { Route, BrowserRouter, Routes } from 'react-router-dom';
import PrivateRoutes from './components/privateRoutes';
import NavBar from './components/NavBar';
import Home from './views/home';
import Login from './views/login';
import Buckets from './views/buckets';
import HTTPError from './views/httpError';
import ConceptMap from './views/conceptMap';
import StudentSelectionWrapper from './components/StudentSelectionWrapper';

const theme = createTheme({
    palette: {
        primary: { main: '#00284e' },
        secondary: { main: '#e3a83b' },
    },
    typography: { fontFamily: ['Roboto'] },
});

export default function App() {
    return (
        <ThemeProvider theme={theme}>
            <StudentSelectionWrapper>
                <div className="app">
                    <div className="content">
                        <BrowserRouter>
                            <div className="nav">
                                <NavBar />
                            </div>
                            <Routes>
                                <Route path="/login" element={<Login />} />
                                <Route path="/buckets" element={<Buckets />} />
                                <Route element={<PrivateRoutes />}>
                                    <Route path="/" element={<Home />} />
                                </Route>
                                <Route path="/conceptmap" element={<ConceptMap />} />
                                <Route path="/serverError" element={<HTTPError errorCode={500} />} />
                                <Route path="/clientError" element={<HTTPError errorCode={400} />} />
                                <Route path="*" element={<HTTPError errorCode={404} />} />
                            </Routes>
                        </BrowserRouter>
                    </div>
                </div>
            </StudentSelectionWrapper>
        </ThemeProvider>
    );
}
