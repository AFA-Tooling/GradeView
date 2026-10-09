// Authorization matrix for every per-student route, run through the real app (lib/app.mjs:
// the same middleware stack server.js serves). Google token verification is replaced by a fake
// getEmailFromAuth, and the `redis` package by an in-memory fake, so the real redisHelper,
// userlib and authlib code runs against fake data.
const request = require('supertest');

jest.mock('redis', () => require('../../../test/support/fakeRedis.js'));
jest.mock('mime', () => require('../../../test/support/fakeMime.js'));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('config', () => require('../../../test/support/fixtures.js').configModule);
jest.mock('../../../lib/googleAuthHelper.mjs', () => ({
    getEmailFromAuth: jest.fn(require('../../../test/support/fixtures.js').fakeGetEmailFromAuth),
}));
jest.mock('../../../lib/logger.mjs', () => (req, res, next) => next());
// The students router allows 100 requests per 5 minutes per client; this suite sends more.
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

const { createApp } = require('../../../lib/app.mjs');
const { getEmailFromAuth } = require('../../../lib/googleAuthHelper.mjs');
const { fakeRedis } = require('redis');
const {
    ADMIN,
    STUDENT_A,
    STUDENT_B,
    OUTSIDER,
    TOKENS,
    STUDENT_RECORDS,
    seedClass,
} = require('../../../test/support/fixtures.js');

const PER_STUDENT_ROUTES = [
    'grades',
    'projections',
    'progressquerystring',
    'masterymapping',
    'concept-structure',
];

// Strings that only appear in internal errors (Redis error messages, stack traces).
const INTERNAL_ERROR_TEXT = [
    'KeyNotFound',
    'StudentNotEnrolled',
    'not enrolled',
    'not found in database',
    'simulated connection failure',
    'MAX POINTS',
    '    at ',
];

const studentUrl = (email, route) => `/api/v2/students/${encodeURIComponent(email)}/${route}`;

/**
 * Asserts that an error response is `{ message }` and leaks neither internal error text nor
 * any of the given emails (or the matching student's legal name).
 */
function expectSafeErrorBody(res, ...emails) {
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Object.keys(res.body)).toEqual(['message']);
    const text = res.text.toLowerCase();
    for (const fragment of INTERNAL_ERROR_TEXT) {
        expect(text).not.toContain(fragment.toLowerCase());
    }
    for (const email of emails) {
        expect(text).not.toContain(email.toLowerCase());
        expect(text).not.toContain(encodeURIComponent(email).toLowerCase());
        const legalName = STUDENT_RECORDS[email]?.['Legal Name'];
        if (legalName) {
            expect(text).not.toContain(legalName.toLowerCase());
        }
    }
}

let app;

beforeAll(() => {
    app = createApp();
});

beforeEach(() => {
    fakeRedis.reset();
    seedClass(fakeRedis);
    getEmailFromAuth.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    // Every Redis client a request opened was closed again.
    expect(fakeRedis.state.openClients).toBe(0);
    jest.restoreAllMocks();
});

describe.each(PER_STUDENT_ROUTES)('GET /api/v2/students/:email/%s', (route) => {
    test('no token -> 401, before any Redis read', async () => {
        const res = await request(app).get(studentUrl(STUDENT_B, route));
        expect(res.status).toBe(401);
        expectSafeErrorBody(res, STUDENT_B);
        expect(fakeRedis.state.clientsCreated).toBe(0);
    });

    test.each([
        ['garbage'],
        ['Bearer'],
        ['Bearer not-a-real-token'],
        ['Basic dXNlcjpwYXNz'],
    ])('malformed or unknown token %p -> 401', async (header) => {
        const res = await request(app).get(studentUrl(STUDENT_B, route)).set('Authorization', header);
        expect(res.status).toBe(401);
        expectSafeErrorBody(res, STUDENT_B);
        expect(fakeRedis.state.clientsCreated).toBe(0);
    });

    test('student A requesting student B -> 403', async () => {
        const res = await request(app)
            .get(studentUrl(STUDENT_B, route))
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(403);
        expectSafeErrorBody(res, STUDENT_A, STUDENT_B);
        expect(getEmailFromAuth).toHaveBeenCalledTimes(1);
    });

    test('student A requesting student B with different casing -> 403', async () => {
        const res = await request(app)
            .get(studentUrl(STUDENT_B.toUpperCase(), route))
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(403);
        expectSafeErrorBody(res, STUDENT_A, STUDENT_B);
    });

    test('student A requesting own data -> 200', async () => {
        const res = await request(app)
            .get(studentUrl(STUDENT_A, route))
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(200);
        expect(getEmailFromAuth).toHaveBeenCalledTimes(1);
    });

    test('student A requesting own data with different casing -> 200, same data', async () => {
        const canonical = await request(app)
            .get(studentUrl(STUDENT_A, route))
            .set('Authorization', TOKENS.studentA);
        const res = await request(app)
            .get(studentUrl('Student01@Berkeley.EDU', route))
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(200);
        // Looked up under the verified email, not the path as typed (Redis keys are case-sensitive).
        expect(res.text).toBe(canonical.text);
    });

    test('admin requesting any student -> 200', async () => {
        const res = await request(app)
            .get(studentUrl(STUDENT_B, route))
            .set('Authorization', TOKENS.admin);
        expect(res.status).toBe(200);
        expect(getEmailFromAuth).toHaveBeenCalledTimes(1);
    });

    test('valid Berkeley user not on the roster, own email -> 403 (not 500)', async () => {
        const res = await request(app)
            .get(studentUrl(OUTSIDER, route))
            .set('Authorization', TOKENS.outsider);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ message: 'You are not a registered student.' });
        expectSafeErrorBody(res, OUTSIDER);
    });

    test('valid Berkeley user not on the roster, another student -> 403', async () => {
        const res = await request(app)
            .get(studentUrl(STUDENT_A, route))
            .set('Authorization', TOKENS.outsider);
        expect(res.status).toBe(403);
        expectSafeErrorBody(res, OUTSIDER, STUDENT_A);
    });
});

describe('responses that carry data', () => {
    test('grades: student A sees their own scores, admin sees student B', async () => {
        const own = await request(app)
            .get(studentUrl(STUDENT_A, 'grades'))
            .set('Authorization', TOKENS.studentA);
        expect(own.body.Projects['Project 2']).toEqual({ student: 15, max: 20 });

        const other = await request(app)
            .get(studentUrl(STUDENT_B, 'grades'))
            .set('Authorization', TOKENS.admin);
        expect(other.body.Projects['Project 2']).toEqual({ student: 18, max: 20 });
    });

    test('grades: an admin viewing their own page gets the max scores', async () => {
        const res = await request(app)
            .get(studentUrl(ADMIN, 'grades'))
            .set('Authorization', TOKENS.admin);
        expect(res.status).toBe(200);
        expect(res.body.Projects['Project 1']).toEqual({ student: 10, max: 10 });
    });

    test('projections: shape is unchanged', async () => {
        const res = await request(app)
            .get(studentUrl(STUDENT_A, 'projections'))
            .set('Authorization', TOKENS.studentA);
        expect(Object.keys(res.body).sort()).toEqual(['pace', 'perfect', 'zeros']);
    });
});

// The old nginx rule (b9304b0) proxies /api/v2/students/<email>/grades to this form; the API
// rewrites it back to the path form, so it gets exactly the same authorization.
describe('GET /api/v2/students/grades?email= (legacy nginx rewrite)', () => {
    const oldUrl = (email) => `/api/v2/students/grades?email=${encodeURIComponent(email)}`;

    test('no token -> 401, before any Redis read', async () => {
        const res = await request(app).get(oldUrl(STUDENT_B));
        expect(res.status).toBe(401);
        expectSafeErrorBody(res, STUDENT_B);
        expect(fakeRedis.state.clientsCreated).toBe(0);
    });

    test.each([['garbage'], ['Bearer not-a-real-token']])('malformed or unknown token %p -> 401', async (header) => {
        const res = await request(app).get(oldUrl(STUDENT_B)).set('Authorization', header);
        expect(res.status).toBe(401);
        expectSafeErrorBody(res, STUDENT_B);
        expect(fakeRedis.state.clientsCreated).toBe(0);
    });

    test('student A asking for student B -> 403, no data', async () => {
        const res = await request(app).get(oldUrl(STUDENT_B)).set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(403);
        expectSafeErrorBody(res, STUDENT_A, STUDENT_B);
    });

    test('a path in the email cannot reach another route', async () => {
        const res = await request(app)
            .get(oldUrl(`${STUDENT_A}/../${STUDENT_B}`))
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(403);
        expectSafeErrorBody(res, STUDENT_A, STUDENT_B);
    });

    test.each([
        ['student A asking for own email', STUDENT_A, TOKENS.studentA],
        ['student A asking for own email with different casing', 'Student01@Berkeley.EDU', TOKENS.studentA],
        ['admin asking for student B', STUDENT_B, TOKENS.admin],
    ])('%s -> 200, same body as the path form', async (_, email, token) => {
        const pathForm = await request(app).get(studentUrl(email, 'grades')).set('Authorization', token);
        const res = await request(app).get(oldUrl(email)).set('Authorization', token);
        expect(res.status).toBe(200);
        expect(res.text).toBe(pathForm.text);
        expect(res.body.Projects['Project 1']).toEqual(expect.objectContaining({ max: 10 }));
    });

    test('valid Berkeley user not on the roster -> 403 (not 500)', async () => {
        const res = await request(app).get(oldUrl(OUTSIDER)).set('Authorization', TOKENS.outsider);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ message: 'You are not a registered student.' });
    });

    test.each([
        ['/api/v2/students/grades'],
        ['/api/v2/students/grades?email='],
        [`/api/v2/students/grades?email=${STUDENT_A}&email=${STUDENT_B}`],
    ])('%s -> 400 without a single email', async (url) => {
        const res = await request(app).get(url).set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Email parameter required' });
        expect(fakeRedis.state.clientsCreated).toBe(0);
    });
});

describe('Redis unreachable (connect rejects)', () => {
    beforeEach(() => {
        fakeRedis.state.failConnect = true;
    });

    test.each(PER_STUDENT_ROUTES)('student request for %s -> 500 without details, no client left open', async (route) => {
        const res = await request(app)
            .get(studentUrl(STUDENT_A, route))
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ message: 'Internal server error.' });
        expectSafeErrorBody(res, STUDENT_A);
        expect(fakeRedis.state.clientsCreated).toBeGreaterThan(0);
    });

    test.each(PER_STUDENT_ROUTES)('admin request for %s -> 500 without details', async (route) => {
        const res = await request(app)
            .get(studentUrl(STUDENT_B, route))
            .set('Authorization', TOKENS.admin);
        expect(res.status).toBe(500);
        expectSafeErrorBody(res, STUDENT_B);
    });

    test('Redis clients are created with reconnects disabled and a connect timeout', async () => {
        await request(app).get(studentUrl(STUDENT_A, 'grades')).set('Authorization', TOKENS.studentA);
        expect(fakeRedis.state.lastClientOptions.socket).toEqual({
            connectTimeout: expect.any(Number),
            reconnectStrategy: false,
        });
    });
});

describe('5xx responses are generic', () => {
    test('Redis failure while checking the roster -> 500 without details', async () => {
        fakeRedis.state.failGet = (key) => key === STUDENT_A;
        const res = await request(app)
            .get(studentUrl(STUDENT_A, 'grades'))
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ message: 'Internal server error.' });
        expectSafeErrorBody(res, STUDENT_A);
    });

    test('Redis failure inside concept-structure -> 500 without details', async () => {
        fakeRedis.state.failGet = (key) => key === 'MAX POINTS';
        const res = await request(app)
            .get(studentUrl(STUDENT_B, 'concept-structure'))
            .set('Authorization', TOKENS.admin);
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ message: 'Internal server error.' });
        expectSafeErrorBody(res, STUDENT_B);
    });

    test.each(['grades', 'projections', 'progressquerystring', 'masterymapping'])(
        'Redis failure inside %s -> 500 without details',
        async (route) => {
            fakeRedis.state.failGet = (key) => key === 'MAX POINTS';
            const res = await request(app)
                .get(studentUrl(STUDENT_B, route))
                .set('Authorization', TOKENS.admin);
            expect(res.status).toBe(500);
            expectSafeErrorBody(res, STUDENT_B);
        },
    );
});
