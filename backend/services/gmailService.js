const crypto = require("crypto");
const {getConnection, migrateLegacyConnectionToBlock, removeConnection, saveConnection} = require("./emailTokenStore");

const GMAIL_API_BASE =
    "https://gmail.googleapis.com/gmail/v1/users/me";

const TOKEN_URL =
    "https://oauth2.googleapis.com/token";

const AUTH_URL =
    "https://accounts.google.com/o/oauth2/v2/auth";

function getRedirectUri() {
    return `${(process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "")}/auth/gmail/callback`;
}

const connections = new Map();

const MAX_GMAIL_REQUESTS_PER_SECOND = 12;
const MAX_CACHED_INBOX_MESSAGES = 5_000;
const inboxMessageCache = new Map();
let gmailRequestTimestamps = [];

const authorizationStates = new Map();
const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose";


function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}


async function reserveGmailRequest() {
    const now = Date.now();
    gmailRequestTimestamps = gmailRequestTimestamps.filter(timestamp => now - timestamp < 1_000);
    if (gmailRequestTimestamps.length >= MAX_GMAIL_REQUESTS_PER_SECOND) {
        const waitTime = 1_000 - (now - gmailRequestTimestamps[0]) + 5;
        await wait(waitTime);
        return reserveGmailRequest();
    }
    gmailRequestTimestamps.push(Date.now());
}


function connectionKey(userId, blockId = "") {
    return `${userId}:${blockId || "legacy"}`;
}

function getUserConnection(userId, blockId = "") {
    const key = connectionKey(userId, blockId);
    if (!connections.has(key)) {
        const connection = getConnection("gmail", userId, blockId)
            || (blockId ? migrateLegacyConnectionToBlock("gmail", userId, blockId) : null);
        connections.set(key, connection);
    }
    return connections.get(key);
}

function saveUserConnection(userId, blockId, connection) {
    connections.set(connectionKey(userId, blockId), connection);
    saveConnection("gmail", userId, connection, blockId);
}

function getCachedInboxMessage(userId, blockId, id, includeText) {
    const cached = inboxMessageCache.get(`${userId}:${blockId}:${id}`);
    if (!cached || (includeText && !cached.hasText)) return null;
    return cached.message;
}


function cacheInboxMessage(userId, blockId, message, hasText) {
    inboxMessageCache.set(`${userId}:${blockId}:${message.id}`, {message, hasText});
    while (inboxMessageCache.size > MAX_CACHED_INBOX_MESSAGES) {
        inboxMessageCache.delete(inboxMessageCache.keys().next().value);
    }
}


function getConfiguration() {

    const clientId =
        process.env.GMAIL_CLIENT_ID;

    const clientSecret =
        process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {

        throw new Error(
            "Configura GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET in backend/.env"
        );

    }


    return {
        clientId,
        clientSecret
    };

}


function getAuthorizationUrl(userId, blockId = "") {

    const {
        clientId
    } = getConfiguration();

    const state =
        crypto.randomBytes(24)
            .toString("hex");

    authorizationStates.set(state, {userId, blockId});

    const parameters =
        new URLSearchParams({
            client_id: clientId,
            redirect_uri: getRedirectUri(),
            response_type: "code",
            access_type: "offline",
            prompt: "select_account consent",
            scope: GMAIL_SCOPES
        });

    parameters.set(
        "state",
        state
    );

    return `${AUTH_URL}?${parameters}`;

}


async function exchangeAuthorizationCode(
    code,
    state,
    expectedUserId
) {
    const authorization = authorizationStates.get(state);
    authorizationStates.delete(state);
    if (!authorization || authorization.userId !== expectedUserId) {

        throw new Error(
            "Autorizzazione Gmail non valida o scaduta"
        );

    }


    const {
        clientId,
        clientSecret
    } = getConfiguration();

    const response =
        await fetch(
            TOKEN_URL,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: getRedirectUri(),
                    grant_type: "authorization_code"
                })
            }
        );

    const data =
        await response.json();

    if (!response.ok) {

        throw new Error(
            data.error_description
            ??
            "Google ha rifiutato l'autorizzazione"
        );

    }

    const connection = {
        accessToken:
            data.access_token,
        refreshToken:
            data.refresh_token,
        expiresAt:
            Date.now()
            +
            (Number(data.expires_in) * 1000)
    };

    saveUserConnection(authorization.userId, authorization.blockId, connection);
    return authorization.blockId;

}


async function refreshAccessToken(userId, blockId = "") {
    const connection = getUserConnection(userId, blockId);

    if (
        !connection
        ||
        !connection.refreshToken
    ) {

        throw new Error(
            "Collega di nuovo Gmail"
        );

    }

    const {
        clientId,
        clientSecret
    } = getConfiguration();

    const response =
        await fetch(
            TOKEN_URL,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: connection.refreshToken,
                    grant_type: "refresh_token"
                })
            }
        );

    const data =
        await response.json();

    if (!response.ok) {

        throw new Error(
            data.error_description
            ??
            "Impossibile aggiornare l'accesso Gmail"
        );

    }

    connection.accessToken =
        data.access_token;

    connection.expiresAt =
        Date.now()
        +
            (Number(data.expires_in) * 1000);

    saveUserConnection(userId, blockId, connection);

}


async function gmailFetch(
    userId,
    path,
    blockId = "",
    remainingRetries = 2,
    options = {}
) {
    const connection = getUserConnection(userId, blockId);

    if (!connection) {

        throw new Error(
            "Gmail non è collegato"
        );

    }

    if (
        Date.now()
        >=
        connection.expiresAt - 60_000
    ) {

        await refreshAccessToken(userId, blockId);

    }

    await reserveGmailRequest();

    const response =
        await fetch(
            `${GMAIL_API_BASE}${path}`,
            {
                method: options.method ?? "GET",
                headers: {
                    Authorization: `Bearer ${connection.accessToken}`,
                    ...(options.headers ?? {})
                },
                body: options.body
            }
        );

    if (!response.ok) {

        const errorText =
            await response.text();

        const rateLimited = response.status === 429
            || (response.status === 403 && /rateLimitExceeded|Quota exceeded/i.test(errorText));
        if (rateLimited && remainingRetries > 0) {
            await wait((3 - remainingRetries) * 5_000 + 5_000);
            return gmailFetch(userId, path, blockId, remainingRetries - 1, options);
        }

        throw new Error(
            rateLimited
                ? "Gmail is temporarily rate-limited. Wait about one minute, then refresh again."
                : errorText || "Errore durante la lettura di Gmail"
        );

    }

    return response;

}


function formatGmailDate(
    value
) {

    return value
        .toISOString()
        .slice(0, 10)
        .replaceAll("-", "/");

}


function parseDateTime(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}


function messageWindow(filters = {}) {
    if (filters.mode === "hours") {
        const hours = Math.min(8760, Math.max(1, Math.floor(Number(filters.hours) || 24)));
        return {start: new Date(Date.now() - hours * 60 * 60 * 1000), end: null};
    }
    if (filters.mode === "range") {
        return {start: parseDateTime(filters.startAt), end: parseDateTime(filters.endAt)};
    }
    return null;
}


function matchesMessageWindow(receivedAt, filters = {}) {
    const window = messageWindow(filters);
    if (!window) return true;
    const received = new Date(receivedAt);
    if (Number.isNaN(received.getTime())) return false;
    return (!window.start || received >= window.start) && (!window.end || received <= window.end);
}


function buildQuery({
    mode,
    days,
    startDate,
    endDate,
    hours,
    startAt,
    endAt
} = {}, {
    attachmentsOnly = true
} = {}) {

    const queryParts = attachmentsOnly
        ? ["has:attachment", "in:inbox"]
        : ["in:inbox"];

    if (mode === "hours" || (mode === "range" && (startAt || endAt))) {
        const window = messageWindow({mode, hours, startAt, endAt});
        if (window?.start) {
            const coarseStart = new Date(window.start);
            coarseStart.setDate(coarseStart.getDate() - 1);
            queryParts.push(`after:${formatGmailDate(coarseStart)}`);
        }
        if (window?.end) {
            const coarseEnd = new Date(window.end);
            coarseEnd.setDate(coarseEnd.getDate() + 1);
            queryParts.push(`before:${formatGmailDate(coarseEnd)}`);
        }
    }

    else if (mode === "range") {

        if (startDate) {

            queryParts.push(
                `after:${startDate.replaceAll("-", "/")}`
            );

        }

        if (endDate) {

            const end =
                new Date(
                    `${endDate}T00:00:00`
                );

            end.setDate(
                end.getDate() + 1
            );

            queryParts.push(
                `before:${formatGmailDate(end)}`
            );

        }

    }

    else {

        const validDays =
            Math.max(
                1,
                Math.floor(Number(days) || 7)
            );

        const start =
            new Date();

        start.setDate(
            start.getDate() - validDays
        );

        queryParts.push(
            `after:${formatGmailDate(start)}`
        );

    }

    return queryParts.join(" ");

}


function findAttachments(
    part,
    attachments = []
) {

    if (
        part.filename
        &&
        part.body?.attachmentId
    ) {

        attachments.push({
            attachmentId:
                part.body.attachmentId,
            name:
                part.filename,
            size:
                Number(part.body.size) || 0,
            mimeType:
                part.mimeType
                ||
                "application/octet-stream"
        });

    }

    for (
        const child
        of part.parts ?? []
    ) {

        findAttachments(
            child,
            attachments
        );

    }

    return attachments;

}


function getHeader(
    headers,
    name
) {

    return headers
        ?.find(
            header =>
                header.name.toLowerCase()
                ===
                name.toLowerCase()
        )
        ?.value
        ??
        "";

}


async function listAttachments(
    filters,
    userId,
    blockId = ""
) {

    const query =
        buildQuery(filters);

    const listResponse =
        await gmailFetch(
            userId,
            `/messages?${new URLSearchParams({
                q: query,
                maxResults: "100"
            })}`,
            blockId
        );

    const list =
        await listResponse.json();

    const attachments = [];

    for (
        const messageReference
        of list.messages ?? []
    ) {

        const messageResponse =
            await gmailFetch(
                userId,
                `/messages/${messageReference.id}?format=full`,
                blockId
            );

        const message =
            await messageResponse.json();

        const messageAttachments =
            findAttachments(
                message.payload
            );

        for (
            const attachment
            of messageAttachments
        ) {

            const receivedAt = new Date(Number(message.internalDate)).toISOString();
            if (!matchesMessageWindow(receivedAt, filters)) continue;
            attachments.push({
                ...attachment,
                messageId:
                    message.id,
                sender:
                    getHeader(
                        message.payload?.headers,
                        "From"
                    ),
                subject:
                    getHeader(
                        message.payload?.headers,
                        "Subject"
                    ),
                receivedAt
            });

        }

    }

    return attachments;

}


async function listInboxMessages(filters = {}, {includeText = true} = {}, userId, blockId = "") {

    const query = buildQuery(filters, {attachmentsOnly: false});
    const messageReferences = [];
    let pageToken = "";

    do {
        const parameters = new URLSearchParams({
            q: query,
            maxResults: "500"
        });
        if (pageToken) parameters.set("pageToken", pageToken);
        const listResponse = await gmailFetch(userId, `/messages?${parameters}`, blockId);
        const list = await listResponse.json();
        messageReferences.push(...(list.messages ?? []));
        pageToken = list.nextPageToken ?? "";
    } while (pageToken);

    const messagesById = new Map();
    const missingReferences = [];
    for (const messageReference of messageReferences) {
        const cached = getCachedInboxMessage(userId, blockId, messageReference.id, includeText);
        if (cached) messagesById.set(messageReference.id, cached);
        else missingReferences.push(messageReference);
    }

    for (let index = 0; index < missingReferences.length; index += 8) {
        const batch = missingReferences.slice(index, index + 8);
        const currentMessages = await Promise.all(batch.map(async messageReference => {
            const detailQuery = includeText
                ? "format=full"
                : "format=metadata&metadataHeaders=From&metadataHeaders=Subject";
            const messageResponse = await gmailFetch(
                userId,
                `/messages/${encodeURIComponent(messageReference.id)}?${detailQuery}`,
                blockId
            );
            const message = await messageResponse.json();
            const inboxMessage = {
                id: message.id,
                sender: getHeader(message.payload?.headers, "From"),
                subject: getHeader(message.payload?.headers, "Subject"),
                receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : "",
                text: includeText ? extractMessageText(message.payload).slice(0, 1600) : ""
            };
            cacheInboxMessage(userId, blockId, inboxMessage, includeText);
            return inboxMessage;
        }));
        for (const message of currentMessages) messagesById.set(message.id, message);
    }

    return messageReferences
        .map(reference => messagesById.get(reference.id))
        .filter(message => message && matchesMessageWindow(message.receivedAt, filters));

}


async function downloadAttachment(
    messageId,
    attachmentId,
    userId,
    blockId = ""
) {

    const response =
        await gmailFetch(
            userId,
            `/messages/${messageId}/attachments/${attachmentId}`,
            blockId
        );

    const data =
        await response.json();

    return Buffer.from(
        data.data
            .replaceAll("-", "+")
            .replaceAll("_", "/"),
        "base64"
    );

}

function decodeBase64Url(value) {
    return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
}

function stripHtml(value) {
    return String(value)
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/p\s*>/gi, "\n\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/gi, '"')
        .trim();
}

function cleanEmailText(value) {
    let text = stripHtml(value);
    // Some messages expose CSS as a text/plain part. Remove only leading CSS
    // rules, then preserve the actual readable body below them.
    while (/^(?:[a-z][a-z0-9\s,.:#_-]*)\s*\{/i.test(text)) {
        const next = text.replace(/^[^{]+\{[\s\S]*?\}\s*/i, "");
        if (next === text) break;
        text = next;
    }
    return text.trim();
}

function extractMessageText(part) {
    const own = part?.body?.data ? decodeBase64Url(part.body.data) : "";
    if (part?.mimeType === "text/plain" && own) return cleanEmailText(own);
    for (const child of part?.parts ?? []) {
        const text = extractMessageText(child);
        if (text) return text;
    }
    return own ? cleanEmailText(own) : "";
}

async function getMessageText(messageId, userId, blockId = "") {
    const response = await gmailFetch(userId, `/messages/${encodeURIComponent(messageId)}?format=full`, blockId);
    const message = await response.json();
    return {
        subject: getHeader(message.payload?.headers, "Subject"),
        sender: getHeader(message.payload?.headers, "From"),
        receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : "",
        text: extractMessageText(message.payload) || "No readable text was found in this email."
    };
}


function getStatus(userId, blockId = "") {

    return {
        connected:
            Boolean(getUserConnection(userId, blockId))
    };

}

function disconnect(userId, blockId = "") {
    connections.set(connectionKey(userId, blockId), null);
    removeConnection("gmail", userId, blockId);
}

function cleanHeader(value) {
    return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

async function getEmailIdentity(userId, blockId = "") {
    const response = await gmailFetch(userId, "/profile", blockId);
    const profile = await response.json();
    return typeof profile.emailAddress === "string" ? profile.emailAddress : "";
}

async function createDraft({to, subject, text}, userId, blockId = "") {
    const recipient = cleanHeader(to);
    if (!recipient) throw new Error("Add at least one recipient.");
    const raw = [
        `To: ${recipient}`,
        `Subject: ${cleanHeader(subject) || "FolderRocket draft"}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        String(text ?? "")
    ].join("\r\n");
    const response = await gmailFetch(userId, "/drafts", blockId, 2, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message: {raw: Buffer.from(raw, "utf8").toString("base64url")}})
    });
    return response.json();
}


module.exports = {
    createDraft,
    downloadAttachment,
    disconnect,
    getEmailIdentity,
    getMessageText,
    exchangeAuthorizationCode,
    getAuthorizationUrl,
    getStatus,
    listAttachments,
    listInboxMessages
};
