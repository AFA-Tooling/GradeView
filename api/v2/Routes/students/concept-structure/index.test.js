// The concept-structure route must return exactly what it returned before the roster was cached
// per request (the pre-change route is kept in __fixtures__/legacyConceptStructure.js), while
// reading the roster at most once per request. redisHelper is mocked with fake class data.
const express = require('express');
const request = require('supertest');

jest.mock('../../../../lib/redisHelper.mjs', () => ({
    getMaxScores: jest.fn(),
    getStudentScores: jest.fn(),
    getStudents: jest.fn(),
}));

const redisHelper = require('../../../../lib/redisHelper.mjs');
const ConceptStructureRouter = require('./index.js').default;
const LegacyConceptStructureRouter = require('./__fixtures__/legacyConceptStructure.js').default;
const KeyNotFoundError = require('../../../../lib/errors/redis/KeyNotFound.js').default;

const FIXED_NOW = new Date('2026-10-08T17:00:00Z');

function appFor(router) {
    const app = express();
    app.use('/students/:email/concept-structure', router);
    app.use((err, req, res, next) => res.status(500).json({ message: 'failed' }));
    return app;
}

const legacyApp = appFor(LegacyConceptStructureRouter);
const currentApp = appFor(ConceptStructureRouter);

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

// A "world" is the fake Redis content: max scores, the roster, and each student's scores
// (an Error value means reading that student fails).
function install(world) {
    redisHelper.getMaxScores.mockImplementation(async () => {
        if (world.maxError) throw world.maxError;
        return clone(world.max);
    });
    redisHelper.getStudents.mockImplementation(async () => {
        if (world.rosterError) throw world.rosterError;
        return clone(world.roster);
    });
    redisHelper.getStudentScores.mockImplementation(async (email) => {
        if (!(email in world.scores)) return {};
        const value = world.scores[email];
        if (value instanceof Error) throw value;
        return clone(value);
    });
}

function callCounts() {
    return {
        getStudents: redisHelper.getStudents.mock.calls.length,
        getMaxScores: redisHelper.getMaxScores.mock.calls.length,
        getStudentScores: redisHelper.getStudentScores.mock.calls.length,
    };
}

async function fetchBoth(world, email) {
    install(world);
    jest.clearAllMocks();
    const legacy = await request(legacyApp).get(`/students/${encodeURIComponent(email)}/concept-structure`);
    const legacyCalls = callCounts();
    jest.clearAllMocks();
    const current = await request(currentApp).get(`/students/${encodeURIComponent(email)}/concept-structure`);
    const currentCalls = callCounts();
    return { legacy, current, legacyCalls, currentCalls };
}

const A = 'student01@berkeley.edu';
const B = 'student02@berkeley.edu';
const C = 'student03@berkeley.edu';
const D = 'student04@berkeley.edu';
const E = 'student05@berkeley.edu';
const F = 'student06@berkeley.edu';

const typicalClass = () => ({
    max: {
        Projects: { 'Project 1': 10, 'Project 2': 20, 'Project 3': 30 },
        Labs: { 'Lab 1': 5, 'Lab 2': 5, 'Lab 3': 5, 'Lab 4': 5 },
        Quests: { 'Quest 1': 10 },
        Final: { 'Final Exam': 100 },
    },
    roster: [
        ['One, Student', A],
        ['Two, Student', B],
        ['Three, Student', C],
        ['Four, Student', D],
        ['Five, Student', E],
        ['Six, Student', F],
    ],
    scores: {
        [A]: {
            Projects: { 'Project 1': 9, 'Project 2': 0, 'Project 3': '' },
            Labs: { 'Lab 1': 5, 'Lab 2': '4', 'Lab 3': null },
        },
        // reading this student fails
        [B]: new Error('simulated connection failure'),
        // a null category makes the old per-student check throw, which skips the student
        [C]: { Projects: null, Labs: { 'Lab 4': 2 } },
        // no Assignments at all
        [D]: undefined,
        // a key named like a category marks that category as taught
        [E]: { Extra: { Labs: 3 }, Quests: { 'Quest 1': 7 } },
        // F has no entry: getStudentScores returns {}
    },
});

// Small deterministic PRNG so the random class is the same on every run.
function prng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

function randomClass(seed) {
    const rand = prng(seed);
    const max = {};
    for (let c = 0; c < 6; c += 1) {
        const category = `Category ${c}`;
        max[category] = {};
        for (let a = 0; a < 2 + Math.floor(rand() * 5); a += 1) {
            max[category][`Assignment ${c}.${a}`] = 5 + Math.floor(rand() * 20);
        }
    }
    const roster = [];
    const scores = {};
    for (let s = 0; s < 25; s += 1) {
        const email = `student${String(s + 10).padStart(2, '0')}@berkeley.edu`;
        roster.push([`Student ${s}`, email]);
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
        scores[email] = record;
    }
    return { max, roster, scores };
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
    ['a typical class, student without an entry', typicalClass, F],
    ['a typical class, email not on the roster', typicalClass, 'student99@berkeley.edu'],
    ['a typical class, the requested student cannot be read', typicalClass, B],
    ['the roster cannot be read', () => ({ ...typicalClass(), rosterError: new Error('simulated') }), A],
    ['an empty roster', () => ({ ...typicalClass(), roster: [] }), A],
    ['no max scores yet', () => ({ ...typicalClass(), max: {} }), A],
    ['max scores cannot be read', () => ({ ...typicalClass(), maxError: new Error('simulated') }), A],
    ['max scores missing (KeyNotFoundError)', () => ({ ...typicalClass(), maxError: new KeyNotFoundError('x', 'MAX POINTS', 0) }), A],
    ['a malformed max-scores category', () => ({ ...typicalClass(), max: { ...typicalClass().max, Broken: null } }), A],
    ['a random class (seed 1)', () => randomClass(1), 'student12@berkeley.edu'],
    ['a random class (seed 2)', () => randomClass(2), 'student20@berkeley.edu'],
    ['a random class (seed 3)', () => randomClass(3), 'student33@berkeley.edu'],
];

describe('GET /students/:email/concept-structure', () => {
    test.each(SCENARIOS)('matches the pre-change output byte for byte: %s', async (_, makeWorld, email) => {
        const world = makeWorld();
        const { legacy, current, currentCalls } = await fetchBoth(world, email);

        expect(current.status).toBe(legacy.status);
        expect(current.headers['content-type']).toBe(legacy.headers['content-type']);
        expect(current.text).toBe(legacy.text);

        // The roster is read at most once, and each student at most once (plus the requester).
        expect(currentCalls.getStudents).toBeLessThanOrEqual(1);
        expect(currentCalls.getMaxScores).toBeLessThanOrEqual(1);
        expect(currentCalls.getStudentScores).toBeLessThanOrEqual((world.roster?.length ?? 0) + 1);
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

        // Before: one roster scan per category and per assignment node.
        const nodeCount = 4 + 9;
        expect(legacyCalls.getStudents).toBe(nodeCount);
        expect(currentCalls).toEqual({ getStudents: 1, getMaxScores: 1, getStudentScores: 7 });
    });
});
