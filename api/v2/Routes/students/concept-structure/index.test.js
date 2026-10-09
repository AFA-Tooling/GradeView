// The concept-structure route must return exactly what it returned before the class was read once
// per request (the pre-change route is kept in __fixtures__/legacyConceptStructure.js), while
// reading the class at most once per request over a bounded number of Redis connections.
//
// Both routes run against the real redisHelper on an in-memory Redis (test/support/fakeRedis.js)
// seeded with the same fake class, so they see the same data with the same error semantics.
// Each redisHelper export is wrapped in a jest.fn to count the calls a route makes, and the fake
// Redis counts the connections a request opens.
const express = require('express');
const request = require('supertest');

jest.mock('redis', () => require('../../../../test/support/fakeRedis.js'));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('config', () => require('../../../../test/support/fixtures.js').configModule);
jest.mock('../../../../lib/redisHelper.mjs', () => {
    const actual = jest.requireActual('../../../../lib/redisHelper.mjs');
    const wrapped = { __esModule: true };
    for (const [name, value] of Object.entries(actual)) {
        wrapped[name] = typeof value === 'function' ? jest.fn(value) : value;
    }
    return wrapped;
});

const redisHelper = require('../../../../lib/redisHelper.mjs');
const { fakeRedis } = require('redis');
const ConceptStructureRouter = require('./index.js').default;
const LegacyConceptStructureRouter = require('./__fixtures__/legacyConceptStructure.js').default;

const FIXED_NOW = new Date('2026-10-08T17:00:00Z');
const COUNTED = ['getStudents', 'getStudentEntries', 'getMaxScores', 'getStudentScores'];

function appFor(router) {
    const app = express();
    app.use('/students/:email/concept-structure', router);
    app.use((err, req, res, next) => res.status(500).json({ message: 'failed' }));
    return app;
}

const legacyApp = appFor(LegacyConceptStructureRouter);
const currentApp = appFor(ConceptStructureRouter);

// A "world" is the fake Redis content:
//   max      the MAX POINTS assignments (undefined: no MAX POINTS entry at all)
//   entries  email -> student entry ({ 'Legal Name', Assignments }), or a string stored raw
//   failGet  (key) => boolean: GET of a matching key fails like a dropped connection
function seed(world) {
    fakeRedis.reset();
    if (world.max !== undefined) {
        fakeRedis.seed('MAX POINTS', { 'Legal Name': 'MAX POINTS', Assignments: world.max });
    }
    for (const [email, entry] of Object.entries(world.entries)) {
        if (typeof entry === 'string') {
            fakeRedis.seedRaw(email, entry);
        } else {
            fakeRedis.seed(email, entry);
        }
    }
    fakeRedis.state.failGet = world.failGet ?? null;
}

async function fetchFrom(app, world, email) {
    seed(world);
    jest.clearAllMocks();
    const res = await request(app).get(`/students/${encodeURIComponent(email)}/concept-structure`);
    const calls = Object.fromEntries(COUNTED.map((name) => [name, redisHelper[name].mock.calls.length]));
    calls.redisClients = fakeRedis.state.clientsCreated;
    expect(fakeRedis.state.openClients).toBe(0);
    return { res, calls };
}

async function fetchBoth(world, email) {
    const legacy = await fetchFrom(legacyApp, world, email);
    const current = await fetchFrom(currentApp, world, email);
    return { legacy: legacy.res, current: current.res, legacyCalls: legacy.calls, currentCalls: current.calls };
}

const A = 'student01@berkeley.edu';
const B = 'student02@berkeley.edu';
const C = 'student03@berkeley.edu';
const D = 'student04@berkeley.edu';
const E = 'student05@berkeley.edu';

const student = (name, assignments) => ({ 'Legal Name': name, Assignments: assignments });

const typicalClass = () => ({
    max: {
        Projects: { 'Project 1': 10, 'Project 2': 20, 'Project 3': 30 },
        Labs: { 'Lab 1': 5, 'Lab 2': 5, 'Lab 3': 5, 'Lab 4': 5 },
        Quests: { 'Quest 1': 10 },
        Final: { 'Final Exam': 100 },
    },
    entries: {
        [A]: student('One, Student', {
            Projects: { 'Project 1': 9, 'Project 2': 0, 'Project 3': '' },
            Labs: { 'Lab 1': 5, 'Lab 2': '4', 'Lab 3': null },
        }),
        [B]: student('Two, Student', { Projects: { 'Project 2': 0 } }),
        // a null category makes the per-student check throw, which skips the student
        [C]: student('Three, Student', { Projects: null, Labs: { 'Lab 4': 2 } }),
        // no Assignments at all
        [D]: { 'Legal Name': 'Four, Student' },
        // a key named like a category marks that category as taught
        [E]: student('Five, Student', { Extra: { Labs: 3 }, Quests: { 'Quest 1': 7 } }),
    },
});

const withEntries = (extra) => () => {
    const world = typicalClass();
    return { ...world, entries: { ...world.entries, ...extra } };
};

// Small deterministic PRNG so the random class is the same on every run.
function prng(seedValue) {
    let state = seedValue >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

function randomClass(seedValue, size = 25) {
    const rand = prng(seedValue);
    const max = {};
    for (let c = 0; c < 6; c += 1) {
        const category = `Category ${c}`;
        max[category] = {};
        for (let a = 0; a < 2 + Math.floor(rand() * 5); a += 1) {
            max[category][`Assignment ${c}.${a}`] = 5 + Math.floor(rand() * 20);
        }
    }
    const entries = {};
    for (let s = 0; s < size; s += 1) {
        const email = `student${String(s + 10).padStart(2, '0')}@berkeley.edu`;
        const record = {};
        for (const [category, assignments] of Object.entries(max)) {
            if (rand() < 0.2) continue;
            record[category] = {};
            for (const [assignment, points] of Object.entries(assignments)) {
                const roll = rand();
                if (roll < 0.15) record[category][assignment] = '';
                else if (roll < 0.3) record[category][assignment] = 0;
                else if (roll < 0.35) continue;
                else record[category][assignment] = Math.round(rand() * points * 2) / 2;
            }
        }
        entries[email] = student(`Student ${s}`, record);
    }
    return { max, entries };
}

beforeAll(() => {
    // Only Date is faked: both implementations compute currentWeek from "now".
    jest.useFakeTimers({
        now: FIXED_NOW,
        doNotFake: [
            'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
            'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
            'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
        ],
    });
});

afterAll(() => {
    jest.useRealTimers();
});

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    console.error.mockRestore();
    console.log.mockRestore();
});

const SCENARIOS = [
    ['a typical class, student on the roster', typicalClass, A],
    ['a typical class, a student with no Assignments', typicalClass, D],
    ['a typical class, email not on the roster', typicalClass, 'student99@berkeley.edu'],
    ['another student\'s entry cannot be read', () => ({ ...typicalClass(), failGet: (key) => key === B }), A],
    ['the requested student\'s entry cannot be read', () => ({ ...typicalClass(), failGet: (key) => key === A }), A],
    ['a student entry that is not JSON', withEntries({ 'student06@berkeley.edu': 'not json' }), A],
    ['a student entry that is JSON null', withEntries({ 'student06@berkeley.edu': 'null' }), A],
    ['a student entry that is a JSON number', withEntries({ 'student06@berkeley.edu': '5' }), A],
    ['an empty roster', () => ({ ...typicalClass(), entries: {} }), A],
    ['no max scores yet', () => ({ ...typicalClass(), max: {} }), A],
    ['no MAX POINTS entry', () => ({ ...typicalClass(), max: undefined }), A],
    ['max scores cannot be read', () => ({ ...typicalClass(), failGet: (key) => key === 'MAX POINTS' }), A],
    ['a malformed max-scores category', () => ({ ...typicalClass(), max: { ...typicalClass().max, Broken: null } }), A],
    ['a random class (seed 1)', () => randomClass(1), 'student12@berkeley.edu'],
    ['a random class (seed 2)', () => randomClass(2), 'student20@berkeley.edu'],
    ['a random class (seed 3)', () => randomClass(3), 'student33@berkeley.edu'],
];

describe('GET /students/:email/concept-structure', () => {
    test.each(SCENARIOS)('matches the pre-change output byte for byte: %s', async (_, makeWorld, email) => {
        const { legacy, current, currentCalls } = await fetchBoth(makeWorld(), email);

        expect(current.status).toBe(legacy.status);
        expect(current.headers['content-type']).toBe(legacy.headers['content-type']);
        expect(current.text).toBe(legacy.text);

        // The class roster is read at most once, and so are the max scores and the requester.
        expect(currentCalls.getStudents + currentCalls.getStudentEntries).toBeLessThanOrEqual(1);
        expect(currentCalls.getMaxScores).toBeLessThanOrEqual(1);
        expect(currentCalls.getStudentScores).toBeLessThanOrEqual(1);
        expect(currentCalls.redisClients).toBeLessThanOrEqual(3);
    });

    test('the typical class exercises both taught and untaught nodes', async () => {
        const { current, legacyCalls, currentCalls } = await fetchBoth(typicalClass(), A);
        expect(current.status).toBe(200);
        const nodes = current.body.nodes.children.flatMap((category) => [category, ...category.children]);
        const taught = Object.fromEntries(nodes.map((node) => [node.name, node.data.taught]));
        expect(taught).toMatchObject({
            'Project 1': true,
            'Project 2': false, // only zeros
            'Lab 2': true, // '4' > 0
            'Lab 4': false, // only from student C, whose scores the check skips
            'Quest 1': true,
            Labs: true,
            'Final Exam': false,
        });

        // Before: one roster scan per category and per assignment node, and one connection per
        // student per node on top of it.
        const nodeCount = 4 + 9;
        expect(legacyCalls.getStudents).toBe(nodeCount);
        expect(legacyCalls.redisClients).toBeGreaterThan(nodeCount * 5);
        expect(currentCalls).toEqual({
            getStudents: 0,
            getStudentEntries: 1,
            getMaxScores: 1,
            getStudentScores: 1,
            redisClients: 3,
        });
    });

    test('the number of Redis connections does not grow with the class size', async () => {
        for (const size of [5, 120]) {
            const world = randomClass(7, size);
            const { legacy, current, legacyCalls, currentCalls } = await fetchBoth(world, 'student12@berkeley.edu');
            expect(current.text).toBe(legacy.text);
            expect(currentCalls.redisClients).toBe(3);
            expect(legacyCalls.redisClients).toBeGreaterThan(size);
        }
    });
});
