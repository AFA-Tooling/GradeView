import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import ConceptMapRouter from './conceptmap/index.js';
import GradesRouter from './grades/index.js';
import ProjectionsRouter from './projections/index.js';
import ProgressQueryStringRouter from './progressquerystring/index.js';
import MasteryMappingRouter from './masterymapping/index.js';
import { validateAdminOrStudentMiddleware } from '../../../lib/authlib.mjs';
import { validateAdminMiddleware } from '../../../lib/authlib.mjs';
import { getStudents } from '../../../lib/redisHelper.mjs';

const router = Router({ mergeParams: true });

// Rate limit calls to 100 per 5 minutes
router.use(
    RateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 100, // 100 requests
    }),
);

// TODO: sanitize email input.
// Ensure the requester has access to the requested student's data.
router.use('/:email', validateAdminOrStudentMiddleware);

router.use('/:id/grades', GradesRouter);
router.use('/:email/projections', ProjectionsRouter);
router.use('/:id/progressquerystring', ProgressQueryStringRouter);
router.use('/:id/masterymapping', MasteryMappingRouter);
router.use('/:id/conceptmap', ConceptMapRouter);

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

export default router;
