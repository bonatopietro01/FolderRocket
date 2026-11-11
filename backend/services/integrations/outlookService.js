const crypto = require("crypto");
const fs = require("fs");
const {getConnection, listConnections, migrateLegacyConnectionToBlock, removeConnection, saveConnection, saveConnectionEmail} = require("../shared/emailTokenStore");

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
const TEAMS_SCOPES = "https://graph.microsoft.com/Chat.Read https://graph.microsoft.com/Channel.ReadBasic.All https://graph.microsoft.com/ChannelMessage.Read.All https://graph.microsoft.com/Files.ReadWrite";
const OUTLOOK_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send";

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
    const scopes = [OUTLOOK_SCOPES, ...(options.includeTeams ? [TEAMS_SCOPES] : []), ...(options.includeSend ? [OUTLOOK_SEND_SCOPE] : [])].join(" ");
    authorizationStates.set(state, {
        userId,
        blockId,
        redirectUri,
        frontendOrigin: options.frontendOrigin || "",
        scopes
    });
    const parameters = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        prompt: options.includeTeams || options.includeSend ? "consent" : "select_account",
        scope: scopes
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
            scope: authorization.scopes || OUTLOOK_SCOPES
        })
    });
    const data = await readTokenResponse(response, "Microsoft rejected the Outlook authorisation");
    // Microsoft can omit a refresh token on a repeat consent. Keep the
    // existing renewable connection for this same source block.
    const previousConnection = getUserConnection(authorization.userId, authorization.blockId);
    const connection = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || previousConnection?.refreshToken || "",
        expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
        scopes: authorization.scopes || OUTLOOK_SCOPES
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
            scope: connection.scopes || OUTLOOK_SCOPES
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
        body: options.body,
        redirect: options.redirect ?? "follow"
    });
    let response = await makeRequest(connection);
    if (response.status === 401) {
        await refreshAccessToken(userId, blockId);
        const refreshedConnection = getUserConnection(userId, blockId);
        response = await makeRequest(refreshedConnection);
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error = new Error(data.error?.message ?? "Unable to read Outlook");
        error.status = response.status;
        throw error;
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

function odataDateRange(fromValue, toValue) {
    const filters = [];
    const parse = (value, end = false) => {
        if (typeof value !== "string" || !value.trim()) return null;
        const time = Date.parse(value);
        if (!Number.isFinite(time)) throw new Error("Choose a valid Outlook date range.");
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(value.trim());
        return new Date(time + (end && dateOnly ? 24 * 60 * 60 * 1000 - 1 : 0)).toISOString();
    };
    const from = parse(fromValue);
    const to = parse(toValue, true);
    if (from && to && Date.parse(from) > Date.parse(to)) throw new Error("Choose a valid Outlook date range.");
    if (from) filters.push(`receivedDateTime ge ${from}`);
    if (to) filters.push(`receivedDateTime le ${to}`);
    return filters.join(" and ");
}

function safeOutlookGraphCursor(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" && url.hostname === "graph.microsoft.com" && url.pathname.startsWith("/v1.0/");
    } catch { return false; }
}

function outlookConversationMessageSummary(message) {
    return {
        id:String(message.id || ""),
        sender:message.from?.emailAddress?.address || "",
        subject:message.subject || "",
        receivedAt:message.receivedDateTime || "",
        text:cleanEmailText(message.bodyPreview || "").slice(0, 1600),
        webLink:typeof message.webLink === "string" && /^https:\/\//i.test(message.webLink) ? message.webLink : "",
        hasAttachments:message.hasAttachments === true
    };
}

async function listOutlookConversationSummaries({from = "", to = "", sender = "", cursor = ""} = {}, userId, blockId = "") {
    let response;
    if (cursor) {
        if (!safeOutlookGraphCursor(cursor)) throw new Error("Invalid Outlook conversation continuation link.");
        response = await graphJson(userId, cursor, blockId);
    } else {
        const parameters = new URLSearchParams({
            "$select":"id,conversationId,subject,from,receivedDateTime,bodyPreview,webLink,hasAttachments",
            "$orderby":"receivedDateTime desc",
            "$top":"50"
        });
        const dateFilter = odataDateRange(from, to);
        if (dateFilter) parameters.set("$filter", dateFilter);
        response = await graphJson(userId, `/me/mailFolders/inbox/messages?${parameters}`, blockId);
    }
    const needle = String(sender || "").trim().toLocaleLowerCase().slice(0, 180);
    const grouped = new Map();
    for (const message of Array.isArray(response.value) ? response.value : []) {
        const summary = outlookConversationMessageSummary(message);
        const fromAddress = summary.sender.toLocaleLowerCase();
        if (needle && !fromAddress.includes(needle)) continue;
        const conversationId = typeof message.conversationId === "string" ? message.conversationId : "";
        if (!conversationId) continue;
        let thread = grouped.get(conversationId);
        if (!thread) {
            thread = {id:conversationId,threadId:conversationId,blockId,subject:String(message.subject || "(no subject)").slice(0, 240),snippet:summary.text,updatedAt:summary.receivedAt,messageCount:0,accountEmail:"",provider:"outlook",sender:summary.sender};
            grouped.set(conversationId, thread);
        }
        thread.messageCount += 1;
        if (summary.receivedAt && summary.receivedAt > thread.updatedAt) thread.updatedAt = summary.receivedAt;
    }
    const items = [...grouped.values()].sort((left,right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return {threads:items,nextPageToken:typeof response["@odata.nextLink"] === "string" ? response["@odata.nextLink"] : ""};
}

async function getOutlookConversation(conversationId, userId, blockId = "", cursor = "") {
    const id = String(conversationId || "").trim();
    if (!id || id.length > 512) throw new Error("Choose a valid Outlook conversation first.");
    let response;
    if (cursor) {
        if (!safeOutlookGraphCursor(cursor)) throw new Error("Invalid Outlook conversation continuation link.");
        response = await graphJson(userId, cursor, blockId);
    } else {
        const parameters = new URLSearchParams({
            "$select":"id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,webLink,hasAttachments",
            "$filter":`conversationId eq '${id.replace(/'/gu,"''")}'`,
            "$orderby":"receivedDateTime asc",
            "$top":"20"
        });
        response = await graphJson(userId, `/me/messages?${parameters}`, blockId);
    }
    const items = (Array.isArray(response.value) ? response.value : []).filter(message => message.conversationId === id);
    const messages = items.map(message => ({
        id:String(message.id || ""),
        from:message.from?.emailAddress?.address || "",
        to:(message.toRecipients || []).map(item => item.emailAddress?.address).filter(Boolean).join(", "),
        cc:(message.ccRecipients || []).map(item => item.emailAddress?.address).filter(Boolean).join(", "),
        receivedAt:message.receivedDateTime || "",
        date:message.receivedDateTime || "",
        text:cleanEmailText(message.body?.content || message.bodyPreview || "").slice(0, 20_000),
        attachments:[],
        inlineImages:[]
    }));
    return {conversationId:id,messages,hasMore:typeof response["@odata.nextLink"] === "string",nextCursor:typeof response["@odata.nextLink"] === "string"?response["@odata.nextLink"]:""};
}

function cleanTeamsBody(value) {
    return String(value || "")
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<\/(?:p|div|li)>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t\r\f]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .trim()
        .slice(0, 1200);
}

function isSafeTeamsShareUrl(value) {
    try {
        const url = new URL(String(value || ""));
        const host = url.hostname.toLowerCase();
        return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
            && (host === "sharepoint.com" || host.endsWith(".sharepoint.com") || host === "1drv.ms" || host === "onedrive.live.com" || host.endsWith(".onedrive.live.com"));
    } catch { return false; }
}

function teamsFilesFromMessage(message) {
    return (Array.isArray(message?.attachments) ? message.attachments : []).slice(0, 30).flatMap((item, index) => {
        const contentUrl = typeof item?.contentUrl === "string" ? item.contentUrl : "";
        if (item?.contentType !== "reference" || !isSafeTeamsShareUrl(contentUrl) || typeof item.id !== "string" || !item.id) return [];
        const attachmentId = item.id;
        const name = String(item.name || item.contentType || "Shared file").replace(/[\\/:*?\"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "Shared file";
        return [{
            id: attachmentId,
            messageId: String(message.id || ""),
            name,
            contentType: String(item.contentType || "application/octet-stream").slice(0, 160),
            size: Number.isFinite(Number(item.size)) ? Math.max(0, Number(item.size)) : null,
            source: "teams-share",
            downloadAvailable: true
        }];
    });
}

function shapeTeamsMessage(message, parentMessageId = "", source = null) {
    const files = teamsFilesFromMessage(message);
    const filesById = new Map(files.map(file => [file.id, file]));
    const attachments = Array.isArray(message.attachments) ? message.attachments.map((item, index) => {
        const file = filesById.get(typeof item.id === "string" ? item.id : `attachment-${index}`);
        return {id:file?.id || "", name:String(item.name || item.contentType || "Shared file").slice(0, 180), url:file && typeof item.contentUrl === "string" ? item.contentUrl : ""};
    }) : [];
    const mentions = Array.isArray(message.mentions) ? message.mentions.map(item => String(item.mentionText || item.mentioned?.user?.displayName || "").trim()).filter(Boolean).slice(0, 20) : [];
    return {
        id: message.id,
        createdAt: message.createdDateTime || "",
        sender: message.from?.user?.displayName || message.from?.application?.displayName || "Teams user",
        senderEmail: message.from?.user?.userPrincipalName || message.from?.user?.email || "",
        text: cleanTeamsBody(message.body?.content),
        mentions,
        attachments,
        files,
        parentMessageId: parentMessageId || message.replyToId || "",
        repliesNextLink: isSafeTeamsNextLink(message["replies@odata.nextLink"], source ? {...source,parentMessageId:String(message.id || "")} : null) ? message["replies@odata.nextLink"] : ""
    };
}

function shapeTeamsMessages(messages, parentMessageId = "", source = null) {
    const shaped = [];
    for (const message of Array.isArray(messages) ? messages : []) {
        shaped.push(shapeTeamsMessage(message, parentMessageId, source));
        if (Array.isArray(message.replies)) shaped.push(...message.replies.map(reply => shapeTeamsMessage(reply, message.id, source)));
    }
    return shaped;
}

function shapeTeamsDirectoryPage(data, kind) {
    const items = Array.isArray(data.value) ? data.value : [];
    const values = kind === "chats" ? items.map(chat => ({
        id: chat.id,
        type: chat.chatType || "chat",
        topic: String(chat.topic || "").slice(0, 180),
        members: (chat.members || []).map(member => String(member.displayName || member.email || "").trim()).filter(Boolean).slice(0, 12),
        updatedAt: chat.lastUpdatedDateTime || ""
    })) : items.map(item => kind === "teams"
        ? ({id: item.id, name: String(item.displayName || "Team").slice(0, 180)})
        : ({id: item.id, name: String(item.displayName || "Channel").slice(0, 180), description: String(item.description || "").slice(0, 240), membershipType: item.membershipType || "standard"}));
    return {items: values, nextLink: data["@odata.nextLink"] || ""};
}

async function listTeamsChats(userId, blockId = "") {
    const data = await graphJson(userId, "/me/chats?$top=50&$expand=members", blockId);
    return shapeTeamsDirectoryPage(data, "chats");
}

async function listJoinedTeams(userId, blockId = "") {
    const data = await graphJson(userId, "/me/joinedTeams?$top=50", blockId);
    return shapeTeamsDirectoryPage(data, "teams");
}

async function listTeamChannels(teamId, userId, blockId = "") {
    const safeId = String(teamId || "").trim();
    if (!safeId || safeId.length > 256) throw new Error("Choose a valid Team first.");
    const data = await graphJson(userId, `/teams/${encodeURIComponent(safeId)}/channels?$top=50`, blockId);
    return shapeTeamsDirectoryPage(data, "channels");
}

async function listTeamsDirectoryNextPage(nextLink, kind, userId, blockId = "", teamId = "") {
    if (!["chats", "teams", "channels"].includes(kind)) throw new Error("Choose a valid Teams directory first.");
    const source = {directoryKind:kind,teamId};
    if (!isSafeTeamsNextLink(nextLink, source)) throw new Error("Invalid Teams directory continuation link.");
    return shapeTeamsDirectoryPage(await graphJson(userId, nextLink, blockId), kind);
}

async function listTeamsChatMessages(chatId, userId, blockId = "") {
    const safeId = String(chatId || "").trim();
    if (!safeId || safeId.length > 512) throw new Error("Choose a valid Teams chat first.");
    const data = await graphJson(userId, `/chats/${encodeURIComponent(safeId)}/messages?$top=50`, blockId);
    const source = {kind:"chat",id:safeId};
    return {messages: await verifyTeamsMessageFiles(shapeTeamsMessages(data.value,"",source), userId, blockId), nextLink: data["@odata.nextLink"] || ""};
}

async function listTeamsChannelMessages(teamId, channelId, userId, blockId = "") {
    const safeTeamId = String(teamId || "").trim();
    const safeChannelId = String(channelId || "").trim();
    if (!safeTeamId || !safeChannelId || safeTeamId.length > 256 || safeChannelId.length > 256) throw new Error("Choose a valid Teams channel first.");
    const data = await graphJson(userId, `/teams/${encodeURIComponent(safeTeamId)}/channels/${encodeURIComponent(safeChannelId)}/messages?$top=50&$expand=replies`, blockId);
    const source = {kind:"channel",id:safeChannelId,teamId:safeTeamId};
    return {messages: await verifyTeamsMessageFiles(shapeTeamsMessages(data.value,"",source), userId, blockId), nextLink: data["@odata.nextLink"] || ""};
}

async function listTeamsMessagesForAlerts(source, userId, blockId = "") {
    const kind = source?.kind;
    const id = String(source?.id || "").trim();
    const teamId = String(source?.teamId || "").trim();
    let resource;
    if (kind === "chat" && id && id.length <= 512) {
        resource = `/chats/${encodeURIComponent(id)}/messages?$top=50`;
    } else if (kind === "channel" && id && id.length <= 256 && teamId && teamId.length <= 256) {
        resource = `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(id)}/messages?$top=50`;
    } else throw new Error("Choose a valid Teams chat or channel for this alert.");
    const data = await graphJson(userId, resource, blockId);
    return shapeTeamsMessages(data.value).slice(0, 50).map(message => ({
        id:String(message.id || "").slice(0, 512),
        sender:String(message.sender || "").slice(0, 180),
        senderEmail:String(message.senderEmail || "").slice(0, 180),
        createdAt:String(message.createdAt || "").slice(0, 80),
        text:String(message.text || "").slice(0, 1200)
    }));
}

function isSafeTeamsNextLink(value, source = null) {
    try {
        const url = new URL(String(value || ""));
        if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com" || url.port || url.username || url.password) return false;
        const path = url.pathname;
        if (!path.startsWith("/v1.0/")) return false;
        if (!source) return /^\/v1\.0\/(?:me\/(?:chats|joinedTeams)|chats\/[^/]+\/messages(?:\/[^/]+\/replies)?|teams\/[^/]+\/channels(?:\/[^/]+\/messages(?:\/[^/]+\/replies)?)?)$/u.test(path);
        if (source.directoryKind) {
            const expected = source.directoryKind === "chats" ? "/v1.0/me/chats"
                : source.directoryKind === "teams" ? "/v1.0/me/joinedTeams"
                    : source.directoryKind === "channels" && validTeamsId(source.teamId) ? `/v1.0/teams/${encodeURIComponent(source.teamId)}/channels` : "";
            return Boolean(expected) && path === expected;
        }
        let expected = "";
        if (source.kind === "chat" && validTeamsId(source.id,512)) expected = `/v1.0/chats/${encodeURIComponent(source.id)}/messages`;
        else if (source.kind === "channel" && validTeamsId(source.teamId) && validTeamsId(source.id)) expected = `/v1.0/teams/${encodeURIComponent(source.teamId)}/channels/${encodeURIComponent(source.id)}/messages`;
        if (!expected) return false;
        if (path === expected) return true;
        const parentMessageId = typeof source.parentMessageId === "string" ? source.parentMessageId : "";
        return Boolean(parentMessageId && validTeamsId(parentMessageId,512) && path === `${expected}/${encodeURIComponent(parentMessageId)}/replies`);
    } catch { return false; }
}

function validTeamsId(value, maxLength = 256) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength && !/[\\/\u0000-\u001f]/u.test(value);
}

async function listTeamsNextPage(nextLink, userId, blockId = "", source = null) {
    if (!source || !isSafeTeamsNextLink(nextLink, source)) throw new Error("Invalid Teams message continuation link.");
    const data = await graphJson(userId, nextLink, blockId);
    const parentId = typeof source.parentMessageId === "string" ? source.parentMessageId : "";
    return {messages: await verifyTeamsMessageFiles(shapeTeamsMessages(data.value, parentId, source), userId, blockId), nextLink: data["@odata.nextLink"] || ""};
}

async function verifyTeamsMessageFiles(messages, userId, blockId) {
    const tasks = [];
    const filesByMessage = messages.map((message, messageIndex) => (message.files || []).map(file => {
        const sourceUrl = message.attachments?.find(item => item.id === file.id)?.url || "";
        const taskIndex = tasks.length;
        if (taskIndex < 50 && sourceUrl) {
            tasks.push({messageIndex,file,sourceUrl});
            return taskIndex;
        }
        return -1;
    }));
    const verified = new Array(tasks.length);
    let cursor = 0;
    const worker = async () => {
        while (cursor < tasks.length) {
            const taskIndex = cursor++;
            const {file,sourceUrl} = tasks[taskIndex];
            try {
                const token = encodeTeamsShareUrl(sourceUrl);
                const share = await graphJson(userId, `/shares/${encodeURIComponent(token)}/driveItem?$select=id,name,size,file,folder,parentReference`, blockId);
                const driveId = typeof share.parentReference?.driveId === "string" ? share.parentReference.driveId : "";
                const itemId = typeof share.id === "string" ? share.id : "";
                verified[taskIndex] = driveId && itemId && share.file && !share.folder
                    ? {...file,name:safeTeamsDownloadName(share.name || file.name),contentType:String(share.file.mimeType || file.contentType || "application/octet-stream").slice(0,160),size:Number.isFinite(Number(share.size))?Math.max(0,Number(share.size)):file.size,driveId,itemId,verified:true,downloadAvailable:true}
                    : {...file,verified:false,downloadAvailable:false,reason:"not-a-drive-file"};
            } catch (error) {
                verified[taskIndex] = {...file,verified:false,downloadAvailable:false,reason:error?.status === 403 ? "files-readwrite-consent-required" : error?.status === 404 ? "share-unavailable" : "share-unresolved"};
            }
        }
    };
    const results = await Promise.allSettled(Array.from({length:Math.min(5,tasks.length)}, worker));
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    return messages.map((message, messageIndex) => ({...message,attachments:(message.attachments || []).map(({id,name})=>({id,name})),files:(message.files || []).map((file,fileIndex) => {
        const taskIndex = filesByMessage[messageIndex][fileIndex];
        return taskIndex >= 0 && taskIndex < 50 && tasks[taskIndex]?.messageIndex === messageIndex
            ? verified[taskIndex]
            : {...file,verified:false,downloadAvailable:false,reason:tasks.length >= 50 ? "verification-limit" : "share-link-unavailable"};
    })}));
}

function encodeTeamsShareUrl(value) {
    if (!isSafeTeamsShareUrl(value)) throw new Error("This Teams file link is not a supported Microsoft share link.");
    return `u!${Buffer.from(value, "utf8").toString("base64").replace(/=+$/u, "").replace(/\//gu, "_").replace(/\+/gu, "-")}`;
}

function safeTeamsDownloadName(value) {
    const name = String(value || "Shared file").replace(/[\\/:*?\"<>|\u0000-\u001f]/g, "_").replace(/^\.+/u, "").trim().slice(0, 180);
    return name || "Shared file";
}

function isSafeTeamsContentHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "sharepoint.com" || host.endsWith(".sharepoint.com")
        || host === "sharepointonline.com" || host.endsWith(".sharepointonline.com")
        || host === "1drv.ms" || host.endsWith(".1drv.com")
        || host === "onedrive.live.com" || host.endsWith(".onedrive.live.com")
        || host.endsWith(".blob.core.windows.net");
}

async function teamsDriveItemContent(userId, driveId, itemId, blockId) {
    let response = await graphFetch(userId, `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, blockId, {redirect:"manual"});
    for (let redirectCount = 0; [301,302,303,307,308].includes(response.status) && redirectCount < 3; redirectCount += 1) {
        const location = response.headers.get("location");
        let target;
        try { target = new URL(location); } catch { throw new Error("Microsoft Graph returned an invalid Teams file download location."); }
        if (target.protocol !== "https:" || target.username || target.password || (target.port && target.port !== "443") || !isSafeTeamsContentHost(target.hostname)) throw new Error("Microsoft Graph returned an unsupported Teams file download host.");
        response = await fetch(target.toString(), {redirect:"manual"});
    }
    if ([301,302,303,307,308].includes(response.status)) throw new Error("The Teams file download exceeded the supported redirect limit.");
    if (!response.ok) {
        const error = new Error("Unable to download this Teams file.");
        error.status = response.status;
        throw error;
    }
    return response;
}

async function downloadTeamsMessageFile({kind, id, teamId = "", messageId, attachmentId, userId, blockId}) {
    const safeMessageId = String(messageId || "").trim();
    const safeAttachmentId = String(attachmentId || "").trim();
    if (!safeMessageId || safeMessageId.length > 512 || !safeAttachmentId || safeAttachmentId.length > 512) throw new Error("Choose a valid Teams file first.");
    let resource;
    if (kind === "chat") {
        const chatId = String(id || "").trim();
        if (!chatId || chatId.length > 512) throw new Error("Choose a valid Teams chat first.");
        resource = `/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(safeMessageId)}`;
    } else if (kind === "channel") {
        const safeTeamId = String(teamId || "").trim();
        const channelId = String(id || "").trim();
        if (!safeTeamId || safeTeamId.length > 256 || !channelId || channelId.length > 256) throw new Error("Choose a valid Teams channel first.");
        resource = `/teams/${encodeURIComponent(safeTeamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(safeMessageId)}`;
    } else throw new Error("Choose a valid Teams chat or channel first.");

    const message = await graphJson(userId, resource, blockId);
    const attachment = (Array.isArray(message.attachments) ? message.attachments : []).find(item => item?.id === safeAttachmentId);
    if (!attachment || attachment.contentType !== "reference" || !isSafeTeamsShareUrl(attachment.contentUrl)) throw new Error("This file is no longer available in the selected Teams message.");
    const shareToken = encodeTeamsShareUrl(attachment.contentUrl);
    const share = await graphJson(userId, `/shares/${encodeURIComponent(shareToken)}/driveItem?$select=id,name,size,file,folder,parentReference`, blockId);
    const driveId = typeof share.parentReference?.driveId === "string" ? share.parentReference.driveId : "";
    const itemId = typeof share.id === "string" ? share.id : "";
    if (!driveId || !itemId || !share.file || share.folder) throw new Error("This Teams share does not resolve to a downloadable file.");
    const declaredSize = Number(share.size);
    if (Number.isFinite(declaredSize) && declaredSize > 75 * 1024 * 1024) throw new Error("FolderRocket can copy Teams files up to 75 MB.");
    const response = await teamsDriveItemContent(userId,driveId,itemId,blockId);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 75 * 1024 * 1024) throw new Error("FolderRocket can copy Teams files up to 75 MB.");
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
        total += chunk.length;
        if (total > 75 * 1024 * 1024) {
            await response.body.cancel().catch(() => {});
            throw new Error("FolderRocket can copy Teams files up to 75 MB.");
        }
        chunks.push(chunk);
    }
    if (!total) throw new Error("The Teams file is empty or unavailable.");
    return {buffer:Buffer.concat(chunks, total), name:safeTeamsDownloadName(share.name || attachment.name), mimeType:String(share.file.mimeType || attachment.contentType || "application/octet-stream").slice(0, 160)};
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
        originWorldId: connection.originWorldId || "",
        originWorldName: connection.originWorldName || "",
        label: connection.email || `Account collegato · ${connection.blockId.slice(-6)}`,
        canSend: String(connection.scopes || "").split(/\s+/).includes(OUTLOOK_SEND_SCOPE)
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
        const content = await fs.promises.readFile(attachment.path);
        await graphFetch(userId, "/me/messages/" + encodeURIComponent(draft.id) + "/attachments", blockId, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({"@odata.type":"#microsoft.graph.fileAttachment",name:attachment.name,contentBytes:content.toString("base64")})});
    }
    return draft;
}

async function sendEmail({to, subject, text}, userId, blockId = "") {
    const connection = getUserConnection(userId, blockId);
    if (!String(connection?.scopes || "").split(/\s+/).includes(OUTLOOK_SEND_SCOPE)) throw new Error("Outlook sending is not authorized. Explicitly reconnect and approve Mail.Send first.");
    const recipients = String(to ?? "").split(/[;,]/).map(value => value.trim()).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    if (!recipients.length) throw new Error("Add a valid digest recipient.");
    await graphFetch(userId, "/me/sendMail", blockId, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({message:{subject:String(subject || "FolderRocket update").replace(/[\r\n]+/g," ").slice(0,180),body:{contentType:"Text",content:String(text ?? "").slice(0,12000)},toRecipients:recipients.map(address=>({emailAddress:{address}}))},saveToSentItems:true})});
    return {sent:true};
}

module.exports = {createDraft, sendEmail, disconnect, downloadAttachment, downloadTeamsMessageFile, exchangeAuthorizationCode, getAuthorizationUrl, getEmailIdentity, getOutlookConversation, getStatus, listAttachments, listConnectedAccounts, listOutlookConversationSummaries, listTeamsChats, listJoinedTeams, listTeamChannels, listTeamsDirectoryNextPage, listTeamsChatMessages, listTeamsChannelMessages, listTeamsMessagesForAlerts, listTeamsNextPage, verifyTeamsMessageFiles, isSafeTeamsNextLink, isSafeTeamsShareUrl, shapeTeamsMessage, shapeTeamsMessages, OUTLOOK_SCOPES, OUTLOOK_SEND_SCOPE, TEAMS_SCOPES};
