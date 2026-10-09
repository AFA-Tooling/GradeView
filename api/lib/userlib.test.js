// Tests for userlib (isAdmin / isStudent) and the redisHelper paths they rely on, run against an
// in-memory Redis so the real error dispatch and connection handling are exercised.
jest.mock('redis', () => require('../test/support/fakeRedis.js'));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('config', () => require('../test/support/fixtures.js').configModule);

const { isAdmin, isStudent } = require('./userlib.mjs');
const redisHelper = require('./redisHelper.mjs');
const { fakeRedis } = require('redis');
const { CONFIG, ADMIN, STUDENT_A, STUDENT_B, OUTSIDER, seedClass } = require('../test/support/fixtures.js');

beforeEach(() => {
    fakeRedis.reset();
    seedClass(fakeRedis);
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    // No test may leave a Redis connection open.
    expect(fakeRedis.state.openClients).toBe(0);
    jest.restoreAllMocks();
});

describe('isAdmin', () => {
    test('is synchronous and returns a boolean', () => {
        const result = isAdmin(ADMIN);
        expect(result).toBe(true);
        expect(result).not.toBeInstanceOf(Promise);
        expect(isAdmin(STUDENT_A)).toBe(false);
    });

    test('compares emails case-insensitively', () => {
        expect(isAdmin('Admin01@Berkeley.EDU')).toBe(true);
        const admins = CONFIG.admins;
        CONFIG.admins = ['Admin01@Berkeley.edu'];
        try {
            expect(isAdmin(ADMIN)).toBe(true);
        } finally {
            CONFIG.admins = admins;
        }
    });

    test.each([undefined, null, '', 42, {}, ['admin01@berkeley.edu']])('is false for %p', (value) => {
        expect(isAdmin(value)).toBe(false);
    });
});

describe('isStudent', () => {
    test('is true for a student on the roster', async () => {
        await expect(isStudent(STUDENT_A)).resolves.toBe(true);
    });

    test('is false (not an error) for someone not on the roster', async () => {
        await expect(isStudent(OUTSIDER)).resolves.toBe(false);
    });

    test('passes infrastructure errors on', async () => {
        fakeRedis.state.failGet = () => true;
        await expect(isStudent(STUDENT_A)).rejects.toThrow('simulated connection failure');
    });
});

describe('redisHelper', () => {
    test('getStudent rejects with StudentNotEnrolledError for an unknown email', async () => {
        await expect(redisHelper.getStudent(OUTSIDER)).rejects.toMatchObject({ name: 'StudentNotEnrolledError' });
    });

    test('getEntry closes its client when the key is missing or the read fails', async () => {
        await expect(redisHelper.getEntry('nope')).rejects.toMatchObject({ name: 'KeyNotFoundError' });
        fakeRedis.state.failGet = () => true;
        await expect(redisHelper.getEntry(STUDENT_A)).rejects.toThrow('simulated connection failure');
        // afterEach checks that no client was left open
    });

    test('getEntry closes its client when the stored value is not JSON', async () => {
        fakeRedis.seedRaw('broken@berkeley.edu', '{not json');
        await expect(redisHelper.getEntry('broken@berkeley.edu')).rejects.toBeInstanceOf(SyntaxError);
    });

    test('getStudents lists [legal name, email] over a single connection', async () => {
        const students = await redisHelper.getStudents();
        expect(students).toEqual(
            expect.arrayContaining([
                ['One, Student', STUDENT_A],
                ['Two, Student', STUDENT_B],
            ]),
        );
        expect(students).toHaveLength(2);
        expect(fakeRedis.state.clientsCreated).toBe(1);
    });

    test('getStudents closes its client when a read fails part-way', async () => {
        fakeRedis.state.failGet = (key) => key === STUDENT_B;
        await expect(redisHelper.getStudents()).rejects.toThrow('simulated connection failure');
    });

    test('getStudentScores returns {} for a student who is not enrolled', async () => {
        await expect(redisHelper.getStudentScores(OUTSIDER)).resolves.toEqual({});
    });
});
