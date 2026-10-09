const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const http = require('http');
const path = require('path');

const { proxy, limit } = require('./middleware');

dotenv.config();

const app = express();
app.disable('x-powered-by');

app.use(cors());
app.use(express.static(path.join(__dirname, 'build')));

// Set up API proxy middleware
// Apply a higher, scoped rate limit to API routes only, then proxy
app.use('/api', limit(60));
app.use('/api', proxy);

// Remove global rate limiting to avoid throttling static assets and pages

// Serve static files from the React app
app.get('/*', (_, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Last handler: answer errors (for example a URL with invalid percent-encoding, or a
// missing build/index.html) with the status text only. Without it Express's default
// handler sends the stack trace, with internal paths, whenever NODE_ENV is not
// "production".
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    const code = err.status || err.statusCode;
    const status = Number.isInteger(code) && code >= 400 && code < 600 ? code : 500;
    if (status >= 500) {
        console.error(`[ERROR] ${req.method} request failed:`, err);
    }
    res.status(status).type('text/plain').send(http.STATUS_CODES[status] || 'Error');
});

// Start the server listening on the unix socket or port if configured otherwise port 3000.
const sock = process.env.SOCKETS_DIR && `${process.env.SOCKETS_DIR}/app.sock`;
const port = process.env.PORT || 3000;
app.listen(sock || port, () => {
    if (sock) {
        console.log(`Server is listening on ${sock}`);
        require('child_process').exec(
            `chmod o+rw ${sock}`,
            (err, stdout, stderr) => {
                if (err) {
                    console.error(`[ERROR] execution error: ${err}`);
                }
                console.log(`[LOG]: ${stdout}`);
                console.error(`[ERROR]: ${stderr}`);
            },
        );
    } else {
        console.log(`Server is listening on port ${port}`);
    }
});
