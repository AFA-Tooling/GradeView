import { Router } from 'express';
import { getStudentScores, getStudents } from '../../../../lib/redisHelper.mjs';
const router = Router({ mergeParams: true });

/**
 * GET /admin/stats/:section/:name
 * Returns statistics for a specific assignment
 * Returns: { average, max, min, count }
 */
router.get('/:section/:name', async (req, res) => {
    try {
        const { section, name } = req.params;
        const students = await getStudents();
        
        const scorePromises = students.map(async student => {
            const studentId = student[1];
            const studentScores = await getStudentScores(studentId);
            const score = studentScores[section] ? studentScores[section][name] : null;
        

            if (score != null && score !== '') {
                return Number(score);
            }
            return null; 
        });

        const rawScores = await Promise.all(scorePromises);

        const scores = rawScores.filter(score => score !== null);

        if (scores.length === 0) {
            console.log('No valid scores found for', section, name);
            return res.json({
                average: 0,
                max: 0,
                min: 0,
                count: 0,
                median: 0
            });
        }

        const sum = scores.reduce((a, b) => a + b, 0);

        const average = sum / scores.length;
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        
        const sorted = [...scores].sort((a, b) => a - b); 
        
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        res.json({
            average: parseFloat(average.toFixed(2)),
            max,
            min,
            median: parseFloat(median.toFixed(2)),
            count: scores.length
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch stats' });
    }
});

export default router;
