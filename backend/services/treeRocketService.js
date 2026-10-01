const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {execFile} = require("node:child_process");

const MAX_TREE_FOLDERS = 250;
const MAX_TREE_FILES = 200;
const MAX_TREE_FOLDER_COUNTS = 80;
const TREE_FOLDER_COUNT_CONCURRENCY = 8;
const MAX_SEARCH_DIRECTORIES = 1500;
const MAX_SEARCH_DEPTH = 8;
const MAX_SEARCH_RESULTS = 100;

function getWindowsDriveRoots() {
    return new Promise(resolve => {
        const script = "Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root } | ConvertTo-Json -Compress";
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024}, (error, stdout) => {
            if (error || !stdout.trim()) return resolve([]);
            try {
                const parsed = JSON.parse(stdout);
                resolve((Array.isArray(parsed) ? parsed : [parsed]).filter(value => typeof value === "string"));
            } catch { resolve([]); }
        });
    });
}

async function directoryExists(candidate) {
    try { return (await fs.stat(candidate)).isDirectory(); }
    catch { return false; }
}

async function listTreeRoots({workspacePath, administrator = false, platform = process.platform, home = os.homedir(), driveRoots} = {}) {
    const candidates = [];
    const add = (candidate, name, kind) => {
        if (typeof candidate === "string" && candidate.trim()) candidates.push({path: path.resolve(candidate), name, kind});
    };

    if (!administrator) {
        add(workspacePath, "FolderRocket workspace", "workspace");
    } else {
        const drives = driveRoots ?? (platform === "win32" ? await getWindowsDriveRoots() : [path.parse(home).root || "/"]);
        for (const drive of drives) add(drive, `Computer · ${drive}`, "computer");
        add(home, "User home", "user");
        for (const [name, directory] of [["Desktop", "Desktop"], ["Documents", "Documents"], ["Downloads", "Downloads"], ["OneDrive", "OneDrive"]]) {
            add(path.join(home, directory), name, "user");
        }
        add(workspacePath, "FolderRocket workspace", "workspace");
    }

    const roots = [];
    const seen = new Set();
    for (const entry of candidates) {
        const key = platform === "win32" ? entry.path.toLowerCase() : entry.path;
        if (seen.has(key) || !await directoryExists(entry.path)) continue;
        seen.add(key);
        roots.push(entry);
    }
    return roots;
}

async function listTreeDirectory(directoryPath, {includeFiles = false, includeFolderFileCounts = false} = {}) {
    const stats = await fs.stat(directoryPath);
    if (!stats.isDirectory()) throw new Error("The selected path is not a folder.");
    const entries = await fs.readdir(directoryPath, {withFileTypes: true});
    const directories = [];
    const files = [];
    let directFileCount = 0;
    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        // Do not follow symlinks/junctions from tree nodes. This prevents cycles
        // and keeps each navigation step within the selected directory tree.
        if (entry.isDirectory()) directories.push({name: entry.name, path: entryPath});
        else if (entry.isFile()) {
            directFileCount += 1;
            if (includeFiles) files.push({name: entry.name, path: entryPath});
        }
    }
    directories.sort((left, right) => left.name.localeCompare(right.name, undefined, {numeric: true, sensitivity: "base"}));
    files.sort((left, right) => left.name.localeCompare(right.name, undefined, {numeric: true, sensitivity: "base"}));
    const visibleDirectories = directories.slice(0, MAX_TREE_FOLDERS);
    if (includeFolderFileCounts) {
        const countDirectories = visibleDirectories.slice(0, MAX_TREE_FOLDER_COUNTS);
        for (let index = 0; index < countDirectories.length; index += TREE_FOLDER_COUNT_CONCURRENCY) {
            const batch = countDirectories.slice(index, index + TREE_FOLDER_COUNT_CONCURRENCY);
            const counts = await Promise.all(batch.map(async folder => {
                try {
                    const childEntries = await fs.readdir(folder.path, {withFileTypes: true});
                    return {files:childEntries.reduce((count, entry) => count + (entry.isFile() ? 1 : 0), 0), folders:childEntries.reduce((count, entry) => count + (entry.isDirectory() ? 1 : 0), 0)};
                } catch { return undefined; }
            }));
            counts.forEach((count, offset) => {
                if (count !== undefined) { batch[offset].directFileCount = count.files; batch[offset].directFolderCount = count.folders; }
            });
        }
    }
    return {
        path: directoryPath,
        folders: visibleDirectories,
        files: includeFiles ? files.slice(0, MAX_TREE_FILES) : [],
        directFileCount,
        truncatedFolders: directories.length > MAX_TREE_FOLDERS,
        truncatedFiles: includeFiles && files.length > MAX_TREE_FILES,
        folderCountsLimited: includeFolderFileCounts && visibleDirectories.length > MAX_TREE_FOLDER_COUNTS
    };
}

async function searchTreeRoots(roots, query, {maxDirectories = MAX_SEARCH_DIRECTORIES, maxDepth = MAX_SEARCH_DEPTH, maxResults = MAX_SEARCH_RESULTS} = {}) {
    const needle = typeof query === "string" ? query.trim().toLocaleLowerCase() : "";
    if (needle.length < 2) throw new Error("Enter at least two characters to search folders and files.");
    const safeRoots = Array.isArray(roots) ? roots.filter(root => root && typeof root.path === "string" && root.path.trim()) : [];
    const queue = safeRoots.map(root => ({path: path.resolve(root.path), depth: 0, rootPath: path.resolve(root.path), rootName: String(root.name || path.basename(root.path) || root.path)}));
    const folders = [];
    const files = [];
    const visited = new Set();
    let scannedDirectories = 0;
    let queueIndex = 0;
    let truncated = false;
    while (queueIndex < queue.length) {
        const current = queue[queueIndex++];
        const visitedKey = process.platform === "win32" ? current.path.toLowerCase() : current.path;
        if (visited.has(visitedKey)) continue;
        visited.add(visitedKey);
        if (scannedDirectories >= maxDirectories) { truncated = true; break; }
        scannedDirectories += 1;
        let entries;
        try { entries = await fs.readdir(current.path, {withFileTypes: true}); }
        catch { continue; }
        for (const entry of entries) {
            const entryPath = path.join(current.path, entry.name);
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
                if (entry.name.toLocaleLowerCase().includes(needle) && folders.length + files.length < maxResults) {
                    folders.push({name: entry.name, path: entryPath, rootPath: current.rootPath, rootName: current.rootName, depth: current.depth + 1});
                }
                if (current.depth < maxDepth) queue.push({...current, path: entryPath, depth: current.depth + 1});
            } else if (entry.isFile() && entry.name.toLocaleLowerCase().includes(needle) && folders.length + files.length < maxResults) {
                files.push({name: entry.name, path: entryPath, parentPath: current.path, parentName: path.basename(current.path) || current.path, rootPath: current.rootPath, rootName: current.rootName});
            }
            if (folders.length + files.length >= maxResults) { truncated = true; break; }
        }
        if (truncated && folders.length + files.length >= maxResults) break;
    }
    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"}));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"}));
    return {folders, files, scannedDirectories, truncated};
}

module.exports = {listTreeDirectory, listTreeRoots, searchTreeRoots, MAX_TREE_FILES, MAX_TREE_FOLDERS, MAX_TREE_FOLDER_COUNTS, MAX_SEARCH_DIRECTORIES, MAX_SEARCH_DEPTH, MAX_SEARCH_RESULTS};
