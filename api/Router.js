import { Router } from 'express';

import V2Router from './v2/index.js';
import apiErrorHandler from './lib/errorHandler.mjs';

const router = Router();
router.use('/v2', V2Router);

// Error handling middleware: sends a safe `{ message }` body and does not call next() afterwards.
router.use(apiErrorHandler);

export default router;
