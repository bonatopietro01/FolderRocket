const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {getRuntimeTokenDirectory} = require("./runtimePaths");

const TOKEN_DIRECTORY = getRuntimeTokenDirectory();
const STORE_PATH = path.join(TOKEN_DIRECTORY, ".folderrocket-email-tokens.json");
const KEY_PATH = path.join(TOKEN_DIRECTORY, ".folderrocket-token-key");
// Keeps pre-world Gmail credentials selectable without silently assigning their
// shared token to whichever planet happens to load first.
const LEGACY_SHARED_GMAIL_ACCOUNT_ID = "folderrocket-legacy-shared-gmail";

function ensureTokenDirectory() {
    fs.mkdirSync(TOKEN_DIRECTORY, {recursive: true});
}

function getEncryptionKey() {
    const configured = String(process.env.FOLDERROCKET_TOKEN_ENCRYPTION_KEY ?? "").trim();
    if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
    try { return Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "hex"); }
    catch {
        ensureTokenDirectory();
        const key = crypto.randomBytes(32).toString("hex");
        fs.writeFileSync(KEY_PATH, key, {encoding: "utf8", mode: 0o600});
        return Buffer.from(key, "hex");
    }
}

function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return {iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64")};
}

function decrypt(value) {
    if (!value || typeof value !== "object" || !value.iv || !value.tag || !value.data) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(value.iv, "base64"));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8"));
}

function readStore() {
    try {
        const value = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
        return value && typeof value === "object" ? value : {version: 2, users: {}};
    } catch { return {version: 2, users: {}}; }
}

function writeStore(data) {
    ensureTokenDirectory();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), {encoding: "utf8", mode: 0o600});
}

function isLegacyStore(data) {
    return !data.version && !data.users;
}

function migrateLegacyConnections(userId) {
    const data = readStore();
    if (!isLegacyStore(data)) return;
    const connections = {};
    for (const provider of ["gmail", "outlook"]) {
        if (data[provider]) connections[provider] = encrypt(data[provider]);
    }
    writeStore({version: 2, users: {[userId]: connections}});
}

function validBlockId(blockId) {
    return typeof blockId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(blockId);
}

function getConnection(provider, userId, blockId = "") {
    const data = readStore();
    if (isLegacyStore(data)) return null;
    try {
        const encrypted = provider === "gmail" && blockId === LEGACY_SHARED_GMAIL_ACCOUNT_ID
            ? data.users?.[userId]?.[provider]
            : validBlockId(blockId)
            ? data.users?.[userId]?.blocks?.[provider]?.[blockId]
            : data.users?.[userId]?.[provider];
        return decrypt(encrypted);
    }
    catch { return null; }
}

function saveConnection(provider, userId, connection, blockId = "") {
    const data = readStore();
    if (isLegacyStore(data)) throw new Error("Email tokens must be migrated before they can be saved.");
    data.version = 2;
    data.users = data.users && typeof data.users === "object" ? data.users : {};
    data.users[userId] = data.users[userId] && typeof data.users[userId] === "object" ? data.users[userId] : {};
    if (provider === "gmail" && blockId === LEGACY_SHARED_GMAIL_ACCOUNT_ID) {
        data.users[userId][provider] = encrypt(connection);
    } else if (validBlockId(blockId)) {
        data.users[userId].blocks = data.users[userId].blocks && typeof data.users[userId].blocks === "object" ? data.users[userId].blocks : {};
        data.users[userId].blocks[provider] = data.users[userId].blocks[provider] && typeof data.users[userId].blocks[provider] === "object" ? data.users[userId].blocks[provider] : {};
        data.users[userId].blocks[provider][blockId] = encrypt(connection);
    } else data.users[userId][provider] = encrypt(connection);
    writeStore(data);
}

function removeConnection(provider, userId, blockId = "") {
    const data = readStore();
    if (isLegacyStore(data)) return;
    if (data.users?.[userId]) {
        if (provider === "gmail" && blockId === LEGACY_SHARED_GMAIL_ACCOUNT_ID) {
            delete data.users[userId][provider];
        } else if (validBlockId(blockId)) {
            delete data.users[userId].blocks?.[provider]?.[blockId];
            if (data.users[userId].blocks?.[provider] && !Object.keys(data.users[userId].blocks[provider]).length) delete data.users[userId].blocks[provider];
            if (data.users[userId].blocks && !Object.keys(data.users[userId].blocks).length) delete data.users[userId].blocks;
        } else delete data.users[userId][provider];
        if (!Object.keys(data.users[userId]).length) delete data.users[userId];
        writeStore(data);
    }
}

function migrateLegacyConnectionToBlock(provider, userId, blockId) {
    if (!validBlockId(blockId)) return null;
    // Gmail credentials are selected by reference from each planet. Never
    // duplicate a token from another Gmail block during a read or migration.
    if (provider === "gmail") return null;
    const data = readStore();
    if (isLegacyStore(data)) return null;
    const user = data.users?.[userId];
    if (!user || typeof user !== "object") return null;
    const existing = user.blocks?.[provider]?.[blockId];
    if (existing) {
        try { return decrypt(existing); } catch { return null; }
    }
    const providerBlocks = user.blocks?.[provider];
    if (providerBlocks && Object.keys(providerBlocks).length >= 1) {
        const encrypted = providerBlocks[Object.keys(providerBlocks)[0]];
        user.blocks[provider] = {...providerBlocks, [blockId]: encrypted};
        writeStore(data);
        try { return decrypt(encrypted); } catch { return null; }
    }
    if (!user[provider]) return null;
    user.blocks = user.blocks && typeof user.blocks === "object" ? user.blocks : {};
    user.blocks[provider] = {[blockId]: user[provider]};
    delete user[provider];
    writeStore(data);
    try { return decrypt(user.blocks[provider][blockId]); } catch { return null; }
}

function listConnections(provider, userId) {
    if (!["gmail", "outlook"].includes(provider)) return [];
    const data = readStore();
    const user = data.users?.[userId];
    const blocks = user?.blocks?.[provider];
    const results = blocks && typeof blocks === "object" && !Array.isArray(blocks)
        ? Object.keys(blocks).filter(validBlockId).map(blockId => {
        try {
            const connection = decrypt(blocks[blockId]);
            return connection ? {
                blockId,
                email: typeof connection.email === "string" ? connection.email : "",
                originWorldId: typeof connection.originWorldId === "string" ? connection.originWorldId : "",
                originWorldName: typeof connection.originWorldName === "string" ? connection.originWorldName : ""
            } : null;
        } catch { return null; }
        }).filter(Boolean)
        : [];
    if (provider === "gmail" && user?.gmail) {
        try {
            const connection = decrypt(user.gmail);
            if (connection) results.push({
                blockId: LEGACY_SHARED_GMAIL_ACCOUNT_ID,
                email: typeof connection.email === "string" ? connection.email : "",
                originWorldId: "",
                originWorldName: "",
                legacyShared: true
            });
        } catch { /* Keep an unreadable legacy token out of the account picker. */ }
    }
    return results;
}

function saveConnectionEmail(provider, userId, blockId, email) {
    const connection = getConnection(provider, userId, blockId);
    const safeEmail = typeof email === "string" && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
    if (!connection || !safeEmail) return false;
    connection.email = safeEmail;
    saveConnection(provider, userId, connection, blockId);
    return true;
}

module.exports = {LEGACY_SHARED_GMAIL_ACCOUNT_ID, getConnection, listConnections, migrateLegacyConnectionToBlock, migrateLegacyConnections, removeConnection, saveConnection, saveConnectionEmail};
