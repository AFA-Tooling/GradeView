import { Router } from 'express';
import { getBins } from '../../../lib/redisHelper.mjs';
import NotFoundError from '../../../lib/errors/http/NotFoundError.js';

const router = Router({ mergeParams: true });

router.get('/', async (_, res) => {
    try {
        const binsData = await getBins();
        if (!binsData) {
            // No bins in Redis – return empty list to keep UI functional
            return res.status(200).json([]);
        }
        return res.status(200).json(binsData);
    } catch (err) {
        if (err?.name === 'KeyNotFoundError') {
            // Graceful fallback when key doesn't exist yet
            return res.status(200).json([]);
        }
        console.error('Error retrieving bins from Redis:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

export default router;
