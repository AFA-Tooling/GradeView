const request = require('supertest');
const express = require('express');
const router = require('./index.js').default; 
const { validateAdminOrStudentMiddleware } = require('../../../lib/authlib.mjs');

// Mock the middleware
jest.mock('../../../lib/authlib.mjs', () => ({
    validateAdminOrStudentMiddleware: jest.fn(),
}));


describe('api/v2/login/index.js', () => {
    let app;

    beforeEach(() => {
        app = express(); // Initialize a new Express app for each test
        app.use('/', router); // Use the actual router
    });

    afterEach(() => {
        jest.clearAllMocks(); // Clear mock history between tests
    });

    test('should return { status: true } when validateAdminOrStudentMiddleware passes', async () => {
        // Simulate middleware success
        validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => next());

        const res = await request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ status: true });
        expect(validateAdminOrStudentMiddleware).toHaveBeenCalled();
    });

    test('should return { status: false } when validateAdminOrStudentMiddleware fails', async () => {
        // Simulate middleware failure
        validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => {
            res.status(401).send({ status: false });
        });

        const res = await request(app).get('/');
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ status: false });
        expect(validateAdminOrStudentMiddleware).toHaveBeenCalled();
    });

    test('should return { status: false } when middleware throws an error', async () => {
        // Simulate middleware throwing an error
        validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => {
            next(new Error('Middleware error'));
        });

        const res = await request(app).get('/');
        expect(res.statusCode).toBe(200); // Error handler in the router catches it
        expect(res.body).toEqual({ status: false });
        expect(validateAdminOrStudentMiddleware).toHaveBeenCalled();
    });

    test('should return 404 for non-GET requests', async () => {
        // Simulate middleware success
        validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => next());

        const res = await request(app).post('/'); // POST request to a GET-only route
        expect(res.statusCode).toBe(404); // Default Express behavior for unsupported methods
    });

    test('should reset rate limiting after windowMs', async () => {
      jest.useFakeTimers();
      
      // Simulate middleware success
      validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => next());
  
      // Send 100 requests
      for (let i = 0; i < 100; i++) {
          await request(app).get('/');
      }
      
      // 101st request should be rate-limited
      let res = await request(app).get('/');
      expect(res.statusCode).toBe(429);
      expect(res.text).toContain('Too many requests');

      // Fast-forward time by windowMs
      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
  
      // New request should pass
      res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ status: true });
  
      jest.useRealTimers();
  });
});

