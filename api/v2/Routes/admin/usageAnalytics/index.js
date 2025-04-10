import { Router } from 'express';

const router = Router({ mergeParams: true });

// Redirect to the usage analytics dashboard with the correct URL
router.get('/', (_, res) => {
    res.redirect('/analytics-dashboard');
});

export default router;