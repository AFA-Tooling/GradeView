import axios from 'axios';

const URL = window.location.origin;

let api;

if (localStorage.getItem('token')) {
    api = axios.create({
        baseURL: `${URL}/api`,
        headers: { Authorization: localStorage.getItem('token') },
        validateStatus: status =>
            (status >= 200 && status < 300) || status === 304,
    });
} else {
    api = axios.create({
        baseURL: `${URL}/api`,
        validateStatus: status =>
            (status >= 200 && status < 300) || status === 304,
    });
}

api.interceptors.response.use(undefined, (err) => {
    try {
        const errorCode = err.response.status;
        switch (errorCode) {
            case 401:
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

export default api;
