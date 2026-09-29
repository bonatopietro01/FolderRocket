const crypto = require("crypto");
const fs = require("fs");
const {getConnection, listConnections, migrateLegacyConnectionToBlock, removeConnection, saveConnection, saveConnectionEmail} = require("./emailTokenStore");

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
function getRedirectUri(origin = process.env.APP_ORIGIN || "http://localhost:3000") {
    const normalizedOrigin = String(origin || "").trim().replace(/\/$/, "");
    let parsedOrigin;
    try {
        parsedOrigin = new URL(normalizedOrigin);
    }
    catch {
        throw new Error("Outlook callback URL is invalid. Check APP_ORIGIN.");
    }
    if (!/^https?:$/.test(parsedOrigin.protocol)) {
        throw new Error("Outlook callback URL must use http or https.");
    }
    return `${parsedOrigin.origin}/auth/outlook/callback`;
}

const connections = new Map();
const authorizationStates = new Map();
const OUTLOOK_SCOPES = "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite";

function connectionKey(userId, blockId = "") {
    return `${userId}:${blockId || "legacy"}`;
}

function getUserConnection(userId, blockId = "") {
    const key = connectionKey(userId, blockId);
    if (!connections.has(key)) {
        const connection = getConnection("outlook", userId, blockId)
            || (blockId ? migrateLegacyConnectionToBlock("outlook", userId, blockId) : null);
        connections.set(key, connection);
    }
    return connections.get(key);
}

function saveUserConnection(userId, blockId, connection) {
    connections.set(connectionKey(userId, blockId), connection);
    saveConnection("outlook", userId, connection, blockId);
}

function getConfiguration() {
    const clientId = String(process.env.OUTLOOK_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.OUTLOOK_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
        throw new Error("Configure OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET in backend/.env");
    }
    return {clientId, clientSecret};
}

function getAuthorizationUrl(userId, blockId = "", options = {}) {
    const {clientId} = getConfiguration();
    const state = crypto.randomBytes(24).toString("hex");
    const redirectUri = getRedirectUri(options.origin);
    authorizationStates.set(state, {
        userId,
        blockId,
        redirectUri,
        frontendOrigin: options.frontendOrigin || ""
    });
    const parameters = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        prompt: "select_account",
        scope: OUTLOOK_SCOPES
    });
    parameters.set("state", state);
    return `${AUTHORITY}/authorize?${parameters}`;
}

async function readTokenResponse(response, fallbackMessage) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description ?? data.error?.message ?? fallbackMessage);
    return data;
}

async function exchangeAuthorizationCode(code, state, expectedUserId) {
    const authorization = authorizationStates.get(state);
    authorizationStates.delete(state);
    // The provider callback can arrive in the system browser, which does not
    // share Electron's cookie. The single-use OAuth state binds it to the user.
    if (!authorization || (expectedUserId && authorization.userId !== expectedUserId)) throw new Error("Outlook authorisation is invalid or expired");
    const {clientId, clientSecret} = getConfiguration();
    const response = await fetch(`${AUTHORITY}/token`, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: authorization.redirectUri || getRedirectUri(),
            grant_type: "authorization_code",
            scope: OUTLOOK_SCOPES
        })
    });
    const data = await readTokenResponse(response, "Microsoft rejected the Outlook authorisation");
    // Microsoft can omit a refresh token on a repeat consent. Keep the
    // existing renewable connection for this same source block.
    const previousConnection = getUserConnection(authorization.userId, authorization.blockId);
    const connection = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || previousConnection?.refreshToken || "",
        expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
    };
    saveUserConnection(authorization.userId, authorization.blockId, connection);
    try {
        const email = await getEmailIdentity(authorization.userId, authorization.blockId);
        saveConnectionEmail("outlook", authorization.userId, authorization.blockId, email);
    } catch { /* Keep a valid token if the identity lookup is temporarily unavailable. */ }
    return {
        blockId: authorization.blockId,
        frontendOrigin: authorization.frontendOrigin
    };
}

async function refreshAccessToken(userId, blockId = "") {
    const connection = getUserConnection(userId, blockId);
    if (!connection?.refreshToken) throw new Error("Reconnect Outlook");
    const {clientId, clientSecret} = getConfiguration();
    const response = await fetch(`${AUTHORITY}/token`, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: connection.refreshToken,
            grant_type: "refresh_token",
            scope: OUTLOOK_SCOPES
        })
    });
    const data = await readTokenResponse(response, "Unable to refresh Outlook access");
    connection.accessToken = data.access_token;
    connection.refreshToken = data.refresh_token || connection.refreshToken;
    connection.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    saveUserConnection(userId, blockId, connection);
}

async function graphFetch(userId, resource, blockId = "", options = {}) {
    const connection = getUserConnection(userId, blockId);
    if (!connection) throw new Error("Outlook is not connected");
    if (Date.now() >= connection.expiresAt - 60_000) await refreshAccessToken(userId, blockId);
    const url = resource.startsWith("http") ? resource : `${GRAPH_API_BASE}${resource}`;
    const makeRequest = activeConnection => fetch(url, {
        method: options.method ?? "GET",
        headers: {Authorization: `Bearer ${activeConnection.accessToken}`, ...(options.headers ?? {})},
        body: options.body
    });
    let response = await makeRequest(connection);
    if (response.status === 401) {
        await refreshAccessToken(userId, blockId);
        const refreshedConnection = getUserConnection(userId, blockId);
        response = await makeRequest(refreshedConnection);
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message ?? "Unable to read Outlook");
    }
    return response;
}

async function graphJson(userId, resource, blockId = "") {
    return (await graphFetch(userId, resource, blockId)).json();
}

function parseDateTime(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDateFilter({mode, days, startDate, endDate, hours, startAt, endAt} = {}, {attachmentsOnly = true} = {}) {
    const filters = attachmentsOnly ? ["hasAttachments eq true"] : [];
    if (mode === "hours") {
        const start = new Date(Date.now() - Math.min(8760, Math.max(1, Math.floor(Number(hours) || 24))) * 60 * 60 * 1000);
        filters.push(`receivedDateTime ge ${start.toISOString()}`);
    } else if (mode === "range" && (startAt || endAt)) {
        const start = parseDateTime(startAt);
        const end = parseDateTime(endAt);
        if (start) filters.push(`receivedDateTime ge ${start.toISOString()}`);
        if (end) filters.push(`receivedDateTime le ${end.toISOString()}`);
    } else if (mode === "range") {
        if (startDate) filters.push(`receivedDateTime ge ${startDate}T00:00:00Z`);
        if (endDate) {
            const end = new Date(`${endDate}T00:00:00Z`);
            end.setUTCDate(end.getUTCDate() + 1);
            filters.push(`receivedDateTime lt ${end.toISOString()}`);
        }
    } else {
        const start = new Date();
        start.setDate(start.getDate() - Math.max(1, Math.floor(Number(days) || 7)));
        filters.push(`receivedDateTime ge ${start.toISOString()}`);
    }
    return filters.join(" and ");
}

async function listAttachments(filters = {}, userId, blockId = "") {
    const parameters = new URLSearchParams({
        "$select": "id,subject,from,receivedDateTime,hasAttachments,webLink",
        "$filter": buildDateFilter(filters),
        "$top": "100"
    });
    const messages = await graphJson(userId, `/me/mailFolders/inbox/messages?${parameters}`, blockId);
    const attachments = [];
    for (const message of messages.value ?? []) {
        const attachmentData = await graphJson(userId, `/me/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType,size,isInline`, blockId);
        for (const attachment of attachmentData.value ?? []) {
            if (!attachment.name || attachment.isInline) continue;
            attachments.push({
                attachmentId: attachment.id,
                messageId: message.id,
                mimeType: attachment.contentType || "application/octet-stream",
                name: attachment.name,
                size: Number(attachment.size) || 0,
                receivedAt: message.receivedDateTime || "",
                sender: message.from?.emailAddress?.address || "",
                subject: message.subject || "",
                webLink: message.webLink || ""
            });
        }
    }
    return attachments;
}

async function downloadAttachment(messageId, attachmentId, userId, blockId = "") {
    const attachment = await graphJson(userId, `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, blockId);
    if (typeof attachment.contentBytes !== "string") throw new Error("Outlook attachment content is unavailable");
    return Buffer.from(attachment.contentBytes, "base64");
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
    while (/^(?:[a-z][a-z0-9\s,.:#_-]*)\s*\{/i.test(text)) {
        const next = text.replace(/^[^{]+\{[\s\S]*?\}\s*/i, "");
        if (next === text) break;
        text = next;
    }
    return text.trim();
}

async function getMessageText(messageId, userId, blockId = "") {
    const message = await graphJson(userId, `/me/messages/${encodeURIComponent(messageId)}?$select=subject,from,receivedDateTime,body`, blockId);
    return {
        subject: message.subject || "",
        sender: message.from?.emailAddress?.address || "",
        receivedAt: message.receivedDateTime || "",
        text: cleanEmailText(message.body?.content || "No readable text was found in this email.")
    };
}

async function listInboxMessages(filters = {}, userId, blockId = "") {
    const dateFilter = buildDateFilter(filters, {attachmentsOnly: false});
    const parameters = new URLSearchParams({
        "$select": "id,subject,from,receivedDateTime,bodyPreview,webLink",
        "$orderby": "receivedDateTime desc",
        "$top": "500"
    });
    if (dateFilter) parameters.set("$filter", dateFilter);
    const messages = [];
    let response = await graphJson(userId, `/me/mailFolders/inbox/messages?${parameters}`, blockId);
    while (response) {
        messages.push(...(response.value ?? []));
        response = response["@odata.nextLink"] ? await graphJson(userId, response["@odata.nextLink"], blockId) : null;
    }
    return messages.map(message => ({
        id: message.id,
        sender: message.from?.emailAddress?.address || "",
        subject: message.subject || "",
        receivedAt: message.receivedDateTime || "",
        text: cleanEmailText(message.bodyPreview || "").slice(0, 1600),
        webLink: message.webLink || ""
    }));
}

function getStatus(userId, blockId = "") {
    return {connected: Boolean(getUserConnection(userId, blockId))};
}

function disconnect(userId, blockId = "") {
    connections.set(connectionKey(userId, blockId), null);
    removeConnection("outlook", userId, blockId);
}

async function getEmailIdentity(userId, blockId = "") {
    const response = await graphFetch(userId, "/me?$select=mail,userPrincipalName", blockId);
    const profile = await response.json();
    return typeof profile.mail === "string" && profile.mail
        ? profile.mail
        : (typeof profile.userPrincipalName === "string" ? profile.userPrincipalName : "");
}

async function listConnectedAccounts(userId) {
    return listConnections("outlook", userId).slice(0, 30).map(connection => ({
        blockId: connection.blockId,
        email: connection.email,
        label: connection.email || `Account collegato · ${connection.blockId.slice(-6)}`
    }));
}

async function createDraft({to, subject, text, attachments = []}, userId, blockId = "") {
    const recipients = String(to ?? "").split(/[;,]/).map(value => value.trim()).filter(Boolean);
    if (!recipients.length) throw new Error("Add at least one recipient.");
    const response = await graphFetch(userId, "/me/messages", blockId, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            subject: String(subject ?? "FolderRocket draft").trim() || "FolderRocket draft",
            body: {contentType: "Text", content: String(text ?? "")},
            toRecipients: recipients.map(address => ({emailAddress: {address}}))
        })
    });
    const draft = await response.json();
    for (const attachment of attachments) {
        await graphFetch(userId, `/me/messages/${encodeURIComponent(draft.id)}/attachments`, blockId, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({"@odata.type":"#microsoft.graph.fileAttachment",name:attachment.name,contentBytes:fs.readFileSync(attachment.path).toString("base64")})});
    }
    return draft;
}

module.exports = {createDraft, disconnect, downloadAttachment, exchangeAuthorizationCode, getAuthorizationUrl, getEmailIdentity, getMessageText, getStatus, listAttachments, listConnectedAccounts, listInboxMessages};
