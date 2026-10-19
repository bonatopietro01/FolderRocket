const fs = require("node:fs");
const path = require("node:path");

// Resolve symlinks in the existing prefix and retain any missing suffix. This
// gives configured-but-not-yet-created vaults a stable, symlink-aware identity.
function canonicalPath(candidatePath) {
    if (typeof candidatePath !== "string" || !candidatePath.trim()) return "";
    let cursor = path.resolve(candidatePath);
    const suffix = [];
    while (true) {
        try { return path.resolve(fs.realpathSync.native(cursor), ...suffix); }
        catch (error) {
            if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return "";
            const parent = path.dirname(cursor);
            if (parent === cursor) return "";
            suffix.unshift(path.basename(cursor));
            cursor = parent;
        }
    }
}

// Inputs should be canonicalized by the caller. path.relative avoids unsafe
// string-prefix checks (for example, C:\\vault-old is not inside C:\\vault).
function isWithinCanonicalRoot(rootPath, candidatePath) {
    if (typeof rootPath !== "string" || typeof candidatePath !== "string" || !rootPath || !candidatePath) return false;
    const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

module.exports = {canonicalPath,isWithinCanonicalRoot};
