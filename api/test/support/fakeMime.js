// Minimal stand-in for the `mime` package (v4 ships ESM only, which Jest's CommonJS runtime
// cannot load). Use: jest.mock('mime', () => require(<this file>)). Covers what config/mime.mjs
// and lib/uploadHandler.mjs use: `new Mime()`, `define()` and `getType()` by file extension.
class Mime {
    constructor() {
        this.typesByExtension = new Map();
    }

    define(typeMap) {
        for (const [type, extensions] of Object.entries(typeMap)) {
            for (const extension of extensions) {
                this.typesByExtension.set(extension.toLowerCase(), type);
            }
        }
        return this;
    }

    getType(path) {
        const name = String(path);
        const dot = name.lastIndexOf('.');
        if (dot === -1) {
            return null;
        }
        return this.typesByExtension.get(name.slice(dot + 1).toLowerCase()) ?? null;
    }
}

module.exports = { Mime };
