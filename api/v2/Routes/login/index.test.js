// index.test.js
import express from 'express';
import request from 'supertest';
import router from './index.js'; // Ensure the correct path
import RateLimit from 'express-rate-limit';
import { jest } from '@jest/globals';
import { validateAdminOrStudentMiddleware } from '../../../lib/authlib.mjs';
// Mock the validateAdminOrStudentMiddleware
jest.mock('../../../lib/authlib.mjs', () => ({
  validateAdminOrStudentMiddleware: jest.fn(),
}));


describe('Router Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/', router);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should respond with status true when middleware passes', async () => {
    // Mock middleware to pass
    validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => next());

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: true });
    expect(validateAdminOrStudentMiddleware).toHaveBeenCalled();
  });

  test('should respond with status false when middleware fails', async () => {
    // Mock middleware to fail
    validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => {
      const err = new Error('Unauthorized');
      next(err);
    });

    const response = await request(app).get('/');

    expect(response.status).toBe(200); // Because the error handler sends a 200 response
    expect(response.body).toEqual({ status: false });
    expect(validateAdminOrStudentMiddleware).toHaveBeenCalled();
  });

  test('should enforce rate limiting', async () => {
    // To test rate limiting, we'll need to adjust the rate limiter for testing purposes.
    // Alternatively, you can mock the rate limiter.

    // For simplicity, let's create a new app with a lower rate limit for testing.
    const testRateLimit = RateLimit({
      windowMs: 1000, // 1 second
      max: 2, // 2 requests
    });

    const testApp = express();
    testApp.use('/', testRateLimit, router);

    validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => next());

    // First request
    let response = await request(testApp).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: true });

    // Second request
    response = await request(testApp).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: true });

    // Third request should be rate limited
    response = await request(testApp).get('/');
    expect(response.status).toBe(429); // Too Many Requests
  });

  test('should reset rate limiting after windowMs', async () => {
    jest.useFakeTimers();

    const testRateLimit = RateLimit({
      windowMs: 1000, // 1 second
      max: 1, // 1 request
      handler: (req, res) => {
        res.status(429).send('Too many requests');
      },
    });

    const testApp = express();
    testApp.use('/', testRateLimit, router);

    validateAdminOrStudentMiddleware.mockImplementation((req, res, next) => next());

    // First request
    let response = await request(testApp).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: true });

    // Second request should be rate limited
    response = await request(testApp).get('/');
    expect(response.status).toBe(429);
    expect(response.text).toBe('Too many requests');

    // Fast-forward time
    jest.advanceTimersByTime(1000);

    // Third request should pass again
    response = await request(testApp).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: true });

    jest.useRealTimers();
  });
});