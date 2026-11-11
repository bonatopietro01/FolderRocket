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

function resolveDesktopRoot({platform = process.platform, home = os.homedir(), environment = process.env, execFileImpl = execFile} = {}) {
    if (platform !== "win32") return Promise.resolve(path.join(home, "Desktop"));
    return new Promise(resolve => {
        const script = "[Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)";
        execFileImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {windowsHide:true, timeout:5000, maxBuffer:16*1024}, (_error, stdout) => {
            const resolved = String(stdout || "").trim();
            if (resolved && path.isAbsolute(resolved)) return resolve(path.resolve(resolved));
            const fallback = environment.OneDrive ? path.join(environment.OneDrive, "Desktop") : path.join(home, "Desktop");
            resolve(path.resolve(fallback));
        });
    });
}

function resolveDesktopRoots({platform = process.platform, home = os.homedir(), environment = process.env, execFileImpl = execFile} = {}) {
    if (platform !== "win32") return Promise.resolve([path.join(home, "Desktop")]);
    return new Promise(resolve => {
        const script = "$paths = @([Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop), [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDesktopDirectory)); $paths | ConvertTo-Json -Compress";
        execFileImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {windowsHide: true, timeout: 5000, maxBuffer: 16 * 1024}, (_error, stdout) => {
            try {
                const parsed = JSON.parse(String(stdout || "").trim());
                const roots = (Array.isArray(parsed) ? parsed : [parsed]).filter(value => typeof value === "string" && value.trim() && path.isAbsolute(value)).map(value => path.resolve(value));
                if (roots.length) return resolve([...new Set(roots.map(value => value.toLowerCase()))].map(key => roots.find(value => value.toLowerCase() === key)));
            } catch { /* Use Windows' conventional locations when PowerShell is unavailable. */ }
            const personal = environment.OneDrive ? path.join(environment.OneDrive, "Desktop") : path.join(home, "Desktop");
            const publicDesktop = environment.PUBLIC
                ? path.join(environment.PUBLIC, "Desktop")
                : path.win32.join(path.win32.parse(home).root, "Users", "Public", "Desktop");
            resolve([...new Set([personal, publicDesktop].map(value => path.resolve(value).toLowerCase()))].map(key => [personal, publicDesktop].map(value => path.resolve(value)).find(value => value.toLowerCase() === key)));
        });
    });
}

async function listTreeRoots({workspacePath, administrator = false, platform = process.platform, home = os.homedir(), driveRoots, mode, desktopRoot, desktopRoots, realpathImpl = fs.realpath, accessImpl = fs.access} = {}) {
    const candidates = [];
    const add = (candidate, name, kind) => {
        if (typeof candidate === "string" && candidate.trim()) candidates.push({path: path.resolve(candidate), name, kind});
    };

    if (mode === "desktop") {
        const roots = Array.isArray(desktopRoots) && desktopRoots.length ? desktopRoots : [desktopRoot || path.join(home, "Desktop")];
        roots.forEach((candidate, index) => add(candidate, index === 0 ? "Desktop" : "Public Desktop", "desktop"));
    } else if (!administrator) {
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
    const unavailableRoots = [];
    const seen = new Set();
    for (const entry of candidates) {
        let canonicalPath;
        try {
            const stats = await fs.stat(entry.path);
            if (!stats.isDirectory()) {
                if (mode === "desktop") unavailableRoots.push(entry.name);
                continue;
            }
            canonicalPath = await realpathImpl(entry.path);
            await accessImpl(canonicalPath, fs.constants.R_OK);
        } catch (error) {
            // Do not follow an unavailable root. Directory listing will expose
            // the omission through metadata so callers can tell a partial tree
            // from a complete one.
            // Desktop roots are known system locations. A missing redirected
            // or public Desktop is just as important to report as denied access.
            if (mode === "desktop" || error?.code === "EACCES" || error?.code === "EPERM") unavailableRoots.push(entry.name);
            continue;
        }
        const key = platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
        if (seen.has(key)) continue;
        seen.add(key);
        roots.push({...entry, path: canonicalPath});
    }
    Object.defineProperties(roots, {
        partial: {value: unavailableRoots.length > 0, enumerable: false},
        unavailableRoots: {value: unavailableRoots, enumerable: false}
    });
    return roots;
}

function treeRootsResponse(roots, mode, worldId) {
    return {
        roots,
        mode,
        ...(worldId ? {worldId} : {}),
        partial: roots?.partial === true,
        unavailableRoots: Array.isArray(roots?.unavailableRoots) ? roots.unavailableRoots : []
    };
}

async function listTreeDirectory(directoryPath, {includeFiles = false, includeFolderFileCounts = false, folderOffset = 0, folderLimit = MAX_TREE_FOLDERS, fileOffset = 0, fileLimit = MAX_TREE_FILES} = {}) {
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
    const safeOffset = Number.isInteger(folderOffset) ? Math.max(0, Math.min(folderOffset, directories.length)) : 0;
    const safeLimit = Number.isInteger(folderLimit) ? Math.max(1, Math.min(folderLimit, MAX_TREE_FOLDERS)) : MAX_TREE_FOLDERS;
    const safeFileOffset = Number.isInteger(fileOffset) ? Math.max(0, Math.min(fileOffset, files.length)) : 0;
    const safeFileLimit = Number.isInteger(fileLimit) ? Math.max(1, Math.min(fileLimit, MAX_TREE_FILES)) : MAX_TREE_FILES;
    const visibleDirectories = directories.slice(safeOffset, safeOffset + safeLimit);
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
        files: includeFiles ? files.slice(safeFileOffset, safeFileOffset + safeFileLimit) : [],
        fileOffset: safeFileOffset,
        fileTotal: includeFiles ? files.length : directFileCount,
        nextFileOffset: includeFiles && safeFileOffset + safeFileLimit < files.length ? safeFileOffset + safeFileLimit : null,
        directFileCount,
        directFolderCount: directories.length,
        folderOffset: safeOffset,
        folderTotal: directories.length,
        nextFolderOffset: safeOffset + visibleDirectories.length < directories.length ? safeOffset + visibleDirectories.length : null,
        truncatedFolders: safeOffset + visibleDirectories.length < directories.length,
        truncatedFiles: includeFiles && safeFileOffset + safeFileLimit < files.length,
        folderCountsLimited: includeFolderFileCounts && visibleDirectories.length > MAX_TREE_FOLDER_COUNTS
    };
}

async function searchTreeRoots(roots, query, {maxDirectories = MAX_SEARCH_DIRECTORIES, maxDepth = MAX_SEARCH_DEPTH, maxResults = MAX_SEARCH_RESULTS, readDirectory = fs.readdir} = {}) {
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
        try { entries = await readDirectory(current.path, {withFileTypes: true}); }
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
    const countableFolders = folders.slice(0, MAX_TREE_FOLDER_COUNTS);
    for (let index = 0; index < countableFolders.length; index += TREE_FOLDER_COUNT_CONCURRENCY) {
        const batch = countableFolders.slice(index, index + TREE_FOLDER_COUNT_CONCURRENCY);
        const counts = await Promise.all(batch.map(async folder => {
            try {
                const entries = await readDirectory(folder.path, {withFileTypes: true});
                return entries.reduce((count, entry) => count + (entry.isDirectory() ? 1 : 0), 0);
            } catch { return undefined; }
        }));
        counts.forEach((count, offset) => {
            if (count !== undefined) batch[offset].directFolderCount = count;
        });
    }
    return {folders, files, scannedDirectories, truncated};
}

module.exports = {listTreeDirectory, listTreeRoots, resolveDesktopRoot, resolveDesktopRoots, searchTreeRoots, treeRootsResponse, MAX_TREE_FILES, MAX_TREE_FOLDERS, MAX_TREE_FOLDER_COUNTS, MAX_SEARCH_DIRECTORIES, MAX_SEARCH_DEPTH, MAX_SEARCH_RESULTS};
