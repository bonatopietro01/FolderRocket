const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {getRuntimeDataDirectory} = require("./runtimePaths");

const STORE_VERSION = 1;
const MAX_KNOWN_IDS = 10000;
const MAX_PENDING_IDS = 5000;
const RENAME_RETRY_DELAYS_MS = [15, 40, 90];
const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function digest(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function userFile(userId, dataDirectory = getRuntimeDataDirectory()) {
    return path.join(dataDirectory, "conversation-notifications", `${digest(userId)}.json`);
}

function normalizedScope(input) {
    const scope = {
        userId:typeof input?.userId === "string" ? input.userId.trim() : "",
        worldId:typeof input?.worldId === "string" ? input.worldId.trim() : "",
        provider:typeof input?.provider === "string" ? input.provider.trim().toLowerCase() : "",
        accountId:typeof input?.accountId === "string" ? input.accountId.trim() : "",
        threadId:typeof input?.threadId === "string" ? input.threadId.trim() : ""
    };
    if (!scope.userId || !scope.worldId || !["gmail", "outlook"].includes(scope.provider) || !scope.accountId || !scope.threadId) {
        throw new TypeError("A user, planet, supported provider, selected account, and thread are required.");
    }
    return scope;
}

function scopeKey(scope) {
    return digest([scope.userId, scope.worldId, scope.provider, scope.accountId, scope.threadId].join("\0"));
}

function normalizeMessageIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.flatMap(item => {
        if (typeof item !== "string") return [];
        const id = item.trim();
        return id && id.length <= 512 ? [id] : [];
    }))];
}

async function readStore(file) {
    try {
        const parsed = JSON.parse(await fs.readFile(file, "utf8"));
        if (parsed?.version !== STORE_VERSION || !parsed.scopes || typeof parsed.scopes !== "object" || Array.isArray(parsed.scopes)) {
            return {version:STORE_VERSION, scopes:{}};
        }
        return parsed;
    } catch (error) {
        if (error?.code === "ENOENT") return {version:STORE_VERSION, scopes:{}};
        throw error;
    }
}

async function writeStore(file, store, {renameImpl = fs.rename, sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
    await fs.mkdir(path.dirname(file), {recursive:true});
    const temporaryPath = `${file}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, JSON.stringify(store), {encoding:"utf8", mode:0o600});
    } catch (error) {
        await fs.rm(temporaryPath, {force:true}).catch(() => {});
        throw error;
    }

    for (let attempt = 0; ; attempt += 1) {
        try {
            await renameImpl(temporaryPath, file);
            return;
        } catch (error) {
            if (!TRANSIENT_RENAME_CODES.has(error?.code)) {
                await fs.rm(temporaryPath, {force:true}).catch(() => {});
                throw error;
            }
            const delay = RENAME_RETRY_DELAYS_MS[attempt];
            if (delay === undefined) {
                // Keep the fully-written temporary store for recovery. Never
                // fall back to a non-atomic write or remove the previous file.
                throw error;
            }
            await sleepImpl(delay);
        }
    }
}

function createConversationNotificationService({getDataDirectory = getRuntimeDataDirectory, renameImpl = fs.rename, sleepImpl} = {}) {
    const writeQueues = new Map();

    function enqueue(userId, operation) {
        const file = userFile(userId, getDataDirectory());
        const previous = writeQueues.get(file) || Promise.resolve();
        const queued = previous.catch(() => {}).then(() => operation(file));
        let safe;
        safe = queued.finally(() => {
            if (writeQueues.get(file) === safe) writeQueues.delete(file);
        });
        writeQueues.set(file, safe);
        return safe;
    }

    async function recordMessages(input, options = {}) {
        const scope = normalizedScope(input);
        const mode = options.mode || input?.mode || "sync";
        if (!["baseline", "sync", "history"].includes(mode)) {
            throw new TypeError("Notification observation mode must be baseline, sync, or history.");
        }
        const messageIds = normalizeMessageIds(input?.messageIds);
        return enqueue(scope.userId, async file => {
            const store = await readStore(file);
            const key = scopeKey(scope);
            const previous = store.scopes[key];
            const known = new Set(Array.isArray(previous?.knownMessageIds) ? previous.knownMessageIds : []);
            const pending = new Set(Array.isArray(previous?.pendingMessageIds) ? previous.pendingMessageIds : []);
            const initialized = previous?.initialized === true;
            const newlyObserved = initialized && mode === "sync"
                ? messageIds.filter(id => !known.has(id))
                : [];

            for (const id of messageIds) known.add(id);
            for (const id of newlyObserved) pending.add(id);

            const next = {
                initialized:true,
                knownMessageIds:[...known].slice(-MAX_KNOWN_IDS),
                pendingMessageIds:[...pending].slice(-MAX_PENDING_IDS),
                updatedAt:new Date().toISOString()
            };
            store.scopes[key] = next;
            await writeStore(file, store, {renameImpl, ...(sleepImpl ? {sleepImpl} : {})});
            return {
                initialized:!initialized,
                newMessageIds:newlyObserved,
                pendingMessageIds:next.pendingMessageIds,
                count:next.pendingMessageIds.length
            };
        });
    }

    async function getPendingMessages(input) {
        const scope = normalizedScope(input);
        return enqueue(scope.userId, async file => {
            const store = await readStore(file);
            const pendingMessageIds = store.scopes[scopeKey(scope)]?.pendingMessageIds;
            const ids = Array.isArray(pendingMessageIds) ? pendingMessageIds : [];
            return {pendingMessageIds:ids, count:ids.length};
        });
    }

    async function acknowledgeMessages(input) {
        const scope = normalizedScope(input);
        const requested = normalizeMessageIds(input?.messageIds);
        const acknowledgeAll = !Array.isArray(input?.messageIds);
        return enqueue(scope.userId, async file => {
            const store = await readStore(file);
            const key = scopeKey(scope);
            const previous = store.scopes[key];
            if (!previous) return {pendingMessageIds:[], count:0};
            const pending = new Set(Array.isArray(previous.pendingMessageIds) ? previous.pendingMessageIds : []);
            if (acknowledgeAll) pending.clear();
            else for (const id of requested) pending.delete(id);
            store.scopes[key] = {...previous, pendingMessageIds:[...pending], updatedAt:new Date().toISOString()};
            await writeStore(file, store, {renameImpl, ...(sleepImpl ? {sleepImpl} : {})});
            return {pendingMessageIds:store.scopes[key].pendingMessageIds, count:pending.size};
        });
    }

    return {recordMessages, getPendingMessages, acknowledgeMessages};
}

const service = createConversationNotificationService();

module.exports = {...service, createConversationNotificationService};
