const RateLimit = require('express-rate-limit');
const createProxyMiddleware =
    require('http-proxy-middleware').createProxyMiddleware;
const dotenv = require('dotenv');
dotenv.config();

// API proxy middleware, mounted with app.use('/api', ...). Express strips the mount
// path before http-proxy-middleware (v3) sees the request, so the target carries the
// /api prefix again: /api/v2/bins -> <REACT_APP_PROXY_SERVER>/api/v2/bins (as
// website/src/setupProxy.js does for the dev server). PORT is this server's own
// port, so it is not a usable fallback for the API.
const apiServer = (process.env.REACT_APP_PROXY_SERVER || 'http://localhost:8000').replace(/\/+$/, '');
exports.proxy = createProxyMiddleware({
    target: `${apiServer}/api`,
    changeOrigin: true,
});

/**
 * Use to exclude a route from being verified with middleware.
 * @param {String} path
 * @param {Function} middleware
 * @returns Function
 */
exports.unless = (path, middleware) => {
    return function (req, res, next) {
        console.log(path, req.path);
        if (path === req.path) {
            return next();
        } else {
            return middleware(req, res, next);
        }
    };
};

/**
 * Use to limit the number of requests made per minute.
 * @param {int} requests
 * @returns {RateLimit} rate limiter middleware
 */
exports.limit = (requests) => {
    return RateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: requests, // limit each IP input requests per minute
        message: 'Too many requests, please try again after 1 minute',
    });
};
