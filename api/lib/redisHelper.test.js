// redisHelper against the real `redis` client when Redis is down or stuck: every call must settle
// (so the auth middleware always calls next()) and leave no client behind. No Redis server is
// needed: the tests point the client at a closed local port, or at a local TCP server that
// accepts connections and never answers.
const net = require('node:net');

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('config', () => require('../test/support/fixtures.js').configModule);

const redisHelper = require('./redisHelper.mjs');
const { CONFIG, STUDENT_A } = require('../test/support/fixtures.js');

const ORIGINAL_CONFIG = { ...CONFIG };

const listen = (server) => new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const close = (server) => new Promise((resolve) => server.close(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Measures how long `promise` takes to settle; returns { error, ms }.
async function settle(promise) {
    const start = Date.now();
    try {
        await promise;
        return { error: null, ms: Date.now() - start };
    } catch (error) {
        return { error, ms: Date.now() - start };
    }
}

let redisErrorLogs;

beforeEach(() => {
    redisErrorLogs = 0;
    jest.spyOn(console, 'error').mockImplementation((first) => {
        if (first === 'Redis error: ') {
            redisErrorLogs += 1;
        }
    });
    CONFIG['redis.host'] = '127.0.0.1';
});

afterEach(() => {
    for (const key of Object.keys(CONFIG)) {
        if (!(key in ORIGINAL_CONFIG)) {
            delete CONFIG[key];
        }
    }
    Object.assign(CONFIG, ORIGINAL_CONFIG);
    jest.restoreAllMocks();
});

describe('Redis refuses connections', () => {
    let port;

    beforeEach(async () => {
        // Take a free port, then stop listening on it.
        const server = net.createServer();
        port = await listen(server);
        await close(server);
        CONFIG['redis.port'] = port;
    });

    test.each([
        ['getEntry', () => redisHelper.getEntry(STUDENT_A)],
        ['getStudents', () => redisHelper.getStudents()],
        ['getStudentScores', () => redisHelper.getStudentScores(STUDENT_A)],
        ['getMaxScores', () => redisHelper.getMaxScores()],
    ])('%s rejects at once and does not keep reconnecting', async (_, call) => {
        const { error, ms } = await settle(call());
        // Node's socket error (created outside Jest's realm, so no instanceof check).
        expect(error?.code).toBe('ECONNREFUSED');
        expect(ms).toBeLessThan(1000);

        // With node-redis's default strategy the client would retry every 50-500 ms forever.
        const logsAtRejection = redisErrorLogs;
        await sleep(400);
        expect(redisErrorLogs).toBe(logsAtRejection);
    });
});

describe('Redis accepts connections but never answers', () => {
    let server;
    let sockets;

    beforeEach(async () => {
        sockets = new Set();
        server = net.createServer((socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
            socket.on('error', () => {});
            socket.resume(); // read and ignore everything, answer nothing
        });
        CONFIG['redis.port'] = await listen(server);
        CONFIG['redis.operationTimeoutMs'] = 200;
    });

    afterEach(async () => {
        for (const socket of sockets) {
            socket.destroy();
        }
        await close(server);
    });

    test.each([
        ['getEntry', () => redisHelper.getEntry(STUDENT_A)],
        ['getStudents', () => redisHelper.getStudents()],
        ['getStudentScores', () => redisHelper.getStudentScores(STUDENT_A)],
    ])('%s fails with RedisTimeoutError after the operation timeout and closes its connection', async (_, call) => {
        const { error, ms } = await settle(call());
        expect(error?.name).toBe('RedisTimeoutError');
        expect(ms).toBeGreaterThanOrEqual(150);
        expect(ms).toBeLessThan(2000);

        // The client hung up: the server sees no open connection left.
        await sleep(100);
        expect(sockets.size).toBe(0);
    });

    test('the default operation timeout leaves room for the connect timeout to fire first', () => {
        expect(redisHelper.DEFAULT_REDIS_OPERATION_TIMEOUT_MS).toBeGreaterThan(redisHelper.REDIS_CONNECT_TIMEOUT_MS);
    });
});
