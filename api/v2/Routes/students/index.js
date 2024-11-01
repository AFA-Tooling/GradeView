import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import GradesRouter from './grades/index.js';
import ProjectionsRouter from './projections/index.js';
import ProgressQueryStringRouter from './progressquerystring/index.js';
import { validateAdminOrStudentMiddleware } from '../../../lib/authlib.mjs';
import { validateAdminMiddleware } from '../../../lib/authlib.mjs';
import 'express-async-errors';
import { getStudents } from '../../../lib/redisHelper.mjs';

const router = Router({ mergeParams: true });

// Rate limit calls to 100 per 5 minutes
router.use(RateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // 100 requests
}));

// TODO: sanitize email input.
// Ensure the requester has access to the requested student's data.
router.use('/:email', validateAdminOrStudentMiddleware);

router.use('/:id/grades', GradesRouter);
router.use('/:email/projections', ProjectionsRouter);
router.use('/:id/progressquerystring', ProgressQueryStringRouter);

router.get('/', validateAdminMiddleware, async (_, res) => {
    try {
        const students = await getStudents();
        return res.status(200).json({ students });
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
});

export default router;
