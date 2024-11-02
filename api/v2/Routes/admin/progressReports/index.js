import { Router } from 'express';

import UploadHandler from '../../../../lib/uploadHandler.mjs';

const router = Router({ mergeParams: true });

const uploadHandler = new UploadHandler(
    'schema',
    'uploads/progressreports',
    'application/x-concept-map',
    5 * 1024 * 1024, // 5MB
);

router.post('/', uploadHandler.handler, async (req, res) => {
    res.status(201).json(req.fileMetadata);
});

export default router;
