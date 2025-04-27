const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    const proxyServerAddress =
        process.env.REACT_APP_PROXY_SERVER || 'http://localhost:8000';
    app.use(
        '/api',
        createProxyMiddleware({
            target: `${proxyServerAddress}/api`,
            changeOrigin: true,
        }),
    );
};
