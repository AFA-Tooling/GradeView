// Fake people, tokens, config and grades shared by the API tests. Nothing here is real data.
const AuthorizationError = require('../../lib/errors/http/AuthorizationError.js').default;

const ADMIN = 'admin01@berkeley.edu';
const STUDENT_A = 'student01@berkeley.edu';
const STUDENT_B = 'student02@berkeley.edu';
// A verified berkeley.edu Google account that is neither an admin nor on the roster.
const OUTSIDER = 'student99@berkeley.edu';

// Authorization header value -> the email getEmailFromAuth returns for it.
const TOKENS = {
    admin: 'Bearer fake-id-token-admin01',
    studentA: 'Bearer fake-id-token-student01',
    studentB: 'Bearer fake-id-token-student02',
    outsider: 'Bearer fake-id-token-student99',
};
const EMAIL_BY_HEADER = {
    [TOKENS.admin]: ADMIN,
    [TOKENS.studentA]: STUDENT_A,
    [TOKENS.studentB]: STUDENT_B,
    [TOKENS.outsider]: OUTSIDER,
};

const CONFIG = {
    'googleconfig.oauth.clientid': 'fake-client-id.apps.googleusercontent.com',
    admins: [ADMIN],
    'redis.username': 'default',
    'redis.host': 'localhost',
    'redis.port': 6379,
};

// Stand-in for the `config` package: jest.mock('config', () => require(<this file>).configModule).
const configModule = {
    get(key) {
        if (!(key in CONFIG)) {
            throw new Error(`Configuration property "${key}" is not defined`);
        }
        return CONFIG[key];
    },
    has: (key) => key in CONFIG,
};

// Stand-in for getEmailFromAuth with the same contract as lib/googleAuthHelper.mjs: the
// verified, lowercased email, or an AuthorizationError for a missing or unknown token.
async function fakeGetEmailFromAuth(authHeader) {
    const email = EMAIL_BY_HEADER[authHeader];
    if (!email) {
        throw new AuthorizationError('Could not authenticate authorization token.');
    }
    return email;
}

const MAX_POINTS = {
    'Legal Name': 'MAX POINTS',
    Assignments: {
        Projects: { 'Project 1': 10, 'Project 2': 20 },
        Labs: { 'Lab 1': 5, 'Lab 2': 5 },
    },
};

const STUDENT_RECORDS = {
    [STUDENT_A]: {
        'Legal Name': 'One, Student',
        Assignments: {
            Projects: { 'Project 1': 9, 'Project 2': 15 },
            Labs: { 'Lab 1': 5, 'Lab 2': '' },
        },
    },
    [STUDENT_B]: {
        'Legal Name': 'Two, Student',
        Assignments: {
            Projects: { 'Project 1': 7, 'Project 2': 18 },
            Labs: { 'Lab 1': 4, 'Lab 2': 3 },
        },
    },
};

const BINS = {
    bins: [
        { letter: 'F', points: 0 },
        { letter: 'A', points: 40 },
    ],
    assignment_points: { Projects: 30, Labs: 10 },
    total_course_points: 40,
};

// Loads the fake class into a fakeRedis instance (see fakeRedis.js).
function seedClass(fakeRedis) {
    fakeRedis.seed('MAX POINTS', MAX_POINTS);
    for (const [email, record] of Object.entries(STUDENT_RECORDS)) {
        fakeRedis.seed(email, record);
    }
    fakeRedis.seed('Categories', { Projects: { 'Project 1': true } });
    fakeRedis.seed('bins', BINS, 1);
}

module.exports = {
    ADMIN,
    STUDENT_A,
    STUDENT_B,
    OUTSIDER,
    TOKENS,
    CONFIG,
    configModule,
    fakeGetEmailFromAuth,
    MAX_POINTS,
    STUDENT_RECORDS,
    BINS,
    seedClass,
};
