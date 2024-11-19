const request = require('supertest');
const express = require('express');
const RateLimit = require('express-rate-limit');
const { Router } = require('express');
// Helper function to set up the router
const setupRouter = (middleware) => {
    const router = Router({ mergeParams: true });
    router.use(RateLimit({ windowMs: 5 * 60 * 1000, max: 100 }));
    router.get('/', middleware, async (_, res) => {
        res.send({ status: true });
    }, (error, req, res, next) => {
        res.send({ status: false });
    });
    return router;
};
describe('api/v2/login/index.js', () => {
    let app;
    beforeEach(() => {
        app = express();
    });
    test('should return { status: true } when validateAdminOrStudentMiddleware passes', async () => {
        // Mock middleware that passes
        const validateAdminOrStudentMiddleware = (req, res, next) => {
            next();
        };
        // Use the setupRouter function
        app.use('/', setupRouter(validateAdminOrStudentMiddleware));
        const res = await request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: true });
    });
    test('should return { status: false } when validateAdminOrStudentMiddleware fails', async () => {
        // Mock middleware that fails validation
        const validateAdminOrStudentMiddleware = (req, res, next) => {
            res.status(401).send({ status: false });
        };
        // Use the setupRouter function
        app.use('/', setupRouter(validateAdminOrStudentMiddleware));
        const res = await request(app).get('/');
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ status: false });
    });
    test('should return { status: false } when middleware throws an error', async () => {
        // Mock middleware that throws an error
        const validateAdminOrStudentMiddleware = (req, res, next) => {
            next(new Error('Middleware error'));
        };
        // Use the setupRouter function
        app.use('/', setupRouter(validateAdminOrStudentMiddleware));
        const res = await request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: false });
    });
    test('should enforce rate limiting', async () => {
        // Mock middleware that passes
        const validateAdminOrStudentMiddleware = (req, res, next) => {
            next();
        };
        // Set up router with lower rate limit for testing
        const router = Router({ mergeParams: true });
        router.use(RateLimit({ windowMs: 5 * 60 * 1000, max: 2 }));
        router.get('/', validateAdminOrStudentMiddleware, async (_, res) => {
            res.send({ status: true });
        }, (error, req, res, next) => {
            res.send({ status: false });
        });
        app.use('/', router);
        // First request
        let res = await request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: true });
        // Second request
        res = await request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: true });
        // Third request should be rate limited
        res = await request(app).get('/');
        expect(res.statusCode).toBe(429);
        expect(res.text).toMatch(/Too many requests/);
    });
    test('should return 404 for non-GET requests', async () => {
        // Mock middleware that passes
        const validateAdminOrStudentMiddleware = (req, res, next) => {
            next();
        };
        // Use the setupRouter function
        app.use('/', setupRouter(validateAdminOrStudentMiddleware));
        const res = await request(app).post('/');
        expect(res.statusCode).toBe(404);
    });
});