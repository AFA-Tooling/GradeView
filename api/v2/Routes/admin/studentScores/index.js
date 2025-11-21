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
        console.log('Fetched students for scores:', students.length);

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
 */
router.get('/:section/:assignment/:score', async (req, res) => {
    const { section, assignment, score } = req.params;
    console.log(`Fetching students for score ${score} on assignment ${assignment} in section ${section}`);
    // Decode parameters (useful if assignment names contain URL-unsafe characters)
    const decodedSection = decodeURIComponent(section);
    const decodedAssignment = decodeURIComponent(assignment);
    
    // The score can be passed directly to the helper function, which handles conversion
    const targetScore = score; 

    try {
        const students = await getStudentsByAssignmentScore(
            decodedSection,
            decodedAssignment,
            targetScore
        );

        res.json({
            students: students
        });
    } catch (error) {
        console.error(`Error fetching students for score ${targetScore} on ${decodedAssignment}:`, error);
        res.status(500).json({ 
            error: error.message || 'Failed to fetch students by score',
            students: []
        });
    }
});


export default router;