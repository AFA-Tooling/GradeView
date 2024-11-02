import fs from 'fs';
import { Router } from 'express';

import UploadHandler from '../../../../lib/uploadHandler.mjs';

const PROGRESS_REPORTS_DIR = 'uploads/progressreports';

let schemaFiles = new Set(fs.readdirSync(PROGRESS_REPORTS_DIR));

const router = Router({ mergeParams: true });

const uploadHandler = new UploadHandler(
    'schema',
    PROGRESS_REPORTS_DIR,
    'application/x-concept-map',
    5 * 1024 * 1024, // 5MB
);

router.post('/', uploadHandler.handler, async (req, res) => {
    schemaFiles.add(req.fileMetadata.originalname);
    res.status(201).json(req.fileMetadata);
});

router.get('/', (_, res) => {
    // TODO: move over to the compiled schema folder when created.
    res.json(
        Array.from(schemaFiles).map((fileName) =>
            fileName.substring(0, fileName.lastIndexOf('.')),
        ),
    );
});

router.get('/:schemaName', (_, res) => {
    // We need to have the CM schema parsing endpoint set up to support this.
    res.status(501);
});

export default router;
