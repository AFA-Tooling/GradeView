import { Router } from 'express';
import { getStudents, getStudentScores, getStudentsByAssignmentScore } from '../../../../lib/redisHelper.mjs'; 

const router = Router({ mergeParams: true });

/**
 * GET /admin/student-scores
 * Returns all student scores in the format expected by admin.jsx
 */
router.get('/', async (req, res) => {
    try {
        const students = await getStudents();

        const studentDataPromises = students.map(async (student) => {
            const studentId = student[1]; 
            
            const scores = await getStudentScores(studentId); 

            return {
                name: student[0] || 'Unknown',
                email: student[1] || '',
                scores: scores || {}
            };
        });

        const formattedStudents = await Promise.all(studentDataPromises);

        res.json({
            students: formattedStudents
        });
    } catch (error) {
        console.error('Error fetching student scores:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to fetch student scores',
            students: []
        });
    }
});

/**
 * GET /admin/students-by-score/:section/:assignment/:score
 * Returns students who achieved the specified score on the assignment.
 * Score can be a range (e.g., "50-74") or a single value.
 * This endpoint now caches distribution data internally to avoid re-traversal.
 */
router.get('/:section/:assignment/:score', async (req, res) => {
    const { section, assignment, score } = req.params;
    // Decode parameters
    const decodedSection = decodeURIComponent(section);
    const decodedAssignment = decodeURIComponent(assignment);
    const decodedScore = decodeURIComponent(score);
    
    // Parse score - could be a range "min-max" or a single value
    let minScore, maxScore;
    if (decodedScore.includes('-')) {
        const parts = decodedScore.split('-');
        minScore = parseInt(parts[0]) || 0;
        maxScore = parseInt(parts[1]) || 0;
    } else {
        const val = parseInt(decodedScore) || 0;
        minScore = val;
        maxScore = val;
    }

    try {
        // Get distribution data which already has all students grouped by score
        const students = await getStudents();
        
        // Check if this is a Summary request
        if (decodedAssignment.includes('Summary')) {
            // Get sum of all assignments in this section for each student
            const matchingStudents = [];
            
            for (const student of students) {
                const studentEmail = student[1];
                const studentName = student[0];
                const studentScores = await getStudentScores(studentEmail);

                // Sum all scores in this section
                let sectionTotal = 0;
                if (studentScores[decodedSection]) {
                    Object.values(studentScores[decodedSection]).forEach(score => {
                        if (score != null && score !== '') {
                            sectionTotal += parseInt(score) || 0;
                        }
                    });
                }

                // Check if this student's total falls within the score range
                if (sectionTotal >= minScore && sectionTotal <= maxScore) {
                    matchingStudents.push({
                        name: studentName,
                        email: studentEmail,
                        score: sectionTotal
                    });
                }
            }

            return res.json({ students: matchingStudents });
        }

        // Regular assignment score lookup - check range
        const matchingStudents = [];

        for (const student of students) {
            const studentEmail = student[1];
            const studentName = student[0];
            const studentScores = await getStudentScores(studentEmail);
            const studentScore = studentScores[decodedSection] ? studentScores[decodedSection][decodedAssignment] : null;

            if (studentScore != null && studentScore !== '') {
                const scoreVal = parseInt(studentScore) || 0;
                // Check if score falls within the range
                if (scoreVal >= minScore && scoreVal <= maxScore) {
                    matchingStudents.push({
                        name: studentName,
                        email: studentEmail,
                        score: scoreVal
                    });
                }
            }
        }

        res.json({ students: matchingStudents });
    } catch (error) {
        console.error('Error fetching students for score %s on %s:', decodedScore, decodedAssignment, error);
        res.status(500).json({ 
            error: error.message || 'Failed to fetch students by score',
            students: []
        });
    }
});


export default router;