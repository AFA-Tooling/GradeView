import { Router } from 'express';
import { getBins, getEntry } from '../../../lib/redisHelper.mjs';
import NotFoundError from '../../../lib/errors/http/NotFoundError.js';

const router = Router({ mergeParams: true });

router.get('/', async (_, res) => {
    try {
        const binsEntry = await getEntry('bins', 1);
        console.log('Retrieved binsEntry from Redis:', JSON.stringify(binsEntry, null, 2));
        
        if (!binsEntry) {
            console.warn('No bins entry found in Redis');
            // No bins in Redis – return empty structure to keep UI functional
            return res.status(200).json({
                bins: [],
                assignment_points: {},
                total_course_points: 0
            });
        }
        
        const response = {
            bins: binsEntry.bins || [],
            assignment_points: binsEntry.assignment_points || {},
            total_course_points: binsEntry.total_course_points || 0
        };
        
        console.log('Returning bins response:', {
            binsCount: response.bins.length,
            assignmentPointsCount: Object.keys(response.assignment_points).length,
            totalPoints: response.total_course_points
        });
        
        // Return both bins and assignment_points for the grading breakdown
        return res.status(200).json(response);
    } catch (err) {
        if (err?.name === 'KeyNotFoundError') {
            console.warn('KeyNotFoundError: bins key not found in Redis database 1');
            // Graceful fallback when key doesn't exist yet
            return res.status(200).json({
                bins: [],
                assignment_points: {},
                total_course_points: 0
            });
        }
        console.error('Error retrieving bins from Redis:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

export default router;
