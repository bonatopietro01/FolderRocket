const fs = require("node:fs");
const path = require("node:path");

const MAX_INSPECTED_FILES = 20_000;

async function inventoryFileTypes(folders, {validatePath, fileSystem = fs} = {}) {
    if (typeof validatePath !== "function") throw new TypeError("A path validator is required.");

    const roots = [];
    const unavailableFolders = [];
    const requestedFolders = Array.isArray(folders) ? folders : [];

    for (let index = 0; index < requestedFolders.length; index += 1) {
        let safePath;
        let stats;
        try {
            safePath = validatePath(requestedFolders[index], {allowMissing: true});
            stats = await fileSystem.promises.stat(safePath);
        } catch (error) {
            if (error?.code === "ENOENT") {
                unavailableFolders.push({index, reasonCode: "not_found"});
                continue;
            }
            if (error?.code === "ENOTDIR") {
                unavailableFolders.push({index, reasonCode: "not_directory"});
                continue;
            }
            throw error;
        }

        if (!stats.isDirectory()) {
            unavailableFolders.push({index, reasonCode: "not_directory"});
            continue;
        }
        roots.push(safePath);
    }

    if (unavailableFolders.length) {
        return {status: "unavailable", types: [], total: 0, truncated: false, unavailableFolders};
    }

    const pending = [...new Set(roots)];
    const counts = new Map();
    let inspected = 0;
    while (pending.length && inspected < MAX_INSPECTED_FILES) {
        const current = pending.pop();
        let entries;
        try {
            entries = await fileSystem.promises.readdir(current, {withFileTypes: true});
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) pending.push(path.join(current, entry.name));
            else if (entry.isFile()) {
                inspected += 1;
                const type = path.extname(entry.name).slice(1).toLowerCase();
                if (type) counts.set(type, (counts.get(type) || 0) + 1);
            }
            if (inspected >= MAX_INSPECTED_FILES) break;
        }
        if (inspected % 500 === 0) await new Promise(resolve => setImmediate(resolve));
    }

    const types = [...counts.entries()]
        .map(([type, count]) => ({type, count}))
        .sort((a, b) => a.type.localeCompare(b.type));
    return {
        status: "ready",
        types,
        total: [...counts.values()].reduce((sum, count) => sum + count, 0),
        truncated: Boolean(pending.length)
    };
}

module.exports = {inventoryFileTypes, MAX_INSPECTED_FILES};
