import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import * as redisHelper from '../lib/redisHelper.mjs';
import BinsRouter from './Routes/bins/index.js';
import StudentsRouter from './Routes/students/index.js';
import VerifyAccessRouter from './Routes/verifyaccess/index.js';
import IsAdminRouter from './Routes/isadmin/index.js';
import LoginRouter from "./Routes/login/index.js";
import AdminRouter from './Routes/admin/index.js';

const router = Router();

// Rate limiting for the meta endpoint.
const limiter = RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // max 100 requests per IP per window
});

/**
 * GET /meta
 *
 * Retrieves meta data stored in Redis.
 *
 * @returns {void}
 *   - Responds with the meta data (status 200) if found.
 *   - Sends a 404 status and message if meta data is not found.
 *   - Sends a 500 status and message if an error occurs during retrieval.
 */
router.get('/meta', limiter, async (req, res, next) => {
    try {
        // Use the centralized Redis helper to create a Redis client.
        const redisClient = redisHelper.getClient();
        await redisClient.connect();
        
        const metaData = await redisClient.get('metaData');
        await redisClient.quit();

        if (!metaData) {
            return res.status(404).send('Meta data not found');
        }
        return res.send(metaData);
    } catch (error) {
        console.error("Error fetching meta data from Redis:", error);
        return res.status(500).send("Error fetching meta data");
    }
});

router.use('/login', LoginRouter);
router.use('/bins', BinsRouter);
router.use('/verifyaccess', VerifyAccessRouter);
router.use('/isadmin', IsAdminRouter);
router.use('/admin', AdminRouter);
router.use('/students', StudentsRouter);

export default router;
