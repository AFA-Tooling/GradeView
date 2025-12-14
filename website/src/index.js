import React from 'react';
import ReactDOM from 'react-dom/client';
import './css/index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // StrictMode temporarily disabled to avoid double API calls during development
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);
