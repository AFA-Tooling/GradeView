import { Router } from 'express';
import { getEntry, getStudents } from '../../../../lib/redisHelper.mjs';

const router = Router({ mergeParams: true });

/**
 * GET /admin/categories
 * Returns assignment categories organized by section
 * assignment name : max
 * Format: { section: { assignmentName: true } }
 */

/** localhost/admin/categories/ */
router.get('/', async (req, res) => {
    try {
        // Get categories from Redis or build from assignment data
        
        const categoriesEntry = await getEntry('Categories');
        if (categoriesEntry) {
            // return res.json(categoriesEntry.categories);
            return res.status(200).json(categoriesEntry);
        }
    }
    catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch categories' });
    }
});

export default router;
