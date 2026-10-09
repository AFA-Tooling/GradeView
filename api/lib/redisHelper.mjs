import config from 'config';
import dotenv from 'dotenv';
import MisformedKeyError from './errors/redis/MisformedKeyError.js';
import KeyNotFoundError from './errors/redis/KeyNotFound.js';
import RedisTimeoutError from './errors/redis/RedisTimeout.js';
import StudentNotEnrolledError from './errors/redis/StudentNotEnrolled.js';
import { createClient } from 'redis';

dotenv.config();

// How long to wait for the TCP connection to Redis before giving up.
export const REDIS_CONNECT_TIMEOUT_MS = 2000;

// Upper bound for one helper call (connect plus all of its commands), for a Redis that accepts
// the connection but does not answer (frozen, paused or overloaded). Can be overridden with the
// `redis.operationTimeoutMs` config key.
export const DEFAULT_REDIS_OPERATION_TIMEOUT_MS = 10000;

/**
 * Gets an authenticated Redis client.
 *
 * Every helper here opens a short-lived client per call, so the client must fail fast: with
 * node-redis's default reconnect strategy `connect()` never settles while Redis is unreachable,
 * which leaves the request hanging (the auth middleware never calls next()) and the client
 * retrying forever. Without reconnects, `connect()` rejects (and an in-flight command is rejected
 * if the connection drops), so the caller closes the client and the request gets a 500.
 * @param {number} databaseIndex the index the entry is stored in.
 * @returns {RedisClient} Redis client.
 */
export function getClient(databaseIndex = 0) {
    const client = createClient({
        url: `redis://${config.get('redis.username')}:${process.env.REDIS_DB_SECRET}` +
            `@${config.get('redis.host')}:${config.get('redis.port')}/${databaseIndex}`,
        socket: {
            connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
            reconnectStrategy: false,
        },
    });
    client.on('error', (err) => {
        console.error('Redis error: ', err);
    });
    return client;
}

/**
 * @returns {number} the time limit for one helper call, in milliseconds.
 */
function operationTimeoutMs() {
    const configured = config.has('redis.operationTimeoutMs') ?
        Number(config.get('redis.operationTimeoutMs')) : NaN;
    return Number.isFinite(configured) && configured > 0 ?
        configured : DEFAULT_REDIS_OPERATION_TIMEOUT_MS;
}

/**
 * Opens a client, runs `operation` with it, and always closes it again.
 *
 * If connecting plus `operation` takes longer than the operation timeout, the client is torn
 * down (which rejects its pending connect or commands) and a RedisTimeoutError is thrown, so a
 * request never waits on Redis indefinitely.
 * @template T
 * @param {number} databaseIndex the index of the database to use.
 * @param {function(RedisClient): Promise<T>} operation the work to do with the connected client.
 * @returns {Promise<T>} what `operation` returned.
 * @throws {RedisTimeoutError} if Redis did not answer in time.
 */
async function withClient(databaseIndex, operation) {
    const client = getClient(databaseIndex);
    const timeoutMs = operationTimeoutMs();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        closeClient(client);
    }, timeoutMs);
    try {
        await client.connect();
        return await operation(client);
    } catch (err) {
        if (timedOut) {
            throw new RedisTimeoutError(timeoutMs, databaseIndex);
        }
        throw err;
    } finally {
        clearTimeout(timer);
        await closeClient(client);
    }
}

/**
 * Gets the value of a specified key in the database.
 * @param {string} key - the key of the entry to get.
 * @param {number} [databaseIndex=0] - the index the entry is stored in.
 * @returns {object} the entry's information.
 * @throws {KeyNotFoundError} if the key is not in the database.
 */
export async function getEntry(key, databaseIndex = 0) {
    return withClient(databaseIndex, async (client) => (
        parseEntry(await client.get(key), key, databaseIndex)
    ));
}

/**
 * Parses a raw Redis value that was read for `key`.
 * @param {string|null} raw the raw value returned by Redis.
 * @param {string} key the key the value was read from.
 * @param {number} databaseIndex the index the entry is stored in.
 * @returns {object} the parsed entry.
 * @throws {KeyNotFoundError} if the key is not in the database.
 */
function parseEntry(raw, key, databaseIndex) {
    if (raw === null) {
        const err = new KeyNotFoundError("failed to get entry", key, databaseIndex);
        console.error(err.message);
        throw err;
    }
    return JSON.parse(raw);
}

/**
 * Closes a client without masking an error that is already propagating.
 *
 * Uses disconnect() rather than quit(): every command has been answered (or abandoned) when
 * this runs, and quit() waits for Redis to answer QUIT, which a frozen Redis never does.
 * @param {RedisClient} client the client to close.
 */
async function closeClient(client) {
    if (!client.isOpen) {
        return;
    }
    try {
        await client.disconnect();
    } catch {
        // Already closed.
    }
}

/**
 * Gets the categories of all assignments from the Redis database.
 * @returns {object} the assignment categories.
 */
export async function getCategories() {
    return await getEntry('Categories');
}

/**
 * Gets a specified student's information from the Redis database.
 * @param {string} email - The email of the student whose information to get.
 * @returns {object} The student's information.
 * @throws {MisformedKeyError} If the key is not a valid type.
 * @throws {StudentNotEnrolledError} If the student is not in the database, meaning
 * the student is not enrolled in the class.
 */
export async function getStudent(email) {
    if (typeof email !== 'string') {
        throw new MisformedKeyError(
            'could not get student info',
            { expectedType: 'string', email },
        );
    }
    try {
        const student = await getEntry(email);
        return student;
    } catch (err) {
        // `typeof err` is always 'object', so dispatch on the error's name instead.
        if (err?.name === 'KeyNotFoundError') {
            throw new StudentNotEnrolledError("Student is not in the database.", email, err);
        }
        throw err;
    }
}

/**
 * Gets the grade bins of all assignments from the Redis database.
 * @returns {object} the assignment categories.
 */
export async function getBins() {
    // TODO: this should be exported into a constant.
    const databaseIndex = 1;
    const binsEntry = await getEntry('bins', databaseIndex);
    return binsEntry.bins;
}

/**
 * Gets the student's scores from the Redis database.
 * @param {string} email the email of the student whose information to get.
 * @returns {object} the student's scores.
 */
export async function getStudentScores(email) {
    try {
        const studentInfo = await getStudent(email);
        return studentInfo['Assignments'];
    } catch (err) {
        if (err.name === 'KeyNotFoundError' || err.name === 'StudentNotEnrolledError') {
            return {}; // Return empty object instead of throwing error
        }
        throw err; // Re-throw other errors
    }
}

/**
 * Gets the total amount of points a user has gotten so far.
 * @param {string} email the email of the student whose information to get.
 * @returns {number} the total amount of points the user has accumulated.
 */
export async function getStudentTotalScore(email) {
    const studentScores = await getStudentScores(email);
    return Object.values(studentScores).reduce((assignmentTotal, assignment) => {
        Object.values(assignment).forEach((points) => {
            assignmentTotal += +(points ?? 0);
        });
        return assignmentTotal;
    }, 0);
}

/**
 * Gets the total amount of points in the class so far.
 * @returns {number} the total amount of points possible for the class.
 */
export async function getTotalPossibleScore() {
    const bins = await getBins();
    return bins.at(-1).points;
}

/**
 * Gets the max points possible so far.
 * @returns {object} the maximal scores for all assignments so far.
 */
export async function getMaxScores() {
    try {
        return await getStudentScores('MAX POINTS');
    } catch (err) {
        if (err.name === 'KeyNotFoundError') {
            return {}; // Return empty object instead of throwing error
        }
        throw err; // Re-throw other errors
    }
}

/**
 * Gets a list of all of the students in the class.
 * Each student is represented as a list: [legalName, email]
 * @returns {Promise<Array<Array<string>>>} List of [legalName, email]
 */
export async function getStudents() {
    const entries = await getStudentEntries();
    return entries.map(([email, studentData]) => [studentData['Legal Name'], email]);
}

/**
 * Reads every student's full entry over one Redis connection.
 * @returns {Promise<Array<[string, object]>>} List of [email, parsed entry], in KEYS order.
 * @throws {KeyNotFoundError} if a key disappears between KEYS and GET.
 */
export async function getStudentEntries() {
    return withClient(0, async (client) => {
        const keys = await client.keys('*@*');
        const entries = [];
        // Read every student over this one connection instead of opening one per key.
        for (const key of keys) {
            entries.push([key, parseEntry(await client.get(key), key, 0)]);
        }
        return entries;
    });
}



/**
 * Gets the average score for a specific assignment across all students.
 * @param {string} section - The category of the assignment (e.g., "Projects", "Labs").
 * @param {string} assignmentName - The name of the assignment.
 * @returns {number|null} The average score, or null if no valid scores are found.
 */
export async function getAverageAssignmentScore(section, assignmentName) {
    const students = await getStudents();
    let totalScore = 0;
    let count = 0;

    const scores = await Promise.all(students.map(async ([, email]) => {
        const student = await getStudentScores(email);
        const score = student?.[section]?.[assignmentName];
        return (score != null && score !== "" && !isNaN(score)) ? +score : null;
    }));

    for (const score of scores) {
        if (score !== null) {
            totalScore += score;
            count++;
        }
    }

    return count > 0 ? totalScore / count : null;
}

/**
 * Gets the maximum score for a specific assignment across all students.
 * @param {string} section - The category of the assignment.
 * @param {string} assignmentName - The name of the assignment.
 * @returns {number|null} The highest score found, or null if no scores are found.
 */
export async function getMaxAssignmentScore(section, assignmentName) {
    const students = await getStudents();

    const scores = await Promise.all(students.map(async ([, email]) => {
        const student = await getStudentScores(email);
        const score = student?.[section]?.[assignmentName];
        return (score != null && score !== "" && !isNaN(score)) ? +score : null;
    }));

    const valid = scores.filter(score => score !== null);
    return valid.length > 0 ? Math.max(...valid) : null;
}

/**
 * Gets the minimum (non-N/A) score for a specific assignment.
 * @param {string} section - The category of the assignment.
 * @param {string} assignmentName - The name of the assignment.
 * @returns {number|null} The lowest valid score, or null if no valid scores found.
 */
export async function getMinAssignmentScore(section, assignmentName) {
    const students = await getStudents();

    const scores = await Promise.all(students.map(async ([, email]) => {
        const student = await getStudentScores(email);
        const score = student?.[section]?.[assignmentName];
        return (score != null && score !== "" && !isNaN(score)) ? +score : null;
    }));

    const validScores = scores.filter(score => score !== null);
    return validScores.length > 0 ? Math.min(...validScores) : null;
}

/**
 * Gets the top K students by score for a specific assignment.
 * @param {string} section - The category of the assignment.
 * @param {string} assignmentName - The name of the assignment.
 * @param {number} k - The number of top students to return.
 * @returns {Array<object>} Array of student objects { name, email, score }.
 */
export async function getTopKAssignmentScores(section, assignmentName, k) {
    const students = await getStudents();

    const scored = await Promise.all(students.map(async ([name, email]) => {
        const student = await getStudentScores(email);
        const score = student?.[section]?.[assignmentName];
        return (score != null && score !== "" && !isNaN(score)) ?
            { name, email, score: +score } : null;
    }));

    return scored
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}

/**
 * Gets the top K students by total score across all assignments.
 * @param {number} k - The number of top students to return.
 * @returns {Array<object>} Array of student objects { name, email, total }.
 */
export async function getTopKTotalScores(k) {
    const students = await getStudents();

    const totals = await Promise.all(students.map(async ([name, email]) => {
        const scores = await getStudentScores(email);
        let total = 0;

        for (const category of Object.values(scores)) {
            for (const score of Object.values(category)) {
                if (score != null && score !== "" && !isNaN(score)) {
                    total += +score;
                }
            }
        }

        return { name, email, total };
    }));

    return totals
        .sort((a, b) => b.total - a.total)
        .slice(0, k);
}


/**
 * Gets a list of students who achieved a specific score on a specific assignment.
 * @param {string} section - The category of the assignment (e.g., "Quest", "Labs").
 * @param {string} assignmentName - The name of the assignment (e.g., "Quest 1", "Lab 2").
 * @param {number|string} targetScore - The score to filter by.
 * @returns {Promise<Array<object>>} Array of student objects { name, email, score }.
 */
export async function getStudentsByAssignmentScore(section, assignmentName, targetScore) {
    const students = await getStudents(); // List of [legalName, email]
    const numericTargetScore = +targetScore; // Ensure comparison is numeric
    const studentsWithScore = await Promise.all(students.map(async ([name, email]) => {
        const studentScores = await getStudentScores(email);
        // Safely access the score
        const rawScore = studentScores?.[section]?.[assignmentName];
        // Convert to number for comparison, handle null/empty strings gracefully
        const score = (rawScore != null && rawScore !== "" && !isNaN(rawScore)) ? +rawScore : null;

        // Check if the score matches the target score
        if (score !== null && score === numericTargetScore) {
            return { name, email, score };
        }
        return null;
    }));

    // Filter out students who didn't match the score or had no score
    return studentsWithScore.filter(Boolean);
}