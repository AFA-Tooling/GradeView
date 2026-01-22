import { Router } from 'express';
import { getCategoryAverages } from '../../../../lib/dbHelper.mjs';

const router = Router({ mergeParams: true });

/**
 * GET /students/category-stats
 * Returns class average percentage for each category
 * Returns: { "Category1": 85.5, "Category2": 90.2, ... }
 */
router.get('/', async (req, res) => {
    try {
        const categoryAverages = await getCategoryAverages();
        res.json(categoryAverages);
    } catch (error) {
        console.error('Error fetching category stats:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch category stats' });
    }
});

export default router;
