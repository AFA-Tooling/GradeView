import { Router } from 'express';
import {
    getMaxScores,
    getStudentScores,
} from '../../../../lib/redisHelper.mjs';
import { isAdmin } from '../../../../lib/userlib.mjs';
import {
    getStudentSubmissionsByTime,
    getStudentSubmissionsGrouped,
    studentExistsInDb,
} from '../../../../lib/dbHelper.mjs';

const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
    const { id } = req.params; // the id is the student's email
    const { sort, format } = req.query; // sort: 'time' or 'assignment' (default), format: 'list' or 'grouped'
    
    try {
        // Handle time-based sorting from PostgreSQL
        if (sort === 'time') {
            if (isAdmin(id)) {
                return res.status(400).json({ 
                    message: "Time-based sorting not available for admin view." 
                });
            }
            
            const submissionsByTime = await getStudentSubmissionsByTime(id);
            
            if (!submissionsByTime || submissionsByTime.length === 0) {
                return res.status(200).json([]);
            }
            
            // Return array format with submission times for chronological view
            return res.status(200).json({
                sortBy: 'time',
                submissions: submissionsByTime,
            });
        }
        
        // Handle grouped format from PostgreSQL (similar to Redis structure)
        if (format === 'db') {
            if (isAdmin(id)) {
                return res.status(400).json({ 
                    message: "Database format not available for admin view." 
                });
            }
            
            const dbExists = await studentExistsInDb(id);
            if (!dbExists) {
                // Fallback to Redis if student not in DB
                const studentScores = await getStudentScores(id);
                const maxScores = await getMaxScores();
                return res.status(200).json(
                    getStudentScoresWithMaxPoints(studentScores, maxScores)
                );
            }
            
            const groupedSubmissions = await getStudentSubmissionsGrouped(id);
            const maxScores = await getMaxScores();
            
            // Merge max scores from Redis with DB scores that may have submission times
            return res.status(200).json(
                getStudentScoresWithMaxPointsAndTime(groupedSubmissions, maxScores)
            );
        }
        
        // Default: Try Redis first, fallback to PostgreSQL if no data
        let studentScores;
        let maxScores;
        
        if (isAdmin(id)) {
            maxScores = await getMaxScores();
            studentScores = maxScores;
        } else {
            // Attempt to get student scores from Redis
            studentScores = await getStudentScores(id);
            maxScores = await getMaxScores();
        }
        
        // Check if Redis returned empty data
        const hasStudentData = studentScores && Object.keys(studentScores).length > 0;
        const hasMaxScores = maxScores && Object.keys(maxScores).length > 0;
        
        if (!hasStudentData && !isAdmin(id)) {
            // Redis has no data, try PostgreSQL fallback
            console.log(`Redis data not found for ${id}, using database fallback`);
            
            const dbExists = await studentExistsInDb(id);
            if (dbExists) {
                const groupedSubmissions = await getStudentSubmissionsGrouped(id);
                return res.status(200).json(groupedSubmissions);
            } else {
                return res.status(200).json({});
            }
        }
        
        // Return Redis data
        return res.status(200).json(
            getStudentScoresWithMaxPoints(studentScores, maxScores)
        );
    } catch (err) {
        console.error("Internal service error for student with id %s", id, err);
        return res.status(500).json({ message: "Internal server error." });
    }
});

/**
 * Gets the student's scores but with the max points added on.
 * @param {object} studentScores the student's scores.
 * @param {object} maxScores the maximum possible scores.
 * @returns {object} students scores with max points.
 */
function getStudentScoresWithMaxPoints(studentScores, maxScores) {
    return Object.keys(studentScores).reduce((assignmentsDict, assignment) => {
        assignmentsDict[assignment] = Object.entries(
            studentScores[assignment],
        ).reduce((scoresDict, [category, pointsScored]) => {
            scoresDict[category] = {
                student: pointsScored,
                max: maxScores[assignment][category],
            };
            return scoresDict;
        }, {});
        return assignmentsDict;
    }, {});
}

/**
 * Gets the student's scores from DB with submission times, merged with max points from Redis
 * @param {object} studentScores the student's scores from DB (with submissionTime).
 * @param {object} maxScores the maximum possible scores from Redis.
 * @returns {object} students scores with max points and submission times.
 */
function getStudentScoresWithMaxPointsAndTime(studentScores, maxScores) {
    return Object.keys(studentScores).reduce((assignmentsDict, assignment) => {
        assignmentsDict[assignment] = Object.entries(
            studentScores[assignment],
        ).reduce((scoresDict, [category, data]) => {
            const maxScore = maxScores?.[assignment]?.[category] || data.max;
            scoresDict[category] = {
                student: data.student,
                max: maxScore,
                submissionTime: data.submissionTime,
                lateness: data.lateness,
            };
            return scoresDict;
        }, {});
        return assignmentsDict;
    }, {});
}

export default router;
