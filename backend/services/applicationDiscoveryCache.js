const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {getRuntimeDataDirectory} = require('./runtimePaths');

function cachePath(userId, appId) {
    const key = crypto.createHash('sha256').update(`${userId}\0${appId}`).digest('hex');
    return path.join(getRuntimeDataDirectory(), 'application-discovery', `${key}.json`);
}

function read(userId, appId, extensions) {
    try {
        const value = JSON.parse(fs.readFileSync(cachePath(userId, appId), 'utf8'));
        if (JSON.stringify(value.extensions) !== JSON.stringify([...extensions].sort())) return null;
        if (!Array.isArray(value.files) || !Array.isArray(value.directories)) return null;
        return value;
    } catch { return null; }
}

function write(userId, appId, extensions, result) {
    const destination = cachePath(userId, appId);
    fs.mkdirSync(path.dirname(destination), {recursive:true});
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({extensions:[...extensions].sort(),files:result.files,directories:result.directories,updatedAt:new Date().toISOString()}), {mode:0o600});
    fs.renameSync(temporary, destination);
}

function remove(userId, appId) {
    try { fs.unlinkSync(cachePath(userId, appId)); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

module.exports = {read, write, remove};
