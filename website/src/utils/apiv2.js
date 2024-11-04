import axios from 'axios';

const URL = window.location.origin;

const api = axios.create({
    baseURL: `${URL}/api/v2`,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = token;
    }
    return config;
});

api.interceptors.response.use(undefined, (err) => {
    if (err.response?.status === 401) {
        localStorage.setItem('token', '');
        window.location.href = `${URL}/login`;
    }
    return Promise.reject(err);
});

export default api;
