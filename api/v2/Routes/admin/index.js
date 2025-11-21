import { Router } from 'express';
import { validateAdminMiddleware } from '../../../lib/authlib.mjs';
import ProgressReportsRouter from './progressReports/index.js';
import CategoriesRouter from './categories/index.js';
import StatsRouter from './stats/index.js';
import DistributionRouter from './distribution/index.js';
import StudentScoresRouter from './studentScores/index.js';
import RateLimit from 'express-rate-limit';

const router = Router({ mergeParams: true });

// set up rate limiter: maximum of 10000 requests per 15 minutes
const limiter = RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // max 10000 requests per windowMs
});

// apply rate limiter to all requests
router.use(limiter);

router.use(validateAdminMiddleware);

// Mount sub-routers
router.use('/progressreports', ProgressReportsRouter);
router.use('/categories', CategoriesRouter);
router.use('/stats', StatsRouter);
router.use('/distribution', DistributionRouter);
router.use('/studentScores', StudentScoresRouter);

// Default admin route
router.get('/', (_, res) => {
    console.log('Admin route accessed');
    res.json({ message: 'Admin API endpoints available' });
});

export default router;
