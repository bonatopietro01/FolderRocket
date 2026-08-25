const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIRECTORY = path.join(__dirname, "..", "data");
const AUDIT_LOG_PATH = path.join(DATA_DIRECTORY, "audit-log.json");
const MAX_EVENTS = 500;

function readEvents() {
    try {
        const parsed = JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeEvents(events) {
    fs.mkdirSync(DATA_DIRECTORY, {recursive: true});
    fs.writeFileSync(
        AUDIT_LOG_PATH,
        JSON.stringify(events.slice(0, MAX_EVENTS), null, 2),
        {encoding: "utf8", mode: 0o600}
    );
}

function addAuditEvent({user, action, details = {}}) {
    if (!user?.id || !user?.email || typeof action !== "string") return null;

    const event = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        user: {
            id: user.id,
            email: user.email,
            role: user.role
        },
        action,
        details: details && typeof details === "object" && !Array.isArray(details) ? details : {}
    };

    const events = readEvents();
    events.unshift(event);
    writeEvents(events);
    return event;
}

function listAuditEvents({limit = 50} = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return readEvents().slice(0, safeLimit);
}

module.exports = {addAuditEvent, listAuditEvents};
