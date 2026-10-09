import config from 'config';
import { OAuth2Client } from 'google-auth-library';
import AuthorizationError from './errors/http/AuthorizationError.js';

const BERKELEY_HOSTED_DOMAIN = 'berkeley.edu';

// "Bearer <token>": the scheme is case-insensitive (RFC 7235), and the token is a single
// run of non-whitespace characters. Anything else (no scheme, extra parts) is rejected.
const BEARER_HEADER = /^Bearer[ \t]+(\S+)$/i;

// verifyIdToken skips the audience check when no audience is given, so refuse to start
// without one rather than accept ID tokens minted for any Google client.
const GOOGLE_OAUTH_AUDIENCE = config.get('googleconfig.oauth.clientid');
if (typeof GOOGLE_OAUTH_AUDIENCE !== 'string' || GOOGLE_OAUTH_AUDIENCE.length === 0) {
    throw new Error('googleconfig.oauth.clientid must be a non-empty string');
}

// One client for the whole process, so Google's signing certificates are fetched once and
// cached by the library instead of being downloaded again for every request.
const oauthClient = new OAuth2Client(GOOGLE_OAUTH_AUDIENCE);

/**
 * Extracts the token from an Authorization header value.
 * @param {string} authHeader the raw Authorization header.
 * @returns {string} the bearer token.
 * @throws {AuthorizationError} if the header is missing or not "Bearer <token>".
 */
function getBearerToken(authHeader) {
    if (typeof authHeader !== 'string') {
        throw new AuthorizationError('no authorization token provided.');
    }
    const match = BEARER_HEADER.exec(authHeader.trim());
    if (!match) {
        throw new AuthorizationError('Could not authenticate authorization token.');
    }
    return match[1];
}

/**
 * Verifies a Google ID token and returns the signed-in Berkeley email.
 * @param {string} authHeader the Authorization header value ("Bearer <token>").
 * @returns {Promise<string>} the verified email address, lowercased.
 * @throws {AuthorizationError} if the header is malformed, the token does not verify,
 * the email is not verified, or the account is not in the berkeley.edu domain.
 */
export async function getEmailFromAuth(authHeader) {
    const idToken = getBearerToken(authHeader);

    let payload;
    try {
        const ticket = await oauthClient.verifyIdToken({
            idToken,
            audience: GOOGLE_OAUTH_AUDIENCE,
        });
        payload = ticket.getPayload();
    } catch (err) {
        // The library's messages can embed the token or its decoded payload; keep them out of the logs.
        console.warn('Google ID token verification failed (%s).', err?.name ?? 'Error');
        throw new AuthorizationError('Could not authenticate authorization token.');
    }

    if (!payload || payload.email_verified !== true) {
        console.warn('Rejected Google ID token: email not verified.');
        throw new AuthorizationError('Could not authenticate authorization token.');
    }
    if (payload.hd !== BERKELEY_HOSTED_DOMAIN) {
        console.warn('Rejected Google ID token: hosted domain mismatch.');
        throw new AuthorizationError('Could not authenticate authorization token.');
    }
    if (typeof payload.email !== 'string' || payload.email.length === 0) {
        console.warn('Rejected Google ID token: no email claim.');
        throw new AuthorizationError('Could not authenticate authorization token.');
    }
    return payload.email.toLowerCase();
}
