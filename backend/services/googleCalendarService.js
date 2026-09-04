const crypto = require("crypto");
const {getConnection, removeConnection, saveConnection} = require("./emailTokenStore");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly";
const authorizations = new Map();
const connections = new Map();

function key(userId, blockId = "") { return `${userId}:${blockId || "legacy"}`; }
function redirectUri(origin = process.env.APP_ORIGIN || "http://localhost:3000") { return `${String(origin).replace(/\/$/, "")}/auth/gmail/callback`; }
function configuration() {
    const clientId = String(process.env.GMAIL_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GMAIL_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) throw new Error("Configure Gmail credentials in Settings first.");
    return {clientId, clientSecret};
}
function connectionFor(userId, blockId = "") {
    const cacheKey = key(userId, blockId);
    if (!connections.has(cacheKey)) connections.set(cacheKey, getConnection("calendar", userId, blockId));
    return connections.get(cacheKey);
}
function save(userId, blockId, value) { connections.set(key(userId, blockId), value); saveConnection("calendar", userId, value, blockId); }

function getAuthorizationUrl(userId, blockId = "", options = {}) {
    const {clientId} = configuration();
    const state = crypto.randomBytes(24).toString("hex");
    const callback = redirectUri(options.origin);
    authorizations.set(state, {userId, blockId, callback, frontendOrigin: options.frontendOrigin || ""});
    const parameters = new URLSearchParams({client_id: clientId, redirect_uri: callback, response_type: "code", access_type: "offline", prompt: "select_account consent", scope: CALENDAR_SCOPE, state});
    return `${AUTH_URL}?${parameters}`;
}

function hasPendingAuthorization(state) { return typeof state === "string" && authorizations.has(state); }

async function exchangeAuthorizationCode(code, state) {
    const pending = authorizations.get(state);
    authorizations.delete(state);
    if (!pending) throw new Error("Google Calendar authorization is invalid or expired.");
    const {clientId, clientSecret} = configuration();
    const response = await fetch(TOKEN_URL, {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: new URLSearchParams({code, client_id: clientId, client_secret: clientSecret, redirect_uri: pending.callback, grant_type: "authorization_code"})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || "Google rejected Calendar authorization.");
    const previous = connectionFor(pending.userId, pending.blockId);
    save(pending.userId, pending.blockId, {accessToken: data.access_token, refreshToken: data.refresh_token || previous?.refreshToken || "", expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000});
    return {blockId: pending.blockId, frontendOrigin: pending.frontendOrigin};
}

async function refresh(userId, blockId) {
    const current = connectionFor(userId, blockId);
    if (!current?.refreshToken) throw new Error("Reconnect Google Calendar.");
    const {clientId, clientSecret} = configuration();
    const response = await fetch(TOKEN_URL, {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: new URLSearchParams({client_id: clientId, client_secret: clientSecret, refresh_token: current.refreshToken, grant_type: "refresh_token"})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error_description || "Unable to refresh Google Calendar access.");
    current.accessToken = data.access_token;
    current.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    save(userId, blockId, current);
}

async function calendarFetch(userId, resource, blockId, options = {}) {
    let current = connectionFor(userId, blockId);
    if (!current) throw new Error("Google Calendar is not connected.");
    if (Date.now() >= Number(current.expiresAt || 0) - 60_000) await refresh(userId, blockId);
    current = connectionFor(userId, blockId);
    const request = token => ({...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token}`}});
    let response = await fetch(`${CALENDAR_API}${resource}`, request(current.accessToken));
    if (response.status === 401) { await refresh(userId, blockId); current = connectionFor(userId, blockId); response = await fetch(`${CALENDAR_API}${resource}`, request(current.accessToken)); }
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data?.error?.message || "Google Calendar could not be read."); }
    return response;
}

function timeWindow({view, days, weekStart} = {}) {
    const now = new Date();
    const week = /^\d{4}-\d{2}-\d{2}$/.test(weekStart || "") ? new Date(`${weekStart}T00:00:00`) : new Date(now);
    if (view === "week") { const day = week.getDay(); week.setDate(week.getDate() - (day === 0 ? 6 : day - 1)); week.setHours(0, 0, 0, 0); const end = new Date(week); end.setDate(end.getDate() + 7); return {start: week, end}; }
    return {start: now, end: new Date(now.getTime() + Math.max(1, Math.min(90, Number(days) || 14)) * 86400000)};
}

async function listEvents(userId, blockId, options = {}) {
    const range = timeWindow(options);
    const query = new URLSearchParams({singleEvents: "true", orderBy: "startTime", timeMin: range.start.toISOString(), timeMax: range.end.toISOString(), maxResults: "60", fields: "items(id,summary,start,end,location,htmlLink,hangoutLink,conferenceData(entryPoints(entryPointType,uri,label)),attachments(fileId,fileUrl,title,mimeType))"});
    const data = await (await calendarFetch(userId, `/calendars/primary/events?${query}`, blockId)).json();
    return (data.items || []).map(item => ({id: String(item.id || ""), title: String(item.summary || "Untitled event"), start: item.start?.dateTime || item.start?.date || "", end: item.end?.dateTime || item.end?.date || "", location: String(item.location || ""), link: "", meetingLink: String(item.hangoutLink || item.conferenceData?.entryPoints?.find(point => point.entryPointType === "video")?.uri || ""), attachments: Array.isArray(item.attachments) ? item.attachments.map(a => ({fileId: String(a.fileId || ""), url: String(a.fileUrl || ""), name: String(a.title || "Calendar attachment"), mimeType: String(a.mimeType || "")})).filter(a => a.fileId && a.url) : []}));
}
async function createEvent(userId, blockId, {title,start,end,attendees=[]}) {
    const response=await calendarFetch(userId,"/calendars/primary/events?sendUpdates=all",blockId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({summary:title,start:{dateTime:start},end:{dateTime:end},attendees:attendees.map(email=>({email}))})});
    const item=await response.json();
    return {id:String(item.id||""),title:String(item.summary||title),start:item.start?.dateTime||start,end:item.end?.dateTime||end,location:String(item.location||""),attachments:[]};
}

async function downloadAttachment(userId, blockId, fileId) {
    let current = connectionFor(userId, blockId);
    if (!current) throw new Error("Google Calendar is not connected.");
    if (Date.now() >= Number(current.expiresAt || 0) - 60_000) await refresh(userId, blockId);
    current = connectionFor(userId, blockId);
    let response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {headers: {Authorization: `Bearer ${current.accessToken}`}});
    if (response.status === 401) { await refresh(userId, blockId); current = connectionFor(userId, blockId); response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {headers: {Authorization: `Bearer ${current.accessToken}`}}); }
    if (!response.ok) throw new Error(response.status === 403 ? "Reconnect Google Calendar and allow read-only Google Drive access." : "Google Drive could not download this attachment.");
    return response;
}

function getStatus(userId, blockId) {
    let configured = true;
    try { configuration(); } catch { configured = false; }
    return {connected: Boolean(connectionFor(userId, blockId)), configured};
}
function disconnect(userId, blockId) { connections.delete(key(userId, blockId)); removeConnection("calendar", userId, blockId); }
module.exports = {createEvent, disconnect, downloadAttachment, exchangeAuthorizationCode, getAuthorizationUrl, getStatus, hasPendingAuthorization, listEvents};
