const {listDashboardPreferences, writeDashboardPreferences} = require("./userPreferencesService");
const {normalizeEmailAlertSettings} = require("./emailAlertSettingsService");
const {evaluateGmailWarnings} = require("./gmailWarningService");
const {listAttachments: listGmailAttachments, listInboxMessages: listGmailInboxMessages} = require("./gmailService");
const {listAttachments: listOutlookAttachments, listInboxMessages: listOutlookInboxMessages} = require("./outlookService");
const {evaluateTeamsSourceRules} = require("./teamsWarningService");
const {appendDigestHistory, buildWorldActivityDigest, dueDigestKey, normalizeWorldActivityNotifications, sanitizeDigestText} = require("./worldActivityEmailService");

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

async function runTeamsRulesForWorld(worldId, world, userId, teamsSettings, now = new Date()) {
    const selected = world?.emailAccount;
    const blockId = selected?.provider === "outlook" && /^[a-zA-Z0-9_-]{1,120}$/.test(selected.blockId || "") ? selected.blockId : "";
    if (!worldId || !blockId) return false;
    const bucket = teamsSettings?.blocks?.[blockId];
    if (!bucket || bucket.accountBlockId !== blockId || !Array.isArray(bucket.rules)) return false;
    const dueRules = bucket.rules.filter(rule => scheduledRuleIsDue(rule, bucket.runtime, now)
        && rule.accountBlockId === blockId
        && rule.source?.id
        && ["chat","channel"].includes(rule.source.kind)
        && (rule.source.kind !== "channel" || rule.source.teamId));
    if (!dueRules.length) return false;
    bucket.runtime = bucket.runtime && typeof bucket.runtime === "object" ? bucket.runtime : {};
    bucket.runtime.rules = bucket.runtime.rules && typeof bucket.runtime.rules === "object" ? bucket.runtime.rules : {};
    const groups = new Map();
    for (const rule of dueRules) {
        const sourceKey = JSON.stringify(rule.source);
        const group = groups.get(sourceKey) || {source:rule.source,rules:[]};
        group.rules.push(rule);
        groups.set(sourceKey,group);
    }
    for (const group of groups.values()) {
        const seenByRule = Object.fromEntries(group.rules.map(rule => [rule.id,bucket.runtime.rules[rule.id]?.seenMessageIds || []]));
        try {
            const results = await evaluateTeamsSourceRules({rules:group.rules,userId,blockId,source:group.source,seenByRule,now});
            const byId = new Map(results.map(result => [result.ruleId,result]));
            for (const rule of group.rules) {
                const previous = bucket.runtime.rules[rule.id] && typeof bucket.runtime.rules[rule.id] === "object" ? bucket.runtime.rules[rule.id] : {};
                const result = byId.get(rule.id) || {ruleId:rule.id,total:0,newCount:0,messageIds:[],messages:[],error:""};
                bucket.runtime.rules[rule.id] = {
                    lastScheduledDay:localDayKey(now),
                    lastCheckedAt:now.toISOString(),
                    seenMessageIds:[...new Set([...(previous.seenMessageIds || []),...(result.messageIds || [])])].slice(-500),
                    result:{...result,messages:(result.messages || []).slice(0,50)},
                    error:result.error || ""
                };
            }
        } catch (error) {
            for (const rule of group.rules) {
                const previous = bucket.runtime.rules[rule.id] && typeof bucket.runtime.rules[rule.id] === "object" ? bucket.runtime.rules[rule.id] : {};
                const status=Number(error?.status);
                const safeError=status===401||status===403
                    ? "Reconnect the Microsoft account selected for this planet and approve Teams permissions."
                    : status===429
                        ? "Microsoft Teams is temporarily rate-limited. The next scheduled check will retry."
                        : "FolderRocket could not check this Teams alert source.";
                bucket.runtime.rules[rule.id] = {...previous,lastScheduledDay:localDayKey(now),lastCheckedAt:now.toISOString(),error:safeError};
            }
        }
    }
    return true;
}

async function runWorldActivityDigest(userId, worldId, worldName, worldSettings, persist, dependencies = {}) {
    const saved = worldSettings?.activityNotifications;
    if (!saved || typeof saved !== "object") return false;
    const config = normalizeWorldActivityNotifications(saved);
    const runtime = saved.runtime && typeof saved.runtime === "object" ? saved.runtime : {};
    const now = typeof dependencies.now === "function" ? dependencies.now() : new Date();
    const scheduleKey = dueDigestKey(config, runtime, now);
    if (!scheduleKey) return false;
    const pending = {...runtime, pendingKey:scheduleKey, pendingAt:now.toISOString(), attemptKey:scheduleKey, attempts:(runtime.attemptKey === scheduleKey ? Number(runtime.attempts || 0) : 0) + 1, lastAttemptAt:now.toISOString(), lastStatus:"sending", lastError:""};
    const pendingConfig = {...saved, ...config, runtime:pending};
    await persist({...worldSettings, activityNotifications:pendingConfig});
    const digest = buildWorldActivityDigest({worldName, config, snapshot:saved.snapshot, emailAlerts:worldSettings.emailAlerts, now});
    try {
        const service = dependencies[config.senderProvider] || (config.senderProvider === "gmail" ? require("./gmailService") : require("./outlookService"));
        await service.sendEmail({to:config.recipient, subject:digest.subject, text:digest.text}, userId, config.senderBlockId);
        const complete = appendDigestHistory({...pending, pendingKey:"", pendingAt:"", lastSentKey:scheduleKey, lastSentAt:now.toISOString(), lastStatus:"sent", lastError:"", nextAttemptAt:""}, {at:now.toISOString(),kind:"scheduled",status:"sent"});
        await persist({...worldSettings, activityNotifications:{...pendingConfig, runtime:complete}});
    } catch (error) {
        const retryableThrottle = Number(error?.status) === 429;
        const definitiveRejection = Number.isFinite(Number(error?.status)) && ![408, 429].includes(Number(error.status)) && Number(error.status) < 500;
        const failed = {...pending, lastStatus:retryableThrottle ? "retrying" : definitiveRejection ? "failed" : "delivery-uncertain", lastError:String(error instanceof Error ? error.message : "Digest send failed.").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,500)};
        if (retryableThrottle) {
            failed.pendingKey = ""; failed.pendingAt = "";
            if (failed.attempts < 3) failed.nextAttemptAt = new Date(now.getTime() + Math.min(30, 5 * failed.attempts) * 60_000).toISOString();
            else { failed.lastStatus = "failed"; failed.nextAttemptAt = ""; }
        } else if (definitiveRejection) {
            failed.pendingKey = ""; failed.pendingAt = ""; failed.attempts = 3; failed.nextAttemptAt = "";
        } else {
            // A timeout or transport/5xx failure can happen after the provider accepted the message.
            // Keep the delivery key pending for human review instead of risking a duplicate.
            failed.nextAttemptAt = "";
        }
        failed.lastError = sanitizeDigestText(failed.lastError, 300);
        Object.assign(failed, appendDigestHistory(failed, {at:now.toISOString(),kind:"scheduled",status:failed.lastStatus,error:failed.lastError}));
        await persist({...worldSettings, activityNotifications:{...pendingConfig, runtime:failed}});
    }
    return true;
}

async function runScheduledEmailAlerts() {
    for (const record of listDashboardPreferences()) {
        if (runningUsers.has(record.userId)) continue;
        const settings = record.settings;
        const worldSettings = settings?.worlds && typeof settings.worlds === "object" ? settings.worlds : {};
        const worldContexts = Object.entries(worldSettings)
            .filter(([, value]) => value && typeof value === "object" && (value.emailAlerts || value.activityNotifications))
            .map(([worldId, value]) => ({worldId, world:value, alerts: normalizeEmailAlertSettings(value.emailAlerts)}));
        const contexts = worldContexts.length
            ? worldContexts
            : [{worldId: "", alerts: normalizeEmailAlertSettings(settings?.emailAlerts)}];
        const hasDueRule = contexts.some(({alerts,worldId,world}) => ["gmail", "outlook"].some(provider =>
            [alerts[provider], ...Object.values(alerts[provider].blocks ?? {})]
                .some(providerSettings => providerSettings.rules.some(rule => scheduledRuleIsDue(rule, providerSettings.runtime)))
        ) || Boolean(worldId && world?.emailAccount?.provider === "outlook" && (() => {
            const blockId = world.emailAccount.blockId;
            const bucket = alerts.teams.blocks?.[blockId];
            return bucket?.accountBlockId === blockId && bucket.rules?.some(rule => scheduledRuleIsDue(rule,bucket.runtime) && rule.accountBlockId === blockId);
        })()));
        const hasDueDigest = Object.entries(worldSettings).some(([, value]) => value && dueDigestKey(value.activityNotifications, value.activityNotifications?.runtime));
        if (!hasDueRule && !hasDueDigest) continue;
        runningUsers.add(record.userId);
        try {
            let changed = false;
            let next = {...settings};
            for (const context of contexts) {
                const gmailChanged = await runProviderRulesForBlocks("gmail", context.alerts.gmail, record.userId);
                const outlookChanged = await runProviderRulesForBlocks("outlook", context.alerts.outlook, record.userId);
                const teamsChanged = context.worldId ? await runTeamsRulesForWorld(context.worldId,context.world,record.userId,context.alerts.teams) : false;
                if (!gmailChanged && !outlookChanged && !teamsChanged) continue;
                changed = true;
                if (context.worldId) {
                    next = {...next, worlds: {...next.worlds, [context.worldId]: {...next.worlds[context.worldId], emailAlerts: context.alerts}}};
                } else {
                    next = {...next, emailAlerts: context.alerts};
                }
            }
            if (changed) writeDashboardPreferences(record.userId, next);
            for (const [worldId, world] of Object.entries(next.worlds || {})) {
                if (!world?.activityNotifications) continue;
                try {
                    await runWorldActivityDigest(record.userId, worldId, world.name || worldId, world, async changedWorld => {
                        next = {...next, worlds:{...next.worlds, [worldId]:changedWorld}};
                        writeDashboardPreferences(record.userId, next);
                    });
                } catch (error) {
                    console.error("Scheduled world digest error:", error instanceof Error ? error.message : error);
                }
            }
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

module.exports = {runScheduledEmailAlerts, runWorldActivityDigest, runTeamsRulesForWorld, startEmailAlertScheduler};
