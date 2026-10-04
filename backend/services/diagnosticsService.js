const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {getRuntimeDataDirectory} = require("./runtimePaths");

const MAX_MESSAGE_LENGTH = 260;
const DEFAULT_MAX_EVENTS = 800;
const DEFAULT_RETENTION_DAYS = 30;
const writeQueues = new Map();
let storageWarning = false;

function configuredLimit(name, fallback, minimum, maximum) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback;
}

function diagnosticsLimits() {
    return {
        maxEvents: configuredLimit("FOLDERROCKET_DIAGNOSTICS_MAX_EVENTS", DEFAULT_MAX_EVENTS, 50, 10000),
        retentionDays: configuredLimit("FOLDERROCKET_DIAGNOSTICS_RETENTION_DAYS", DEFAULT_RETENTION_DAYS, 1, 365)
    };
}

function userFile(userId) {
    const safeId = crypto.createHash("sha256").update(String(userId || "anonymous")).digest("hex");
    return path.join(getRuntimeDataDirectory(), "diagnostics", `${safeId}.json`);
}

function safeText(value, max = MAX_MESSAGE_LENGTH) {
    return String(value || "")
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/\b(access[_-]?token|refresh[_-]?token|api[_-]?key|password)\s*[:=]\s*\S+/gi, "$1=[redacted]")
        .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted key]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .replace(/(?:[A-Z]:\\|\\\\|\/Users\/|\/home\/)[^\r\n"'<>(),;]+/gi, match => "[local path]" + (match.match(/\s+$/)?.[0] || ""))
        .replace(/[\r\n\t]+/g, " ")
        .slice(0, max);
}

function normalizeRecord(entry) {
    const allowedTypes = new Set(["http", "runtime", "unhandled-rejection", "performance", "backend", "electron"]);
    const status = entry.status !== null && entry.status !== undefined && Number.isFinite(Number(entry.status)) ? Number(entry.status) : null;
    return {
        id: safeText(entry.id || crypto.randomUUID(), 80),
        at: safeText(entry.at || new Date().toISOString(), 40),
        type: allowedTypes.has(entry.type) ? entry.type : "backend",
        severity: ["info", "warning", "error", "critical"].includes(entry.severity) ? entry.severity : (entry.type === "performance" ? "info" : status >= 500 ? "error" : "warning"),
        category: safeText(entry.category || entry.type || "backend", 50),
        message: safeText(entry.message || "Errore applicativo"),
        route: safeText(entry.route || "", 180),
        screen: safeText(entry.screen || "", 100),
        component: safeText(entry.component || "", 100),
        stack: safeText(entry.stack || "", 2000),
        method: safeText(entry.method || "", 10),
        status,
        worldId: /^[a-zA-Z0-9_-]{1,80}$/.test(String(entry.worldId || "")) ? String(entry.worldId) : "",
        requestId: safeText(entry.requestId || "", 80),
        durationMs: entry.durationMs !== null && entry.durationMs !== undefined && Number.isFinite(Number(entry.durationMs)) ? Math.max(0, Math.round(Number(entry.durationMs))) : null,
        resolved: Boolean(entry.resolved)
    };
}

function validEvents(events) {
    const limits = diagnosticsLimits();
    const cutoff = Date.now() - limits.retentionDays * 24 * 60 * 60 * 1000;
    return events.filter(item => item && typeof item.id === "string" && Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) >= cutoff)
        .slice(0, limits.maxEvents);
}

async function readFileEntries(file) {
    try {
        const entries = JSON.parse(await fs.readFile(file, "utf8"));
        return Array.isArray(entries) ? entries : [];
    } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
    }
}

async function writeFileEntries(file, entries) {
    await fs.mkdir(path.dirname(file), {recursive: true});
    const temporaryPath = `${file}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, JSON.stringify(entries), {encoding: "utf8", mode: 0o600});
        await fs.rename(temporaryPath, file);
    } catch (error) {
        await fs.rm(temporaryPath, {force: true}).catch(() => {});
        throw error;
    }
}

function enqueueForUser(userId, operation) {
    const file = userFile(userId);
    const previous = writeQueues.get(file) || Promise.resolve();
    const queued = previous.catch(() => {}).then(() => operation(file));
    let safe;
    safe = queued.catch(() => null).finally(() => {
        if (writeQueues.get(file) === safe) writeQueues.delete(file);
    });
    writeQueues.set(file, safe);
    return safe;
}

function recordDiagnostic(userId, entry) {
    if (!userId || !entry || typeof entry !== "object") return Promise.resolve(null);
    const record = normalizeRecord(entry);
    return enqueueForUser(userId, async file => {
        try {
            const current = await readFileEntries(file);
            await writeFileEntries(file, validEvents([record, ...current]));
            storageWarning = false;
            return record;
        } catch {
            // A diagnostics failure must never become an application failure.
            storageWarning = true;
            return null;
        }
    });
}

function listDiagnostics(userId, limit = 300) {
    const safeLimit = Math.min(diagnosticsLimits().maxEvents, Math.max(1, Number(limit) || 300));
    return enqueueForUser(userId, async file => {
        try {
            const current = await readFileEntries(file);
            const valid = validEvents(current);
            if (valid.length !== current.length) await writeFileEntries(file, valid);
            return valid.slice(0, safeLimit);
        } catch { storageWarning = true; return []; }
    });
}

function clearDiagnostics(userId) {
    return enqueueForUser(userId, async file => {
        try { await fs.rm(file, {force: true}); storageWarning = false; return true; }
        catch { storageWarning = true; return false; }
    }).then(result => result === true);
}

async function flushDiagnostics() {
    await Promise.all([...writeQueues.values()].map(queue => queue.catch(() => null)));
}

function hasStorageWarning() { return storageWarning; }

module.exports = {recordDiagnostic, listDiagnostics, clearDiagnostics, diagnosticsLimits, flushDiagnostics, hasStorageWarning, safeText};
