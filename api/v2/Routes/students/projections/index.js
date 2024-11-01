import { Router } from 'express';
import { getTotalPossibleScore, getMaxScores, getStudentTotalScore, getStudentScores } from '../../../../lib/redisHelper.mjs';
import { getMaxPointsSoFar } from '../../../../lib/studentHelper.mjs';
import 'express-async-errors';
import { isAdmin } from '../../../../lib/userlib.mjs';

const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
    const { email } = req.params;
    let maxPoints;
    try {
        maxPoints = await getTotalPossibleScore();
        const maxScores = await getMaxScores();
        let studentTotalScore;
        let userGrades;
        if (isAdmin(email)) {
            userGrades = maxScores;
            studentTotalScore = getMaxPointsSoFar(maxScores, maxScores);
        } else {
                userGrades = await getStudentScores(email);
                studentTotalScore = await getStudentTotalScore(email);
        } 
    } catch (err) {
        switch (typeof err) {
            case 'StudentNotEnrolledError':
                console.error(`Error fetching student with id ${id}`, err);
                return res.status(404).json({ message: "Error fetching student."});
            default:
                console.error(`Internal service error fetching student with id ${id}`, err);
                return res.status(500).json({ message: "Internal server error." });
        }
    }
    const maxPointsSoFar = getMaxPointsSoFar(userGrades, maxScores);
    return res.status(200).json({
        zeros: Math.round(studentTotalScore),
        pace: Math.round((studentTotalScore / maxPointsSoFar) * maxPoints),
        perfect: Math.round(studentTotalScore + (maxPoints - maxPointsSoFar))
    });
});



export default router;
