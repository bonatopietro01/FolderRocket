const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {getRuntimeDataDirectory, getRuntimeUploadsDirectory} = require("./runtimePaths");

const STORE_PATH = path.join(getRuntimeDataDirectory(), "browser-bridge-tokens.json");
const EXPIRY_MS = 30 * 60 * 1000;
const stagedDrops = new Map();

function digest(token) {
    return crypto.createHash("sha256").update(String(token ?? "")).digest("hex");
}

function readStore() {
    try {
        const value = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
        return value && typeof value === "object" && Array.isArray(value.tokens) ? value : {version: 1, tokens: []};
    } catch {
        return {version: 1, tokens: []};
    }
}

function writeStore(store) {
    fs.mkdirSync(path.dirname(STORE_PATH), {recursive: true});
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), {encoding: "utf8", mode: 0o600});
}

function validBridgeId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(value);
}

function safeFileName(value) {
    const name = path.basename(String(value ?? "")).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
    return name || "Gmail attachment";
}

function nextAvailablePath(directory, name) {
    const extension = path.extname(name);
    const base = extension ? name.slice(0, -extension.length) : name;
    let candidate = path.join(directory, name);
    let index = 2;
    while (fs.existsSync(candidate)) {
        candidate = path.join(directory, `${base} (${index})${extension}`);
        index += 1;
    }
    return candidate;
}

function cleanExpiredDrops() {
    const oldest = Date.now() - EXPIRY_MS;
    for (const [bridgeId, drop] of stagedDrops) {
        if (drop.createdAt > oldest) continue;
        stagedDrops.delete(bridgeId);
        try { fs.rmSync(drop.directory, {recursive: true, force: true}); } catch { /* Cleanup is best effort. */ }
    }
}

function createBrowserBridgeToken(userId) {
    if (typeof userId !== "string" || !userId) throw new Error("A valid FolderRocket user is required.");
    const token = `frb_${crypto.randomBytes(32).toString("base64url")}`;
    const store = readStore();
    store.tokens = store.tokens.filter(record => record && record.userId !== userId);
    store.tokens.push({userId, tokenHash: digest(token), createdAt: new Date().toISOString()});
    writeStore(store);
    return token;
}

function userIdForToken(token) {
    const tokenHash = digest(token);
    const record = readStore().tokens.find(item => item && item.tokenHash === tokenHash && typeof item.userId === "string");
    return record?.userId ?? "";
}

function stageBrowserDrop({token, bridgeId, files}) {
    cleanExpiredDrops();
    const userId = userIdForToken(token);
    if (!userId) throw new Error("The browser bridge code is invalid or has been replaced.");
    if (!validBridgeId(bridgeId)) throw new Error("The browser bridge drop identifier is invalid.");
    if (!Array.isArray(files) || !files.length) throw new Error("No Gmail attachment was received.");
    const directory = path.join(getRuntimeUploadsDirectory(), "browser-bridge", userId, bridgeId);
    fs.mkdirSync(directory, {recursive: true});
    const staged = [];
    for (const file of files) {
        if (!file?.path || !fs.existsSync(file.path)) continue;
        const targetPath = nextAvailablePath(directory, safeFileName(file.originalname));
        fs.renameSync(file.path, targetPath);
        const stats = fs.statSync(targetPath);
        staged.push({name: path.basename(targetPath), path: targetPath, size: stats.size, createdAt: stats.birthtime.toISOString()});
    }
    if (!staged.length) throw new Error("The Gmail attachment could not be staged.");
    stagedDrops.set(bridgeId, {userId, directory, createdAt: Date.now(), files: staged});
    return {userId, files: staged};
}

function resolveBrowserDrop(userId, bridgeId) {
    cleanExpiredDrops();
    const drop = stagedDrops.get(bridgeId);
    if (!drop) throw new Error("The Gmail attachment is still being prepared. Keep dragging for a moment and try again.");
    if (drop.userId !== userId) throw new Error("This Gmail attachment belongs to another FolderRocket account.");
    return drop.files.filter(file => fs.existsSync(file.path));
}

module.exports = {createBrowserBridgeToken, resolveBrowserDrop, stageBrowserDrop};
