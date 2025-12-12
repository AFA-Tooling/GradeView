import { Router } from 'express';
import { getEntry, getStudents, getStudentScores } from '../../../../lib/redisHelper.mjs';

const router = Router({ mergeParams: true });

/**
 * GET /admin/categories
 * Returns assignment categories organized by section
 * Format: { section: { assignmentName: true } }
 */
router.get('/', async (req, res) => {
    try {
        // Try to get categories from Redis first
        try {
            const categoriesEntry = await getEntry('Categories');
            return res.status(200).json(categoriesEntry);
        } catch (err) {
            // If not in Redis, build from student scores
            console.log('Categories not in Redis, building from student data...');
        }
        
        // Build categories from student scores
        const students = await getStudents();
        const categories = {};
        
        for (const student of students) {
            const studentId = student[1];
            const scores = await getStudentScores(studentId);
            
            // For each section in scores
            for (const [section, assignments] of Object.entries(scores)) {
                if (!categories[section]) {
                    categories[section] = {};
                }
                // For each assignment in section
                for (const assignmentName of Object.keys(assignments)) {
                    categories[section][assignmentName] = true;
                }
            }
        }
        
        res.status(200).json(categories);
    }
    catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch categories' });
    }
});

export default router;
