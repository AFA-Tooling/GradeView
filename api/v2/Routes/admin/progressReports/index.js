import { readdir } from 'fs/promises';
import path from 'path';
import { Router } from 'express';

import UploadHandler from '../../../../lib/uploadHandler.mjs';

const PROGRESS_REPORTS_DIR = 'uploads/progressreports';

const router = Router({ mergeParams: true });

const uploadHandler = new UploadHandler(
    'schema',
    PROGRESS_REPORTS_DIR,
    'application/x-concept-map',
    5 * 1024 * 1024, // 5MB
);

router.post('/', uploadHandler.handler, (req, res) => {
    res.status(201).json(req.fileMetadata);
});

/**
 * Lists the uploaded schemas by name (without extension). The upload
 * directory is the source of truth, so the list always matches what is on
 * disk; files that are not schemas (such as .GITKEEP) are left out.
 */
router.get('/', async (_, res) => {
    // TODO: move over to the compiled schema folder when created.
    let entries;
    try {
        entries = await readdir(PROGRESS_REPORTS_DIR, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return res.json([]);
        console.error('[ERROR]: Could not list progress reports:', err);
        return res.status(500).json({ error: 'Failed to list progress reports' });
    }
    res.json(
        entries
            .filter((entry) => entry.isFile() && uploadHandler.isAllowedFileName(entry.name))
            .map((entry) => path.parse(entry.name).name)
            .sort(),
    );
});

router.get('/:schemaName', (_, res) => {
    // We need to have the CM schema parsing endpoint set up to support this.
    res.status(501).json({ message: 'Not implemented' });
});

export default router;
