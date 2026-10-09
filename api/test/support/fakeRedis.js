// In-memory stand-in for the `redis` package, for tests: `jest.mock('redis', () => require(<this file>))`.
// Only the client calls that lib/redisHelper.mjs makes are implemented. It records how many
// clients were created and how many are still open, so tests can check for leaked connections.

const state = {
    databases: new Map(),
    clientsCreated: 0,
    openClients: 0,
    // (key, databaseIndex) => boolean; GET of a matching key rejects like a dropped connection.
    failGet: null,
    // true: connect() rejects, like a client with reconnects disabled when Redis is unreachable.
    failConnect: false,
    // The options of the last createClient call.
    lastClientOptions: null,
};

function database(index) {
    if (!state.databases.has(index)) {
        state.databases.set(index, new Map());
    }
    return state.databases.get(index);
}

function databaseIndexFromUrl(url = '') {
    const match = /\/(\d+)$/.exec(url);
    return match ? Number(match[1]) : 0;
}

function createClient(options = {}) {
    const databaseIndex = databaseIndexFromUrl(options.url);
    state.clientsCreated += 1;
    state.lastClientOptions = options;
    let open = false;

    const ensureOpen = () => {
        if (!open) {
            throw new Error('The client is closed');
        }
    };
    const close = async () => {
        ensureOpen();
        open = false;
        state.openClients -= 1;
    };

    const client = {
        get isOpen() {
            return open;
        },
        on() {
            return client;
        },
        async connect() {
            if (state.failConnect) {
                throw new Error('simulated connection failure: connect ECONNREFUSED 127.0.0.1:6379');
            }
            open = true;
            state.openClients += 1;
        },
        quit: close,
        disconnect: close,
        async get(key) {
            ensureOpen();
            if (state.failGet?.(key, databaseIndex)) {
                throw new Error(`simulated connection failure while reading ${key}`);
            }
            const value = database(databaseIndex).get(key);
            return value === undefined ? null : value;
        },
        async keys(pattern) {
            ensureOpen();
            if (pattern !== '*@*') {
                throw new Error(`fakeRedis only supports the '*@*' pattern, got ${pattern}`);
            }
            return [...database(databaseIndex).keys()].filter((key) => key.includes('@'));
        },
    };
    return client;
}

const fakeRedis = {
    state,
    reset() {
        state.databases.clear();
        state.clientsCreated = 0;
        state.openClients = 0;
        state.failGet = null;
        state.failConnect = false;
        state.lastClientOptions = null;
    },
    // Stores `value` as JSON, like the dbcron jobs do.
    seed(key, value, databaseIndex = 0) {
        database(databaseIndex).set(key, JSON.stringify(value));
    },
    seedRaw(key, raw, databaseIndex = 0) {
        database(databaseIndex).set(key, raw);
    },
};

module.exports = { createClient, fakeRedis };
