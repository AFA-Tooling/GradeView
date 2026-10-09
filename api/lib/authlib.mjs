import AuthorizationError from './errors/http/AuthorizationError.js';
import UnauthorizedAccessError from './errors/http/UnauthorizedAccessError.js';
import { getEmailFromAuth } from './googleAuthHelper.mjs';
import { isAdmin, isStudent } from './userlib.mjs';

// Route params that name the student whose data is being requested.
const STUDENT_ROUTE_PARAMS = ['email', 'id'];

/**
 * Verifies the request's Google ID token.
 * @param {Request} req the request to authenticate.
 * @returns {Promise<string>} the requester's verified, lowercased email.
 * @throws {AuthorizationError} (401) if the token is missing or invalid.
 */
async function authenticate(req) {
    const authHeader = req.headers?.authorization;
    if (!authHeader) {
        throw new AuthorizationError('no authorization token provided.');
    }
    return getEmailFromAuth(authHeader);
}

/**
 * Checks that every student named in the route params is the requester.
 * @param {Request} req the request being authorized.
 * @param {string} authEmail the requester's verified, lowercased email.
 * @throws {UnauthorizedAccessError} (403) if the route names someone else.
 */
function assertOwnStudentRoute(req, authEmail) {
    for (const param of STUDENT_ROUTE_PARAMS) {
        const requested = req.params?.[param];
        if (requested === undefined) {
            continue;
        }
        if (typeof requested !== 'string' || requested.toLowerCase() !== authEmail) {
            throw new UnauthorizedAccessError('not permitted');
        }
    }
}

/**
 * Lets admins through, and students only to their own data.
 *
 * The token is verified once and `next` is called exactly once: with no arguments when the
 * request is allowed, otherwise with an AuthorizationError (401: no or invalid token) or an
 * UnauthorizedAccessError (403: valid token, but not registered or not the requested student).
 * On success, `req.auth` is set to `{ email, role }`.
 * @param {Request} req request to validate.
 * @param {Response} _res unused.
 * @param {Function} next trigger the next middleware / request.
 */
export async function validateAdminOrStudentMiddleware(req, _res, next) {
    let auth;
    try {
        const email = await authenticate(req);
        if (isAdmin(email)) {
            auth = { email, role: 'admin' };
        } else {
            assertOwnStudentRoute(req, email);
            if (!(await isStudent(email))) {
                throw new UnauthorizedAccessError('You are not a registered student.');
            }
            auth = { email, role: 'student' };
        }
    } catch (err) {
        return next(err);
    }
    req.auth = auth;
    return next();
}

/**
 * Lets only admins through.
 *
 * Calls `next` exactly once: with no arguments for an admin, otherwise with an
 * AuthorizationError (401) or an UnauthorizedAccessError (403). On success, `req.auth`
 * is set to `{ email, role: 'admin' }`.
 * @param {Request} req the request to validate.
 * @param {Response} _res unused.
 * @param {Function} next trigger the next middleware / request.
 */
export async function validateAdminMiddleware(req, _res, next) {
    let email;
    try {
        email = await authenticate(req);
        if (!isAdmin(email)) {
            throw new UnauthorizedAccessError('not permitted');
        }
    } catch (err) {
        return next(err);
    }
    req.auth = { email, role: 'admin' };
    return next();
}
