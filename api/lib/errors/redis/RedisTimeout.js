import Base from './Base.js';

/**
 * Thrown when Redis does not finish a request (connect plus commands) in time.
 */
export default class RedisTimeoutError extends Base {
    /**
     * Creates a new RedisTimeoutError.
     * @constructor
     * @param {number} timeoutMs - How long the request was allowed to take.
     * @param {int} databaseIndex - The index of the db that was queried.
     * @param {Error|null} [err=null] - the existing error that was thrown if any.
     */
    constructor(timeoutMs, databaseIndex, err = null) {
        super(
            `Redis did not answer within ${timeoutMs} ms (database index ${databaseIndex})`,
            err,
        );
        this.name = 'RedisTimeoutError';
        this.timeoutMs = timeoutMs;
        this.databaseIndex = databaseIndex;
    }
}
