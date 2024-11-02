import { Router } from 'express';
import { validateAdminMiddleware } from '../../../lib/authlib.mjs';
import ProgressReportsRouter from './progressReports/index.js';

const router = Router({ mergeParams: true });
router.use(validateAdminMiddleware);
router.use('/progressreports', ProgressReportsRouter);

router.get('/', (_, res) => {
    res.status(200);
});

export default router;
