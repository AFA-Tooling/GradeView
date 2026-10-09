import { Router } from 'express';
import {
    getMaxScores,
    getStudentScores,
} from '../../../../lib/redisHelper.mjs';
import { isAdmin } from '../../../../lib/userlib.mjs';
import { requestedStudentEmail } from '../../../../lib/authlib.mjs';

const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
    const email = requestedStudentEmail(req);
    try {
        let studentScores;
        const maxScores = await getMaxScores();
        if (isAdmin(email)) {
            studentScores = maxScores;
        } else {
            // Attempt to get student scores
            studentScores = await getStudentScores(email);
        }
        return res.status(200).json(
            getStudentScoresWithMaxPoints(studentScores, maxScores)
        );
    } catch (err) {
        switch (err.name) {
            case 'StudentNotEnrolledError':
            case 'KeyNotFoundError':
                console.error("Error fetching scores for student with email %s", email, err);
                return res.status(200).json();
            default:
                console.error("Internal service error for student with email %s", email, err);
                return res.status(500).json({ message: "Internal server error." });
        }
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

export default router;
