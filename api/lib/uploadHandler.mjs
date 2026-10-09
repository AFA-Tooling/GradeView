import multer from 'multer';
import path from 'path';
import sanitize from 'sanitize-filename';

import mimeTypes from '../config/mime.mjs';

const MAX_FILE_NAME_LENGTH = 100;

/**
 * An upload the client got wrong, with the HTTP status to answer with.
 */
class UploadRejection extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'UploadRejection';
        this.status = status;
    }
}

/**
 * Native file handling utility.
 *
 * One instance serves every request to its route, so it must not keep
 * per-request state: everything about an upload lives on `req`/`file`.
 */
export default class UploadHandler {
    /**
     * Creates a new file handler.
     * @constructor
     * @param {string} fieldName the name of field in which the file is sent.
     * @param {string} directory the path to store the file in.
     * @param {string} mimeType the mime type of the file.
     * @param {number} fileSize the maximum number of bytes allowed.
     * @param {function} fileNameTransformer the cb for the file name.
     */
    constructor(
        fieldName,
        directory,
        mimeType,
        fileSize,
        fileNameTransformer = (f) => sanitize(f.originalname),
    ) {
        this.fieldName = fieldName;
        this.mimeType = mimeType;
        this.filePath = directory;
        this.fileNameTransformer = fileNameTransformer;

        const storage = multer.diskStorage({
            destination: (_req, _file, cb) => {
                cb(null, directory);
            },
            filename: (_req, file, cb) => {
                try {
                    cb(null, this.storedFileName(file));
                } catch (err) {
                    cb(err);
                }
            },
        });

        this.upload = multer({
            storage,
            fileFilter: this.fileFilter.bind(this),
            limits: {
                fileSize,
            },
        }).single(fieldName);
    }

    /**
     * The name a file is stored under (sanitized, so it cannot leave the directory).
     * @param {Express.Multer.File} file the file object.
     * @return {string} the file name on disk.
     */
    storedFileName(file) {
        return sanitize(String(this.fileNameTransformer(file) ?? ''));
    }

    /**
     * Whether a stored file name has this handler's type and a non-empty name
     * before the extension (so ".cm" or a bare "cm" do not count).
     * @param {string} fileName a file name without directory.
     * @return {boolean}
     */
    isAllowedFileName(fileName) {
        const { name, ext } = path.parse(fileName);
        return (
            ext.length > 1 &&
            name.trim().length > 0 &&
            mimeTypes.getType(fileName) === this.mimeType
        );
    }

    /**
     * Filters the types of files allowed.
     * @param {Request} _req the request object.
     * @param {Express.Multer.File} file the file object.
     * @param {function} cb the callback to use.
     */
    fileFilter(_req, file, cb) {
        try {
            if (file.originalname?.length > MAX_FILE_NAME_LENGTH) {
                return cb(new UploadRejection(400, 'File name too long.'));
            }
            const storedName = this.storedFileName(file);
            if (!storedName) {
                // e.g. "con.cm" or ".." sanitize to an empty name
                return cb(new UploadRejection(400, 'Invalid file name.'));
            }
            if (!this.isAllowedFileName(storedName)) {
                return cb(
                    new UploadRejection(
                        415,
                        `Invalid file type. Only ${this.mimeType} files are allowed.`,
                    ),
                );
            }
            return cb(null, true);
        } catch (err) {
            // Never let a throw escape into busboy's event handler (it would crash the process).
            console.error('[ERROR]: Upload file filter failed:', err);
            return cb(new UploadRejection(400, 'Invalid file name.'));
        }
    }

    /**
     * Sends the response for a failed upload. multer has already removed any
     * file it stored for this request.
     * @param {Response} res the response object.
     * @param {Error} err the error from multer, the file filter or the storage.
     */
    static sendUploadError(res, err) {
        if (err instanceof UploadRejection) {
            return res.status(err.status).json({ error: err.message });
        }
        if (err instanceof multer.MulterError) {
            // Fixed messages such as "File too large" or "Unexpected file field".
            return res.status(400).json({ error: err.message });
        }
        if (err?.syscall) {
            // Filesystem error while storing: our fault, and its message has server paths.
            console.error('[ERROR]: Could not store an uploaded file:', err);
            return res.status(500).json({ error: 'Could not store the uploaded file.' });
        }
        // Malformed or interrupted multipart body (busboy / request stream errors).
        console.error('[ERROR]: Rejected a malformed upload:', err?.message);
        return res.status(400).json({ error: 'Malformed upload request.' });
    }

    /**
     * The file handler middleware.
     * @return {function} the middleware function.
     */
    get handler() {
        return (req, res, next) => {
            this.upload(req, res, (err) => {
                if (err) {
                    return UploadHandler.sendUploadError(res, err);
                }
                if (!req.file) {
                    // Not multipart, no part with a file name, or an empty file name.
                    return res.status(400).json({
                        error: `No file uploaded. Send it in the "${this.fieldName}" field.`,
                    });
                }
                req.fileMetadata = {
                    fileName: req.file.filename,
                    originalName: req.file.originalname,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    uploadedAt: new Date(),
                };
                console.log('[LOG]: Accepted file upload:', req.fileMetadata);
                return next();
            });
        };
    }
}
