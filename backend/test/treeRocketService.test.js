const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {listTreeDirectory, listTreeRoots, searchTreeRoots} = require("../services/treeRocketService");

test("Tree Rocket lists only direct child folders until files are requested", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    await fs.mkdir(path.join(root, "nested", "child"), {recursive: true});
    await fs.writeFile(path.join(root, "visible.txt"), "not read by the listing");
    await fs.writeFile(path.join(root, "nested", "inside.pdf"), "fixture");

    const tree = await listTreeDirectory(root);
    assert.deepEqual(tree.folders.map(folder => folder.name), ["nested"]);
    assert.deepEqual(tree.files, []);
    const preview = await listTreeDirectory(root, {includeFiles: true});
    assert.deepEqual(preview.files.map(file => file.name), ["visible.txt"]);
    assert.equal(preview.path, root);
});

test("Tree Rocket roots are limited to the private workspace for non-admin users", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-roots-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const workspace = path.join(root, "workspace");
    const home = path.join(root, "home");
    await fs.mkdir(workspace, {recursive: true});
    await fs.mkdir(home, {recursive: true});
    const roots = await listTreeRoots({workspacePath: workspace, administrator: false, platform: "win32", home, driveRoots: [root]});
    assert.deepEqual(roots.map(entry => entry.path), [workspace]);
});

test("Tree Rocket admin roots include available drives and user locations without duplicates", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-admin-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const home = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    await fs.mkdir(path.join(home, "Desktop"), {recursive: true});
    await fs.mkdir(workspace, {recursive: true});
    const roots = await listTreeRoots({workspacePath: workspace, administrator: true, platform: "win32", home, driveRoots: [root, root]});
    assert.equal(roots.filter(entry => entry.path.toLowerCase() === root.toLowerCase()).length, 1);
    assert.ok(roots.some(entry => entry.path === path.join(home, "Desktop")));
    assert.ok(roots.some(entry => entry.path === workspace));
});

test("Tree Rocket search finds folder and file names without opening file contents", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-search-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const project = path.join(root, "Project Alpha");
    await fs.mkdir(path.join(project, "Reports"), {recursive: true});
    await fs.writeFile(path.join(project, "Reports", "budget-report.xlsx"), "secret body text must never be read by tree search");
    await fs.writeFile(path.join(project, "other.txt"), "this should not be returned for the selected query");

    const results = await searchTreeRoots([{name: "Fixture root", path: root}], "report");
    assert.equal(results.folders.some(folder => folder.name === "Reports"), true);
    assert.equal(results.files.some(file => file.name === "budget-report.xlsx"), true);
    assert.equal(results.files[0].parentPath, path.join(project, "Reports"));
    assert.equal(Object.hasOwn(results.files[0], "content"), false);
    assert.equal(results.truncated, false);
});

test("Tree Rocket search rejects short queries and respects its scan bound", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-search-bounded-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    await fs.mkdir(path.join(root, "child"), {recursive: true});
    await assert.rejects(searchTreeRoots([{name: "Fixture root", path: root}], "x"), /at least two characters/);
    const results = await searchTreeRoots([{name: "Fixture root", path: root}], "nothing", {maxDirectories: 1});
    assert.equal(results.scannedDirectories, 1);
    assert.equal(results.truncated, true);
});

test("Tree Rocket reports truncated search results when a matching directory contains more hits", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-search-results-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    await fs.writeFile(path.join(root, "report-one.txt"), "one");
    await fs.writeFile(path.join(root, "report-two.txt"), "two");
    await fs.writeFile(path.join(root, "report-three.txt"), "three");
    const results = await searchTreeRoots([{name: "Fixture root", path: root}], "report", {maxResults: 2});
    assert.equal(results.files.length, 2);
    assert.equal(results.truncated, true);
});
