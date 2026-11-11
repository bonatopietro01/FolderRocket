const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {assertWorkspacePath} = require("../services/files/userPathSecurity");
const {inventoryFileTypes} = require("../services/files/fileTypeInventoryService");

test("inventory marks missing roots unavailable without returning partial counts", async t => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-inventory-r61-"));
    t.after(() => fs.rm(workspace, {recursive: true, force: true}));

    const validRoot = path.join(workspace, "valid");
    const missingRoot = path.join(workspace, "missing");
    await fs.mkdir(validRoot);
    await fs.writeFile(path.join(validRoot, "fixture.txt"), "synthetic file");
    const validatePath = (candidate, options) => assertWorkspacePath(workspace, candidate, options);
    let directoryReads = 0;
    const fileSystem = {promises: {
        stat: (...args) => fs.stat(...args),
        readdir: (...args) => { directoryReads += 1; return fs.readdir(...args); }
    }};

    const missing = await inventoryFileTypes([missingRoot], {validatePath, fileSystem});
    assert.deepEqual(missing, {
        status: "unavailable",
        types: [],
        total: 0,
        truncated: false,
        unavailableFolders: [{index: 0, reasonCode: "not_found"}]
    });

    const mixed = await inventoryFileTypes([validRoot, missingRoot], {validatePath, fileSystem});
    assert.equal(mixed.status, "unavailable");
    assert.deepEqual(mixed.types, [], "a partial count must not appear complete");
    assert.equal(mixed.total, 0);
    assert.deepEqual(mixed.unavailableFolders, [{index: 1, reasonCode: "not_found"}]);
    assert.equal(directoryReads, 0, "do not scan valid roots when any selected root is unavailable");
});

test("inventory marks regular files as unavailable directory roots", async t => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-inventory-r61-"));
    t.after(() => fs.rm(workspace, {recursive: true, force: true}));
    const file = path.join(workspace, "not-a-folder.txt");
    await fs.writeFile(file, "synthetic file");
    const childOfFile = path.join(file, "child");
    const result = await inventoryFileTypes([file, childOfFile], {
        validatePath: (candidate, options) => assertWorkspacePath(workspace, candidate, options)
    });
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.types, []);
    assert.equal(result.total, 0);
    assert.deepEqual(result.unavailableFolders[0], {index: 0, reasonCode: "not_directory"});
    assert.equal(result.unavailableFolders[1].index, 1);
    assert.ok(["not_found", "not_directory"].includes(result.unavailableFolders[1].reasonCode), "a child under a file is unavailable on Windows and POSIX, though the OS may report ENOENT or ENOTDIR");
});

test("inventory converts ENOTDIR raised by the secure path validator into a recoverable root status", async () => {
    const result = await inventoryFileTypes(["synthetic-child"], {
        validatePath: () => { throw Object.assign(new Error("The requested path has a non-directory parent."), {code: "ENOTDIR"}); }
    });
    assert.deepEqual(result.unavailableFolders, [{index: 0, reasonCode: "not_directory"}]);
    assert.deepEqual(result.types, []);
    assert.equal(result.total, 0);
});

test("inventory counts valid roots and keeps workspace path security", async t => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-inventory-r61-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-inventory-outside-"));
    t.after(async () => {
        await fs.rm(workspace, {recursive: true, force: true});
        await fs.rm(outside, {recursive: true, force: true});
    });
    const validRoot = path.join(workspace, "valid");
    await fs.mkdir(validRoot);
    await fs.writeFile(path.join(validRoot, "one.TXT"), "synthetic");
    await fs.mkdir(path.join(validRoot, "nested"));
    await fs.writeFile(path.join(validRoot, "nested", "two.txt"), "synthetic");
    const validatePath = (candidate, options) => assertWorkspacePath(workspace, candidate, options);

    const result = await inventoryFileTypes([validRoot], {validatePath});
    assert.equal(result.status, "ready");
    assert.deepEqual(result.types, [{type: "txt", count: 2}]);
    assert.equal(result.total, 2);
    assert.equal(result.truncated, false);

    await assert.rejects(
        inventoryFileTypes([outside], {validatePath}),
        /only use files inside its private FolderRocket workspace/
    );
});
