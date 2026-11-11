const {evaluateGmailWarnings} = require("./gmailWarningService");
const {listTeamsMessagesForAlerts} = require("../integrations/outlookService");

function alertWindow(filter, now = new Date()) {
    if (filter?.mode === "range") {
        const from = filter.startAt ? Date.parse(filter.startAt) : null;
        const to = filter.endAt ? Date.parse(filter.endAt) : null;
        if ((filter.startAt && !Number.isFinite(from)) || (filter.endAt && !Number.isFinite(to)) || (from === null && to === null)) return {from:Infinity,to:-Infinity};
        return {from:Number.isFinite(from) ? from : null,to:Number.isFinite(to) ? to : null};
    }
    const hours = Math.min(8760, Math.max(1, Math.floor(Number(filter?.hours) || 168)));
    return {from:now.getTime() - hours * 60 * 60 * 1000,to:null};
}

function filterTeamsAlertMessages(messages, filter, now = new Date()) {
    const window = alertWindow(filter, now);
    return messages.filter(message => {
        const at = Date.parse(message.createdAt || "");
        if (!Number.isFinite(at)) return false;
        return !(window.from !== null && at < window.from) && !(window.to !== null && at > window.to);
    }).slice(0, 50).map(message => ({
        id:message.id,
        sender:[message.sender, message.senderEmail].filter(Boolean).join(" "),
        subject:"",
        receivedAt:message.createdAt,
        text:String(message.text || "").slice(0, 1200),
        webLink:""
    }));
}

async function evaluateTeamsWarnings({rules, messages, seenByRule = {}, now = new Date()}) {
    const enabledRules = (Array.isArray(rules) ? rules : []).filter(rule => rule && rule.enabled !== false && rule.accountBlockId && rule.source?.id).slice(0, 20);
    const results = [];
    for (const rule of enabledRules) {
        const filteredMessages = filterTeamsAlertMessages(messages, rule.filter, now);
        const evaluated = await evaluateGmailWarnings({rules:[rule],messages:filteredMessages,seenByRule:{[rule.id]:seenByRule?.[rule.id] || []}});
        const result = evaluated[0] || {ruleId:rule.id,total:0,newCount:0,messageIds:[],messages:[],error:""};
        results.push({...result,messages:(result.messages || []).slice(0,50)});
    }
    return results;
}

async function evaluateTeamsSourceRules({rules,userId,blockId,source,seenByRule = {},now = new Date(),listMessages = listTeamsMessagesForAlerts,evaluate = evaluateTeamsWarnings}) {
    const selectedRules = (Array.isArray(rules) ? rules : []).filter(rule => rule?.enabled !== false
        && rule?.accountBlockId === blockId
        && rule?.source?.kind === source?.kind
        && rule?.source?.id === source?.id
        && (source?.kind !== "channel" || rule?.source?.teamId === source?.teamId)).slice(0,20);
    if (!selectedRules.length) return [];
    const messages = await listMessages(source,userId,blockId);
    return evaluate({rules:selectedRules,messages,seenByRule,now});
}

module.exports = {alertWindow, filterTeamsAlertMessages, evaluateTeamsWarnings, evaluateTeamsSourceRules};
