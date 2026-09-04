const fs = require('node:fs/promises');
const path = require('node:path');

// Read metadata only: cloud placeholders need not be downloaded. Resolve directory
// junctions and symlinks, and visit each physical directory once to avoid cycles.
async function discoverApplicationFiles(roots, extensions, {signal, previous} = {}) {
    const pending = [...roots];
    const visited = new Set(), found = new Set(), folders = new Map();
    const wanted = new Set(extensions);
    let files = [], directories = [];
    const repositoryCache = new Map();
    let inspected = 0, skipped = 0;
    const keyOf = value => process.platform === 'win32' ? value.toLowerCase() : value;
    async function sensitivityOf(directory) {
        const normalized = directory.replaceAll('/', '\\').toLowerCase();
        if (/\\windows\\/.test(normalized)) return 'system';
        if (/\\(?:program files(?: \(x86\))?|programdata)\\|\\appdata\\local\\programs\\/.test(normalized)) return 'installation';
        if (/\\(?:shared drives|shared with me|team drives)\\/.test(normalized)) return 'shared';
        const cloudPath=/\\(?:onedrive(?: - [^\\]+)?|dropbox|icloud drive|google drive|drivefs)\\/.test(normalized);
        const directoryKey=keyOf(directory);if(repositoryCache.has(directoryKey))return repositoryCache.get(directoryKey)?'shared':(cloudPath?'synced':'');
        let current = directory, repository=false;
        while (current && current !== path.dirname(current)) {
            try { if ((await fs.stat(path.join(current,'.git'))).isDirectory()) { repository=true; break; } } catch { /* Continue through ancestors. */ }
            current = path.dirname(current);
        }
        repositoryCache.set(directoryKey,repository);if(repository)return 'shared';
        return cloudPath ? 'synced' : '';
    }
    // An incremental scan stats every indexed folder, then reads only changed
    // subtrees. This is cheap even when the saved application contains many files.
    if (previous?.files && previous?.directories) {
        const affected = [], missing = [];
        for (const directory of previous.directories) {
            signal?.throwIfAborted();
            try {
                const stats = await fs.stat(directory.path);
                if (!stats.isDirectory()) missing.push(directory.path);
                else if (stats.mtimeMs !== directory.mtimeMs) affected.push(directory.path);
            } catch (error) {
                if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') missing.push(directory.path);
                else skipped++;
            }
        }
        const changedRoots = affected.filter(candidate => !affected.some(other => other !== candidate && isInside(candidate, other)));
        const invalidRoots = [...missing, ...changedRoots];
        files = previous.files.filter(file => !invalidRoots.some(directory => isInside(file.path, directory)));
        directories = previous.directories.filter(item => !invalidRoots.some(directory => isInside(item.path, directory)));
        pending.splice(0, pending.length, ...changedRoots);
    }
    const retainedFileKeys = new Set(files.map(file => keyOf(file.path)));
    const retainedDirectoryKeys = new Set(directories.map(directory => keyOf(directory.canonical || directory.path)));
    for (let index = 0; index < pending.length; index++) {
        signal?.throwIfAborted();
        const directory = pending[index];
        pending[index] = null;
        let canonical, entries;
        try {
            canonical = await fs.realpath(directory);
            const key = keyOf(canonical);
            if (visited.has(key) || retainedDirectoryKeys.has(key)) continue;
            visited.add(key);
            entries = await fs.readdir(directory, {withFileTypes: true});
            const directoryStats = await fs.stat(directory);
            directories.push({path:directory, canonical, mtimeMs:directoryStats.mtimeMs});
        } catch { skipped++; continue; }
        for (const entry of entries) {
            signal?.throwIfAborted();
            const filePath = path.join(directory, entry.name);
            let stats;
            try {
                if (entry.isSymbolicLink()) stats = await fs.stat(filePath);
                if (entry.isDirectory() || stats?.isDirectory()) { pending.push(filePath); continue; }
                if (!entry.isFile() && !stats?.isFile()) continue;
                inspected++;
                const extension = path.extname(entry.name).slice(1).toLowerCase();
                if (!wanted.has(extension)) continue;
                const key = keyOf(path.join(canonical, entry.name));
                if (found.has(key) || retainedFileKeys.has(key)) continue;
                stats ||= await fs.stat(filePath);
                found.add(key);
                files.push({name:entry.name, path:filePath, size:stats.size, createdAt:stats.birthtime.toISOString(), extension, sensitivity:await sensitivityOf(directory)});
                folders.set(directory, (folders.get(directory) || 0) + 1);
            } catch { skipped++; }
        }
        await new Promise(resolve => setImmediate(resolve));
    }
    folders.clear();
    for (const file of files) { const folder=path.dirname(file.path); folders.set(folder,(folders.get(folder)||0)+1); }
    const before = new Set((previous?.files || []).map(file => keyOf(file.path)));
    const after = new Set(files.map(file => keyOf(file.path)));
    return {files, directories, folders:[...folders].map(([path,count]) => ({path,count})).sort((a,b) => b.count-a.count), inspected, skipped, truncated:false, mode:previous?'incremental':'full', added:[...after].filter(file=>!before.has(file)).length, removed:[...before].filter(file=>!after.has(file)).length};
}
function isInside(candidate, parent) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
module.exports = {discoverApplicationFiles};
