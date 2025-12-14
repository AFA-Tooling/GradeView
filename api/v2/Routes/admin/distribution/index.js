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
        
        // Get max possible score for this assignment
        const { getMaxScores } = await import('../../../../lib/redisHelper.mjs');
        const maxScoresData = await getMaxScores();
        let maxPossibleScore = null;
        
        if (!name.includes('Summary') && maxScoresData[section] && maxScoresData[section][name]) {
            maxPossibleScore = Number(maxScoresData[section][name]);
        } 

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
        
        // --- Logic for binning: Always use 1-point bins for accuracy ---
        const range = maxScore - minScore;
        const isSummary = name.includes('Summary');
        
        // Validate range
        if (!isFinite(range) || range < 0) {
            console.error('Invalid range calculation:', { minScore, maxScore, range });
            return res.status(500).json({ 
                error: 'Invalid score range',
                details: { minScore, maxScore, range }
            });
        }
        
        // Handle case where all scores are the same
        if (range === 0) {
            return res.json({
                freq: [scoreData.length],
                minScore,
                maxScore,
                binWidth: 1,
                totalStudents: scoreData.length,
                isSummary,
                suggestedTickInterval: 1,
                distribution: [{
                    range: `${minScore}`,
                    rangeStart: minScore,
                    rangeEnd: minScore,
                    count: scoreData.length,
                    students: scoreData.map(d => ({
                        name: d.studentName,
                        email: d.studentEmail,
                        score: d.score
                    }))
                }]
            });
        }
        
        // Always use 1-point bins for data accuracy
        const binWidth = 1;
        
        // Determine the actual range to use (0 to maxPossibleScore if available)
        const displayMinScore = 0;
        const displayMaxScore = maxPossibleScore || maxScore;
        const displayRange = displayMaxScore - displayMinScore;
        const numBuckets = Math.ceil(displayRange) + 1;
        
        // Calculate suggested tick interval for display
        // This helps the frontend show appropriate x-axis labels
        let suggestedTickInterval = 1;
        if (displayRange > 100) {
            suggestedTickInterval = 10;
        } else if (displayRange > 50) {
            suggestedTickInterval = 5;
        } else if (displayRange > 25) {
            suggestedTickInterval = 2;
        }
        
        // Additional validation before creating arrays
        if (numBuckets > 1000) {
            console.error('Too many buckets requested:', numBuckets);
            return res.status(500).json({ 
                error: 'Score range too large',
                details: { minScore, maxScore, range, numBuckets }
            });
        }
        
        // Initialize frequency array and distribution map
        // Fill from 0 to displayMaxScore
        const freq = Array(numBuckets).fill(0);
        const distributionBuckets = Array(numBuckets).fill(null).map(() => ({
            students: []
        }));
        
        // Group students by bucket
        scoreData.forEach(data => {
            const score = data.score;
            // Calculate which bucket this score falls into (from 0)
            let bucketIndex = Math.floor(score / binWidth);
            
            // Handle edge case where score equals or exceeds displayMaxScore
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
        // Start from 0 and go to displayMaxScore
        const distribution = distributionBuckets.map((bucket, index) => {
            const scoreValue = index * binWidth;
            
            return {
                range: `${scoreValue}`,
                rangeStart: scoreValue,
                rangeEnd: scoreValue,
                count: bucket.students.length,
                students: bucket.students
            };
        });
        
        // --- END Logic for binning ---

        res.json({
            freq,
            minScore: displayMinScore,  // Always 0
            maxScore: displayMaxScore,  // Max possible score or highest student score
            actualMinScore: minScore,   // Actual lowest student score
            actualMaxScore: maxScore,   // Actual highest student score
            maxPossibleScore,           // Max possible score for this assignment (null for summary)
            binWidth,
            totalStudents: scoreData.length,
            isSummary,
            suggestedTickInterval,  // Frontend can use this to reduce x-axis label density
            distribution  // Includes all students grouped by score range (0 to maxScore)
        });
    } catch (error) {
        console.error('Error fetching frequency distribution:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch frequency distribution' });
    }
});

export default router;