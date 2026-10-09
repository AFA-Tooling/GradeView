import cors from 'cors';
import express, { json, urlencoded } from 'express';
import logger from './logger.mjs';
import apiErrorHandler from './errorHandler.mjs';
import ApiV2Router from '../Router.js';

/**
 * Builds the API's Express app (server.js only adds `listen`), so tests can exercise the same
 * middleware stack that runs in production.
 * @returns {Express} the configured app.
 */
export function createApp() {
    const app = express();

    // Critical when running behind Nginx/TLS
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    app.use(logger);

    // Allow your prod + local origins. Add others as needed.
    app.use(cors({
        origin: ['https://gradeview.eecs.berkeley.edu', 'http://localhost'],
        credentials: true,
    }));

    app.use(json());
    app.use(urlencoded({ extended: false }));

    // --- Health check (nice for sanity & uptime monitors)
    app.get(['/api/health', '/health'], (_, res) => res.json({ ok: true }));

    // Mount your real API
    app.use('/api', ApiV2Router);

    // (Optional) log unknown API routes
    app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

    // Errors raised outside the API router (e.g. a malformed JSON body).
    app.use(apiErrorHandler);

    return app;
}
