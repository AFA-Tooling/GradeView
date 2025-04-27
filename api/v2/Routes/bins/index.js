import { Router } from 'express';
import { getBins } from '../../../lib/redisHelper.mjs';
import NotFoundError from '../../../lib/errors/http/NotFoundError.js';

const router = Router({ mergeParams: true });

router.get('/', async (_, res) => {
    try {
        const binsData = await getBins();
        if (!binsData) {
            throw new NotFoundError('Bins data not found');
        }
        return res.status(200).json(binsData);
    } catch (err) {
        console.error('Error retrieving bins from Redis:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

export default router;
