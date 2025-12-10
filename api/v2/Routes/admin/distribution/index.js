import { Router } from 'express';
import { getStudents, getStudentScores } from '../../../../lib/redisHelper.mjs'; 
const router = Router({ mergeParams: true });

/**
 * GET /admin/distribution/:section/:name
 * Returns score distribution with student data.
 * Returns: { 
 *   freq: [count0, count1, ...], 
 *   minScore: number, 
 *   maxScore: number,
 *   binWidth: number,
 *   distribution: [{ range: "50-74", count: N, students: [{name, email, score}, ...] }, ...]
 * }
 */
router.get('/:section/:name', async (req, res) => {
    try {
        const { section, name } = req.params;
        const students = await getStudents(); 

        let scoreData; // Array of {studentName, studentEmail, score}
        
        // Check if this is a summary request
        if (name.includes('Summary')) {
            // Get sum of all assignments in this section for each student
            scoreData = [];
            for (const student of students) {
                const studentId = student[1]; 
                const studentScores = await getStudentScores(studentId); 
                
                if (!studentScores[section]) {
                    continue;
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
                
                if (count > 0) {
                    scoreData.push({
                        studentName: student[0],
                        studentEmail: student[1],
                        score: total
                    });
                }
            }
        } else {
            // Get score for a specific assignment
            scoreData = [];
            for (const student of students) {
                const studentId = student[1]; 
                const studentScores = await getStudentScores(studentId); 
                
                const score = studentScores[section] ? studentScores[section][name] : null;
                
                if (score != null && score !== '' && !isNaN(score)) {
                    scoreData.push({
                        studentName: student[0],
                        studentEmail: student[1],
                        score: Number(score)
                    });
                }
            }
        }

        if (scoreData.length === 0) {
            // Return empty data structure
            return res.json({ 
                freq: [], 
                minScore: 0, 
                maxScore: 0,
                binWidth: 1,
                distribution: [] 
            });
        }

        const scores = scoreData.map(d => d.score);
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
        
        // Initialize frequency array and distribution map
        const freq = Array(numBuckets).fill(0);
        const distributionBuckets = Array(numBuckets).fill(null).map(() => ({
            students: []
        }));
        
        // Group students by bucket
        scoreData.forEach(data => {
            const score = data.score;
            // Calculate which bucket this score falls into
            let bucketIndex = Math.floor((score - minScore) / binWidth);
            
            // Handle edge case where score equals maxScore
            if (bucketIndex >= numBuckets) {
                bucketIndex = numBuckets - 1;
            }
            
            freq[bucketIndex]++;
            distributionBuckets[bucketIndex].students.push({
                name: data.studentName,
                email: data.studentEmail,
                score: data.score
            });
        });
        
        // Convert distribution buckets to array with range labels
        const distribution = distributionBuckets.map((bucket, index) => {
            const rangeStart = minScore + (index * binWidth);
            const rangeEnd = Math.min(rangeStart + binWidth - 1, maxScore);
            const rangeLabel = binWidth === 1 ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`;
            
            return {
                range: rangeLabel,
                rangeStart,
                rangeEnd,
                count: bucket.students.length,
                students: bucket.students
            };
        });
        
        // --- END Logic for binning ---

        res.json({
            freq,
            minScore,
            maxScore,
            binWidth,
            distribution  // New: includes all students grouped by score range
        });
    } catch (error) {
        console.error('Error fetching frequency distribution:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch frequency distribution' });
    }
});

export default router;