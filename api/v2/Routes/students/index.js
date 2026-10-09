import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import GradesRouter from './grades/index.js';
import ProjectionsRouter from './projections/index.js';
import ProgressQueryStringRouter from './progressquerystring/index.js';
import MasteryMappingRouter from './masterymapping/index.js';
import ConceptStructureRouter from './concept-structure/index.js';
import {
    validateAdminMiddleware,
    validateAdminOrStudentMiddleware,
} from '../../../lib/authlib.mjs';
import { getStudents } from '../../../lib/redisHelper.mjs';

const router = Router({ mergeParams: true });

// Rate limit calls to 100 per 5 minutes
router.use(
    RateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 100, // 100 requests
    }),
);

router.get('/', validateAdminMiddleware, async (_, res) => {
    try {
        const students = await getStudents();
        return res.status(200).json({ students });
    } catch (err) {
        switch (err.name) {
            case 'StudentNotEnrolledError':
            case 'KeyNotFoundError':
                console.error(`Error fetching all students. `, err);
                return res.status(404).json({ message: "Error fetching student."});
            default:
                console.error(`Internal service error fetching all students. `, err);
                return res.status(500).json({ message: "Internal server error." });
        }
    }
});

// Per-student data routes. They all live on this sub-router, which is only reachable through
// validateAdminOrStudentMiddleware: admins may read any student, students only their own
// :email. Add new per-student routes here, never directly on `router`.
const studentRouter = Router({ mergeParams: true });
studentRouter.use('/grades', GradesRouter);
studentRouter.use('/projections', ProjectionsRouter);
studentRouter.use('/progressquerystring', ProgressQueryStringRouter);
studentRouter.use('/masterymapping', MasteryMappingRouter);
studentRouter.use('/concept-structure', ConceptStructureRouter);

router.use('/:email', validateAdminOrStudentMiddleware, studentRouter);

export default router;
