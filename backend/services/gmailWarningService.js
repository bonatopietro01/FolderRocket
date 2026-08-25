require("dotenv").config();

const OpenAI = require("openai");

function getClient() {
    const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
    return apiKey ? new OpenAI({apiKey}) : null;
}

const OPENAI_ALERT_BATCH_SIZE = 10;
const OPENAI_ALERT_REQUEST_INTERVAL_MS = 3_000;
let nextOpenAiAlertRequestAt = 0;


function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}


async function waitForOpenAiAlertSlot() {
    const delay = Math.max(0, nextOpenAiAlertRequestAt - Date.now());
    if (delay) await wait(delay);
    nextOpenAiAlertRequestAt = Date.now() + OPENAI_ALERT_REQUEST_INTERVAL_MS;
}


function retryDelayFromRateLimit(error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/try again in\s+([\d.]+)s/i);
    return Math.max(2_000, Math.ceil(Number(match?.[1] ?? 4) * 1_000) + 1_000);
}


async function classifyBatchWithAi(rules, batch) {
    const client = getClient();
    if (!client) throw new Error("OpenAI AI integration is not configured yet.");
    const safeMessages = batch.map(message => ({
        id: message.id,
        from: cleanText(message.sender),
        subject: cleanText(message.subject),
        receivedAt: cleanText(message.receivedAt),
        text: cleanText(message.text).slice(0, 1600)
    }));

    for (let attempt = 0; attempt < 8; attempt += 1) {
        await waitForOpenAiAlertSlot();
        try {
            return await client.chat.completions.create({
                model: "gpt-4.1-mini",
                temperature: 0,
                max_tokens: 300,
                response_format: {type: "json_object"},
                messages: [
                    {
                        role: "system",
                        content: [
                            "You classify inbox emails for user-defined notification rules.",
                            "Return only JSON in this shape: {\"matches\": {\"rule-id\": [\"message-id\"]}}.",
                            "For each rule, include only message IDs that clearly satisfy that rule.",
                            "Consider sender, subject, and text. Do not infer facts that are not present.",
                            "Omit a rule key or return an empty list if no message matches."
                        ].join("\n")
                    },
                    {
                        role: "user",
                        content: JSON.stringify({
                            rules: rules.map(rule => ({id: rule.id, request: rule.query})),
                            messages: safeMessages
                        })
                    }
                ]
            });
        }
        catch (error) {
            if (error?.status !== 429 || attempt === 7) throw error;
            const retryDelay = retryDelayFromRateLimit(error);
            nextOpenAiAlertRequestAt = Math.max(nextOpenAiAlertRequestAt, Date.now() + retryDelay);
        }
    }
}


function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}


function normalizeRule(rule) {
    const id = cleanText(rule?.id);
    const kind = rule?.kind === "sender" ? "sender" : "ai";
    const query = cleanText(rule?.query).slice(0, 500);
    return id && query ? {id, kind, query} : null;
}


function senderMatches(message, query) {
    const sender = cleanText(message.sender).toLowerCase();
    const senders = cleanText(query)
        .split(";")
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);
    return senders.some(value => sender.includes(value));
}


async function classifyWithAi(rules, messages) {
    if (!rules.length) return {matches: {}, error: ""};
    if (!getClient()) {
        return {
            matches: {},
            error: "OpenAI AI integration is not configured yet."
        };
    }

    try {
        const matches = Object.fromEntries(rules.map(rule => [rule.id, []]));
        for (let index = 0; index < messages.length; index += OPENAI_ALERT_BATCH_SIZE) {
            const batch = messages.slice(index, index + OPENAI_ALERT_BATCH_SIZE);
            const response = await classifyBatchWithAi(rules, batch);
            const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
            const rawMatches = parsed && typeof parsed.matches === "object" ? parsed.matches : {};
            const validIds = new Set(batch.map(message => message.id));
            for (const rule of rules) {
                const ids = Array.isArray(rawMatches[rule.id])
                    ? rawMatches[rule.id].filter(id => typeof id === "string" && validIds.has(id))
                    : [];
                matches[rule.id].push(...ids);
            }
        }
        return {matches, error: ""};
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log("GMAIL WARNING AI ERROR:", reason);
        return {matches: {}, error: `AI warning check failed: ${reason}`};
    }
}


async function evaluateGmailWarnings({rules, messages, seenByRule}) {
    const validRules = (Array.isArray(rules) ? rules : []).map(normalizeRule).filter(Boolean).slice(0, 12);
    const seen = seenByRule && typeof seenByRule === "object" ? seenByRule : {};
    const senderRules = validRules.filter(rule => rule.kind === "sender");
    const aiRules = validRules.filter(rule => rule.kind === "ai");
    const ai = await classifyWithAi(aiRules, messages);

    return validRules.map(rule => {
        const messageIds = rule.kind === "sender"
            ? messages.filter(message => senderMatches(message, rule.query)).map(message => message.id)
            : (ai.matches[rule.id] ?? []);
        const alreadySeen = new Set(Array.isArray(seen[rule.id]) ? seen[rule.id] : []);
        const matchedMessages = messages.filter(message => messageIds.includes(message.id));
        return {
            ruleId: rule.id,
            total: matchedMessages.length,
            newCount: matchedMessages.filter(message => !alreadySeen.has(message.id)).length,
            messageIds,
            messages: matchedMessages.map(message => ({
                id: message.id,
                sender: message.sender,
                subject: message.subject,
                receivedAt: message.receivedAt,
                webLink: message.webLink || ""
            })),
            error: rule.kind === "ai" ? ai.error : ""
        };
    });
}


module.exports = {evaluateGmailWarnings};
