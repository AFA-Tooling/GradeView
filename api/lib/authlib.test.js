// Unit tests for the auth middlewares, called directly (no HTTP). Token verification is faked;
// the roster lookup runs the real userlib/redisHelper code against an in-memory Redis.
jest.mock('redis', () => require('../test/support/fakeRedis.js'));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('config', () => require('../test/support/fixtures.js').configModule);
jest.mock('./googleAuthHelper.mjs', () => ({
    getEmailFromAuth: jest.fn(require('../test/support/fixtures.js').fakeGetEmailFromAuth),
}));

const { validateAdminMiddleware, validateAdminOrStudentMiddleware } = require('./authlib.mjs');
const { getEmailFromAuth } = require('./googleAuthHelper.mjs');
const AuthorizationError = require('./errors/http/AuthorizationError.js').default;
const UnauthorizedAccessError = require('./errors/http/UnauthorizedAccessError.js').default;
const { fakeRedis } = require('redis');
const {
    ADMIN,
    STUDENT_A,
    STUDENT_B,
    OUTSIDER,
    TOKENS,
    seedClass,
} = require('../test/support/fixtures.js');

function makeRequest(authorization, params = {}) {
    return { headers: authorization === undefined ? {} : { authorization }, params };
}

// Runs a middleware and returns the arguments of every next() call.
async function run(middleware, req) {
    const next = jest.fn();
    await middleware(req, {}, next);
    return next.mock.calls;
}

beforeEach(() => {
    fakeRedis.reset();
    seedClass(fakeRedis);
    getEmailFromAuth.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('validateAdminOrStudentMiddleware', () => {
    test.each([
        ['admin, any student', TOKENS.admin, { email: STUDENT_B }, 'admin'],
        ['admin, no student param (login)', TOKENS.admin, {}, 'admin'],
        ['student, own email', TOKENS.studentA, { email: STUDENT_A }, 'student'],
        ['student, own email in other casing', TOKENS.studentA, { email: 'STUDENT01@berkeley.edu' }, 'student'],
        ['student, no student param (login)', TOKENS.studentA, {}, 'student'],
    ])('allows %s: next() once, no error, token verified once', async (_, header, params, role) => {
        const req = makeRequest(header, params);
        const calls = await run(validateAdminOrStudentMiddleware, req);
        expect(calls).toEqual([[]]);
        expect(getEmailFromAuth).toHaveBeenCalledTimes(1);
        expect(req.auth.role).toBe(role);
    });

    test.each([
        ['no Authorization header', undefined, { email: STUDENT_A }, AuthorizationError, 401],
        ['an unknown token', 'Bearer forged', { email: STUDENT_A }, AuthorizationError, 401],
        ['student A asking for student B', TOKENS.studentA, { email: STUDENT_B }, UnauthorizedAccessError, 403],
        ['student A asking for B through :id', TOKENS.studentA, { id: STUDENT_B }, UnauthorizedAccessError, 403],
        ['student A with :email ok but :id someone else', TOKENS.studentA, { email: STUDENT_A, id: STUDENT_B }, UnauthorizedAccessError, 403],
        ['a Berkeley user not on the roster', TOKENS.outsider, { email: OUTSIDER }, UnauthorizedAccessError, 403],
        ['a Berkeley user not on the roster logging in', TOKENS.outsider, {}, UnauthorizedAccessError, 403],
    ])('rejects %s: next(err) exactly once', async (_, header, params, errorType, status) => {
        const req = makeRequest(header, params);
        const calls = await run(validateAdminOrStudentMiddleware, req);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toHaveLength(1);
        expect(calls[0][0]).toBeInstanceOf(errorType);
        expect(calls[0][0].status).toBe(status);
        expect(getEmailFromAuth.mock.calls.length).toBeLessThanOrEqual(1);
        expect(req.auth).toBeUndefined();
    });

    test('a Redis failure during the roster check is passed on as a non-HTTP error', async () => {
        fakeRedis.state.failGet = (key) => key === STUDENT_A;
        const calls = await run(validateAdminOrStudentMiddleware, makeRequest(TOKENS.studentA, { email: STUDENT_A }));
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBeInstanceOf(Error);
        expect(calls[0][0]).not.toBeInstanceOf(AuthorizationError);
        expect(calls[0][0]).not.toBeInstanceOf(UnauthorizedAccessError);
    });
});

describe('validateAdminMiddleware', () => {
    test('allows an admin', async () => {
        const req = makeRequest(TOKENS.admin);
        expect(await run(validateAdminMiddleware, req)).toEqual([[]]);
        expect(req.auth).toEqual({ email: ADMIN, role: 'admin' });
        expect(getEmailFromAuth).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['no token', undefined, AuthorizationError],
        ['an unknown token', 'Bearer forged', AuthorizationError],
        ['a student', TOKENS.studentA, UnauthorizedAccessError],
        ['a Berkeley user not on the roster', TOKENS.outsider, UnauthorizedAccessError],
    ])('rejects %s with next(err) exactly once', async (_, header, errorType) => {
        const calls = await run(validateAdminMiddleware, makeRequest(header));
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBeInstanceOf(errorType);
    });
});
