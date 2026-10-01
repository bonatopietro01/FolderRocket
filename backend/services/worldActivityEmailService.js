const ALLOWED_SOURCES = new Set(["dailyActivities", "reminders", "calendar", "gmailAlerts", "outlookAlerts", "teams"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeDigestText(value, limit) {
    return String(value ?? "").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").replace(/((?:access|refresh)[_-]?token|client[_-]?secret|token|authorization)\s*[:=]\s*[^&\s]+/gi,"$1=[redacted]").replace(/[\r\n\t]+/g," ").trim().slice(0,limit);
}

function validTimeZone(value) {
    try { new Intl.DateTimeFormat("en-US", {timeZone:value}).format(new Date()); return true; }
    catch { return false; }
}

function normalizeWorldActivityNotifications(value, now = new Date()) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const timeZone = typeof input.timeZone === "string" && validTimeZone(input.timeZone) ? input.timeZone : "UTC";
    const sources = Array.isArray(input.sources) ? [...new Set(input.sources.filter(source => ALLOWED_SOURCES.has(source)))] : [];
    return {
        enabled: input.enabled === true,
        senderProvider: ["gmail", "outlook"].includes(input.senderProvider) ? input.senderProvider : "",
        senderBlockId: typeof input.senderBlockId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(input.senderBlockId) ? input.senderBlockId : "",
        recipient: typeof input.recipient === "string" ? input.recipient.trim().slice(0, 254) : "",
        everyDays: Number.isFinite(Number(input.everyDays)) ? Math.max(1, Math.min(30, Math.round(Number(input.everyDays)))) : 1,
        time: typeof input.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : "08:00",
        timeZone,
        calendarWindow: ["today", "tomorrow", "week"].includes(input.calendarWindow) ? input.calendarWindow : "today",
        sources,
        anchorDate: typeof input.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate) ? input.anchorDate : localDateKey(now, timeZone)
    };
}

function sanitizeActivitySnapshot(value) {
    const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const cleanDate = value => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : "";
    const activities = Array.isArray(input.activities) ? input.activities.slice(-300).flatMap(item => {
        if (!item || typeof item !== "object" || typeof item.summary !== "string") return [];
        const at = cleanDate(item.at); if (!at) return [];
        const kind = ["gmail", "outlook", "recent", "phone", "domain", "usb", "fire", "studio", "folders", "applications", "teams"].includes(item.kind) ? item.kind : "recent";
        return [{at, kind, summary:sanitizeDigestText(item.summary, 240)}];
    }) : [];
    const calendarEvents = Array.isArray(input.calendarEvents) ? input.calendarEvents.slice(0, 120).flatMap(event => {
        if (!event || typeof event !== "object") return [];
        const start = cleanDate(event.start); if (!start) return [];
        return [{title:typeof event.title === "string" ? sanitizeDigestText(event.title, 160) || "Calendar event" : "Calendar event", start, end:cleanDate(event.end)}];
    }) : [];
    const reminders = Array.isArray(input.reminders) ? input.reminders.slice(0, 120).flatMap(note => {
        if (!note || typeof note !== "object") return [];
        const at = cleanDate(note.at); if (!at) return [];
        return [{at, title:typeof note.title === "string" ? sanitizeDigestText(note.title, 120) || "Reminder" : "Reminder"}];
    }) : [];
    return {updatedAt:cleanDate(input.updatedAt) || new Date().toISOString(), activities, calendarEvents, reminders};
}

function selectActivitySnapshotSources(value, sources = []) {
    const snapshot = sanitizeActivitySnapshot(value);
    const enabled = new Set(Array.isArray(sources) ? sources : []);
    return {
        ...snapshot,
        activities:snapshot.activities.filter(item => item.kind === "teams" ? enabled.has("teams") : enabled.has("dailyActivities")),
        calendarEvents:enabled.has("calendar") ? snapshot.calendarEvents : [],
        reminders:enabled.has("reminders") ? snapshot.reminders : []
    };
}

function localDateKey(date, timeZone = "UTC") {
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function localClock(date, timeZone = "UTC") {
    const parts = new Intl.DateTimeFormat("en-GB", {timeZone, hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.hour}:${values.minute}`;
}

function ordinal(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dueDigestKey(configValue, runtime = {}, now = new Date()) {
    const config = normalizeWorldActivityNotifications(configValue, now);
    if (!config.enabled || !config.senderProvider || !config.senderBlockId || !EMAIL_PATTERN.test(config.recipient) || !config.sources.length) return "";
    const today = localDateKey(now, config.timeZone);
    if (localClock(now, config.timeZone) < config.time) return "";
    if ((ordinal(today) - ordinal(config.anchorDate)) % config.everyDays !== 0) return "";
    if (runtime.lastSentKey === today || runtime.pendingKey === today) return "";
    const nextAttemptAt = Date.parse(runtime.nextAttemptAt || "");
    if (Number.isFinite(nextAttemptAt) && nextAttemptAt > now.getTime()) return "";
    if (Number(runtime.attempts || 0) >= 3 && runtime.attemptKey === today) return "";
    return today;
}

function localDateTimeToUtc(dateKey, time, timeZone) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const targetWallTime = Date.UTC(year, month - 1, day, hour, minute);
    let candidate = targetWallTime;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts(new Date(candidate));
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        const representedWallTime = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
        const correction = targetWallTime - representedWallTime;
        if (!correction) return new Date(candidate);
        candidate += correction;
    }
    return new Date(candidate);
}

function nextDigestAt(configValue, runtime = {}, now = new Date()) {
    const config = normalizeWorldActivityNotifications(configValue, now);
    if (!config.enabled || !config.senderProvider || !config.senderBlockId || !EMAIL_PATTERN.test(config.recipient) || !config.sources.length) return null;
    const today = localDateKey(now, config.timeZone);
    const todayOrdinal = ordinal(today);
    for (let offset = 0; offset <= 60; offset += 1) {
        const date = new Date((todayOrdinal + offset) * 86400000);
        const dateKey = date.toISOString().slice(0, 10);
        if ((ordinal(dateKey) - ordinal(config.anchorDate)) % config.everyDays !== 0) continue;
        if (runtime.lastSentKey === dateKey || runtime.pendingKey === dateKey) continue;
        if (Number(runtime.attempts || 0) >= 3 && runtime.attemptKey === dateKey) continue;
        let candidate = localDateTimeToUtc(dateKey, config.time, config.timeZone);
        const retryAt = Date.parse(runtime.nextAttemptAt || "");
        if (runtime.attemptKey === dateKey && Number.isFinite(retryAt) && retryAt > now.getTime()) candidate = new Date(Math.max(candidate.getTime(), retryAt));
        if (candidate <= now) continue;
        return candidate.toISOString();
    }
    return null;
}

function withinLocalDate(value, dateKey, timeZone) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) && localDateKey(new Date(time), timeZone) === dateKey;
}

function buildWorldActivityDigest({worldName = "Workspace", config:configValue, snapshot:snapshotValue, emailAlerts = {}, now = new Date()}) {
    const config = normalizeWorldActivityNotifications(configValue, now);
    const snapshot = sanitizeActivitySnapshot(snapshotValue);
    const sections = [];
    const dateKey = localDateKey(now, config.timeZone);
    if (config.sources.includes("dailyActivities")) {
        const dayAgo = now.getTime() - 86400000;
        const activities = snapshot.activities.filter(item => Date.parse(item.at) >= dayAgo && Date.parse(item.at) <= now.getTime()).slice(-50);
        sections.push(["Recent workspace activity", ...activities.map(item => `• ${item.summary}`)].join("\n"));
    }
    if (config.sources.includes("teams")) {
        const teams = snapshot.activities.filter(item => item.kind === "teams" && Date.parse(item.at) >= now.getTime() - 86400000 && Date.parse(item.at) <= now.getTime()).slice(-30);
        sections.push(["Teams activity", ...teams.map(item => `• ${item.summary}`)].join("\n"));
    }
    if (config.sources.includes("reminders")) {
        const reminders = snapshot.reminders.filter(item => withinLocalDate(item.at, dateKey, config.timeZone));
        sections.push(["Reminders due today", ...reminders.map(item => `• ${item.title} · ${localClock(new Date(item.at), config.timeZone)}`)].join("\n"));
    }
    if (config.sources.includes("calendar")) {
        const todayOrdinal = ordinal(dateKey);
        const firstDay = config.calendarWindow === "tomorrow" ? todayOrdinal + 1 : config.calendarWindow === "week" ? todayOrdinal - (new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7 : todayOrdinal;
        const lastDay = config.calendarWindow === "week" ? firstDay + 6 : firstDay;
        const events = snapshot.calendarEvents.filter(event => { const eventDay = ordinal(localDateKey(new Date(event.start), config.timeZone)); return eventDay >= firstDay && eventDay <= lastDay; });
        sections.push([`Calendar · ${config.calendarWindow}`, ...events.slice(0, 50).map(event => `• ${event.title} · ${localDateKey(new Date(event.start), config.timeZone)} ${localClock(new Date(event.start), config.timeZone)}`)].join("\n"));
    }
    for (const provider of ["gmail", "outlook"]) {
        const source = `${provider}Alerts`;
        if (!config.sources.includes(source)) continue;
        const value = emailAlerts?.[provider];
        const rules = [...(Array.isArray(value?.rules) ? value.rules : []), ...Object.values(value?.blocks || {}).flatMap(block => Array.isArray(block?.rules) ? block.rules : [])];
        const active = rules.map(rule => value?.runtime?.rules?.[rule.id]?.result || Object.values(value?.blocks || {}).map(block => block?.runtime?.rules?.[rule.id]?.result).find(Boolean)).filter(result => Number(result?.newCount) > 0);
        const count = active.reduce((sum, result) => sum + Math.min(1000, Number(result.newCount) || 0), 0);
        sections.push([`${provider.toUpperCase()} alerts`, `• ${count} new match${count === 1 ? "" : "es"} in the latest saved alert checks`].join("\n"));
    }
    const body = [`${worldName} · FolderRocket daily update`, `${dateKey}`, "", ...sections.flatMap((section, index) => index ? ["", section] : [section]), "", "This message contains compact activity metadata only; no email or document body is included."].join("\n");
    return {subject:`FolderRocket · ${worldName} · ${dateKey}`, text:body.slice(0, 12000), snapshotUpdatedAt:snapshot.updatedAt};
}

function validForEnable(configValue, outlookCanSend = false) {
    const config = normalizeWorldActivityNotifications(configValue);
    if (!EMAIL_PATTERN.test(config.recipient)) throw new Error("Enter a valid digest recipient email address.");
    if (!config.senderProvider || !config.senderBlockId) throw new Error("Choose a connected sender account for this planet.");
    if (!config.sources.length) throw new Error("Select at least one digest source.");
    if (config.senderProvider === "outlook" && !outlookCanSend) throw new Error("Outlook needs explicit Mail.Send consent. Use the reconnect-for-sending action first.");
    return config;
}

function appendDigestHistory(runtimeValue, entry, limit = 25) {
    const runtime = runtimeValue && typeof runtimeValue === "object" ? runtimeValue : {};
    const history = Array.isArray(runtime.history) ? runtime.history : [];
    const cleanEntry = {
        at:typeof entry?.at === "string" && !Number.isNaN(Date.parse(entry.at)) ? new Date(entry.at).toISOString() : new Date().toISOString(),
        kind:entry?.kind === "test" ? "test" : "scheduled",
        status:["sent", "failed", "retrying", "delivery-uncertain"].includes(entry?.status) ? entry.status : "failed",
        error:entry?.error ? sanitizeDigestText(entry.error, 300) : ""
    };
    return {...runtime, history:[...history, cleanEntry].slice(-Math.max(1, Math.min(100, limit)))};
}

module.exports = {appendDigestHistory, buildWorldActivityDigest, dueDigestKey, localDateKey, nextDigestAt, normalizeWorldActivityNotifications, sanitizeActivitySnapshot, sanitizeDigestText, selectActivitySnapshotSources, validForEnable};
