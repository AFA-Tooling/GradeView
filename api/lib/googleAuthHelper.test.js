// Unit tests for getEmailFromAuth. Google's verifyIdToken is replaced, so no network calls are
// made and the tokens below are fake strings, not JWTs.
jest.mock('config', () => require('../test/support/fixtures.js').configModule);

const { OAuth2Client } = require('google-auth-library');
const { getEmailFromAuth } = require('./googleAuthHelper.mjs');
const AuthorizationError = require('./errors/http/AuthorizationError.js').default;
const { CONFIG } = require('../test/support/fixtures.js');

const CLIENT_ID = CONFIG['googleconfig.oauth.clientid'];

const payloadFor = (overrides = {}) => ({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    email: 'student01@berkeley.edu',
    email_verified: true,
    hd: 'berkeley.edu',
    ...overrides,
});

// fake token -> payload the (mocked) Google verification returns for it
const PAYLOADS = {
    'fake-token-valid': payloadFor(),
    'fake-token-mixed-case': payloadFor({ email: 'Student01@Berkeley.EDU' }),
    'fake-token-gmail': payloadFor({ email: 'student01@gmail.com', hd: undefined }),
    'fake-token-other-hd': payloadFor({ email: 'student01@example.edu', hd: 'example.edu' }),
    'fake-token-unverified': payloadFor({ email_verified: false }),
    'fake-token-verified-missing': payloadFor({ email_verified: undefined }),
    'fake-token-verified-string': payloadFor({ email_verified: 'true' }),
    'fake-token-no-email': payloadFor({ email: undefined }),
};

let verifyIdToken;
let warn;
let error;

beforeEach(() => {
    verifyIdToken = jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockImplementation(async ({ idToken }) => {
            const payload = PAYLOADS[idToken];
            if (!payload) {
                // google-auth-library puts the token itself in some of its error messages.
                throw new Error(`Wrong number of segments in token: ${idToken}`);
            }
            return { getPayload: () => payload };
        });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

const loggedText = () => [...warn.mock.calls, ...error.mock.calls].flat().map(String).join('\n');

describe('getEmailFromAuth', () => {
    test('returns the verified email and checks the configured audience', async () => {
        await expect(getEmailFromAuth('Bearer fake-token-valid')).resolves.toBe('student01@berkeley.edu');
        expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'fake-token-valid', audience: CLIENT_ID });
    });

    test('lowercases the email', async () => {
        await expect(getEmailFromAuth('Bearer fake-token-mixed-case')).resolves.toBe('student01@berkeley.edu');
    });

    test.each(['bearer fake-token-valid', 'BEARER fake-token-valid', 'Bearer   fake-token-valid'])(
        'accepts the Bearer scheme case-insensitively: %p',
        async (header) => {
            await expect(getEmailFromAuth(header)).resolves.toBe('student01@berkeley.edu');
        },
    );

    test.each([
        ['missing', undefined],
        ['null', null],
        ['empty', ''],
        ['an array (what verifyaccess used to pass)', ['Bearer', 'fake-token-valid']],
        ['missing the scheme', 'fake-token-valid'],
        ['using another scheme', 'Basic fake-token-valid'],
        ['the scheme only', 'Bearer'],
        ['the scheme and blanks', 'Bearer   '],
        ['carrying extra parts', 'Bearer fake-token-valid extra'],
        ['missing the separator', 'Bearerfake-token-valid'],
    ])('rejects a header that is %s, without calling Google', async (_, header) => {
        await expect(getEmailFromAuth(header)).rejects.toBeInstanceOf(AuthorizationError);
        expect(verifyIdToken).not.toHaveBeenCalled();
    });

    test.each([
        ['a non-Berkeley Google account (no hd)', 'fake-token-gmail'],
        ['another hosted domain', 'fake-token-other-hd'],
        ['email_verified false', 'fake-token-unverified'],
        ['email_verified missing', 'fake-token-verified-missing'],
        ['email_verified as a string', 'fake-token-verified-string'],
        ['no email claim', 'fake-token-no-email'],
    ])('rejects %s', async (_, token) => {
        const err = await getEmailFromAuth(`Bearer ${token}`).catch((e) => e);
        expect(err).toBeInstanceOf(AuthorizationError);
        expect(err.status).toBe(401);
    });

    test('a token Google rejects becomes an AuthorizationError, and the token is not logged', async () => {
        const err = await getEmailFromAuth('Bearer fake-token-forged.abc.def').catch((e) => e);
        expect(err).toBeInstanceOf(AuthorizationError);
        expect(err.message).toBe('Could not authenticate authorization token.');
        expect(err.message).not.toContain('fake-token-forged');
        expect(loggedText()).not.toContain('fake-token-forged');
    });

    test('rejection messages never include the email from the token', async () => {
        const err = await getEmailFromAuth('Bearer fake-token-other-hd').catch((e) => e);
        expect(err.message).not.toContain('example.edu');
        expect(loggedText()).not.toContain('student01');
    });

    test('reuses one OAuth2Client across calls (so Google certificates stay cached)', async () => {
        await getEmailFromAuth('Bearer fake-token-valid');
        await getEmailFromAuth('Bearer fake-token-mixed-case');
        await getEmailFromAuth('Bearer fake-token-unverified').catch(() => {});

        const clients = verifyIdToken.mock.contexts;
        expect(clients).toHaveLength(3);
        expect(clients[0]).toBeInstanceOf(OAuth2Client);
        expect(clients[1]).toBe(clients[0]);
        expect(clients[2]).toBe(clients[0]);
    });
});
