import { Router } from 'express';
import { getMaxScores, getStudentScores, getStudents } from '../../../../lib/redisHelper.mjs';
import ProgressReportData from '../../../../assets/progressReport/CS10.json' with { type: 'json' };
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
    const numLevels = ProgressReportData['student levels'].length;
    Object.entries(userTopicPoints).forEach(([topic, pts]) => {
        const maxPts = maxTopicPoints[topic] || 0;
        if (pts === 0 || maxPts === 0) {
            userTopicPoints[topic] = 0;
        } else if (pts >= maxPts) {
            userTopicPoints[topic] = numLevels - 1; // Last level (Mastered)
        } else {
            const raw = (pts / maxPts) * (numLevels - 1);
            userTopicPoints[topic] = Math.min(Math.ceil(raw), numLevels - 1);
        }
    });
    return Object.fromEntries(
        Object.entries(userTopicPoints).map(([t, level]) => [
            t,
            { student_mastery: level, class_mastery: 0 },
        ])
    );
}

// Check if a concept has been taught (has actual student grades from ANY student)
async function checkIfTaught(conceptName) {
    try {
        // Get all students
        const students = await getStudents();
        
        // Check if any student has any grade for this concept
        for (const [legalName, email] of students) {
            try {
                const studentScores = await getStudentScores(email);
                
                // Check if this student has any grade > 0 for this concept
                const hasGrade = Object.values(studentScores).some(category => 
                    Object.keys(category).includes(conceptName) && 
                    category[conceptName] > 0
                );
                if (hasGrade) {
                    return true;
                }
            } catch (err) {
                // Skip this student if we can't get their scores
                continue;
            }
        }
        
        return false;
    } catch (err) {
        console.error('Error checking if concept is taught:', err);
        return false;
    }
}

// Check if a parent node has been taught (if ANY of its children have been taught)
function checkIfParentTaught(node) {
    if (!node.children || node.children.length === 0) {
        return node.data?.taught || false;
    }
    
    // Check if any child has been taught
    return node.children.some(child => checkIfParentTaught(child));
}

// Build dynamic outline shape from assignment data
async function buildOutline(email) {
    try {
        const maxScores = await getMaxScores();
        const studentScores = await getStudentScores(email);
        
        // Build tree structure from assignment categories
        const tree = {
            id: 1,
            name: "CS10",
            parent: "null",
            children: []
        };
        
        const totalCategories = Object.keys(maxScores).length;
        const semesterWeeks = 15; // Full semester length
        
        // Add each assignment category as a child
        for (const [category, assignments] of Object.entries(maxScores)) {
            // Distribute categories across the first 12 weeks of semester
            const categoryIndex = Object.keys(maxScores).indexOf(category);
            const categoryWeek = Math.min(Math.floor((categoryIndex / totalCategories) * 12) + 1, 12);
            
            // Check if this category has been taught
            const categoryTaught = await checkIfTaught(category);
            
            const categoryNode = {
                id: categoryIndex + 2,
                name: category,
                parent: "CS10",
                children: [],
                data: {
                    week: categoryWeek,
                    taught: categoryTaught
                }
            };
            
            // Add each assignment as a child of the category
            for (const [assignment, maxScore] of Object.entries(assignments)) {
                const assignmentIndex = Object.keys(assignments).indexOf(assignment);
                // Distribute assignments within the category's week range
                const assignmentWeek = Math.min(categoryWeek + Math.floor(assignmentIndex / 2), semesterWeeks);
                
                // Check if this assignment has been taught
                const assignmentTaught = await checkIfTaught(assignment);
                
                const assignmentNode = {
                    id: (categoryIndex + 2) * 100 + assignmentIndex + 1,
                    name: assignment,
                    parent: category,
                    children: [],
                    data: {
                        week: assignmentWeek,
                        taught: assignmentTaught
                    }
                };
                categoryNode.children.push(assignmentNode);
            }
            
            tree.children.push(categoryNode);
        }
        
        return {
            name: "CS10",
            'start date': ProgressReportData['start date'],
            nodes: tree
        };
    } catch (err) {
        console.error('Error building dynamic outline:', err);
        // Fallback to static outline if dynamic building fails
        const { name, 'start date': startDate, nodes } = ProgressReportData;
        return { name, 'start date': startDate, nodes };
    }
}

// Recursively annotate node trees with mastery data and taught status
function annotateTreeWithMastery(nodes, masteryMap) {
    const annotated = {
        ...nodes,
        children: nodes.children.map((node) => {
            const annotatedNode = { ...node };
            const key = annotatedNode.name;
            if (masteryMap[key]) {
                annotatedNode.data = { ...annotatedNode.data, ...masteryMap[key] };
            }
            if (annotatedNode.children) {
                annotatedNode.children = annotateTreeWithMastery(
                    { children: annotatedNode.children },
                    masteryMap
                ).children;
            }
            return annotatedNode;
        }),
    };
    
    // Calculate taught status and mastery for parent nodes based on their children
    const calculateTaughtStatus = (node) => {
        if (node.children && node.children.length > 0) {
            // This is a parent node - check if any child has been taught
            const hasTaughtChild = node.children.some(child => 
                child.data?.taught || checkIfParentTaught(child)
            );
            node.data = { ...node.data, taught: hasTaughtChild };
            
            // Calculate average mastery from children
            const childrenWithMastery = node.children.filter(child => 
                child.data?.student_mastery !== undefined
            );
            
            if (childrenWithMastery.length > 0) {
                const totalMastery = childrenWithMastery.reduce((sum, child) => 
                    sum + (child.data.student_mastery || 0), 0
                );
                // Use Math.floor to match old Python behavior (// operator = floor division)
                const averageMastery = Math.floor(totalMastery / childrenWithMastery.length);
                node.data = { ...node.data, student_mastery: averageMastery };
            }
            
            // Recursively calculate for children
            node.children.forEach(calculateTaughtStatus);
        }
        return node;
    };

    
    // Process the root node as well
    const result = calculateTaughtStatus(annotated);
    
    // Ensure root node has data property initialized
    if (!result.data) {
        result.data = {};
    }
    
    // Calculate mastery for root node based on all its children
    if (result.children && result.children.length > 0) {
        const childrenWithMastery = result.children.filter(child => 
            child.data?.student_mastery !== undefined
        );
        
        if (childrenWithMastery.length > 0) {
            const totalMastery = childrenWithMastery.reduce((sum, child) => 
                sum + (child.data.student_mastery || 0), 0
            );
            const averageMastery = Math.floor(totalMastery / childrenWithMastery.length);
            result.data = { ...result.data, student_mastery: averageMastery };
        }
        
        // Also calculate taught status for root
        const hasTaughtChild = result.children.some(child => 
            child.data?.taught || (child.children && child.children.length > 0)
        );
        result.data = { ...result.data, taught: hasTaughtChild };
    }
    
    return result;
}

// GET /api/v2/students/:email/concept-structure
router.get('/', async (req, res, next) => {
    const { email } = req.params;
    try {
        const outline = await buildOutline(email);
        
        // 2) compute mastery mapping
        let studentScores = {};
        let maxScores = {};
        
        try {
            maxScores = await getMaxScores();
            studentScores = await getStudentScores(email);
        } catch (err) {
            if (
                err instanceof KeyNotFoundError ||
                err instanceof StudentNotEnrolledError
            ) {
                // no scores yet – treat as all–zero
                maxScores = {};
                studentScores = {};
            } else {
                throw err; // real infrastructure problem
            }
        }
        
        const userPoints = getTopicsFromUser(studentScores);
        const maxPoints = getTopicsFromUser(maxScores);
        const mastery = await computeMasteryLevels(userPoints, maxPoints);
        
        // 3) annotate outline with mastery and taught status
        outline.nodes = annotateTreeWithMastery(outline.nodes, mastery);
        
        // 4) add student levels and calculate current week dynamically
        outline['student levels'] = ProgressReportData['student levels'];
        outline['class levels'] = ProgressReportData['class levels'];
        
        // Calculate current week based on start date
        const startDate = new Date(outline['start date']);
        const currentDate = new Date();
        const timeDiff = currentDate.getTime() - startDate.getTime();
        const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
        const currentWeek = Math.max(1, Math.floor(daysDiff / 7) + 1);
        outline['currentWeek'] = currentWeek;
        
        // 5) respond
        return res.status(200).json(outline);
    } catch (err) {
        console.error('Error fetching concept-structure for', email, err);
        return next(err);
    }
});

export default router;
