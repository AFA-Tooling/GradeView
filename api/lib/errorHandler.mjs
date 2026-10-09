import { STATUS_CODES } from 'node:http';
import AuthorizationError from './errors/http/AuthorizationError.js';
import NotFoundError from './errors/http/NotFoundError.js';
import UnauthorizedAccessError from './errors/http/UnauthorizedAccessError.js';

// Errors whose messages are written for clients (see lib/errors/http). StudentNotFoundError
// extends NotFoundError. BadSheetDataError is a 500 and is deliberately not listed.
const CLIENT_ERROR_TYPES = [AuthorizationError, UnauthorizedAccessError, NotFoundError];

const INTERNAL_ERROR_MESSAGE = 'Internal server error.';

/**
 * Maps an error to the status and message that are safe to send to the client.
 * @param {Error} err the error that was raised.
 * @returns {{status: number, message: string}} the response to send.
 */
function toClientResponse(err) {
    if (CLIENT_ERROR_TYPES.some((type) => err instanceof type)) {
        return { status: err.status, message: err.message };
    }
    // Other 4xx errors (e.g. a malformed JSON body or URL parameter) keep their status, but
    // their messages can quote the request, so only the standard reason phrase is sent.
    const status = err?.status ?? err?.statusCode;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
        return { status, message: STATUS_CODES[status] ?? 'Bad Request' };
    }
    return { status: 500, message: INTERNAL_ERROR_MESSAGE };
}

/**
 * Express error handler for the API.
 *
 * Responds with `{ message }`: the message of a known HTTP error (lib/errors/http) for 4xx,
 * and a generic message for everything else, so Redis errors (which embed the key, i.e. a
 * student's email) and stack traces never reach the client. Details are logged server-side;
 * request headers (and so the Authorization token) are never logged.
 * @param {Error} err the error that was raised.
 * @param {Request} req the request.
 * @param {Response} res the response.
 * @param {Function} next the next handler.
 */
export default function apiErrorHandler(err, req, res, next) {
    const { status, message } = toClientResponse(err);
    const route = `${req.method} ${(req.originalUrl ?? req.url ?? '').split('?')[0]}`;
    if (status >= 500) {
        console.error('[api] %s failed:', route, err);
    } else {
        console.warn('[api] %s rejected with %d (%s)', route, status, err?.name ?? 'Error');
    }

    if (res.headersSent) {
        // Too late to send an error response; let Express close the connection.
        return next(err);
    }
    return res.status(status).json({ message });
}
