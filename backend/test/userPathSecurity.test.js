const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {assertWorkspacePath} = require("../services/userPathSecurity");

test("account workspace path validation rejects links that escape the workspace", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-user-path-"));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const workspace = path.join(root, "workspace");
    const privateOutside = path.join(root, "outside");
    const privateInside = path.join(workspace, "inside");
    await fs.mkdir(workspace);
    await fs.mkdir(privateOutside);
    await fs.mkdir(privateInside);
    await fs.writeFile(path.join(privateOutside, "private.txt"), "synthetic");
    await fs.symlink(privateOutside, path.join(workspace, "external-link"), process.platform === "win32" ? "junction" : "dir");
    await fs.symlink(privateInside, path.join(workspace, "internal-link"), process.platform === "win32" ? "junction" : "dir");

    assert.throws(
        () => assertWorkspacePath(workspace, path.join(workspace, "external-link", "private.txt")),
        /private FolderRocket workspace/
    );
    assert.throws(
        () => assertWorkspacePath(workspace, path.join(workspace, "external-link", "new-file.txt"), {allowMissing: true}),
        /private FolderRocket workspace/
    );
    assert.equal(
        assertWorkspacePath(workspace, path.join(workspace, "internal-link", "new-file.txt"), {allowMissing: true}),
        path.join(workspace, "internal-link", "new-file.txt")
    );
    assert.equal(
        assertWorkspacePath(workspace, path.join(workspace, "new-folder", "new-file.txt"), {allowMissing: true}),
        path.join(workspace, "new-folder", "new-file.txt")
    );
});
