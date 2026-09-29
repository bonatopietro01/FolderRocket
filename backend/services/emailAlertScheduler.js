const {listDashboardPreferences, writeDashboardPreferences} = require("./userPreferencesService");
const {normalizeEmailAlertSettings} = require("./emailAlertSettingsService");
const {evaluateGmailWarnings} = require("./gmailWarningService");
const {listAttachments: listGmailAttachments, listInboxMessages: listGmailInboxMessages} = require("./gmailService");
const {listAttachments: listOutlookAttachments, listInboxMessages: listOutlookInboxMessages} = require("./outlookService");

const CHECK_INTERVAL_MS = 30_000;
const runningUsers = new Set();

function localDayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function localTimeKey(date = new Date()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function scheduledRuleIsDue(rule, runtime, now = new Date()) {
    if (rule?.enabled === false || !rule?.schedule?.enabled || rule.schedule.frequency !== "daily") return false;
    const selectedDays = Array.isArray(rule.schedule.daysOfWeek) ? rule.schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
    if (!selectedDays.includes(now.getDay())) return false;
    const dayKey = localDayKey(now);
    const lastRun = runtime?.rules?.[rule.id]?.lastScheduledDay;
    return lastRun !== dayKey && localTimeKey(now) >= rule.schedule.time;
}

async function readProviderMessages(provider, filter, userId, needsText, blockId = "") {
    if (provider === "gmail") {
        return listGmailInboxMessages(filter, {includeText: needsText}, userId, blockId);
    }
    return listOutlookInboxMessages(filter, userId, blockId);
}

async function readProviderAttachments(provider, filter, userId, blockId = "") {
    return provider === "gmail"
        ? listGmailAttachments(filter, userId, blockId)
        : listOutlookAttachments(filter, userId, blockId);
}

async function runProviderRules(provider, providerSettings, userId, blockId = "") {
    const runtime = providerSettings.runtime && typeof providerSettings.runtime === "object"
        ? providerSettings.runtime
        : {};
    const dueRules = providerSettings.rules.filter(rule => scheduledRuleIsDue(rule, runtime));
    if (!dueRules.length) return false;
    // Gmail's null selection must not fall back to a block-local or legacy
    // shared connection. Leave Outlook's existing block selection untouched.
    if (provider === "gmail" && providerSettings.accountBlockId === null) return false;
    const credentialBlockId = provider === "gmail"
        ? (/^[a-zA-Z0-9_-]{1,120}$/.test(providerSettings.accountBlockId || "") ? providerSettings.accountBlockId : blockId)
        : blockId;
    if (provider === "gmail" && !credentialBlockId) return false;

    runtime.rules = runtime.rules && typeof runtime.rules === "object" ? runtime.rules : {};
    if (provider === "gmail") runtime.accountBlockId = credentialBlockId;
    const now = new Date();
    for (const rule of dueRules) {
        const previous = runtime.rules[rule.id] && typeof runtime.rules[rule.id] === "object"
            ? runtime.rules[rule.id]
            : {};
        try {
            const messages = await readProviderMessages(provider, rule.filter, userId, rule.kind === "ai", credentialBlockId);
            const evaluated = await evaluateGmailWarnings({
                rules: [rule],
                messages,
                seenByRule: {[rule.id]: previous.seenMessageIds || []}
            });
            const result = evaluated[0] || {ruleId: rule.id, total: 0, newCount: 0, messageIds: [], messages: []};
            const attachments = await readProviderAttachments(provider, rule.filter, userId, credentialBlockId);
            const messageIds = new Set(result.messageIds || []);
            runtime.rules[rule.id] = {
                lastScheduledDay: localDayKey(now),
                lastCheckedAt: now.toISOString(),
                seenMessageIds: [...new Set([...(previous.seenMessageIds || []), ...(result.messageIds || [])])].slice(-500),
                result: {...result, messages: (result.messages || []).slice(0, 100)},
                attachments: attachments.filter(attachment => messageIds.has(attachment.messageId)).slice(0, 100),
                error: result.error || ""
            };
        } catch (error) {
            runtime.rules[rule.id] = {
                ...previous,
                lastScheduledDay: localDayKey(now),
                lastCheckedAt: now.toISOString(),
                error: error instanceof Error ? error.message : "Scheduled email alert failed."
            };
        }
    }
    providerSettings.runtime = runtime;
    return true;
}

async function runProviderRulesForBlocks(provider, providerSettings, userId) {
    let changed = await runProviderRules(provider, providerSettings, userId);
    for (const [blockId, blockSettings] of Object.entries(providerSettings.blocks ?? {})) {
        if (await runProviderRules(provider, blockSettings, userId, blockId)) changed = true;
    }
    return changed;
}

async function runScheduledEmailAlerts() {
    for (const record of listDashboardPreferences()) {
        if (runningUsers.has(record.userId)) continue;
        const settings = record.settings;
        const worldSettings = settings?.worlds && typeof settings.worlds === "object" ? settings.worlds : {};
        const worldContexts = Object.entries(worldSettings)
            .filter(([, value]) => value && typeof value === "object" && value.emailAlerts)
            .map(([worldId, value]) => ({worldId, alerts: normalizeEmailAlertSettings(value.emailAlerts)}));
        const contexts = worldContexts.length
            ? worldContexts
            : [{worldId: "", alerts: normalizeEmailAlertSettings(settings?.emailAlerts)}];
        const hasDueRule = contexts.some(({alerts}) => ["gmail", "outlook"].some(provider =>
            [alerts[provider], ...Object.values(alerts[provider].blocks ?? {})]
                .some(providerSettings => providerSettings.rules.some(rule => scheduledRuleIsDue(rule, providerSettings.runtime)))
        ));
        if (!hasDueRule) continue;
        runningUsers.add(record.userId);
        try {
            let changed = false;
            let next = {...settings};
            for (const context of contexts) {
                const gmailChanged = await runProviderRulesForBlocks("gmail", context.alerts.gmail, record.userId);
                const outlookChanged = await runProviderRulesForBlocks("outlook", context.alerts.outlook, record.userId);
                if (!gmailChanged && !outlookChanged) continue;
                changed = true;
                if (context.worldId) {
                    next = {...next, worlds: {...next.worlds, [context.worldId]: {...next.worlds[context.worldId], emailAlerts: context.alerts}}};
                } else {
                    next = {...next, emailAlerts: context.alerts};
                }
            }
            if (changed) writeDashboardPreferences(record.userId, next);
        } catch (error) {
            console.error("Scheduled email-alert error:", error instanceof Error ? error.message : error);
        } finally {
            runningUsers.delete(record.userId);
        }
    }
}

function startEmailAlertScheduler() {
    const timer = setInterval(() => void runScheduledEmailAlerts(), CHECK_INTERVAL_MS);
    timer.unref?.();
    setTimeout(() => void runScheduledEmailAlerts(), 5_000).unref?.();
}

module.exports = {runScheduledEmailAlerts, startEmailAlertScheduler};
