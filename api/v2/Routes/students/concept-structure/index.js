import { Router } from 'express';
import { getMaxScores, getStudentScores } from '../../../../lib/redisHelper.mjs';
import ProgressReportData from '../../../../assets/progressReport/CS10.json' assert { type: 'json' };
import KeyNotFoundError from '../../../../lib/errors/redis/KeyNotFound.js';
import StudentNotEnrolledError from '../../../../lib/errors/redis/StudentNotEnrolled.js';

const router = Router({ mergeParams: true });

// Helper functions (reuse from masterymapping)
function getTopicsFromUser(gradeData) {
    const topicsTable = {};
    Object.entries(gradeData)
        .flatMap(([_, topics]) => Object.entries(topics))
        .forEach(([topic, score]) => {
            topicsTable[topic] = (topicsTable[topic] || 0) + +(score ?? 0);
        });
    return topicsTable;
}

async function computeMasteryLevels(userTopicPoints, maxTopicPoints) {
    const numLevels = ProgressReportData['student levels'].length - 2;
    Object.entries(userTopicPoints).forEach(([topic, pts]) => {
        const maxPts = maxTopicPoints[topic] || 0;
        if (pts === 0 || maxPts === 0) {
            userTopicPoints[topic] = 0;
        } else if (pts >= maxPts) {
            userTopicPoints[topic] = numLevels + 1;
        } else {
            const raw = (pts / maxPts) * numLevels;
            userTopicPoints[topic] = raw % 1 === 0 ? raw + 1 : Math.ceil(raw);
        }
    });
    return Object.fromEntries(
        Object.entries(userTopicPoints).map(([t, level]) => [
            t,
            { student_mastery: level, class_mastery: 0 },
        ])
    );
}

// Build dynamic outline shape from assignment data
async function buildOutline(email) {
    try {
        const maxScores = await getMaxScores();
        const studentScores = await getStudentScores(email);
        
        console.log('buildOutline - maxScores keys:', Object.keys(maxScores));
        console.log('buildOutline - maxScores structure:', JSON.stringify(maxScores, null, 2));
        
        // Build tree structure from assignment categories
        const tree = {
            id: 1,
            name: "CS10",
            parent: "null",
            children: []
        };
        
        // Add each assignment category as a child
        Object.entries(maxScores).forEach(([category, assignments], categoryIndex) => {
            console.log(`Adding category: ${category} with ${Object.keys(assignments).length} assignments`);
            const categoryNode = {
                id: categoryIndex + 2,
                name: category,
                parent: "CS10",
                children: []
            };
            
            // Add each assignment as a child of the category
            Object.entries(assignments).forEach(([assignment, maxScore], assignmentIndex) => {
                const assignmentNode = {
                    id: (categoryIndex + 2) * 100 + assignmentIndex + 1,
                    name: assignment,
                    parent: category,
                    children: [],
                    data: {
                        week: 0 // Default week, could be enhanced later
                    }
                };
                categoryNode.children.push(assignmentNode);
            });
            
            tree.children.push(categoryNode);
        });
        
        console.log('buildOutline - final tree children count:', tree.children.length);
        
        return {
            name: "CS10",
            'start date': new Date().toLocaleDateString(),
            nodes: tree
        };
    } catch (err) {
        console.error('Error building dynamic outline:', err);
        // Fallback to static outline if dynamic building fails
        const { name, 'start date': startDate, nodes } = ProgressReportData;
        return { name, 'start date': startDate, nodes };
    }
}

// Recursively annotate node trees with mastery data
function annotateTreeWithMastery(nodes, masteryMap) {
    return {
        ...nodes,
        children: nodes.children.map((node) => {
            const annotated = { ...node };
            const key = annotated.name;
            if (masteryMap[key]) {
                annotated.data = { ...annotated.data, ...masteryMap[key] };
            }
            if (annotated.children) {
                annotated.children = annotateTreeWithMastery(
                    { children: annotated.children },
                    masteryMap
                ).children;
            }
            return annotated;
        }),
    };
}

// GET /api/v2/students/:email/concept-structure
router.get('/', async (req, res, next) => {
    const { email } = req.params;
    try {
        const outline = await buildOutline(email);
        // 2) compute mastery mapping
        let studentScores = {};
        let maxScores     = {};
        try {
            maxScores     = await getMaxScores();
            studentScores = await getStudentScores(email);
        } catch (err) {
            if (
            err instanceof KeyNotFoundError ||
            err instanceof StudentNotEnrolledError
            ) {
            // no scores yet – treat as all–zero
            maxScores     = {};
            studentScores = {};
            } else {
            throw err;          // real infrastructure problem
            }
        }
        const userPoints    = getTopicsFromUser(studentScores);
        const maxPoints     = getTopicsFromUser(maxScores);
        const mastery       = await computeMasteryLevels(userPoints, maxPoints);
        // 3) annotate outline
        outline.nodes = annotateTreeWithMastery(outline.nodes, mastery);
        // 4) respond
        return res.status(200).json(outline);
    } catch (err) {
        console.error('Error fetching concept-structure for', email, err);
        return next(err);
    }
});

export default router;
