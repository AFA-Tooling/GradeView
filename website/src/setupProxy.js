// src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost',   // your Nginx on port 80
      changeOrigin: true,
      pathRewrite: { '^/api': '/api' }, // no-op, but explicit
      timeout:     30000,            // 30s
      proxyTimeout:30000,
    })
  );
};
