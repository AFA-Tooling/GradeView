import { Router } from 'express';
import {
    getMaxScores,
    getStudentScores,
} from '../../../../lib/redisHelper.mjs';
import { isAdmin } from '../../../../lib/userlib.mjs';

const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
    const { id } = req.params; // the id is the student's email
    try {
        let studentScores;
        const maxScores = await getMaxScores();
        if (isAdmin(id)) {
            studentScores = maxScores;
        } else {
            // Attempt to get student scores
            studentScores = await getStudentScores(id);
        }
        return res.status(200).json(
            getStudentScoresWithMaxPoints(studentScores, maxScores)
        );
    } catch (err) {
        switch (err.name) {
            case 'StudentNotEnrolledError':
            case 'KeyNotFoundError':
                console.error("Error fetching scores for student with id %s", id, err);
                return res.status(404).json({ message: `Error fetching scores for student with id ${id}` });
            default:
                console.error("Internal service error for student with id %s", id, err);
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
