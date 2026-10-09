/**
 * Upload tests for POST /api/v2/admin/progressreports (multer disk storage).
 *
 * The upload chain (lib/uploadHandler.mjs -> config/mime.mjs -> the ESM-only
 * `mime` package) is native ESM. jest.config.cjs only transforms `*.js`, so
 * Jest's CommonJS runtime can't load it. These tests start the real router in
 * a child Node process instead, with a temporary directory as its working
 * directory so uploads never land in the repo. A stand-in replaces
 * validateAdminMiddleware, because the real one needs Google OAuth and Redis.
 * All file contents and identities are fake.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const ROUTE_FILE = path.join(__dirname, 'index.js');
const FAKE_ADMIN_AUTH = 'Bearer fake-google-id-token-for-admin01@berkeley.edu';
const MAX_SCHEMA_BYTES = 5 * 1024 * 1024; // must match the route's UploadHandler limit

const HARNESS = `
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [routeFile, fakeAdminAuth] = process.argv.slice(1);
const express = createRequire(routeFile)('express');
const { default: ProgressReportsRouter } = await import(pathToFileURL(routeFile).href);

// Stand-in for validateAdminMiddleware, mounted the same way as in Routes/admin/index.js.
function fakeValidateAdminMiddleware(req, res, next) {
    if (req.headers.authorization === fakeAdminAuth) return next();
    res.status(403).json({ message: 'not permitted' });
}

const admin = express.Router();
admin.use(fakeValidateAdminMiddleware);
admin.use('/progressreports', ProgressReportsRouter);

const app = express();
app.use('/api/v2/admin', admin);
const server = app.listen(0, '127.0.0.1', () => {
    console.log(JSON.stringify({ port: server.address().port }));
});
`;

let tmpRoot;
let uploadDir;
let child;
let childLog = '';
let baseUrl;

function startServer(cwd) {
    return new Promise((resolve, reject) => {
        child = spawn(
            process.execPath,
            ['--input-type=module', '-e', HARNESS, ROUTE_FILE, FAKE_ADMIN_AUTH],
            { cwd, env: { PATH: process.env.PATH, NODE_ENV: 'test' } },
        );
        child.stdout.on('data', (chunk) => {
            childLog += chunk;
            const match = childLog.match(/\{"port":(\d+)\}/);
            if (match) resolve(`http://127.0.0.1:${match[1]}`);
        });
        child.stderr.on('data', (chunk) => {
            childLog += chunk;
        });
        child.on('exit', (code) =>
            reject(new Error(`upload server exited (${code}):\n${childLog}`)),
        );
    });
}

const filesOnDisk = () => fs.readdirSync(uploadDir).sort();

const adminUpload = () =>
    request(baseUrl)
        .post('/api/v2/admin/progressreports')
        .set('Authorization', FAKE_ADMIN_AUTH);

beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-progressreports-'));
    uploadDir = path.join(tmpRoot, 'uploads', 'progressreports');
    fs.mkdirSync(uploadDir, { recursive: true });
    baseUrl = await startServer(tmpRoot);
}, 20000);

afterAll(() => {
    if (child && child.exitCode === null) child.kill();
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
    for (const name of filesOnDisk()) fs.rmSync(path.join(uploadDir, name));
});

afterEach(() => {
    // A crashed server shows up as ECONNREFUSED in later tests; surface its output here.
    if (child.exitCode !== null) throw new Error(`upload server crashed:\n${childLog}`);
});

describe('POST /api/v2/admin/progressreports', () => {
    test('stores an uploaded .cm schema and returns its metadata', async () => {
        const content = Buffer.from('fake concept map for student01@berkeley.edu\n');

        const res = await adminUpload().attach('schema', content, 'fake-schema.cm');

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            fileName: 'fake-schema.cm',
            originalName: 'fake-schema.cm',
            size: content.length,
        });
        expect(typeof res.body.mimeType).toBe('string');
        expect(Number.isNaN(Date.parse(res.body.uploadedAt))).toBe(false);
        expect(fs.readFileSync(path.join(uploadDir, 'fake-schema.cm'))).toEqual(content);
    });

    test('rejects requests without admin auth before anything is written', async () => {
        const res = await request(baseUrl)
            .post('/api/v2/admin/progressreports')
            .attach('schema', Buffer.from('fake'), 'anonymous.cm');

        expect(res.status).toBe(403);
        expect(filesOnDisk()).toEqual([]);
    });

    test('strips path components so uploads stay in the upload directory', async () => {
        const res = await adminUpload().attach('schema', Buffer.from('fake'), {
            filename: '../../escape.cm',
        });

        expect(res.status).toBe(201);
        expect(res.body.fileName).toBe('escape.cm');
        expect(filesOnDisk()).toEqual(['escape.cm']);
        expect(fs.existsSync(path.join(tmpRoot, 'escape.cm'))).toBe(false);
    });

    test('accepts a schema of exactly the size limit', async () => {
        const res = await adminUpload().attach(
            'schema',
            Buffer.alloc(MAX_SCHEMA_BYTES, 'a'),
            'at-limit.cm',
        );

        expect(res.status).toBe(201);
        expect(res.body.size).toBe(MAX_SCHEMA_BYTES);
    });

    test('rejects a schema over the size limit and leaves no partial file', async () => {
        const res = await adminUpload().attach(
            'schema',
            Buffer.alloc(MAX_SCHEMA_BYTES + 1, 'a'),
            'too-big.cm',
        );

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'File too large' });
        expect(filesOnDisk()).toEqual([]);
    });

    test('rejects a file sent under an unexpected field name', async () => {
        const res = await adminUpload().attach('notschema', Buffer.from('fake'), 'wrong-field.cm');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Unexpected file field' }); // multer >= 2.4 wording
        expect(filesOnDisk()).toEqual([]);
    });
});
