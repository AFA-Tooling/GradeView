import { Router } from 'express';
import { validateAdminMiddleware } from '../../../lib/authlib.mjs';
import ProgressReportsRouter from './progressReports/index.js';
import UsageAnalyticsRouter from './usageAnalytics/index.js';
import RateLimit from 'express-rate-limit';

const router = Router({ mergeParams: true });

// set up rate limiter: maximum of 100 requests per 15 minutes
const limiter = RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // max 100 requests per windowMs
});

// apply rate limiter to all requests
router.use(limiter);

router.use(validateAdminMiddleware);
router.use('/progressreports', ProgressReportsRouter);
router.use('/usageanalytics', UsageAnalyticsRouter);

router.get('/', (_, res) => {
    res.status(200);
});

export default router;
