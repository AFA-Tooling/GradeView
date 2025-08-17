import config from 'config';
import dotenv from 'dotenv';
import MisformedKeyError from './errors/redis/MisformedKeyError.js';
import KeyNotFoundError from './errors/redis/KeyNotFound.js';
import StudentNotEnrolledError from './errors/redis/StudentNotEnrolled.js';
import { createClient } from 'redis';

dotenv.config();

/**
 * Gets an authenticated Redis client.
 * @param {number} databaseIndex the index the entry is stored in.
 * @returns {RedisClient} Redis client.
 */
export function getClient(databaseIndex = 0) {
    const client = createClient({
        url: `redis://${config.get('redis.username')}:${process.env.REDIS_DB_SECRET}` +
            `@${config.get('redis.host')}:${config.get('redis.port')}/${databaseIndex}`,
    });
    client.on('error', (err) => {
        console.error('Redis error: ', err);
    });
    return client;
}

/**
 * Gets the value of a specified key in the database.
 * @param {string} key - the key of the entry to get.
 * @param {number} [databaseIndex=0] - the index the entry is stored in.
 * @returns {object} the entry's information.
 * @throws {KeyNotFoundError} if the key is not in the database.
 */
export async function getEntry(key, databaseIndex = 0) {
    const client = getClient(databaseIndex);
    await client.connect();

    try {
        const res = await client.get(key);
        if (res === null) {
            const err = new KeyNotFoundError("failed to get entry", key, databaseIndex);
            console.error(err.message);
            throw err;
        }
        return JSON.parse(res);
    } finally {
        await client.quit();
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
        switch (typeof err) {
            case 'KeyNotFoundError':
                throw new StudentNotEnrolledError("Student is not in the database.", email, err);
            default:
                throw err;
        }
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
    const studentInfo = await getStudent(email);
    return studentInfo['Assignments'];
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
    return await getStudentScores('MAX POINTS');
}

/**
 * Gets a list of all of the students in the class.
 * Each student is represented as a list: [legalName, email]
 * @returns {Promise<Array<Array<string>>>} List of [legalName, email]
 */
export async function getStudents() {
    const client = await getClient();
    await client.connect();

    var keys = await client.keys('*@*');
    const students = [];

    for (const key of keys) {
        const studentData = await getEntry(key)
        students.push([studentData['Legal Name'], key]); 
    }

    await client.quit();
    return students;
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
