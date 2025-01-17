/**
 * @deprecated This file is deprecated. It contains logic to produce a query string for CM, which is no longer used.
 */
import { Router } from 'express';
import {
    getMaxScores,
    getStudentScores,
} from '../../../../lib/redisHelper.mjs';
import ProgressReportData from '../../../../assets/progressReport/CS10.json' assert { type: 'json' };

const router = Router({ mergeParams: true });

/**
 * @deprecated Use the function with the same name in ../masterymapping/index.js instead.
 */
function getTopicsFromUser(gradeData) {
    const topicsTable = {};
    Object.entries(gradeData).forEach(([assignment, topics]) => {
        Object.entries(topics).forEach(([topic, score]) => {
            if (topic in topicsTable) {
                topicsTable[topic] += +(score ?? 0);
            } else {
                topicsTable[topic] = +(score ?? 0);
            }
        });
    });
    return topicsTable;
}

/**
 * @deprecated The query string is deprecated. GV now relays info to Concept Map using a POST request.
 */
async function getMasteryString(userTopicPoints, maxTopicPoints) {
    const numMasteryLevels = ProgressReportData['student levels'].length - 2;
    Object.entries(userTopicPoints).forEach(([topic, userPoints]) => {
        const maxAchievablePoints = maxTopicPoints[topic];
        if (userPoints === 0) {
            return;
        }
        if (userPoints >= maxAchievablePoints) {
            userTopicPoints[topic] = numMasteryLevels + 1;
            return;
        }
        const unBoundedMasteryLevel =
            (userPoints / maxAchievablePoints) * numMasteryLevels;
        if (unBoundedMasteryLevel === numMasteryLevels) {
            userTopicPoints[topic] = numMasteryLevels;
        } else if (unBoundedMasteryLevel % 1 === 0) {
            // Push them over to the next category if they are exactly on the edge.
            userTopicPoints[topic] = unBoundedMasteryLevel + 1;
        } else {
            userTopicPoints[topic] = Math.ceil(unBoundedMasteryLevel);
        }
    });
    let masteryNum = Object.values(userTopicPoints).join('');
    return masteryNum;
}

router.get('/', async (req, res) => {
    const { id } = req.params;
    try {
        const maxScores = await getMaxScores();
        const studentScores = await getStudentScores(id);
        const userTopicPoints = getTopicsFromUser(studentScores);
        const maxTopicPoints = getTopicsFromUser(maxScores);
        const masteryNum = await getMasteryString(userTopicPoints, maxTopicPoints);
        return res.status(200).json(masteryNum);
    } catch (err) {
        switch (err.name) {
            case 'StudentNotEnrolledError':
            case 'KeyNotFoundError':
                console.error('Error fetching student with id %s', id, err);
                return res.status(404).json({ message: "Error fetching student."});
            default:
                console.error('Internal service error fetching student with id %s', id, err);
                return res.status(500).json({ message: "Internal server error." });
        }
    }
});

export default router;
