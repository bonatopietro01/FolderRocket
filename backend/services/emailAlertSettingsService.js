const {readDashboardPreferences, writeDashboardPreferences} = require("./userPreferencesService");

const ALERT_COLORS = new Set(["red", "orange", "yellow", "green", "blue", "purple"]);
const ALERT_KINDS = new Set(["ai", "sender"]);

function cleanText(value, limit = 500) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeAttachmentFilter(value) {
    const source = value && typeof value === "object" ? value : {};
    const mode = source.mode === "range" ? "range" : "relative";
    const days = Math.min(3650, Math.max(1, Math.floor(Number(source.days) || 7)));
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";
    return {mode, days, startDate: date(source.startDate), endDate: date(source.endDate)};
}

function normalizeAlertFilter(value) {
    const source = value && typeof value === "object" ? value : {};
    const mode = source.mode === "range" ? "range" : "hours";
    const hours = Math.min(8760, Math.max(1, Math.floor(Number(source.hours) || (Number(source.days) || 7) * 24)));
    const dateTime = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : "";
    const legacyDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";
    const startAt = dateTime(source.startAt) || (legacyDate(source.startDate) ? `${source.startDate}T00:00` : "");
    const endAt = dateTime(source.endAt) || (legacyDate(source.endDate) ? `${source.endDate}T23:59` : "");
    return {mode, hours, startAt, endAt};
}

function normalizeSchedule(value) {
    const source = value && typeof value === "object" ? value : {};
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(source.time || "") ? source.time : "09:00";
    const daysOfWeek = [...new Set((Array.isArray(source.daysOfWeek) ? source.daysOfWeek : [0, 1, 2, 3, 4, 5, 6])
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 6))]
        .sort((first, second) => first - second);
    return {
        enabled: Boolean(source.enabled),
        frequency: source.frequency === "daily" ? "daily" : "manual",
        time,
        daysOfWeek
    };
}

function normalizeRule(value) {
    if (!value || typeof value !== "object") return null;
    const id = cleanText(value.id, 100);
    const kind = ALERT_KINDS.has(value.kind) ? value.kind : "ai";
    const query = cleanText(value.query);
    if (!id || !query) return null;
    return {
        id,
        kind,
        query,
        label: cleanText(value.label, 100) || (kind === "ai" ? "AI alert" : "Sender list"),
        color: ALERT_COLORS.has(value.color) ? value.color : (kind === "ai" ? "red" : "green"),
        enabled: value.enabled !== false,
        favoriteId: cleanText(value.favoriteId, 100) || undefined,
        filter: normalizeAlertFilter(value.filter),
        schedule: normalizeSchedule(value.schedule)
    };
}

function normalizeProviderBlock(value) {
    const source = value && typeof value === "object" ? value : {};
    const attachmentSource = source.attachmentReader && typeof source.attachmentReader === "object"
        ? source.attachmentReader
        : {};
    return {
        attachmentReader: {
            enabled: attachmentSource.enabled !== false,
            filter: normalizeAttachmentFilter(attachmentSource.filter)
        },
        rules: (Array.isArray(source.rules) ? source.rules : [])
            .map(normalizeRule)
            .filter(Boolean)
            .slice(0, 20),
        runtime: source.runtime && typeof source.runtime === "object" ? source.runtime : {}
    };
}

function normalizeProvider(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawBlocks = source.blocks && typeof source.blocks === "object" && !Array.isArray(source.blocks)
        ? source.blocks
        : {};
    const blocks = Object.fromEntries(
        Object.entries(rawBlocks)
            .filter(([blockId, block]) => /^[a-zA-Z0-9_-]{1,120}$/.test(blockId) && block && typeof block === "object")
            .slice(0, 30)
            .map(([blockId, block]) => [blockId, normalizeProviderBlock(block)])
    );
    return {...normalizeProviderBlock(source), blocks};
}

function normalizeEmailAlertSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        favorites: (Array.isArray(source.favorites) ? source.favorites : [])
            .map(normalizeRule)
            .filter(Boolean)
            .slice(0, 30),
        gmail: normalizeProvider(source.gmail),
        outlook: normalizeProvider(source.outlook)
    };
}

function getEmailAlertSettings(userId) {
    return normalizeEmailAlertSettings(readDashboardPreferences(userId)?.emailAlerts);
}

function saveEmailAlertSettings(userId, value) {
    const current = readDashboardPreferences(userId) || {};
    const normalized = normalizeEmailAlertSettings(value);
    writeDashboardPreferences(userId, {...current, emailAlerts: normalized});
    return normalized;
}

module.exports = {
    getEmailAlertSettings,
    normalizeEmailAlertSettings,
    normalizeProvider,
    normalizeProviderBlock,
    saveEmailAlertSettings
};
