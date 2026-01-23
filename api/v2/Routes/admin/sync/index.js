import { Router } from 'express';

const router = Router({ mergeParams: true });
// Use service name "gradesync" which is resolvable in the shared docker network
const GRADESYNC_URL = process.env.GRADESYNC_URL || 'http://gradesync:8000';

// GET /api/v2/admin/sync - List courses
router.get('/', async (req, res) => {
    try {
        console.log(`[Proxy] Fetching courses from ${GRADESYNC_URL}/api/courses`);
        const response = await fetch(`${GRADESYNC_URL}/api/courses`);
        
        if (!response.ok) {
             throw new Error(`GradeSync service returned ${response.status}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('GradeSync proxy error:', err);
        res.status(502).json({ error: 'Failed to fetch courses from GradeSync', details: err.message });
    }
});

// POST /api/v2/admin/sync/:courseId - Trigger sync
router.post('/:courseId', async (req, res) => {
    const { courseId } = req.params;
    try {
        console.log(`[Proxy] Triggering sync for ${courseId} at ${GRADESYNC_URL}/api/sync/${courseId}`);
        const response = await fetch(`${GRADESYNC_URL}/api/sync/${courseId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
             const txt = await response.text();
             throw new Error(`GradeSync service returned ${response.status}: ${txt}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('GradeSync proxy error:', err);
        res.status(502).json({ error: 'Failed to sync grades', details: err.message });
    }
});

export default router;
