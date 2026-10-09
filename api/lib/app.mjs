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

    // --- Legacy grades URL: GET /api/v2/students/grades?email=X
    // An nginx rule added in b9304b0 (and possibly still in the production TLS config, which is
    // not in this repo) proxies /api/v2/students/<email>/grades to this form. Rewrite it back to
    // the path form so it goes through the same students router, and so the same
    // validateAdminOrStudentMiddleware, as every other per-student request.
    app.get('/api/v2/students/grades', (req, res, next) => {
        const { email } = req.query;
        if (typeof email !== 'string' || email.length === 0) {
            return res.status(400).json({ message: 'Email parameter required' });
        }
        req.url = `/api/v2/students/${encodeURIComponent(email)}/grades`;
        return next();
    });

    // Mount your real API
    app.use('/api', ApiV2Router);

    // (Optional) log unknown API routes
    app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

    // Errors raised outside the API router (e.g. a malformed JSON body).
    app.use(apiErrorHandler);

    return app;
}
