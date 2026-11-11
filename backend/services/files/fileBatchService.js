const fs = require("fs");
const path = require("path");

async function pathExists(targetPath) {
    return Boolean(await fs.promises.stat(targetPath).catch(() => null));
}

async function moveFilePortable(sourcePath, targetPath) {
    try {
        await fs.promises.rename(sourcePath, targetPath);
    } catch (error) {
        if (!error || error.code !== "EXDEV") throw error;
        await fs.promises.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
        try {
            const [sourceStats, targetStats] = await Promise.all([fs.promises.stat(sourcePath), fs.promises.stat(targetPath)]);
            if (sourceStats.size !== targetStats.size) throw new Error(`The copied file ${path.basename(sourcePath)} failed size verification.`);
            await fs.promises.unlink(sourcePath);
        } catch (unlinkError) {
            await fs.promises.unlink(targetPath).catch(() => {});
            throw unlinkError;
        }
    }
}

async function executeMoveBatch(operations) {
    const completed = [];
    const backups = [];
    try {
        for (const operation of operations) {
            if (operation.replaceExisting && await pathExists(operation.targetPath)) {
                const backupPath = `${operation.targetPath}.folderrocket-backup-${require("crypto").randomUUID()}`;
                await fs.promises.rename(operation.targetPath, backupPath);
                backups.push({targetPath: operation.targetPath, backupPath});
            }
            if (!operation.samePath) await moveFilePortable(operation.sourcePath, operation.targetPath);
            completed.push(operation);
        }
    } catch (error) {
        for (const operation of completed.reverse()) {
            if (!operation.samePath && await pathExists(operation.targetPath) && !await pathExists(operation.sourcePath)) {
                await moveFilePortable(operation.targetPath, operation.sourcePath).catch(() => {});
            }
        }
        for (const backup of backups.reverse()) {
            if (await pathExists(backup.backupPath)) await fs.promises.rename(backup.backupPath, backup.targetPath).catch(() => {});
        }
        throw error;
    }
    await Promise.all(backups.map(backup => fs.promises.unlink(backup.backupPath).catch(() => {})));
    return completed.map(operation => ({name:path.basename(operation.targetPath),path:operation.targetPath,sourcePath:operation.sourcePath}));
}

async function executeCopyBatch(operations) {
    const copied = [];
    try {
        for (const operation of operations) {
            if (operation.samePath) throw new Error(`${path.basename(operation.sourcePath)} is already in the destination folder`);
            await fs.promises.copyFile(operation.sourcePath, operation.targetPath, fs.constants.COPYFILE_EXCL);
            const stats = await fs.promises.stat(operation.targetPath);
            copied.push({name:path.basename(operation.targetPath),path:operation.targetPath,size:stats.size,createdAt:stats.birthtime.toISOString()});
        }
    } catch (error) {
        await Promise.all(copied.map(file => fs.promises.unlink(file.path).catch(() => {})));
        throw error;
    }
    return copied;
}

module.exports = {executeCopyBatch, executeMoveBatch, moveFilePortable, pathExists};
