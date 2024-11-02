import multer from 'multer';
import sanitize from 'sanitize-filename';
import { unlink } from 'fs';

import mimeTypes from '../config/mime.mjs';

/**
 * Native file handling utility.
 */
export default class UploadHandler {
    /**
     * Creates a new file handler.
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
        this.mimeType = mimeType;

        const storage = multer.diskStorage({
            destination: (_req, _file, cb) => {
                cb(null, directory);
            },
            filename: (_req, file, cb) => {
                cb(null, fileNameTransformer(file));
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
     * Filters the types of files allowed.
     * @param {Request} _req the request object.
     * @param {Express.Multer.File} file the file object.
     * @param {function} cb the callback to use.
     */
    fileFilter(_req, file, cb) {
        if (mimeTypes.getType(file.originalname) === this.mimeType) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    `Invalid file type. Only ${this.mimeType} files are allowed.`,
                ),
                false,
            );
        }
    }

    /**
     * The file handler middleware.
     */
    get handler() {
        return (req, res, next) => {
            this.upload(req, res, (err) => {
                if (!err) {
                    req.fileMetadata = {
                        fileName: req.file.filename,
                        originalName: req.file.originalname,
                        mimeType: req.file.mimetype,
                        size: req.file.size,
                        uploadedAt: new Date(),
                    };
                    console.log(
                        '[LOG]: Accepted file upload:',
                        req.fileMetadata,
                    );
                    return next();
                }
                if (req.file) {
                    unlink(req.file.path, (unlinkError) => {
                        if (unlinkError) {
                            console.error('Error deleting file:', unlinkError);
                        }
                    });
                }
                return res.status(400).send({ error: err.message });
            });
        };
    }
}
