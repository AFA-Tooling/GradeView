import config from 'config';
import { getStudent } from './redisHelper.mjs';

/**
 * Checks if the specified user is an admin.
 *
 * Deliberately synchronous: it only reads the `admins` list from config. An async version that a
 * caller forgot to await would return a (truthy) Promise and make every user an admin.
 * @param {string} email - the email of the user to check.
 * @returns {boolean} whether the user is an admin.
 */
export function isAdmin(email) {
    if (typeof email !== 'string' || email.length === 0) {
        return false;
    }
    const target = email.toLowerCase();
    const admins = config.get('admins');
    return admins.some((admin) => typeof admin === 'string' && admin.toLowerCase() === target);
}

/**
 * Checks if the specified user is a student (has an entry in the roster).
 * @param {string} email - the email of the user to check.
 * @returns {Promise<boolean>} whether the user is a student.
 */
export async function isStudent(email) {
    try {
        const student = await getStudent(email);
        return !!student;
    } catch (err) {
        // `typeof err` is always 'object', so dispatch on the error's name instead.
        if (err?.name === 'StudentNotEnrolledError') {
            return false;
        }
        throw err;
    }
}
