/**
 * Tests for POST and GET /api/v2/admin/progressreports (multer disk storage).
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
const http = require('http');
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

// Like the repo's api/uploads/progressreports, the directory always holds a
// .GITKEEP, and it is already there when the router is loaded.
const GITKEEP = '.GITKEEP';

/** Everything in the upload directory except the .GITKEEP placeholder. */
const filesOnDisk = () =>
    fs
        .readdirSync(uploadDir)
        .filter((name) => name !== GITKEEP)
        .sort();

const adminUpload = () =>
    request(baseUrl)
        .post('/api/v2/admin/progressreports')
        .set('Authorization', FAKE_ADMIN_AUTH);

const adminList = () =>
    request(baseUrl)
        .get('/api/v2/admin/progressreports')
        .set('Authorization', FAKE_ADMIN_AUTH);

/** A hand-written multipart body, for shapes supertest's attach() cannot produce. */
const rawMultipart = (body) =>
    adminUpload()
        .set('Content-Type', 'multipart/form-data; boundary=fakeboundary')
        .send(body.replace(/\n/g, '\r\n'));

const WRONG_TYPE = {
    error: 'Invalid file type. Only application/x-concept-map files are allowed.',
};
const NO_FILE = { error: 'No file uploaded. Send it in the "schema" field.' };

beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-progressreports-'));
    uploadDir = path.join(tmpRoot, 'uploads', 'progressreports');
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, GITKEEP), 'DO NOT DELETE\n');
    baseUrl = await startServer(tmpRoot);
}, 20000);

afterAll(() => {
    if (child && child.exitCode === null) child.kill();
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
    for (const name of filesOnDisk()) {
        fs.rmSync(path.join(uploadDir, name), { recursive: true, force: true });
    }
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

    test('rejects a second file in the schema field and removes the first one', async () => {
        const res = await adminUpload()
            .attach('schema', Buffer.from('fake one'), 'first.cm')
            .attach('schema', Buffer.from('fake two'), 'second.cm');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Unexpected file field' });
        expect(filesOnDisk()).toEqual([]);
    });
});

describe('POST /api/v2/admin/progressreports with a wrong file type', () => {
    // Used to throw a ReferenceError (`res` is not defined) inside busboy's
    // event handler, which took the whole API process down.
    test('answers 415, stores nothing and keeps serving', async () => {
        const res = await adminUpload().attach('schema', Buffer.from('fake notes'), 'notes.txt');

        expect(res.status).toBe(415);
        expect(res.body).toEqual(WRONG_TYPE);
        expect(filesOnDisk()).toEqual([]);

        const next = await adminUpload().attach('schema', Buffer.from('fake'), 'after.cm');
        expect(next.status).toBe(201);
    });

    test.each([
        ['no extension', 'schema'],
        ['a bare extension', 'cm'],
        ['a dotfile', '.cm'],
        ['a name that is only spaces', ' .cm'],
    ])('answers 415 for %s (%j)', async (_label, filename) => {
        const res = await adminUpload().attach('schema', Buffer.from('fake'), filename);

        expect(res.status).toBe(415);
        expect(res.body).toEqual(WRONG_TYPE);
        expect(filesOnDisk()).toEqual([]);
    });

    test('answers 400 when the name sanitizes to nothing', async () => {
        // sanitize-filename turns the reserved Windows name "con" into ""; writing
        // to the bare directory path would fail with EISDIR.
        const res = await adminUpload().attach('schema', Buffer.from('fake'), 'con.cm');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid file name.' });
        expect(filesOnDisk()).toEqual([]);
    });

    test('answers 400 for a file name over 100 characters', async () => {
        const res = await adminUpload().attach(
            'schema',
            Buffer.from('fake'),
            `${'a'.repeat(98)}.cm`,
        );

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'File name too long.' });
        expect(filesOnDisk()).toEqual([]);
    });
});

describe('POST /api/v2/admin/progressreports without a file', () => {
    // Each of these used to reach `req.file.filename` with req.file undefined
    // (TypeError) instead of answering the client.
    test('multipart body with only a text field', async () => {
        const res = await adminUpload().field('note', 'fake note');

        expect(res.status).toBe(400);
        expect(res.body).toEqual(NO_FILE);
    });

    test('file part with an empty file name', async () => {
        const res = await rawMultipart(
            '--fakeboundary\n' +
                'Content-Disposition: form-data; name="schema"; filename=""\n' +
                'Content-Type: application/octet-stream\n\n' +
                'fake\n' +
                '--fakeboundary--\n',
        );

        expect(res.status).toBe(400);
        expect(res.body).toEqual(NO_FILE);
        expect(filesOnDisk()).toEqual([]);
    });

    test('JSON body instead of multipart', async () => {
        const res = await adminUpload().send({ schema: 'fake.cm' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual(NO_FILE);
    });

    test('no body at all', async () => {
        const res = await adminUpload();

        expect(res.status).toBe(400);
        expect(res.body).toEqual(NO_FILE);
    });

    test('truncated multipart body', async () => {
        const res = await rawMultipart(
            '--fakeboundary\n' +
                'Content-Disposition: form-data; name="schema"; filename="truncated.cm"\n' +
                'Content-Type: application/octet-stream\n\n' +
                'fake data without a closing boundary',
        );

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Malformed upload request.' });
        expect(filesOnDisk()).toEqual([]);
    });
});

/** Starts a multipart upload over a raw socket, so a test can pause in the middle of the body. */
function openSlowUpload(boundary) {
    const { hostname, port } = new URL(baseUrl);
    let req;
    const response = new Promise((resolve, reject) => {
        req = http.request(
            {
                hostname,
                port,
                method: 'POST',
                path: '/api/v2/admin/progressreports',
                headers: {
                    Authorization: FAKE_ADMIN_AUTH,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
            },
            (res) => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
            },
        );
        req.on('error', reject);
    });
    const crlf = (text) => text.replace(/\n/g, '\r\n');
    return {
        write: (text) => req.write(crlf(text)),
        end: (text) => req.end(crlf(text)),
        response,
    };
}

async function waitUntil(condition, what) {
    const deadline = Date.now() + 5000;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

describe('concurrent POST /api/v2/admin/progressreports', () => {
    // The handler used to remember the last stored name on the one shared
    // UploadHandler instance and unlink that name when a request failed, so a
    // failing request could delete a file another request had just stored.
    test('a failing upload that overlaps another one does not delete the other file', async () => {
        const slow = openSlowUpload('fakeboundary');
        slow.write(
            '--fakeboundary\n' +
                'Content-Disposition: form-data; name="schema"; filename="slow-first.cm"\n' +
                'Content-Type: application/octet-stream\n\n' +
                'fake first file, still streaming',
        );
        await waitUntil(
            () => fs.existsSync(path.join(uploadDir, 'slow-first.cm')),
            'the slow upload to start writing',
        );

        const kept = Buffer.from('fake schema uploaded while the slow request is open\n');
        const other = await adminUpload().attach('schema', kept, 'kept.cm');
        expect(other.status).toBe(201);

        // A second file in the same field makes the slow request fail.
        slow.end(
            '\n--fakeboundary\n' +
                'Content-Disposition: form-data; name="schema"; filename="slow-second.cm"\n' +
                'Content-Type: application/octet-stream\n\n' +
                'fake second file\n' +
                '--fakeboundary--\n',
        );
        const failed = await slow.response;
        expect(failed).toEqual({ status: 400, body: { error: 'Unexpected file field' } });

        await new Promise((resolve) => setTimeout(resolve, 200)); // let any stray unlink land
        expect(filesOnDisk()).toEqual(['kept.cm']);
        expect(fs.readFileSync(path.join(uploadDir, 'kept.cm'))).toEqual(kept);
    });

    test('each request keeps its own file, and failed requests remove only their own', async () => {
        const good = Array.from({ length: 12 }, (_, i) => ({
            name: `concurrent-${String(i).padStart(2, '0')}.cm`,
            content: Buffer.alloc(64 * 1024 + i, String.fromCharCode(97 + i)),
        }));

        const requests = [];
        good.forEach(({ name, content }, i) => {
            requests.push(
                adminUpload()
                    .attach('schema', content, name)
                    .then((res) => ({ kind: 'good', name, content, res })),
            );
            if (i % 2 === 0) {
                // stores its first file, then fails on the second one
                requests.push(
                    adminUpload()
                        .attach('schema', Buffer.alloc(32 * 1024, 'x'), `failing-${i}.cm`)
                        .attach('schema', Buffer.from('fake'), `failing-${i}-extra.cm`)
                        .then((res) => ({ kind: 'two-files', res })),
                );
            } else {
                requests.push(
                    adminUpload()
                        .attach('schema', Buffer.alloc(MAX_SCHEMA_BYTES + 1, 'y'), `big-${i}.cm`)
                        .then((res) => ({ kind: 'too-big', res })),
                );
            }
        });

        const results = await Promise.all(requests);

        for (const { kind, name, content, res } of results) {
            if (kind === 'good') {
                expect(res.status).toBe(201);
                expect(res.body).toMatchObject({ fileName: name, originalName: name, size: content.length });
            } else {
                expect(res.status).toBe(400);
                expect(res.body).toEqual({
                    error: kind === 'two-files' ? 'Unexpected file field' : 'File too large',
                });
            }
        }
        expect(filesOnDisk()).toEqual(good.map(({ name }) => name).sort());
        for (const { name, content } of good) {
            expect(fs.readFileSync(path.join(uploadDir, name))).toEqual(content);
        }
    }, 20000);
});

describe('GET /api/v2/admin/progressreports', () => {
    test('lists nothing when only .GITKEEP is in the directory', async () => {
        // Used to list .GITKEEP as an empty name ("").
        const res = await adminList();

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('lists uploaded schemas without their extension, after uploads too', async () => {
        fs.writeFileSync(path.join(uploadDir, 'stray-notes.txt'), 'fake');
        fs.mkdirSync(path.join(uploadDir, 'folder.cm'));

        for (const name of ['week-2.cm', 'cs10.fall.cm']) {
            const up = await adminUpload().attach('schema', Buffer.from('fake'), name);
            expect(up.status).toBe(201);
            // Used to answer 500 once an upload had added `undefined` to the list.
            const res = await adminList();
            expect(res.status).toBe(200);
        }

        const res = await adminList();

        expect(res.status).toBe(200);
        expect(res.body).toEqual(['cs10.fall', 'week-2']);
    });

    test('rejects requests without admin auth', async () => {
        const res = await request(baseUrl).get('/api/v2/admin/progressreports');

        expect(res.status).toBe(403);
    });
});
