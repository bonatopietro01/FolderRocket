const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {listTreeDirectory, listTreeRoots, resolveDesktopRoots, searchTreeRoots, treeRootsResponse, MAX_TREE_FILES, MAX_TREE_FOLDER_COUNTS} = require("../services/treeRocketService");

test("Tree Rocket resolves the personal and public Windows Desktop roots", async () => {
    const roots = await resolveDesktopRoots({
        platform: "win32",
        home: "C:/Users/demo",
        environment: {},
        execFileImpl: (_file, _args, _options, callback) => callback(null, '["D:/OneDrive/Desktop","C:/Users/Public/Desktop"]\r\n', "")
    });
    assert.deepEqual(roots, [path.resolve("D:/OneDrive/Desktop"), path.resolve("C:/Users/Public/Desktop")]);
});

test("Tree Rocket falls back to redirected and public Desktop locations when PowerShell is unavailable", async () => {
    const roots = await resolveDesktopRoots({
        platform: "win32",
        home: "C:/Users/demo",
        environment: {OneDrive: "D:/OneDrive", PUBLIC: "C:/Users/Public"},
        execFileImpl: (_file, _args, _options, callback) => callback(new Error("powershell unavailable"), "", "")
    });
    assert.deepEqual(roots, [path.resolve("D:/OneDrive/Desktop"), path.resolve("C:/Users/Public/Desktop")]);
});

test("Tree Rocket Desktop roots deduplicate canonical aliases but preserve same-name folders", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-desktop-roots-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const personal = path.join(root, "personal");
    const publicDesktop = path.join(root, "public");
    const alias = path.join(root, "desktop-alias");
    await fs.mkdir(personal);
    await fs.mkdir(publicDesktop);
    await fs.mkdir(alias);
    await fs.mkdir(path.join(personal, "Shared name"));
    await fs.mkdir(path.join(publicDesktop, "Shared name"));

    const roots = await listTreeRoots({
        workspacePath: path.join(root, "workspace"),
        administrator: false,
        platform: "win32",
        mode: "desktop",
        desktopRoots: [personal, alias, publicDesktop],
        realpathImpl: async candidate => path.resolve(candidate) === path.resolve(alias)
            ? fs.realpath(personal)
            : fs.realpath(candidate)
    });

    assert.deepEqual(roots.map(entry => entry.path), [await fs.realpath(personal), await fs.realpath(publicDesktop)]);
    assert.deepEqual(roots.map(entry => entry.name), ["Desktop", "Public Desktop"]);
    const personalTree = await listTreeDirectory(roots[0].path);
    const publicTree = await listTreeDirectory(roots[1].path);
    assert.equal(personalTree.folders[0].name, "Shared name");
    assert.equal(publicTree.folders[0].name, "Shared name");
});

test("Tree Rocket marks Desktop roots as partial when a known location is denied", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-desktop-denied-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const personal = path.join(root, "personal");
    const publicDesktop = path.join(root, "public");
    await fs.mkdir(personal);
    await fs.mkdir(publicDesktop);

    const roots = await listTreeRoots({
        workspacePath: path.join(root, "workspace"),
        administrator: false,
        platform: "win32",
        mode: "desktop",
        desktopRoots: [personal, publicDesktop],
        accessImpl: async candidate => {
            if (path.resolve(candidate) === path.resolve(publicDesktop)) {
                const error = new Error("access denied");
                error.code = "EACCES";
                throw error;
            }
        }
    });

    assert.deepEqual(roots.map(entry => entry.name), ["Desktop"]);
    assert.equal(roots.partial, true);
    assert.deepEqual(roots.unavailableRoots, ["Public Desktop"]);
});

test("Tree Rocket marks known missing local and public Desktop roots unavailable", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-desktop-missing-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const personal = path.join(root, "personal-desktop");
    const publicDesktop = path.join(root, "public-desktop");
    await fs.mkdir(personal);

    const roots = await listTreeRoots({
        workspacePath: path.join(root, "workspace"),
        administrator: false,
        platform: "win32",
        mode: "desktop",
        desktopRoots: [personal, publicDesktop]
    });

    assert.deepEqual(roots.map(entry => entry.name), ["Desktop"]);
    assert.equal(roots.partial, true);
    assert.deepEqual(roots.unavailableRoots, ["Public Desktop"]);
    assert.deepEqual(treeRootsResponse(roots, "desktop", "work"), {
        roots, mode: "desktop", worldId: "work", partial: true, unavailableRoots: ["Public Desktop"]
    });
});

test("Tree Rocket root API keeps the known Desktop candidates and serializes partial status", async () => {
    const server = await fs.readFile(path.join(__dirname, "..", "server.js"), "utf8");
    const route = server.slice(server.indexOf('app.get("/filesystem/tree-roots"'), server.indexOf('app.post("/filesystem/tree-children"'));
    assert.match(route, /desktopRoots=await resolveDesktopRoots\(\)/);
    assert.match(route, /res\.json\(treeRootsResponse\(roots,mode,worldId\)\)/);
    assert.doesNotMatch(route, /if\(!desktopRoots\.length\)return res\.status\(404\)/);
    const searchRoute = server.slice(server.indexOf('app.post("/filesystem/tree-search"'), server.indexOf('app.post("/file-types/inventory"'));
    assert.match(searchRoute, /desktopRoots=await resolveDesktopRoots\(\)/);
    assert.match(searchRoute, /partial:roots\.partial===true,unavailableRoots:roots\.unavailableRoots\|\|\[\]/);
});

test("Tree Rocket lists only direct child folders until files are requested", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    await fs.mkdir(path.join(root, "nested", "child"), {recursive: true});
    await fs.writeFile(path.join(root, "visible.txt"), "not read by the listing");
    await fs.writeFile(path.join(root, "nested", "inside.pdf"), "fixture");

    const tree = await listTreeDirectory(root);
    assert.deepEqual(tree.folders.map(folder => folder.name), ["nested"]);
    assert.deepEqual(tree.files, []);
    assert.equal(tree.directFileCount, 1);
    assert.equal(tree.folders[0].directFileCount, undefined);
    const preview = await listTreeDirectory(root, {includeFiles: true});
    assert.deepEqual(preview.files.map(file => file.name), ["visible.txt"]);
    assert.equal(preview.path, root);
});

test("Tree Rocket provides bounded direct-file counts without recursively scanning child folders", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-counts-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const child = path.join(root, "child");
    await fs.mkdir(path.join(child, "grandchild"), {recursive: true});
    await fs.writeFile(path.join(child, "direct.txt"), "fixture");
    await fs.writeFile(path.join(child, "grandchild", "nested.txt"), "fixture");
    const tree = await listTreeDirectory(root, {includeFolderFileCounts: true});
    assert.equal(tree.directFileCount, 0);
    assert.equal(tree.folders[0].directFileCount, 1);
    assert.equal(tree.folders[0].directFolderCount, 1);
    assert.equal(tree.folderCountsLimited, false);
});

test("Tree Rocket can page through every direct folder in a large Desktop directory",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-tree-pages-"));t.after(async()=>fs.rm(root,{recursive:true,force:true}));
    await Promise.all(Array.from({length:252},(_,index)=>fs.mkdir(path.join(root,`Desktop folder ${String(index).padStart(3,"0")}`))));
    const first=await listTreeDirectory(root);
    assert.equal(first.folders.length,250);
    assert.equal(first.directFolderCount,252);
    assert.equal(first.nextFolderOffset,250);
    const second=await listTreeDirectory(root,{folderOffset:first.nextFolderOffset});
    assert.equal(second.folders.length,2);
    assert.equal(second.nextFolderOffset,null);
    assert.equal(second.truncatedFolders,false);
    assert.deepEqual([...first.folders,...second.folders].map(item=>item.name),Array.from({length:252},(_,index)=>`Desktop folder ${String(index).padStart(3,"0")}`));
});

test("Tree Rocket pages direct files with stable ordering and no content reads", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-file-pages-"));
    t.after(async () => fs.rm(root, {recursive:true,force:true}));
    await Promise.all(Array.from({length:MAX_TREE_FILES + 3}, (_,index) => fs.writeFile(path.join(root, `Report ${String(index).padStart(3,"0")}.txt`), "private file body")));
    await fs.mkdir(path.join(root,"nested"));
    const first = await listTreeDirectory(root,{includeFiles:true});
    assert.equal(first.files.length,MAX_TREE_FILES);
    assert.equal(first.fileOffset,0);
    assert.equal(first.fileTotal,MAX_TREE_FILES+3);
    assert.equal(first.nextFileOffset,MAX_TREE_FILES);
    assert.equal(first.truncatedFiles,true);
    assert.equal(Object.hasOwn(first.files[0],"content"),false);
    const second = await listTreeDirectory(root,{includeFiles:true,fileOffset:first.nextFileOffset});
    assert.equal(second.files.length,3);
    assert.equal(second.nextFileOffset,null);
    assert.equal(second.truncatedFiles,false);
    assert.equal(second.files[0].name,"Report 200.txt");
    assert.deepEqual([...first.files,...second.files].map(file=>file.path),[...new Set([...first.files,...second.files].map(file=>file.path))]);
    assert.deepEqual(first.folders.map(folder=>folder.name),["nested"]);
});

test("Tree Rocket clamps invalid direct-file offsets without returning duplicates", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-file-offset-"));
    t.after(async () => fs.rm(root,{recursive:true,force:true}));
    await fs.writeFile(path.join(root,"only.txt"),"fixture");
    const result = await listTreeDirectory(root,{includeFiles:true,fileOffset:50});
    assert.equal(result.fileOffset,1);
    assert.equal(result.files.length,0);
    assert.equal(result.nextFileOffset,null);
    assert.equal(result.fileTotal,1);
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

test("Tree Rocket search reports bounded direct-folder counts and leaves unreadable or unchecked counts unavailable", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-tree-search-direct-counts-"));
    t.after(async () => fs.rm(root, {recursive: true, force: true}));
    const folderPaths = Array.from({length: MAX_TREE_FOLDER_COUNTS + 1}, (_, index) => path.join(root, `report-${String(index).padStart(3, "0")}`));
    await Promise.all(folderPaths.map(folderPath => fs.mkdir(folderPath)));
    await fs.mkdir(path.join(folderPaths[0], "direct-child", "grandchild"), {recursive: true});

    const readsByFolder = new Map();
    const readDirectory = async (directoryPath, options) => {
        const normalizedPath = path.resolve(directoryPath);
        if (folderPaths.some(folderPath => path.resolve(folderPath) === normalizedPath)) {
            const readCount = (readsByFolder.get(normalizedPath) || 0) + 1;
            readsByFolder.set(normalizedPath, readCount);
            if (normalizedPath === path.resolve(folderPaths[2]) && readCount > 1) {
                const error = new Error("synthetic access denied");
                error.code = "EACCES";
                throw error;
            }
        }
        return fs.readdir(directoryPath, options);
    };

    const results = await searchTreeRoots([{name: "Fixture root", path: root}], "report", {readDirectory});
    assert.equal(results.folders.length, MAX_TREE_FOLDER_COUNTS + 1);
    assert.equal(results.folders[0].directFolderCount, 1);
    assert.equal(results.folders[1].directFolderCount, 0);
    assert.equal(results.folders[2].directFolderCount, undefined);
    assert.equal(results.folders[MAX_TREE_FOLDER_COUNTS - 1].directFolderCount, 0);
    assert.equal(results.folders[MAX_TREE_FOLDER_COUNTS].directFolderCount, undefined);
    assert.equal(readsByFolder.get(path.resolve(folderPaths[MAX_TREE_FOLDER_COUNTS - 1])), 2);
    assert.equal(readsByFolder.get(path.resolve(folderPaths[MAX_TREE_FOLDER_COUNTS])), 1);
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
