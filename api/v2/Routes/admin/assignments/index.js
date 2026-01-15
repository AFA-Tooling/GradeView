import { Router } from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const router = Router({ mergeParams: true });

const pool = new Pool({
    connectionString: process.env.GRADESYNC_DATABASE_URL || process.env.DATABASE_URL
});

/**
 * GET /admin/assignments
 * Returns all assignments grouped by category from PostgreSQL database
 * This replaces the Redis-based /admin/categories endpoint
 * Format: {
 *   "Projects": { "Project 1": 100, "Project 2": 100, ... },
 *   "Labs": { "Lab 1": 10, "Lab 2": 10, ... },
 *   ...
 * }
 */
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                COALESCE(a.category, 'Uncategorized') as category,
                a.title as assignment_name,
                a.max_points
            FROM assignments a
            WHERE a.title IS NOT NULL
            ORDER BY a.category, a.title
        `;
        
        const result = await pool.query(query);
        
        // Group by category
        const grouped = {};
        result.rows.forEach(row => {
            const category = row.category.trim();
            const name = row.assignment_name.trim();
            const maxPoints = parseFloat(row.max_points) || 0;
            
            if (!grouped[category]) {
                grouped[category] = {};
            }
            grouped[category][name] = maxPoints;
        });
        
        console.log(`[INFO] Fetched ${result.rows.length} assignments from database, ${Object.keys(grouped).length} categories`);
        
        res.json(grouped);
    } catch (error) {
        console.error('Error fetching assignments from database:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch assignments' });
    }
});

export default router;
