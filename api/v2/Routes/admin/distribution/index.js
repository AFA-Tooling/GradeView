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

        let scorePromises;
        
        // Check if this is a summary request
        if (name.includes('Summary')) {
            // Get sum of all assignments in this section for each student
            scorePromises = students.map(async student => {
                const studentId = student[1]; 
                const studentScores = await getStudentScores(studentId); 
                
                if (!studentScores[section]) {
                    return null;
                }
                
                const sectionScores = studentScores[section];
                let total = 0;
                let count = 0;
                
                Object.values(sectionScores).forEach(score => {
                    if (score != null && score !== '' && !isNaN(score)) {
                        total += Number(score);
                        count++;
                    }
                });
                
                return count > 0 ? total : null;
            });
        } else {
            // Original logic: get distribution for a specific assignment
            scorePromises = students.map(async student => {
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
        }

        const rawScores = await Promise.all(scorePromises);
        
        const scores = rawScores.filter(score => score !== null);

        if (scores.length === 0) {
            // Return empty data structure
            return res.json({ freq: [], minScore: 0, maxScore: 0 });
        }

        
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        
        // --- Logic for binning with max 25 buckets ---
        const range = maxScore - minScore + 1;
        let numBuckets = range;
        let binWidth = 1;
        
        // If range > 25, create bins of equal width
        if (range > 25) {
            numBuckets = 25;
            binWidth = Math.ceil(range / numBuckets);
        }
        
        // Initialize frequency array
        const freq = Array(numBuckets).fill(0);
        
        scores.forEach(score => {
            // Calculate which bucket this score falls into
            let bucketIndex = Math.floor((score - minScore) / binWidth);
            
            // Handle edge case where score equals maxScore
            if (bucketIndex >= numBuckets) {
                bucketIndex = numBuckets - 1;
            }
            
            freq[bucketIndex]++;
        });
        
        // --- END Logic for binning ---

        res.json({
            freq,
            minScore,
            maxScore,
            binWidth  // Include binWidth so frontend knows the bin size
        });
    } catch (error) {
        console.error('Error fetching frequency distribution:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch frequency distribution' });
    }
});

export default router;