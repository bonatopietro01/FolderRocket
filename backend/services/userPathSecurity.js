const fs = require("node:fs");
const path = require("node:path");

const WORKSPACE_ACCESS_ERROR = "This account can only use files inside its private FolderRocket workspace.";

function isResolvedPathWithin(basePath, candidatePath) {
    const relative = path.relative(basePath, candidatePath);
    return relative === ""
        || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

function assertWorkspacePath(workspacePath, candidatePath, {allowMissing = false} = {}) {
    const workspace = path.resolve(workspacePath);
    const candidate = path.resolve(candidatePath);
    if (!isResolvedPathWithin(workspace, candidate)) throw new Error(WORKSPACE_ACCESS_ERROR);

    let realWorkspace;
    try {
        realWorkspace = fs.realpathSync.native(workspace);
    } catch {
        throw new Error("The private FolderRocket workspace is unavailable.");
    }

    let existingPath = candidate;
    while (true) {
        try {
            fs.lstatSync(existingPath);
        } catch (error) {
            if (allowMissing && error?.code === "ENOENT") {
                const parent = path.dirname(existingPath);
                if (parent === existingPath) throw new Error(WORKSPACE_ACCESS_ERROR);
                existingPath = parent;
                continue;
            }
            if (error?.code === "ENOENT") throw new Error("The requested file or folder does not exist.");
            throw new Error("Unable to validate the requested file or folder.");
        }

        let realPath;
        try {
            realPath = fs.realpathSync.native(existingPath);
        } catch {
            throw new Error("The requested path contains an unavailable symbolic link.");
        }
        if (!isResolvedPathWithin(realWorkspace, realPath)) throw new Error(WORKSPACE_ACCESS_ERROR);
        return candidate;
    }
}

module.exports = {assertWorkspacePath};
