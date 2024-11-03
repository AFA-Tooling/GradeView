import axios from 'axios';

const URL = window.location.origin;

let api;

if (localStorage.getItem('token')) {
    api = axios.create({
        baseURL: `${URL}/api/`,
        headers: { Authorization: localStorage.getItem('token') },
    });
} else {
    api = axios.create({
        baseURL: `${URL}/api/`,
    });
}

api.interceptors.response.use(undefined, (err) => {
    try {
        const errorCode = err.response.status;
        switch (true) {
            case errorCode === 401:
                localStorage.setItem('token', '');
                window.location.href = `${URL}/login`;
                break;
            default:
                return Promise.reject(err);
        }
    } catch (axiosErr) {
        console.log(axiosErr);
        localStorage.setItem('token', '');
        window.location.href = `${URL}/login`;
    }
});

/**
 * @deprecated use apiv2 instead.
 */
export default api;
