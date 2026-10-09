// Access review of every /api/v2 route outside /students/:email (covered in
// Routes/students/index.test.js), through the real app. Token verification is faked and Redis
// is in memory.
const request = require('supertest');

jest.mock('redis', () => require('../test/support/fakeRedis.js'));
jest.mock('mime', () => require('../test/support/fakeMime.js'));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('config', () => require('../test/support/fixtures.js').configModule);
jest.mock('../lib/googleAuthHelper.mjs', () => ({
    getEmailFromAuth: jest.fn(require('../test/support/fixtures.js').fakeGetEmailFromAuth),
}));
jest.mock('../lib/logger.mjs', () => (req, res, next) => next());
// The login and students routers allow 100 requests per 5 minutes per client; this suite sends more.
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

const { createApp } = require('../lib/app.mjs');
const { fakeRedis } = require('redis');
const { STUDENT_A, STUDENT_B, TOKENS, BINS, seedClass } = require('../test/support/fixtures.js');

let app;

beforeAll(() => {
    app = createApp();
});

beforeEach(() => {
    fakeRedis.reset();
    seedClass(fakeRedis);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    expect(fakeRedis.state.openClients).toBe(0);
    jest.restoreAllMocks();
});

describe('public routes', () => {
    test.each(['/api/health', '/health'])('GET %s needs no token', async (path) => {
        const res = await request(app).get(path);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    test('GET /api/v2/bins needs no token and only returns grade cutoffs', async () => {
        const res = await request(app).get('/api/v2/bins');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(BINS);
        expect(res.text).not.toContain('@');
    });

    test('responses do not advertise Express', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });
});

describe('GET /api/v2/login (website expects 200 { status })', () => {
    test.each([
        ['no token', undefined, false],
        ['a malformed token', 'garbage', false],
        ['an unknown token', 'Bearer forged', false],
        ['a Berkeley user not on the roster', TOKENS.outsider, false],
        ['a student', TOKENS.studentA, true],
        ['an admin', TOKENS.admin, true],
    ])('%s -> { status: %p }', async (_, header, status) => {
        const req = request(app).get('/api/v2/login');
        const res = await (header ? req.set('Authorization', header) : req);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status });
    });
});

describe('GET /api/v2/isadmin', () => {
    test.each([
        ['no token', undefined],
        ['a malformed token', 'garbage'],
    ])('%s -> 401', async (_, header) => {
        const req = request(app).get('/api/v2/isadmin');
        const res = await (header ? req.set('Authorization', header) : req);
        expect(res.status).toBe(401);
    });

    test.each([
        ['a student', TOKENS.studentA, false],
        ['a Berkeley user not on the roster', TOKENS.outsider, false],
        ['an admin', TOKENS.admin, true],
    ])('%s -> { isAdmin: %p }', async (_, header, isAdmin) => {
        const res = await request(app).get('/api/v2/isadmin').set('Authorization', header);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ isAdmin });
    });
});

describe('GET /api/v2/students (roster list)', () => {
    test('no token -> 401', async () => {
        const res = await request(app).get('/api/v2/students');
        expect(res.status).toBe(401);
        expect(res.text).not.toContain('@');
    });

    test('student -> 403', async () => {
        const res = await request(app).get('/api/v2/students').set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(403);
        expect(res.text).not.toContain(STUDENT_B);
    });

    test('admin -> 200 with [legal name, email] pairs', async () => {
        const res = await request(app).get('/api/v2/students').set('Authorization', TOKENS.admin);
        expect(res.status).toBe(200);
        expect(res.body.students).toEqual(
            expect.arrayContaining([
                ['One, Student', STUDENT_A],
                ['Two, Student', STUDENT_B],
            ]),
        );
    });
});

describe('/api/v2/admin/** is admins only', () => {
    const ADMIN_GETS = [
        '/api/v2/admin',
        '/api/v2/admin/categories',
        '/api/v2/admin/studentScores',
        '/api/v2/admin/studentScores/Projects/Project%201/9',
        '/api/v2/admin/stats/Projects/Project%201',
        '/api/v2/admin/distribution/Projects/Project%201',
        '/api/v2/admin/progressreports',
    ];

    describe.each(ADMIN_GETS)('GET %s', (path) => {
        test('no token -> 401, before any Redis read', async () => {
            const res = await request(app).get(path);
            expect(res.status).toBe(401);
            expect(fakeRedis.state.clientsCreated).toBe(0);
        });

        test('malformed token -> 401', async () => {
            const res = await request(app).get(path).set('Authorization', 'garbage');
            expect(res.status).toBe(401);
            expect(fakeRedis.state.clientsCreated).toBe(0);
        });

        test('student -> 403, before any Redis read', async () => {
            const res = await request(app).get(path).set('Authorization', TOKENS.studentA);
            expect(res.status).toBe(403);
            expect(res.text).not.toContain(STUDENT_B);
            expect(fakeRedis.state.clientsCreated).toBe(0);
        });

        test('admin -> 200', async () => {
            const res = await request(app).get(path).set('Authorization', TOKENS.admin);
            expect(res.status).toBe(200);
        });
    });

    test('POST /api/v2/admin/progressreports without a token -> 401 (no upload handled)', async () => {
        const res = await request(app)
            .post('/api/v2/admin/progressreports')
            .attach('schema', Buffer.from('fake'), 'fake.cm');
        expect(res.status).toBe(401);
    });

    test('GET /api/v2/admin/progressreports/:schemaName answers instead of hanging', async () => {
        const res = await request(app)
            .get('/api/v2/admin/progressreports/anything')
            .set('Authorization', TOKENS.admin);
        expect(res.status).toBe(501);
    });

    test('admin 500s do not echo internal error text', async () => {
        fakeRedis.state.failGet = (key) => key === STUDENT_B;
        const res = await request(app)
            .get('/api/v2/admin/studentScores')
            .set('Authorization', TOKENS.admin);
        expect(res.status).toBe(500);
        expect(res.text).not.toContain('simulated');
        expect(res.text).not.toContain(STUDENT_B);
    });
});

describe('removed and unknown routes', () => {
    test('the deprecated verifyaccess route is gone', async () => {
        const res = await request(app)
            .get('/api/v2/verifyaccess/verifyaccess')
            .set('Authorization', TOKENS.studentA);
        expect(res.status).toBe(404);
    });

    test('unknown API paths -> 404 { message }', async () => {
        const res = await request(app).get('/api/v2/nope');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'Not found' });
    });

    test('a malformed JSON body -> 400 without the parser message', async () => {
        const res = await request(app)
            .post('/api/v2/login')
            .set('Content-Type', 'application/json')
            .send(`{"email": "${STUDENT_A}",`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Bad Request' });
    });
});
