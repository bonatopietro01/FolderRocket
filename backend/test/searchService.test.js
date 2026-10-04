const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {searchFiles} = require("../services/searchService");

test("folder search asynchronously scans large directory listings and yields to the event loop", async t => {
    const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "folderrocket-search-"));
    t.after(() => fsPromises.rm(root, {recursive: true, force: true}));
    await Promise.all(Array.from({length: 300}, (_, index) => fsPromises.mkdir(path.join(root, "synthetic-" + index))));
    const matchingPath = path.join(root, "synthetic-299", "needle-report.txt");
    await fsPromises.writeFile(matchingPath, "synthetic document");

    const originalReadDirectorySync = fs.readdirSync;
    const originalStatSync = fs.statSync;
    const originalExistsSync = fs.existsSync;
    const originalSetImmediate = global.setImmediate;
    let yieldCount = 0;
    fs.readdirSync = () => { throw new Error("Synchronous directory reads are forbidden in this test."); };
    fs.statSync = () => { throw new Error("Synchronous file stats are forbidden in this test."); };
    fs.existsSync = () => { throw new Error("Synchronous existence checks are forbidden in this test."); };
    global.setImmediate = (...args) => {
        yieldCount += 1;
        return originalSetImmediate(...args);
    };
    try {
        const results = await searchFiles([root], "needle");
        assert.equal(results.length, 1);
        assert.equal(results[0].path, matchingPath);
        assert.ok(yieldCount >= 1, "search should periodically yield while processing a wide directory");
    } finally {
        fs.readdirSync = originalReadDirectorySync;
        fs.statSync = originalStatSync;
        fs.existsSync = originalExistsSync;
        global.setImmediate = originalSetImmediate;
    }
});
