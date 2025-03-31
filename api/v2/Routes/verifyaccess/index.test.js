const request = require('supertest');
const express = require('express');

const router = require('./index.js').default;
const { getEmailFromAuth } = require ('../../../lib/googleAuthHelper.mjs');
const { getStudent } = require('../../../lib/redisHelper.mjs');


jest.mock('../../../lib/googleAuthHelper.mjs', () => ({
    getEmailFromAuth: jest.fn(),
})); 
jest.mock('../../../lib/redisHelper.mjs', () => ({
    getStudent: jest.fn()
})); 

describe("'api/v2/verifyAccess/index.js'", () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use('/', router); // make router
    });

    afterEach(() => {
        jest.clearAllMocks(); // Clear mock history between tests
    });
    
    test("should respond with a 200 status code and true if authorization valid", async () => { 
            getStudent.mockReturnValueOnce({ id: 1, name: 'Test Student' });
            getEmailFromAuth.mockReturnValueOnce('example@test.com');
            const response = await request(app)
             .get('/verifyAccess')
             .set('Authorization', 'Bearer valid_token');
            expect(response.statusCode).toBe(200);
            expect(response.text).toBe('true');
        });

    test("should respond with a 200 status code and false when no authorization header is provided", async () => {
            const response = await request(app)
              .get('/verifyaccess');  // No Authorization header
        
            expect(response.statusCode).toBe(200);
            expect(response.text).toBe('false');
          });


    test("should respond with a 200 status code and false when authorization is invalid", async () => {

            getEmailFromAuth.mockReturnValueOnce(null); // no email returned from authorization token
            getStudent.mockRejectedValueOnce(new Error('Student not found')); // student not found because email not found
        
            const response = await request(app)
              .get('/verifyaccess')  
              .set('Authorization', 'Bearer invalid_token');
        
            expect(response.statusCode).toBe(200);
            expect(response.text).toBe('false');
          });

    test("should respond with a 200 status code and false when email is invalid", async () => {
            // Mock `getEmailFromAuth` to return an invalid email
            getEmailFromAuth.mockReturnValueOnce('invalid@example.com');  

            // Mock `getStudent` to throw an error when trying to get the student with the invalid email
            getStudent.mockRejectedValueOnce(new Error('Student not found')); 

            const response = await request(app)
            .get('/verifyaccess')
            .set('Authorization', 'Bearer some_invalid_token'); 

           
            expect(response.statusCode).toBe(200);
            expect(response.text).toBe('false'); 
        });   
    });
