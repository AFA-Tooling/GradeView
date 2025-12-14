const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    const proxyServerAddress =
        process.env.REACT_APP_PROXY_SERVER || 'http://localhost:8000';
    
    // Proxy /api/* requests
    app.use(
        '/api',
        createProxyMiddleware({
            target: `${proxyServerAddress}/api`,
            changeOrigin: true,
        }),
    );
    
    // Proxy /v2/* requests (direct routing)
    app.use(
        '/v2',
        createProxyMiddleware({
            target: `${proxyServerAddress}/api/v2`,
            changeOrigin: true,
            pathRewrite: {
                '^/v2': '',
            },
        }),
    );
};
