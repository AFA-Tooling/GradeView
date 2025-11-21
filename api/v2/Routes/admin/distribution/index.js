import { Router } from 'express';
import { getStudents, getStudentScores } from '../../../../lib/redisHelper.mjs'; 
const router = Router({ mergeParams: true });

/**
 * GET /admin/distribution/:section/:name
 * Returns score distribution (frequency data, 1 score = 1 bucket).
 * Returns: { freq: [count0, count1, ...], minScore: number, maxScore: number }
 */
router.get('/:section/:name', async (req, res) => {
    try {
        const { section, name } = req.params;
        const students = await getStudents(); 

        const scorePromises = students.map(async student => {
            const studentId = student[1]; 
            
            const studentScores = await getStudentScores(studentId); 
            
            // Assuming scores are under section/name and are numbers
            const score = studentScores[section] ? studentScores[section][name] : null;
            
            if (score != null && score !== '' && !isNaN(score)) {
                // Ensure we are working with integers for binning, 
                // but keep original value for max/min if needed.
                // Since scores are typically integers, we convert to Number.
                return Number(score); 
            }
            return null;
        });

        const rawScores = await Promise.all(scorePromises);
        
        const scores = rawScores.filter(score => score !== null);

        if (scores.length === 0) {
            // Return empty data structure
            return res.json({ freq: [], minScore: 0, maxScore: 0 });
        }

        
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        
        // --- Logic for 1-point buckets ---

        // The number of buckets needed, plus 1 (inclusive range)
        const range = maxScore - minScore + 1;
        
        // Initialize frequency array with size 'range', all counts start at 0
        const freq = Array(range).fill(0); 

        scores.forEach(score => {
            // Calculate the index relative to the minScore.
            // A score equal to minScore goes into index 0.
            const index = score - minScore;

            // This condition is robust because scores are filtered to be between minScore and maxScore.
            if (index >= 0 && index < range) {
                freq[index]++;
            }
        });
        
        // --- END Logic for 1-point buckets ---

        res.json({
            // freq array now contains counts where freq[i] is the count for score (minScore + i)
            freq,
            minScore,
            maxScore
            // Removed: bins, max, min, binWidth
        });
    } catch (error) {
        console.error('Error fetching frequency distribution:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch frequency distribution' });
    }
});

export default router;