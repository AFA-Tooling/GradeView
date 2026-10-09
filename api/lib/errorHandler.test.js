// Tests for the API error handler used by Router.js and lib/app.mjs.
const express = require('express');
const request = require('supertest');

const apiErrorHandler = require('./errorHandler.mjs').default;
const AuthorizationError = require('./errors/http/AuthorizationError.js').default;
const UnauthorizedAccessError = require('./errors/http/UnauthorizedAccessError.js').default;
const NotFoundError = require('./errors/http/NotFoundError.js').default;
const StudentNotFoundError = require('./errors/http/StudentNotFoundError.js').default;
const BadSheetDataError = require('./errors/http/BadSheetDataError.js').default;
const KeyNotFoundError = require('./errors/redis/KeyNotFound.js').default;
const StudentNotEnrolledError = require('./errors/redis/StudentNotEnrolled.js').default;

const EMAIL = 'student01@berkeley.edu';
const FAKE_TOKEN = 'Bearer fake-id-token-student01';

let errorLog;
let warnLog;

function appThrowing(makeError) {
    const app = express();
    app.use(express.json());
    app.get('/boom', (req, res, next) => next(makeError()));
    app.get('/async-boom', async () => {
        throw makeError();
    });
    app.use(apiErrorHandler);
    return app;
}

const loggedText = () => [...errorLog.mock.calls, ...warnLog.mock.calls].flat().map(String).join('\n');

beforeEach(() => {
    errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnLog = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('apiErrorHandler', () => {
    test.each([
        ['AuthorizationError', () => new AuthorizationError('no authorization token provided.'), 401],
        ['UnauthorizedAccessError', () => new UnauthorizedAccessError('not permitted'), 403],
        ['NotFoundError', () => new NotFoundError('no such thing'), 404],
        ['StudentNotFoundError', () => new StudentNotFoundError('no such student'), 404],
    ])('%s keeps its status and safe message', async (_, makeError, status) => {
        const expected = makeError();
        const res = await request(appThrowing(makeError)).get('/boom');
        expect(res.status).toBe(status);
        expect(res.body).toEqual({ message: expected.message });
    });

    test.each([
        ['KeyNotFoundError', () => new KeyNotFoundError('failed to get entry', EMAIL, 0)],
        ['StudentNotEnrolledError', () => new StudentNotEnrolledError('Student is not in the database.', EMAIL)],
        ['BadSheetDataError', () => new BadSheetDataError(`bad row for ${EMAIL}`)],
        ['a plain Error', () => new Error(`connect ECONNREFUSED while reading ${EMAIL}`)],
        ['a thrown string', () => `oops ${EMAIL}`],
        ['an error claiming status 503', () => Object.assign(new Error(`down for ${EMAIL}`), { status: 503 })],
    ])('%s becomes a generic 500 that does not mention the email', async (_, makeError) => {
        for (const path of ['/boom', '/async-boom']) {
            const res = await request(appThrowing(makeError)).get(path);
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ message: 'Internal server error.' });
            expect(res.text).not.toContain(EMAIL);
        }
        // ...but the details are logged server-side.
        expect(loggedText()).toContain(EMAIL);
    });

    test('other 4xx errors keep their status but only send the standard reason phrase', async () => {
        const makeError = () => Object.assign(new Error(`Failed to decode param '${EMAIL}%'`), { status: 400 });
        const res = await request(appThrowing(makeError)).get('/boom');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Bad Request' });
    });

    test('a malformed JSON body gets a 400 without the parser message', async () => {
        const app = express();
        app.use(express.json());
        app.post('/echo', (req, res) => res.json(req.body));
        app.use(apiErrorHandler);
        const res = await request(app)
            .post('/echo')
            .set('Content-Type', 'application/json')
            .send(`{"email": "${EMAIL}",`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Bad Request' });
    });

    test('never logs the Authorization header', async () => {
        const app = appThrowing(() => new Error('boom'));
        await request(app).get('/boom').set('Authorization', FAKE_TOKEN);
        await request(appThrowing(() => new AuthorizationError('x'))).get('/boom').set('Authorization', FAKE_TOKEN);
        expect(loggedText()).not.toContain('fake-id-token');
    });

    test('responds once and does not call next() after responding', () => {
        const res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
        const next = jest.fn();
        apiErrorHandler(new Error('boom'), { method: 'GET', originalUrl: '/x' }, res, next);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });

    test('hands off to Express without writing when headers were already sent', () => {
        const res = { headersSent: true, status: jest.fn(), json: jest.fn(), send: jest.fn() };
        const next = jest.fn();
        const err = new Error('late');
        apiErrorHandler(err, { method: 'GET', originalUrl: '/x' }, res, next);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(err);
    });
});
