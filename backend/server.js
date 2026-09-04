require("./services/hostFilesystem");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {execFile, spawn} = require("child_process");
let xlsxModule;
let readFileContentModule;
let analyzeDocumentModule;
let saveFileInfoModule;
let checkFolderDeadlinesModule;
let syncArchiveModule;

function getXlsx() { return xlsxModule ??= require("xlsx"); }
function readFileContent(...args) { return (readFileContentModule ??= require("./ai/reader"))(...args); }
function analyzeDocument(...args) { return (analyzeDocumentModule ??= require("./ai/analyzer"))(...args); }
function saveFileInfo(...args) { return (saveFileInfoModule ??= require("./database/excelManager"))(...args); }
function checkFolderDeadlines(...args) { return (checkFolderDeadlinesModule ??= require("./services/deadlineService").checkFolderDeadlines)(...args); }
function syncArchive(...args) { return (syncArchiveModule ??= require("./services/archiveService").syncArchive)(...args); }

const {moveToTrash} = require("./services/trashService");
const {searchFiles} = require("./services/searchService");
const {readDashboardPreferences, writeDashboardPreferences} = require("./services/userPreferencesService");
const {getRuntimeUploadsDirectory} = require("./services/runtimePaths");
const {getEmailAlertSettings, normalizeProviderBlock, saveEmailAlertSettings} = require("./services/emailAlertSettingsService");
const {startEmailAlertScheduler} = require("./services/emailAlertScheduler");
const {migrateLegacyConnections} = require("./services/emailTokenStore");
const {addAuditEvent, listAuditEvents} = require("./services/auditLogService");
const {analyzeDomainPage, analyzeProjection, downloadDomainFile, listDomainDownloads, readDomainPreview} = require("./services/projectionAnalysisService");
const {createStickyNote} = require("./services/stickyNoteAiService");
const {integrationStatus, saveIntegrationConfiguration} = require("./services/desktopIntegrationConfigService");
const {createBrowserBridgeToken, resolveBrowserDrop, stageBrowserDrop} = require("./services/browserBridgeService");
const {
    createEvent: createGoogleCalendarEvent,
    authenticateRequest,
    createEmergencyRecoveryCode,
    createInvite,
    createPasswordReset,
    createSession,
    createUser,
    getCookie,
    login,
    removeSession,
    resetPassword,
    setupRequired
} = require("./services/userAuthService");

const {
    createDraft: createGmailDraft,
    downloadAttachment,
    disconnect: disconnectGmail,
    exchangeAuthorizationCode,
    getAuthorizationUrl,
    getEmailIdentity: getGmailEmailIdentity,
    getMessageText: getGmailMessageText,
    getStatus: getGmailStatus,
    listAttachments: listGmailAttachments,
    listInboxMessages
} = require("./services/gmailService");

const {
    evaluateGmailWarnings
} = require("./services/gmailWarningService");

const {
    disconnect: disconnectGoogleCalendar,
    downloadAttachment: downloadGoogleCalendarAttachment,
    exchangeAuthorizationCode: exchangeGoogleCalendarAuthorizationCode,
    getAuthorizationUrl: getGoogleCalendarAuthorizationUrl,
    getStatus: getGoogleCalendarStatus,
    hasPendingAuthorization: hasPendingGoogleCalendarAuthorization,
    listEvents: listGoogleCalendarEvents
} = require("./services/googleCalendarService");

const {
    createDraft: createOutlookDraft,
    downloadAttachment: downloadOutlookAttachment,
    disconnect: disconnectOutlook,
    exchangeAuthorizationCode: exchangeOutlookAuthorizationCode,
    getAuthorizationUrl: getOutlookAuthorizationUrl,
    getEmailIdentity: getOutlookEmailIdentity,
    getMessageText: getOutlookMessageText,
    getStatus: getOutlookStatus,
    listAttachments: listOutlookAttachments,
    listInboxMessages: listOutlookInboxMessages
} = require("./services/outlookService");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const APP_ORIGIN = (process.env.APP_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, "");
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || APP_ORIGIN).replace(/\/$/, "");
const RUNTIME_MODE = process.env.FOLDERROCKET_DESKTOP === "1" ? "desktop" : "manual";
const AUTH_ATTEMPT_WINDOW_MS = 1000 * 60 * 15;
const AUTH_MAX_FAILURES = 8;
const authFailures = new Map();

app.set("trust proxy", 1);

function oauthOriginForRequest(request) {
    const requestHost = String(request.get("host") || "").trim().toLowerCase();
    // The installed app and the local development server always use this
    // canonical callback. It prevents an old public APP_ORIGIN in .env from
    // sending any local mailbox connection to a stale Tailscale address.
    if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(requestHost)) {
        return `http://localhost:${PORT}`;
    }
    return APP_ORIGIN;
}

function oauthCompletionUrl(provider, blockId, fallbackOrigin) {
    if (RUNTIME_MODE === "desktop") {
        const parameters = new URLSearchParams({provider});
        if (blockId) parameters.set("blockId", blockId);
        return `folderrocket://oauth/connected?${parameters}`;
    }
    return `${fallbackOrigin}?${provider}=connected${blockId ? `&blockId=${encodeURIComponent(blockId)}` : ""}`;
}

function authAttemptKey(request, action) {
    return `${action}:${request.ip || request.socket.remoteAddress || "unknown"}`;
}

function isAuthThrottled(request, response, action) {
    const key = authAttemptKey(request, action);
    const record = authFailures.get(key);
    if (!record || record.resetAt <= Date.now()) {
        authFailures.delete(key);
        return false;
    }
    if (record.count < AUTH_MAX_FAILURES) return false;
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000));
    response.set("Retry-After", String(retryAfter));
    response.status(429).json({message: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`});
    return true;
}

function recordAuthFailure(request, action) {
    const key = authAttemptKey(request, action);
    const now = Date.now();
    const existing = authFailures.get(key);
    const record = existing && existing.resetAt > now
        ? {count: existing.count + 1, resetAt: existing.resetAt}
        : {count: 1, resetAt: now + AUTH_ATTEMPT_WINDOW_MS};
    authFailures.set(key, record);
}

function clearAuthFailures(request, action) {
    authFailures.delete(authAttemptKey(request, action));
}

function normalizeFolderPath(value) {
    const cleaned = typeof value === "string" ? value.trim() : "";
    return cleaned.length >= 2 && cleaned.startsWith('"') && cleaned.endsWith('"')
        ? cleaned.slice(1, -1).trim()
        : cleaned;
}

function setSessionCookie(res, session) {
    res.cookie("folderrocket_session", session.token, {
        httpOnly: true,
        secure: APP_ORIGIN.startsWith("https://"),
        sameSite: "lax",
        maxAge: Math.max(0, session.expiresAt - Date.now()),
        path: "/"
    });
}

function clearSessionCookie(res) {
    res.clearCookie("folderrocket_session", {
        httpOnly: true,
        secure: APP_ORIGIN.startsWith("https://"),
        sameSite: "lax",
        path: "/"
    });
}

function isAdmin(user) {
    return user?.role === "admin";
}

function requireAuthenticated(req, res, next) {
    if (!req.user) return res.status(401).json({message: "Authentication required."});
    next();
}

function requireAdministrator(req, res, next) {
    if (!isAdmin(req.user)) return res.status(403).json({message: "Administrator access required."});
    next();
}

function isLoopbackRequest(req) {
    const address = String(req.ip || req.socket?.remoteAddress || "").toLowerCase();
    return address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function userWorkspace(user) {
    return path.resolve(user.workspacePath);
}

function isPathWithin(basePath, candidatePath) {
    const base = path.resolve(basePath);
    const candidate = path.resolve(candidatePath);
    return candidate === base || candidate.startsWith(`${base}${path.sep}`);
}

function assertUserPath(user, candidate, {allowMissing = false} = {}) {
    const resolved = path.resolve(normalizeFolderPath(candidate));
    if (!resolved || resolved === path.resolve(".")) throw new Error("A valid folder path is required.");
    if (!isAdmin(user) && !isPathWithin(userWorkspace(user), resolved)) {
        throw new Error("This account can only use files inside its private FolderRocket workspace.");
    }
    if (!allowMissing && !fs.existsSync(resolved)) throw new Error("The requested file or folder does not exist.");
    return resolved;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function sendLocalEmailView(res, message) {
    const subject = escapeHtml(message.subject || "Untitled email");
    const sender = escapeHtml(message.sender || "Unknown sender");
    const receivedAt = message.receivedAt ? escapeHtml(new Date(message.receivedAt).toLocaleString()) : "";
    const text = escapeHtml(message.text || "No readable text was found in this email.");
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title><style>body{margin:0;background:#f4f8fc;color:#182536;font:15px/1.55 Segoe UI,Arial,sans-serif}.mail{max-width:900px;margin:32px auto;background:#fff;border:1px solid #cbd9e7;border-radius:14px;box-shadow:0 10px 32px #17365d18;overflow:hidden}.head{padding:22px 28px;border-bottom:1px solid #dbe6ef;background:#f9fcff}.head h1{margin:0 0 9px;font-size:22px}.meta{color:#5f6d7d;font-size:13px}.body{padding:28px;white-space:pre-wrap;word-break:break-word}</style></head><body><article class="mail"><header class="head"><h1>${subject}</h1><div class="meta"><strong>From:</strong> ${sender}</div><div class="meta"><strong>Received:</strong> ${receivedAt}</div></header><main class="body">${text}</main></article></body></html>`);
}

async function openWithDefaultApp(filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error("File non trovato");
    }
    const command = process.platform === "win32" ? "powershell.exe" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32"
        ? ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", "& { param($target) Invoke-Item -LiteralPath $target }", filePath]
        : [filePath];
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, {detached: true, stdio: "ignore", windowsHide: true});
        child.once("error", reject);
        child.once("spawn", () => { child.unref(); resolve(); });
    });
}

function chooseParentFolderOnHost() {
    if (process.platform !== "win32") return Promise.reject(new Error("The native folder picker is available on Windows only."));
    const pickerScript = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
        "$dialog.Description = 'Choose where to create the new FolderRocket folder'",
        "$dialog.ShowNewFolderButton = $true",
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }"
    ].join("; ");
    return new Promise((resolve, reject) => {
        execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", pickerScript], {windowsHide: false, maxBuffer: 1024 * 1024}, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr?.trim() || "Unable to open the folder picker."));
            const selectedPath = stdout.trim();
            resolve(selectedPath || null);
        });
    });
}

async function listRemovableDrives() {
    if (process.platform !== "win32") return [];
    const script = "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 2' | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress";
    const output = await new Promise((resolve, reject) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {windowsHide: true, maxBuffer: 1024 * 1024}, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr?.trim() || "Unable to check removable drives."));
            resolve(stdout.trim());
        });
    });
    if (!output) return [];
    let parsed;
    try { parsed = JSON.parse(output); }
    catch { throw new Error("Windows did not return removable-drive data."); }
    return (Array.isArray(parsed) ? parsed : [parsed])
        .filter(item => item && typeof item.DeviceID === "string" && /^[A-Za-z]:$/.test(item.DeviceID))
        .map(item => ({
            id: item.DeviceID.toUpperCase(),
            path: `${item.DeviceID.toUpperCase()}\\`,
            label: typeof item.VolumeName === "string" && item.VolumeName.trim() ? item.VolumeName.trim() : "USB drive",
            size: Number(item.Size) || 0,
            freeSpace: Number(item.FreeSpace) || 0
        }));
}

function normalizeRemovableDrivePath(value) {
    const trimmed = String(value ?? "").trim().replace(/^"|"$/g, "");
    if (!/^[A-Za-z]:[\\/](?:[^<>:"|?*\x00-\x1f]+[\\/]?)*$/.test(trimmed)) return "";
    return path.resolve(trimmed);
}

function convertWordToPdf(sourcePath, targetPath) {
    const source = Buffer.from(sourcePath, "utf16le").toString("base64");
    const target = Buffer.from(targetPath, "utf16le").toString("base64");
    const script = [
        "$ErrorActionPreference = 'Stop'",
        `$source = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${source}'))`,
        `$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${target}'))`,
        "$word = $null; $document = $null",
        "try {",
        "  $word = New-Object -ComObject Word.Application",
        "  $word.Visible = $false",
        "  $document = $word.Documents.Open($source, $false, $true)",
        "  $document.ExportAsFixedFormat($target, 17)",
        "} finally {",
        "  if ($document) { $document.Close($false) }",
        "  if ($word) { $word.Quit() }",
        "}"
    ].join("; ");
    return new Promise((resolve, reject) => {
        const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {windowsHide: true});
        let error = "";
        child.stderr.on("data", data => { error += data.toString(); });
        child.on("error", reject);
        child.on("close", code => code === 0 && fs.existsSync(targetPath) ? resolve() : reject(new Error(error.trim() || "Microsoft Word non ha potuto creare il PDF")));
    });
}

function convertImageToPdf(sourcePath, targetPath) {
    const source = Buffer.from(sourcePath, "utf16le").toString("base64");
    const target = Buffer.from(targetPath, "utf16le").toString("base64");
    const script = [
        "$ErrorActionPreference = 'Stop'",
        `$source = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${source}'))`,
        `$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${target}'))`,
        "$word = $null; $document = $null",
        "try { $word = New-Object -ComObject Word.Application; $word.Visible = $false; $document = $word.Documents.Add(); $document.InlineShapes.AddPicture($source) | Out-Null; $document.ExportAsFixedFormat($target, 17) } finally { if ($document) { $document.Close($false) }; if ($word) { $word.Quit() } }"
    ].join("; ");
    return new Promise((resolve, reject) => {
        const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {windowsHide: true});
        let error = "";
        child.stderr.on("data", data => { error += data.toString(); });
        child.on("error", reject);
        child.on("close", code => code === 0 && fs.existsSync(targetPath) ? resolve() : reject(new Error(error.trim() || "Image conversion failed")));
    });
}

function writeTextPdf(targetPath, title, content) {
    const normalized = String(content ?? "")
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/•/g, "- ")
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u2022/g, "- ")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/[\u00E0\u00E1\u00E2\u00E3\u00E4]/g, "a")
        .replace(/[\u00E8\u00E9\u00EA\u00EB]/g, "e")
        .replace(/[\u00EC\u00ED\u00EE\u00EF]/g, "i")
        .replace(/[\u00F2\u00F3\u00F4\u00F5\u00F6]/g, "o")
        .replace(/[\u00F9\u00FA\u00FB\u00FC]/g, "u")
        .replace(/\u00E7/g, "c")
        .replace(/\u00F1/g, "n")
        .replace(/[^\x20-\x7E\r\n\t]/g, "?");
    const wrapLine = line => {
        const words = line.trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [""];
        const lines = [];
        let current = "";
        for (const word of words) {
            if (!current || current.length + word.length + 1 <= 88) current = current ? `${current} ${word}` : word;
            else { lines.push(current); current = word; }
        }
        lines.push(current);
        return lines;
    };
    const safeLines = normalized.split(/\r?\n/).flatMap(wrapLine);
    const pages = [];
    for (let index = 0; index < Math.max(safeLines.length, 1); index += 48) pages.push(safeLines.slice(index, index + 48));
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
    const pageIds = [];
    for (const lines of pages) {
        const pageId = objects.length + 1;
        const contentId = pageId + 1;
        pageIds.push(pageId);
        const escaped = [title, ...lines].map(line => String(line).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") );
        const stream = `BT /F1 12 Tf 48 800 Td (${escaped[0]}) Tj /F1 9 Tf 0 -20 Td ${escaped.slice(1).map(line => `(${line}) Tj 0 -14 Td`).join(" ")} ET`;
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
        objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    }
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    fs.writeFileSync(targetPath, Buffer.from(pdf, "latin1"));
}

function writeTextDocx(targetPath, title, content) {
    const encodedTarget = Buffer.from(targetPath, "utf16le").toString("base64");
    const encodedContent = Buffer.from(`${String(title ?? "FolderRocket note")}\r\n\r\n${String(content ?? "")}`, "utf16le").toString("base64");
    const script = [
        "$ErrorActionPreference = 'Stop'",
        `$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedTarget}'))`,
        `$content = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedContent}'))`,
        "$word = $null; $document = $null",
        "try {",
        "  $word = New-Object -ComObject Word.Application",
        "  $word.Visible = $false",
        "  $document = $word.Documents.Add()",
        "  $document.Content.Text = $content",
        "  $document.SaveAs2($target, 16)",
        "} finally {",
        "  if ($document) { $document.Close($false) }",
        "  if ($word) { $word.Quit() }",
        "}"
    ].join("; ");
    return new Promise((resolve, reject) => {
        const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {windowsHide: true});
        let error = "";
        child.stderr.on("data", data => { error += data.toString(); });
        child.on("error", reject);
        child.on("close", code => code === 0 && fs.existsSync(targetPath) ? resolve() : reject(new Error(error.trim() || "Microsoft Word could not create the DOCX file")));
    });
}


// Permette le richieste dal frontend
app.use(
    cors({
        origin: [
            FRONTEND_ORIGIN,
            "http://localhost:5173"
        ],
        credentials: true
    })
);


// Permette al server di leggere JSON
app.use(
    express.json({limit: "6mb"})
);

// ==================================================
// ACCOUNT ACCESS AND PRIVATE WORKSPACES
// ==================================================

app.use((req, res, next) => {
    req.user = authenticateRequest(req);
    next();
});

app.get("/auth/bootstrap", (req, res) => {
    res.json({setupRequired: setupRequired()});
});

app.post("/auth/register", (req, res) => {
    if (isAuthThrottled(req, res, "register")) return;
    try {
        const firstAccount = setupRequired();
        const user = createUser({
            email: req.body?.email,
            password: req.body?.password,
            inviteCode: req.body?.inviteCode
        });
        if (firstAccount) migrateLegacyConnections(user.id);
        const session = createSession(user.id);
        setSessionCookie(res, session);
        clearAuthFailures(req, "register");
        addAuditEvent({user, action: "account_created", details: {role: user.role}});
        addAuditEvent({user, action: "signed_in", details: {method: "registration"}});
        res.status(201).json({user});
    } catch (error) {
        recordAuthFailure(req, "register");
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to create the account."});
    }
});

app.post("/auth/login", (req, res) => {
    if (isAuthThrottled(req, res, "login")) return;
    try {
        const user = login({email: req.body?.email, password: req.body?.password});
        const session = createSession(user.id);
        setSessionCookie(res, session);
        clearAuthFailures(req, "login");
        addAuditEvent({user, action: "signed_in", details: {method: "password"}});
        res.json({user});
    } catch (error) {
        recordAuthFailure(req, "login");
        res.status(401).json({message: error instanceof Error ? error.message : "Unable to sign in."});
    }
});

app.post("/auth/logout", (req, res) => {
    if (req.user) addAuditEvent({user: req.user, action: "signed_out"});
    removeSession(getCookie(req, "folderrocket_session"));
    clearSessionCookie(res);
    res.json({message: "Signed out."});
});

app.get("/auth/me", (req, res) => {
    if (!req.user) return res.status(401).json({message: "Sign in required."});
    res.json({user: req.user});
});

app.get("/auth/admin/audit-log", requireAuthenticated, requireAdministrator, (req, res) => {
    res.json({events: listAuditEvents({limit: req.query?.limit})});
});

app.post("/auth/invitations", (req, res) => {
    try {
        if (!isAdmin(req.user)) throw new Error("Only the administrator can create invitations.");
        res.status(201).json(createInvite(req.user.id, req.body?.email));
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to create invitation."});
    }
});

app.post("/auth/recovery-code", (req, res) => {
    try {
        if (!req.user) throw new Error("Sign in required.");
        res.status(201).json(createEmergencyRecoveryCode(req.user.id));
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to create a recovery code."});
    }
});

app.post("/auth/admin-password-reset", (req, res) => {
    try {
        if (!isAdmin(req.user)) throw new Error("Only the administrator can reset another account password.");
        res.status(201).json(createPasswordReset(req.user.id, req.body?.email));
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to create a reset code."});
    }
});

app.post("/auth/password-reset", (req, res) => {
    if (isAuthThrottled(req, res, "password-reset")) return;
    try {
        const user = resetPassword({
            email: req.body?.email,
            code: req.body?.code,
            password: req.body?.password
        });
        const session = createSession(user.id);
        setSessionCookie(res, session);
        clearAuthFailures(req, "password-reset");
        addAuditEvent({user, action: "password_reset_signed_in", details: {method: "recovery_code"}});
        res.json({user});
    } catch (error) {
        recordAuthFailure(req, "password-reset");
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to reset password."});
    }
});

app.get("/settings/dashboard", (req, res) => {
    if (!req.user) return res.status(401).json({message: "Sign in required."});
    res.json({settings: readDashboardPreferences(req.user.id)});
});

app.put("/settings/dashboard", (req, res) => {
    try {
        if (!req.user) throw new Error("Sign in required.");
        const settings = req.body?.settings;
        if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Invalid dashboard settings.");
        const existing = readDashboardPreferences(req.user.id) || {};
        // Dashboard saves frequently. Keep the server-owned scheduled-alert state
        // unless this request deliberately contains a replacement for it.
        writeDashboardPreferences(req.user.id, {
            ...existing,
            ...settings,
            emailAlerts: settings.emailAlerts ?? existing.emailAlerts
        });
        res.json({message: "Dashboard settings saved."});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to save dashboard settings."});
    }
});

// Desktop-only credentials stay in the current Windows user's private app-data folder.
// The response deliberately reports status only: secret values are never sent back to the UI.
app.get("/desktop/integrations/status", requireAuthenticated, requireAdministrator, (req, res) => {
    res.json(integrationStatus());
});

app.put("/desktop/integrations/config", requireAuthenticated, requireAdministrator, (req, res) => {
    try {
        res.json(saveIntegrationConfiguration(req.body?.settings));
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to save local integration settings."});
    }
});

// The code is shown once to the local administrator, then stored only as a hash.
// A browser extension uses it solely to send an attachment to this local backend.
app.post("/browser-bridge/token", requireAuthenticated, requireAdministrator, (req, res) => {
    try {
        const token = createBrowserBridgeToken(req.user.id);
        addAuditEvent({user: req.user, action: "browser_bridge_code_generated"});
        res.status(201).json({token});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to generate the browser bridge code."});
    }
});

app.use((req, res, next) => {
    const pathIsPublic = req.path === "/health"
        || req.path === "/auth/bootstrap"
        || req.path === "/auth/register"
        || req.path === "/auth/login"
        || req.path === "/auth/logout"
        || req.path === "/auth/password-reset"
        || req.path === "/auth/gmail/callback"
        || req.path === "/auth/outlook/callback"
        || req.path === "/browser-bridge/stage"
        || req.path === "/"
        || req.path.startsWith("/assets/")
        || req.path === "/favicon.ico";
    if (pathIsPublic || req.method === "OPTIONS") return next();
    return requireAuthenticated(req, res, next);
});

app.get("/email/alerts/settings", requireAuthenticated, (req, res) => {
    res.json({settings: getEmailAlertSettings(req.user.id)});
});

app.put("/email/alerts/settings", requireAuthenticated, (req, res) => {
    try {
        const settings = req.body?.settings;
        if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Invalid email-alert settings.");
        res.json({settings: saveEmailAlertSettings(req.user.id, settings)});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to save email-alert settings."});
    }
});

function readAlertBlockId(request) {
    const value = typeof request.query?.blockId === "string" ? request.query.blockId.trim() : "";
    return /^[a-zA-Z0-9_-]{1,120}$/.test(value) ? value : "";
}

function getScopedProviderSettings(userId, provider, blockId) {
    const settings = getEmailAlertSettings(userId);
    if (!blockId) return {settings, providerSettings: settings[provider]};
    const existing = settings[provider].blocks?.[blockId];
    if (existing) return {settings, providerSettings: existing};

    // Move a pre-block configuration to the first block that asks for it. New blocks
    // then start empty, so no alert is silently shared between separate cards.
    if (!Object.keys(settings[provider].blocks ?? {}).length && (settings[provider].rules.length || Object.keys(settings[provider].runtime ?? {}).length)) {
        const migrated = normalizeProviderBlock(settings[provider]);
        const saved = saveEmailAlertSettings(userId, {
            ...settings,
            [provider]: {...settings[provider], rules: [], runtime: {}, blocks: {...settings[provider].blocks, [blockId]: migrated}}
        });
        return {settings: saved, providerSettings: saved[provider].blocks[blockId]};
    }
    return {settings, providerSettings: normalizeProviderBlock({})};
}

app.get("/email/alerts/settings/:provider", requireAuthenticated, (req, res) => {
    const provider = req.params.provider;
    if (provider !== "gmail" && provider !== "outlook") return res.status(400).json({message: "Unknown email provider."});
    const scoped = getScopedProviderSettings(req.user.id, provider, readAlertBlockId(req));
    res.json({providerSettings: scoped.providerSettings, favorites: scoped.settings.favorites});
});

app.put("/email/alerts/settings/:provider", requireAuthenticated, (req, res) => {
    try {
        const provider = req.params.provider;
        if (provider !== "gmail" && provider !== "outlook") throw new Error("Unknown email provider.");
        const providerSettings = req.body?.providerSettings;
        if (!providerSettings || typeof providerSettings !== "object" || Array.isArray(providerSettings)) throw new Error("Invalid provider alert settings.");
        const current = getEmailAlertSettings(req.user.id);
        const blockId = readAlertBlockId(req);
        const next = blockId ? {
            ...current,
            [provider]: {
                ...current[provider],
                blocks: {
                    ...current[provider].blocks,
                    // Browser edits must never erase results written by the scheduler.
                    [blockId]: {...providerSettings, runtime: current[provider].blocks?.[blockId]?.runtime ?? {}}
                }
            },
            favorites: Array.isArray(req.body?.favorites) ? req.body.favorites : current.favorites
        } : {
            ...current,
            // Legacy non-block route kept for backward compatibility.
            [provider]: {...providerSettings, runtime: current[provider].runtime},
            favorites: Array.isArray(req.body?.favorites) ? req.body.favorites : current.favorites
        };
        const saved = saveEmailAlertSettings(req.user.id, next);
        res.json({providerSettings: blockId ? saved[provider].blocks[blockId] : saved[provider], favorites: saved.favorites});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to save email-alert settings."});
    }
});

// The image exists only in this request. It is never written to disk by FolderRocket.
app.post("/projection/analyze", requireAuthenticated, async (req, res) => {
    try {
        const result = await analyzeProjection(req.body?.imageDataUrl, req.body?.query);
        addAuditEvent({user: req.user, action: "projection_analyzed"});
        res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to analyse the projection.";
        const isInputError = /valid projection image|required|too large/i.test(message);
        res.status(isInputError ? 400 : 502).json({message});
    }
});

// Reads only publicly reachable page text. It never receives browser cookies or credentials.
app.post("/domain/analyze", requireAuthenticated, async (req, res) => {
    try {
        const result = await analyzeDomainPage(req.body?.url, req.body?.query);
        addAuditEvent({user: req.user, action: "domain_analyzed"});
        res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to analyse this page.";
        const isInputError = /valid page address|required|public http|private network|readable text|too large/i.test(message);
        res.status(isInputError ? 400 : 502).json({message});
    }
});

app.post("/domain/preview", requireAuthenticated, async (req, res) => {
    try { res.json(await readDomainPreview(req.body?.url)); }
    catch (error) {
        const message=error instanceof Error?error.message:"Unable to read this public page.";
        res.status(/valid page address|public http|private network|readable text|too large/i.test(message)?400:502).json({message});
    }
});

// The file picker reads only links declared by the loaded public page.  The
// download route repeats that check, so a client cannot use this as a generic
// network fetcher for arbitrary URLs.
app.post("/domain/downloads", requireAuthenticated, async (req, res) => {
    try {
        const result = await listDomainDownloads(req.body?.url);
        addAuditEvent({user: req.user, action: "domain_downloads_listed", details: {count: result.downloads.length}});
        res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to inspect downloadable files.";
        res.status(/valid page address|public http|private network|HTML page|too large/i.test(message) ? 400 : 502).json({message});
    }
});

app.post("/domain/download", requireAuthenticated, async (req, res) => {
    try {
        const result = await downloadDomainFile(req.body?.pageUrl, req.body?.fileUrl);
        addAuditEvent({user: req.user, action: "domain_file_downloaded", details: {name: result.fileName}});
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-FolderRocket-Filename", encodeURIComponent(result.fileName));
        res.setHeader("Content-Disposition", `attachment; filename="${result.fileName.replaceAll('"', "")}"`);
        res.type(result.contentType).send(result.content);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to download this file.";
        res.status(/Select a downloadable|no longer available|valid page address|public http|private network|larger than|web page|empty/i.test(message) ? 400 : 502).json({message});
    }
});

// Google Calendar API keys intentionally support public calendars only. Private
// calendars will use a separate OAuth consent flow rather than exposing a key.
app.get("/calendar/google/events", requireAuthenticated, async (req, res) => {
    try {
        const blockId = readAlertBlockId(req);
        if (getGoogleCalendarStatus(req.user.id, blockId).connected) {
            const days = Math.max(1, Math.min(90, Math.floor(Number(req.query?.days) || 14)));
            const view = req.query?.view === "upcoming" ? "upcoming" : "week";
            const weekStart = typeof req.query?.weekStart === "string" ? req.query.weekStart : "";
            const events = await listGoogleCalendarEvents(req.user.id, blockId, {days, view, weekStart});
            addAuditEvent({user: req.user, action: "google_calendar_read", details: {view, count: events.length}});
            return res.json({events, days, view, weekStart});
        }
        const apiKey = String(process.env.GOOGLE_CALENDAR_API_KEY ?? "").trim();
        if (!apiKey) throw new Error("Connect Google Calendar in this block first.");
        const calendarId = typeof req.query?.calendarId === "string" ? req.query.calendarId.trim() : "";
        if (!calendarId || calendarId.length > 320) throw new Error("Enter a public Google Calendar ID.");
        const days = Math.max(1, Math.min(90, Math.floor(Number(req.query?.days) || 14)));
        const view = req.query?.view === "upcoming" ? "upcoming" : "week";
        const now = new Date();
        const startOfCurrentWeek = new Date(now);
        const day = startOfCurrentWeek.getDay();
        startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() - (day === 0 ? 6 : day - 1));
        startOfCurrentWeek.setHours(0, 0, 0, 0);
        const requestedWeek = typeof req.query?.weekStart === "string" ? req.query.weekStart : "";
        const weekMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(requestedWeek);
        if (view === "week" && weekMatch) {
            const requestedDate = new Date(Number(weekMatch[1]), Number(weekMatch[2]) - 1, Number(weekMatch[3]));
            if (requestedDate.getFullYear() === Number(weekMatch[1]) && requestedDate.getMonth() === Number(weekMatch[2]) - 1 && requestedDate.getDate() === Number(weekMatch[3])) {
                const requestedDay = requestedDate.getDay();
                requestedDate.setDate(requestedDate.getDate() - (requestedDay === 0 ? 6 : requestedDay - 1));
                requestedDate.setHours(0, 0, 0, 0);
                startOfCurrentWeek.setTime(requestedDate.getTime());
            }
        }
        const endOfCurrentWeek = new Date(startOfCurrentWeek);
        endOfCurrentWeek.setDate(endOfCurrentWeek.getDate() + 7);
        const timeMin = view === "week" ? startOfCurrentWeek : now;
        const timeMax = view === "week" ? endOfCurrentWeek : new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const parameters = new URLSearchParams({
            key: apiKey,
            singleEvents: "true",
            orderBy: "startTime",
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            maxResults: "60",
            fields: "items(id,summary,start,end,location,htmlLink,attachments(fileId,fileUrl,title,mimeType,iconLink))"
        });
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${parameters}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || "Google Calendar could not read this calendar.");
        const events = Array.isArray(data.items) ? data.items.map(item => ({
            id: String(item.id ?? ""),
            title: typeof item.summary === "string" && item.summary.trim() ? item.summary.trim() : "Untitled event",
            start: item.start?.dateTime || item.start?.date || "",
            end: item.end?.dateTime || item.end?.date || "",
            location: typeof item.location === "string" ? item.location : "",
            link: typeof item.htmlLink === "string" ? item.htmlLink : "",
            attachments: Array.isArray(item.attachments) ? item.attachments
                .filter(attachment => typeof attachment?.fileId === "string" && typeof attachment?.fileUrl === "string")
                .map(attachment => ({
                    fileId: attachment.fileId,
                    url: attachment.fileUrl,
                    name: typeof attachment.title === "string" && attachment.title.trim() ? attachment.title.trim() : "Calendar attachment",
                    mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : ""
                })) : []
        })) : [];
        const weekStart = `${startOfCurrentWeek.getFullYear()}-${String(startOfCurrentWeek.getMonth() + 1).padStart(2, "0")}-${String(startOfCurrentWeek.getDate()).padStart(2, "0")}`;
        addAuditEvent({user: req.user, action: "google_calendar_read", details: {calendarId, view, weekStart, count: events.length}});
        res.json({events, days, view, weekStart});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to read Google Calendar."});
    }
});

app.post("/calendar/google/events", requireAuthenticated, async (req,res)=>{
    try {
        const blockId=readAlertBlockId(req);
        const title=typeof req.body?.title==="string"?req.body.title.trim():"";
        const start=new Date(req.body?.start),end=new Date(req.body?.end);
        if(!title||title.length>200||Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)throw new Error("Enter a title and a valid start and end time.");
        const attendees=(Array.isArray(req.body?.attendees)?req.body.attendees:[]).filter(value=>typeof value==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)).slice(0,50);
        const event=await createGoogleCalendarEvent(req.user.id,blockId,{title,start:start.toISOString(),end:end.toISOString(),attendees});
        addAuditEvent({user:req.user,action:"google_calendar_event_created",details:{title,start:event.start,end:event.end}});
        res.json({event});
    } catch(error){res.status(400).json({message:error instanceof Error?error.message:"Unable to create the Calendar event."});}
});

// Calendar attachments use the read-only Drive permission attached to the
// selected Calendar block, so private meeting files remain available by drag.
app.get("/calendar/google/attachments/download", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const fileId = typeof req.query?.fileId === "string" ? req.query.fileId.trim() : "";
        if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new Error("Invalid Google Drive attachment.");
        const requestedName = typeof req.query?.name === "string" ? path.basename(req.query.name).trim() : "";
        const fileName = requestedName || "calendar-attachment";
        const requestedMimeType = typeof req.query?.mimeType === "string" ? req.query.mimeType.trim() : "";
        const blockId = typeof req.query?.blockId === "string" ? req.query.blockId.trim() : "";
        const driveResponse = await downloadGoogleCalendarAttachment(req.user.id, blockId, fileId);
        const contentLength = Number(driveResponse.headers.get("content-length") || 0);
        if (contentLength > 75 * 1024 * 1024) throw new Error("This attachment is larger than 75 MB. Open it from Google Drive instead.");
        const content = Buffer.from(await driveResponse.arrayBuffer());
        const contentType = String(driveResponse.headers.get("content-type") || "").toLowerCase();
        const probablyHtml = contentType.includes("text/html") || /^\s*<(?:!doctype|html)/i.test(content.subarray(0, 256).toString("utf8"));
        if (probablyHtml) throw new Error("Google Drive returned an invalid attachment. Reconnect Calendar and try again.");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName.replaceAll('"', "")}"`);
        res.type(requestedMimeType || contentType || "application/octet-stream").send(content);
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to download the calendar attachment."});
    }
});

app.get("/devices/removable", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        res.json({drives: await listRemovableDrives()});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to check USB drives."});
    }
});

app.post("/devices/removable/files", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const requestedPath = normalizeRemovableDrivePath(req.body?.drive);
        if (!requestedPath) throw new Error("Choose a valid removable drive.");
        const drives = await listRemovableDrives();
        const drive = drives.find(item => {
            const root = path.resolve(item.path);
            const requested = path.resolve(requestedPath);
            const relative = path.relative(root, requested);
            return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
        });
        if (!drive || !fs.existsSync(requestedPath)) throw new Error("That USB folder is unavailable or outside the connected drive.");
        const entries = fs.readdirSync(requestedPath, {withFileTypes: true}).slice(0, 120);
        const files = entries.filter(entry => entry.isFile()).flatMap(entry => {
            const filePath = path.join(requestedPath, entry.name);
            try {
                // USB media can be removed or locked while Windows is reading
                // its metadata. We only list metadata here; one unreadable MKV
                // must not prevent the rest of the drive from appearing.
                const stats = fs.statSync(filePath);
                return [{name: entry.name, path: filePath, size: stats.size, createdAt: stats.birthtime.toISOString()}];
            } catch {
                return [];
            }
        }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const folders = entries.filter(entry => entry.isDirectory()).map(entry => ({name: entry.name, path: path.join(requestedPath, entry.name)}));
        res.json({drive, currentPath: requestedPath, files, folders, truncated: entries.length >= 120});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to read the USB drive."});
    }
});


// Cartella temporanea dove multer salva
// i file appena ricevuti
const upload = multer({

    dest: getRuntimeUploadsDirectory()

});

app.post("/browser-bridge/stage", upload.array("files", 8), (req, res) => {
    const temporaryFiles = Array.isArray(req.files) ? req.files : [];
    const removeTemporaryFiles = () => temporaryFiles.forEach(file => { try { fs.rmSync(file.path, {force: true}); } catch { /* Best effort cleanup. */ } });
    try {
        if (!isLoopbackRequest(req)) throw new Error("Browser bridge requests are accepted only from this computer.");
        const staged = stageBrowserDrop({token: req.body?.bridgeToken, bridgeId: req.body?.bridgeId, files: temporaryFiles});
        res.status(201).json({message: `${staged.files.length} Gmail attachment(s) ready to drop.`});
    } catch (error) {
        removeTemporaryFiles();
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to stage the Gmail attachment."});
    }
});

app.get("/browser-bridge/resolve/:bridgeId", requireAuthenticated, requireAdministrator, (req, res) => {
    try {
        const files = resolveBrowserDrop(req.user.id, req.params.bridgeId);
        res.json({files: files.map((file, index) => ({...file, downloadUrl: `/browser-bridge/download/${encodeURIComponent(req.params.bridgeId)}/${index}`}))});
    } catch (error) {
        res.status(404).json({message: error instanceof Error ? error.message : "The Gmail attachment is not ready."});
    }
});

app.get("/browser-bridge/download/:bridgeId/:index", requireAuthenticated, requireAdministrator, (req, res) => {
    try {
        const files = resolveBrowserDrop(req.user.id, req.params.bridgeId);
        const index = Number(req.params.index);
        const file = Number.isInteger(index) ? files[index] : null;
        if (!file || !fs.existsSync(file.path)) throw new Error("The staged Gmail attachment is no longer available.");
        res.set("Cache-Control", "no-store");
        res.sendFile(file.path);
    } catch (error) {
        res.status(404).json({message: error instanceof Error ? error.message : "Unable to read the staged Gmail attachment."});
    }
});


// ==================================================
// TEST BACKEND
// ==================================================

app.get(
    "/health",
    (req, res) => {
        res.json({
            status: "ok",
            runtime: RUNTIME_MODE
        });
    }
);


// ==================================================
// UPLOAD FILE
// ==================================================

app.post(
    "/upload",
    requireAuthenticated,
    upload.single("file"),
    async (req, res) => {

        try {

            // Percorso scelto nel frontend
            const destination = assertUserPath(req.user, req.body.path, {allowMissing: true});


            // File ricevuto da multer
            const file =
                req.file;

            /*
                Indica se archivio.xlsx deve essere
                aggiornato automaticamente dopo l'upload.
            */
            const archiveEnabled =
                req.body.archiveEnabled === "true";
            let archiveColumns;
            try { archiveColumns = JSON.parse(req.body.archiveColumns ?? "null"); } catch { archiveColumns = undefined; }

            // Controlla che il file sia stato inviato
            if (!file) {

                return res.status(400).json({

                    message:
                        "Nessun file ricevuto"

                });

            }


            // Controlla che il percorso sia stato inserito
            if (!destination) {

                return res.status(400).json({

                    message:
                        "Nessun percorso inserito"

                });

            }


            // Crea la cartella se non esiste
            if (
                !fs.existsSync(
                    destination
                )
            ) {

                fs.mkdirSync(
                    destination,
                    {
                        recursive: true
                    }
                );

            }


            // ==========================================
            // GESTIONE NOMI DUPLICATI
            // ==========================================

            const originalName =
                path.basename(
                    file.originalname
                );


            let finalName =
                originalName;


            let counter =
                1;


            while (
                fs.existsSync(
                    path.join(
                        destination,
                        finalName
                    )
                )
            ) {

                const extension =
                    path.extname(
                        originalName
                    );


                const baseName =
                    path.basename(
                        originalName,
                        extension
                    );


                finalName =
                    `${baseName} (${counter})${extension}`;


                counter++;

            }


            // Percorso finale del file
            const newPath =
                path.join(
                    destination,
                    finalName
                );


            // Sposta il file dalla cartella temporanea
            // alla cartella scelta dall'utente
            fs.renameSync(
                file.path,
                newPath
            );


            console.log(
                "FILE SALVATO:",
                newPath
            );


            /*
                L'analisi generale viene eseguita
                soltanto quando Archivio è attivo.
            */
            let analysis = {

                azienda: "",

                posizione: "",

                tipoDocumento: "",

                competenze: [],

                esperienza: "",

                aiStatus: "Not analysed"

            };


            if (archiveEnabled) {

                console.log(
                    "ARCHIVIO ATTIVO: ANALIZZO IL FILE"
                );


                let content = "";


                try {

                    const extractedContent =
                        await readFileContent(
                            newPath
                        );


                    if (
                        typeof extractedContent ===
                        "string"
                    ) {

                        content =
                            extractedContent;

                    }

                }

                catch (readError) {

                    console.log(
                        "ERRORE LETTURA FILE:",
                        readError
                    );

                }


                if (!content || content === "Formato non supportato") {
                    analysis.aiStatus = content === "Formato non supportato"
                        ? "Warning: unsupported file format"
                        : "Warning: no readable text extracted";
                } else {
                    try {
                        analysis = await analyzeDocument(content, archiveColumns);
                        analysis.aiStatus = "Success";
                    } catch (analysisError) {
                        analysis.aiStatus = `Error: ${analysisError instanceof Error ? analysisError.message : String(analysisError)}`;
                    }
                }


                await saveFileInfo(
                    destination,
                    finalName,
                    analysis,
                    archiveColumns
                );


                console.log(
                    "ARCHIVIO AGGIORNATO AUTOMATICAMENTE"
                );

            }

            else {

                console.log(
                    "ARCHIVIO DISATTIVATO: FILE NON INSERITO IN archivio.xlsx"
                );

            }



            console.log(
                "EXCEL AGGIORNATO"
            );

            addAuditEvent({
                user: req.user,
                action: "file_uploaded",
                details: {
                    fileName: finalName,
                    size: file.size,
                    destination: path.basename(destination)
                }
            });


            // Risposta al frontend
            res.json({

                message:
                    "File salvato correttamente",

                location:
                    newPath,

                analysis

            });

        }

        catch (error) {

            console.log(
                "ERRORE UPLOAD:",
                error
            );


            res.status(500).json({

                message:
                    error instanceof Error
                        ? error.message
                        : "Errore durante upload"

            });

        }

    }
);

// ==================================================
// CREAZIONE O AGGIORNAMENTO ARCHIVIO
// ==================================================

app.post(
    "/sync-archive",
    async (req, res) => {

        try {

            const folderPath = assertUserPath(req.user, req.body.path);


            const result = await syncArchive(folderPath, req.body?.archiveColumns);


            res.json(
                result
            );

        }

        catch (error) {

            console.log(
                "ERRORE SINCRONIZZAZIONE ARCHIVIO:",
                error
            );


            res.status(500).json({

                message:
                    error instanceof Error
                        ? error.message
                        : "Errore durante l'aggiornamento dell'archivio"

            });

        }

    }
);


// ==================================================
// CONTROLLO SCADENZE DI UNA CARTELLA
// ==================================================

app.post(
    "/check-deadlines",
    async (req, res) => {

        try {

            // Percorso della cartella
            const folderPath = assertUserPath(req.user, req.body.path);


            // Giorni entro cui mostrare
            // il warning giallo
            const watchDays =
                Number(
                    req.body.watchDays
                );


            // Giorni entro cui mostrare
            // il warning rosso
            const urgentDays =
                Number(
                    req.body.urgentDays
                );


            // Il servizio si occupa di:
            // - aprire o creare scadenze.xlsx
            // - leggere le scadenze già presenti
            // - analizzare i file senza scadenza
            // - aggiornare le righe
            // - applicare i colori
            //
            // Non modifica archivio.xlsx.
            const result =
                await checkFolderDeadlines(

                    folderPath,

                    watchDays,

                    urgentDays

                );


            res.json(
                result
            );

        }

        catch (error) {

            console.log(
                "ERRORE CONTROLLO SCADENZE:",
                error
            );


            res.status(500).json({

                message:
                    error instanceof Error
                        ? error.message
                        : "Errore durante il controllo delle scadenze"

            });

        }

    }
);

// ==================================================
// FIRE MOUNTAIN — SPOSTAMENTO NEL CESTINO
// ==================================================

app.post(
    "/trash-file",
    async (req, res) => {

        try {

            const targetPath = assertUserPath(req.user, req.body.path);


            const result =
                await moveToTrash(
                    targetPath
                );


            res.json(
                result
            );

        }

        catch (error) {

            console.log(
                "ERRORE FIRE MOUNTAIN:",
                error
            );


            res.status(400).json({

                message:
                    error instanceof Error
                        ? error.message
                        : "Errore durante lo spostamento nel cestino"

            });

        }

    }
);

// File trascinati dal browser in una cartella immaginaria. Il browser non
// comunica il percorso di origine, quindi il server conserva una copia privata
// che resta disponibile a Dashboard, Folder Management e File Studio.
app.post("/virtual-files/upload", requireAuthenticated, upload.array("files"), (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        if (!files.length) throw new Error("No files received");
        const directory = path.join(userWorkspace(req.user), ".virtual");
        fs.mkdirSync(directory, {recursive: true});
        const saved = files.map(file => {
            const name = path.basename(file.originalname);
            const fileDirectory = path.join(directory, crypto.randomUUID());
            fs.mkdirSync(fileDirectory, {recursive: true});
            const targetPath = path.join(fileDirectory, name);
            fs.renameSync(file.path, targetPath);
            return {name, path: targetPath, size: file.size, createdAt: new Date().toISOString()};
        });
        addAuditEvent({user: req.user, action: "virtual_files_uploaded", details: {count: saved.length}});
        res.json({files: saved});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to add virtual files"});
    }
});

// Identifica un file trascinato dal browser dentro le cartelle Dashboard note.
// Il risultato è restituito solo quando nome e dimensione corrispondono a una
// singola origine: in questo modo non si rischia di cancellare un omonimo.
app.post("/files/locate-configured", (req, res) => {
    try {
        const folders = Array.isArray(req.body?.folders) ? req.body.folders.filter(item => typeof item === "string") : [];
        const requestedFiles = Array.isArray(req.body?.files) ? req.body.files.filter(item => item && typeof item.name === "string" && Number.isFinite(item.size)) : [];
        const matches = [];
        for (const requested of requestedFiles) {
            const name = path.basename(requested.name);
            const candidates = [];
            for (const folderValue of folders) {
                const folder = assertUserPath(req.user, folderValue);
                if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) continue;
                const candidate = path.join(folder, name);
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && fs.statSync(candidate).size === requested.size) {
                    candidates.push(candidate);
                }
            }
            if (candidates.length === 1) {
                const stats = fs.statSync(candidates[0]);
                matches.push({name, path: candidates[0], size: stats.size, createdAt: stats.birthtime.toISOString()});
            }
        }
        res.json({matches});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to identify the source file"});
    }
});

app.post("/search-files", async (req, res) => {
    try {
        const folders = Array.isArray(req.body?.folders) ? req.body.folders.map(folder => assertUserPath(req.user, folder)) : [];
        const ai = Boolean(req.body?.ai);
        if (ai && !integrationStatus().aiConfigured) throw new Error("Enable the OpenAI AI integration before using AI Search Assistant.");
        res.json({results: await searchFiles(folders, req.body?.query, {ai})});
    }
    catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Ricerca non riuscita"});
    }
});

app.post("/files/recent", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const {recentFiles, defaultRecentRoots} = require("./services/recentFilesService");
        const extra = (Array.isArray(req.body?.folders) ? req.body.folders : []).slice(0, 60).map(folder => assertUserPath(req.user, folder, {allowMissing: true}));
        res.json(await recentFiles([...defaultRecentRoots(), ...extra], {hours: req.body?.hours}));
    } catch (error) { res.status(400).json({message: error.message}); }
});

app.get("/devices/phone", requireAuthenticated, requireAdministrator, async (_req, res) => {
    try { res.json(await require("./services/windowsTask").windowsTask("phone-files.ps1", {action: "devices"})); }
    catch (error) { res.status(400).json({message: error.message}); }
});

app.post("/devices/phone/:action", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const {deviceId, segments = [], name} = req.body || {};
        if (!["files", "copy", "recent"].includes(req.params.action) || typeof deviceId !== "string" || !Array.isArray(segments) || segments.length > 30 || segments.some(value => typeof value !== "string" || value.length > 255)) throw new Error("Invalid phone location.");
        const job = {action: req.params.action, deviceId, segments};
        if (job.action === "recent") { job.hours=Math.max(0.1,Math.min(87600,Number(req.body?.hours)||24));job.category=["all","image","file"].includes(req.body?.category)?req.body.category:"all"; }
        if (job.action === "copy") {
            if (typeof name !== "string" || !name || /[\\/\x00]/.test(name) || name === "." || name === "..") throw new Error("Invalid file name.");
            job.name = name;
            job.destination = path.join(userWorkspace(req.user), ".phone-imports", crypto.randomUUID());
            await fs.promises.mkdir(job.destination, {recursive: true});
        }
        res.json(await require("./services/windowsTask").windowsTask("phone-files.ps1", job, ["copy","recent"].includes(job.action) ? 125000 : 45000));
    } catch (error) { res.status(400).json({message: error.message}); }
});

app.post("/applications/open", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        if (typeof req.body?.name !== "string" || !req.body.name.trim() || req.body.name.length > 120) throw new Error("Invalid application name.");
        res.json(await require("./services/windowsTask").windowsTask("open-application.ps1", {name: req.body.name}));
    } catch (error) { res.status(400).json({message: error.message || "Unable to open application."}); }
});

app.post("/applications/discover", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const appId = String(req.body?.appId || "");
        if (!/^[a-zA-Z0-9_-]{1,120}$/.test(appId)) throw new Error("Invalid application identifier.");
        const extensions = [...new Set((Array.isArray(req.body?.extensions) ? req.body.extensions : []).map(value => String(value).replace(/^\./, "").toLowerCase()).filter(value => /^[a-z0-9]{1,12}$/.test(value)))];
        if (!extensions.length) throw new Error("Select at least one file type for this application.");
        const roots = [os.homedir(), process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer].filter(Boolean);
        if (process.platform === "win32") for (let code = 65; code <= 90; code += 1) {
            const root = String.fromCharCode(code) + ":\\";
            if (fs.existsSync(root)) roots.push(root);
        }
        const controller = new AbortController();
        const cancel = () => controller.abort();
        res.on("close", cancel);
        try {
            const cache = require("./services/applicationDiscoveryCache");
            const previous = cache.read(req.user.id, appId, extensions);
            const result = await require("./services/applicationDiscoveryService").discoverApplicationFiles(roots, extensions, {signal:controller.signal, previous});
            cache.write(req.user.id, appId, extensions, result);
            const {directories, ...response} = result;
            if (!res.destroyed) res.json(response);
        } finally { res.off("close", cancel); }
    } catch (error) { res.status(400).json({message:error instanceof Error?error.message:"Unable to scan application files."}); }
});

app.delete("/applications/discover", requireAuthenticated, requireAdministrator, (req, res) => {
    try {
        const appId = String(req.body?.appId || "");
        if (!/^[a-zA-Z0-9_-]{1,120}$/.test(appId)) throw new Error("Invalid application identifier.");
        require("./services/applicationDiscoveryCache").remove(req.user.id, appId);
        res.json({ok:true});
    } catch (error) { res.status(400).json({message:error instanceof Error?error.message:"Unable to clear the application cache."}); }
});

app.post("/sticky-notes/ai", async (req, res) => {
    try {
        if (!integrationStatus().aiConfigured) throw new Error("Enable the OpenAI AI integration before creating AI notes.");
        const folders = Array.isArray(req.body?.folders)
            ? req.body.folders.filter(folder => typeof folder === "string").map(folder => assertUserPath(req.user, folder))
            : [];
        const calendarEvents = Array.isArray(req.body?.calendarEvents)
            ? req.body.calendarEvents.slice(0, 20).filter(event => event && typeof event === "object")
            : [];
        res.json(await createStickyNote(req.body?.prompt, folders, calendarEvents));
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to create the AI note."});
    }
});

app.post("/list-folder-files", (req, res) => {
    try {
        const folder = assertUserPath(req.user, req.body?.folder);
        if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
            throw new Error("Il percorso della cartella non è valido o non è accessibile");
        }
        const files = fs.readdirSync(folder, {withFileTypes: true})
            .filter(entry => entry.isFile())
            .filter(entry => !["archivio.xlsx", "scadenze.xlsx"].includes(entry.name.toLowerCase()))
            .flatMap(entry => {
                const filePath = path.join(folder, entry.name);
                try {
                    const stats = fs.statSync(filePath);
                    return [{name: entry.name, path: filePath, createdAt: stats.birthtime.toISOString(), size: stats.size}];
                } catch {
                    // Some removable-media files can be briefly locked while
                    // Windows indexes them. Ignore only that item.
                    return [];
                }
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        // Directory entries are returned separately. The frontend requests their
        // contents only after the user expands a folder, so a large tree never
        // blocks the initial folder view.
        const folders = fs.readdirSync(folder, {withFileTypes: true})
            .filter(entry => entry.isDirectory())
            .flatMap(entry => {
                const folderPath = path.join(folder, entry.name);
                try {
                    const stats = fs.statSync(folderPath);
                    return [{name: entry.name, path: folderPath, createdAt: stats.birthtime.toISOString()}];
                } catch {
                    return [];
                }
            })
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"}));
        res.json({files, folders});
    }
    catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Impossibile leggere la cartella"});
    }
});

app.post("/file-types/inventory", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const roots = (Array.isArray(req.body?.folders) ? req.body.folders : []).map(folder => assertUserPath(req.user, folder)).filter(folder => fs.existsSync(folder) && fs.statSync(folder).isDirectory());
        const pending = [...new Set(roots)]; const counts = new Map(); let inspected = 0;
        while (pending.length && inspected < 20_000) {
            const current = pending.pop(); let entries; try { entries = await fs.promises.readdir(current,{withFileTypes:true}); } catch { continue; }
            for (const entry of entries) { if (entry.isDirectory()) pending.push(path.join(current,entry.name)); else if (entry.isFile()) { inspected += 1; const type=path.extname(entry.name).slice(1).toLowerCase(); if(type)counts.set(type,(counts.get(type)||0)+1); } if(inspected>=20_000)break; }
            if(inspected%500===0)await new Promise(resolve=>setImmediate(resolve));
        }
        res.json({types:[...counts.entries()].map(([type,count])=>({type,count})).sort((a,b)=>a.type.localeCompare(b.type)),total:[...counts.values()].reduce((sum,count)=>sum+count,0),truncated:Boolean(pending.length)});
    } catch(error){res.status(400).json({message:error instanceof Error?error.message:"Unable to inventory file types."});}
});

// File Studio uses this deliberately small local preview. Text-based documents
// are extracted locally; images and PDFs are shown inline without uploading
// anything to an external service.
app.post("/files/preview", async (req, res) => {
    try {
        const targetPath = assertUserPath(req.user, req.body?.path);
        if (!fs.statSync(targetPath).isFile()) throw new Error("The selected item is not a file.");
        const extension = path.extname(targetPath).toLowerCase();
        const assetUrl = `/files/preview/asset?path=${encodeURIComponent(targetPath)}`;
        if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(extension)) {
            return res.json({kind: "image", url: assetUrl});
        }
        if (extension === ".pdf") return res.json({kind: "pdf", url: assetUrl});
        const text = [".csv", ".md", ".log"].includes(extension)
            ? fs.readFileSync(targetPath, "utf8")
            : await readFileContent(targetPath);
        if (!text || text === "Formato non supportato") {
            return res.json({kind: "unavailable", message: "A text preview is not available for this file type."});
        }
        return res.json({kind: "text", text: String(text).slice(0, 12000)});
    } catch (error) {
        return res.status(400).json({message: error instanceof Error ? error.message : "Unable to preview this file."});
    }
});

app.get("/files/preview/asset", (req, res) => {
    try {
        const targetPath = assertUserPath(req.user, req.query?.path);
        if (!fs.statSync(targetPath).isFile()) throw new Error("The selected item is not a file.");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Disposition", `inline; filename="${path.basename(targetPath).replaceAll('"', "")}"`);
        return res.sendFile(targetPath);
    } catch (error) {
        return res.status(404).json({message: error instanceof Error ? error.message : "Preview file not found."});
    }
});

app.post("/folders/create", (req, res) => {
    try {
        const folder = assertUserPath(req.user, req.body?.path, {allowMissing: true});
        fs.mkdirSync(folder, {recursive: true});
        res.json({path: folder});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Impossibile creare la cartella"});
    }
});

// The picker is deliberately limited to the host administrator: it opens a
// native Windows dialog on the computer running FolderRocket, not in a remote browser.
app.post("/folders/pick-parent", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const selectedPath = await chooseParentFolderOnHost();
        res.json({path: selectedPath});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to open the folder picker."});
    }
});

app.post("/files/rename", (req, res) => {
    try {
        const sourcePath = assertUserPath(req.user, req.body?.path);
        const enteredName = typeof req.body?.name === "string" ? path.basename(req.body.name.trim()) : "";
        if (!sourcePath || !enteredName || !fs.existsSync(sourcePath)) throw new Error("File or new name is invalid");
        // Rinominare cambia solo il titolo. L'estensione effettiva del file
        // resta sempre quella originale, così non cambia né il formato né
        // l'icona mostrata nell'interfaccia.
        const name = `${path.basename(enteredName, path.extname(enteredName))}${path.extname(sourcePath)}`;
        const targetPath = path.join(path.dirname(sourcePath), name);
        if (fs.existsSync(targetPath)) throw new Error("A file with this name already exists");
        fs.renameSync(sourcePath, targetPath);
        res.json({path: targetPath, name});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to rename file"}); }
});

app.post("/files/move", (req, res) => {
    try {
        const destination = assertUserPath(req.user, req.body?.destination);
        const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter(item => typeof item === "string").map(item => assertUserPath(req.user, item)) : [];
        if (!destination || !fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) throw new Error("Select a valid destination folder");
        const moved = [];
        for (const sourcePath of paths) {
            if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
            const targetPath = path.join(destination, path.basename(sourcePath));
            if (fs.existsSync(targetPath)) throw new Error(`${path.basename(sourcePath)} already exists in the destination folder`);
            try {
                fs.renameSync(sourcePath, targetPath);
            } catch (error) {
                // rename non funziona tra dischi diversi. Copia e rimozione
                // mantengono comunque la semantica di un vero taglia/incolla.
                if (error && ["EXDEV", "EPERM"].includes(error.code)) {
                    try {
                        fs.copyFileSync(sourcePath, targetPath);
                        fs.unlinkSync(sourcePath);
                    } catch (fallbackError) {
                        // Non lasciare una copia quando il taglio non riesce:
                        // l'operazione deve essere atomica dal punto di vista UI.
                        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
                        if (fallbackError && fallbackError.code === "EPERM") {
                            throw new Error(`Cannot move ${path.basename(sourcePath)} because it is open or locked by OneDrive. Close the file and try again.`);
                        }
                        throw fallbackError;
                    }
                } else {
                    throw error;
                }
            }
            moved.push({name: path.basename(targetPath), path: targetPath});
        }
        res.json({moved});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to move files"}); }
});

app.post("/files/copy", (req, res) => {
    try {
        const destination = assertUserPath(req.user, req.body?.destination);
        const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter(item => typeof item === "string").map(item => assertUserPath(req.user, item)) : [];
        if (!destination || !fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) throw new Error("Select a valid destination folder");
        const copied = [];
        for (const sourcePath of paths) {
            if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
            const targetPath = path.join(destination, path.basename(sourcePath));
            if (fs.existsSync(targetPath)) throw new Error(`${path.basename(sourcePath)} already exists in the destination folder`);
            fs.copyFileSync(sourcePath, targetPath);
            const stats = fs.statSync(targetPath);
            copied.push({name: path.basename(targetPath), path: targetPath, size: stats.size, createdAt: stats.birthtime.toISOString()});
        }
        res.json({copied});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to copy files"}); }
});

// ==================================================
// CARGO SHIP - PERSONAL TEMPORARY FILE WORKSPACE
// ==================================================

function cargoShipDirectory(user) {
    const directory = path.join(userWorkspace(user), "CargoRocket");
    const legacy = path.join(userWorkspace(user), "Cargo Ship");
    if (!fs.existsSync(directory) && fs.existsSync(legacy)) {
        try { fs.renameSync(legacy, directory); } catch { /* Keep legacy data in place if another process has it open. */ }
    }
    fs.mkdirSync(directory, {recursive: true});
    return directory;
}

function nextAvailableFilePath(directory, preferredName) {
    const cleanName = path.basename(String(preferredName || "FolderRocket file")).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "FolderRocket file";
    const extension = path.extname(cleanName);
    const base = path.basename(cleanName, extension) || "FolderRocket file";
    let candidate = path.join(directory, `${base}${extension}`);
    let index = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(directory, `${base} (${index})${extension}`);
        index += 1;
    }
    return candidate;
}

app.post("/cargo-ship/text-file", requireAuthenticated, async (req, res) => {
    try {
        const format = ["txt", "pdf", "docx"].includes(req.body?.format) ? req.body.format : "txt";
        const text = typeof req.body?.text === "string" ? req.body.text : "";
        const enteredName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        if (!text.trim()) throw new Error("Add some text before creating the file.");
        if (text.length > 500000) throw new Error("The text is too large for CargoRocket.");
        const baseName = path.basename(enteredName || "FolderRocket note", path.extname(enteredName || ""));
        const targetPath = nextAvailableFilePath(cargoShipDirectory(req.user), `${baseName || "FolderRocket note"}.${format}`);
        if (format === "pdf") writeTextPdf(targetPath, baseName || "FolderRocket note", text);
        else if (format === "docx") await writeTextDocx(targetPath, baseName || "FolderRocket note", text);
        else fs.writeFileSync(targetPath, text, "utf8");
        const stats = fs.statSync(targetPath);
        addAuditEvent({user: req.user, action: "cargo_text_file_created", details: {fileName: path.basename(targetPath)}});
        res.json({file: {name: path.basename(targetPath), path: targetPath, size: stats.size}});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to create the CargoRocket file."});
    }
});

app.post("/cargo-ship/lens-screenshot", requireAuthenticated, (req, res) => {
    try {
        const imageDataUrl = typeof req.body?.imageDataUrl === "string" ? req.body.imageDataUrl : "";
        const match = imageDataUrl.match(/^data:image\/png;base64,([a-z0-9+/=\s]+)$/i);
        if (!match) throw new Error("A valid PNG screenshot is required.");
        if (imageDataUrl.length > 5_500_000) throw new Error("The lens screenshot is too large. Resize CargoRocket and try again.");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const targetPath = nextAvailableFilePath(cargoShipDirectory(req.user), `Lens screenshot ${timestamp}.png`);
        fs.writeFileSync(targetPath, Buffer.from(match[1].replace(/\s/g, ""), "base64"));
        const stats = fs.statSync(targetPath);
        addAuditEvent({user: req.user, action: "cargo_lens_screenshot_created", details: {fileName: path.basename(targetPath)}});
        res.json({file: {name: path.basename(targetPath), path: targetPath, size: stats.size}});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to save the lens screenshot."});
    }
});

app.post("/cargo-ship/stage-files", requireAuthenticated, upload.array("files"), (req, res) => {
    try {
        const temporaryFiles = Array.isArray(req.files) ? req.files : [];
        if (!temporaryFiles.length) throw new Error("No local files were received.");
        const directory = cargoShipDirectory(req.user);
        const staged = [];
        for (const file of temporaryFiles) {
            const targetPath = nextAvailableFilePath(directory, file.originalname);
            fs.renameSync(file.path, targetPath);
            const stats = fs.statSync(targetPath);
            staged.push({name: path.basename(targetPath), path: targetPath, size: stats.size});
        }
        addAuditEvent({user: req.user, action: "cargo_files_staged", details: {count: staged.length}});
        res.json({files: staged});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to stage local CargoRocket files."});
    }
});

function cargoEmailBlockId(request) {
    const value = typeof request.body?.blockId === "string" ? request.body.blockId.trim() : "";
    return /^[a-zA-Z0-9_-]{1,120}$/.test(value) ? value : "";
}

app.get("/cargo-ship/email-sources", requireAuthenticated, async (req, res) => {
    try {
        const blocks = Array.isArray(readDashboardPreferences(req.user.id)?.sourceBlocks)
            ? readDashboardPreferences(req.user.id).sourceBlocks
            : [];
        const sources = [];
        let gmailIndex = 0;
        let outlookIndex = 0;
        for (const block of blocks) {
            if (!block || typeof block.id !== "string" || !["gmail", "outlook"].includes(block.type)) continue;
            const provider = block.type;
            const index = provider === "gmail" ? ++gmailIndex : ++outlookIndex;
            const status = provider === "gmail" ? getGmailStatus(req.user.id, block.id) : getOutlookStatus(req.user.id, block.id);
            if (!status.connected) continue;
            let email = "";
            try {
                email = provider === "gmail"
                    ? await getGmailEmailIdentity(req.user.id, block.id)
                    : await getOutlookEmailIdentity(req.user.id, block.id);
            } catch { /* A connected source remains selectable even if its profile is temporarily unavailable. */ }
            sources.push({provider, blockId: block.id, email, label: email || `${provider === "gmail" ? "Gmail" : "Outlook"} source ${index}`});
        }
        res.json({sources});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to read connected email sources."});
    }
});

app.post("/cargo-ship/email-draft", requireAuthenticated, async (req, res) => {
    try {
        const provider = req.body?.provider === "outlook" ? "outlook" : req.body?.provider === "gmail" ? "gmail" : "";
        const blockId = cargoEmailBlockId(req);
        const to = typeof req.body?.to === "string" ? req.body.to : "";
        const subject = typeof req.body?.subject === "string" ? req.body.subject : "";
        const text = typeof req.body?.text === "string" ? req.body.text : "";
        const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 20).map(item => {
            const targetPath = assertUserPath(req.user, item?.path);
            if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) throw new Error("One email attachment is no longer available.");
            const attachmentLimit = provider === "outlook" ? 3 * 1024 * 1024 : 20 * 1024 * 1024;
            if (fs.statSync(targetPath).size > attachmentLimit) throw new Error(`${path.basename(targetPath)} is too large for this mailbox draft.`);
            return {path: targetPath, name: path.basename(typeof item?.name === "string" ? item.name : targetPath)};
        }) : [];
        if (!provider || !blockId || !text.trim()) throw new Error("Choose a connected email source and add the email text.");
        const draft = provider === "gmail"
            ? await createGmailDraft({to, subject, text, attachments}, req.user.id, blockId)
            : await createOutlookDraft({to, subject, text, attachments}, req.user.id, blockId);
        addAuditEvent({user: req.user, action: "cargo_email_draft_created", details: {fileName: subject || "FolderRocket draft"}});
        res.json({message: `Draft saved in ${provider === "gmail" ? "Gmail" : "Outlook"}. Review and send it from that mailbox.`, draftId: draft?.id ?? ""});
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create the email draft.";
        const requiresReconnect = /insufficient|permission|scope|access denied/i.test(message);
        res.status(400).json({message: requiresReconnect ? "Reconnect the selected email source, grant the new draft permission, then try again." : message});
    }
});

app.get("/search-files/download", (req, res) => {
    const targetPath = assertUserPath(req.user, req.query.path);
    if (!targetPath || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        return res.status(404).json({message: "File non trovato"});
    }
    res.download(targetPath, path.basename(targetPath));
});

app.post("/files/open-location", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const target = assertUserPath(req.user, req.body?.path);
        const stats = await fs.promises.stat(target);
        const folder = stats.isDirectory() ? target : path.dirname(target);
        const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
        await new Promise((resolve, reject) => {
            const child = spawn(command, [folder], {detached:true, stdio:"ignore", windowsHide:true});
            child.once("error", reject);
            child.once("spawn", () => { child.unref(); resolve(); });
        });
        res.json({path:folder});
    } catch (error) { res.status(400).json({message:error.message || "Unable to open containing folder."}); }
});

app.post("/files/keep", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const target = assertUserPath(req.user, req.body?.path);
        const stats = await fs.promises.stat(target);
        if (!stats.isFile()) throw new Error("The converted item is not a file.");
        res.json({name: path.basename(target), path: target, folder: path.dirname(target), size: stats.size});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to keep this file."}); }
});

app.post("/search-files/open", async (req, res) => {
    try {
        if (!isAdmin(req.user)) throw new Error("For security, files can be opened on the host computer only by the administrator. Download the file instead.");
        const targetPath = assertUserPath(req.user, req.body?.path);
        await openWithDefaultApp(targetPath);
        res.json({message: "File aperto"});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Impossibile aprire il file"});
    }
});

app.post("/files/change-format", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const mother = assertUserPath(req.user, req.body?.mother);
        const children = (Array.isArray(req.body?.children) ? req.body.children : []).map(file => assertUserPath(req.user, file));
        for (const file of [mother, ...children]) if (!(await fs.promises.stat(file)).isFile()) throw new Error("Choose files, not folders.");
        const result = await require("./services/changeFormatService").changeFormat(mother, children, req.body?.options || {}, userWorkspace(req.user));
        res.json(result);
    } catch (error) { res.status(400).json({message:error.message || "Unable to apply the mother format. Microsoft Word is required for documents."}); }
});

app.post("/convert-files", async (req, res) => {
    try {
        const targetFormat = typeof req.body?.format === "string" ? req.body.format.toLowerCase() : "";
        const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter(item => typeof item === "string").map(item => assertUserPath(req.user, item)) : [];
        const requestedNames = new Map((Array.isArray(req.body?.files) ? req.body.files : [])
            .filter(item => item && typeof item.path === "string" && typeof item.name === "string")
            .map(item => [item.path, path.basename(item.name)]));
        if (!paths.length || !["txt", "csv", "xlsx", "pdf"].includes(targetFormat)) throw new Error("Conversione non supportata");
        const converted = [];
        for (const sourcePath of paths) {
            if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) continue;
            const sourceExtension = path.extname(sourcePath).toLowerCase();
            const displayedSourceName = requestedNames.get(sourcePath) || path.basename(sourcePath);
            const targetPath = path.join(path.dirname(sourcePath), `${path.basename(displayedSourceName, path.extname(displayedSourceName))}_converted.${targetFormat}`);
            if (targetFormat === "pdf") {
                if (sourceExtension === ".pdf") fs.copyFileSync(sourcePath, targetPath);
                else if ([".doc", ".docx"].includes(sourceExtension)) await convertWordToPdf(sourcePath, targetPath);
                else if ([".png", ".jpg", ".jpeg"].includes(sourceExtension)) await convertImageToPdf(sourcePath, targetPath);
                else {
                    const content = sourceExtension === ".csv" ? fs.readFileSync(sourcePath, "utf8") : await readFileContent(sourcePath);
                    if (!content || content === "Formato non supportato") throw new Error(`${path.basename(sourcePath)} non può essere convertito in PDF`);
                    writeTextPdf(targetPath, path.basename(sourcePath), content);
                }
            } else if (targetFormat === "txt") {
                const content = sourceExtension === ".csv" ? fs.readFileSync(sourcePath, "utf8") : await readFileContent(sourcePath);
                if (!content || content === "Formato non supportato") throw new Error(`${path.basename(sourcePath)} non può essere convertito in TXT`);
                fs.writeFileSync(targetPath, content, "utf8");
            } else if (targetFormat === "csv" && sourceExtension === ".xlsx") {
                const XLSX = getXlsx();
                const workbook = XLSX.readFile(sourcePath);
                fs.writeFileSync(targetPath, XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]), "utf8");
            } else if (targetFormat === "xlsx" && sourceExtension === ".csv") {
                const XLSX = getXlsx();
                const workbook = XLSX.readFile(sourcePath, {type: "file"});
                XLSX.writeFile(workbook, targetPath);
            } else throw new Error(`${path.basename(sourcePath)} non supporta la conversione selezionata`);
            converted.push({name: path.basename(targetPath), path: targetPath});
        }
        res.json({converted});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Conversione non riuscita"}); }
});

function normalizeEmailRuleFilter(rule, fallback = {}) {
    const source = rule?.filter && typeof rule.filter === "object" ? rule.filter : fallback;
    const mode = source?.mode === "range" ? "range" : "hours";
    const hours = Math.min(8760, Math.max(1, Math.floor(Number(source?.hours) || (Number(source?.days) || 7) * 24)));
    const isDateTime = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
    const isDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    return {
        mode,
        hours,
        startAt: isDateTime(source?.startAt) ? source.startAt : (isDate(source?.startDate) ? `${source.startDate}T00:00` : ""),
        endAt: isDateTime(source?.endAt) ? source.endAt : (isDate(source?.endDate) ? `${source.endDate}T23:59` : "")
    };
}

async function checkEmailWarningsByRule(provider, rules, fallbackFilter, seenByRule, userId, blockId = "") {
    const groups = new Map();
    for (const rule of rules) {
        if (!rule || typeof rule !== "object") continue;
        const filter = normalizeEmailRuleFilter(rule, fallbackFilter);
        const key = JSON.stringify(filter);
        const group = groups.get(key) || {filter, rules: []};
        group.rules.push(rule);
        groups.set(key, group);
    }
    const results = [];
    const attachments = [];
    for (const group of groups.values()) {
        const hasAiRule = group.rules.some(rule => rule?.kind === "ai" && typeof rule?.query === "string" && rule.query.trim());
        const messages = provider === "gmail"
            ? await listInboxMessages(group.filter, {includeText: hasAiRule}, userId, blockId)
            : await listOutlookInboxMessages(group.filter, userId, blockId);
        const groupResults = await evaluateGmailWarnings({rules: group.rules, messages, seenByRule});
        results.push(...groupResults);
        const matchingMessageIds = new Set(groupResults.flatMap(result => result.messageIds || []));
        if (matchingMessageIds.size) {
            const candidates = provider === "gmail"
                ? await listGmailAttachments(group.filter, userId, blockId)
                : await listOutlookAttachments(group.filter, userId, blockId);
            attachments.push(...candidates.filter(attachment => matchingMessageIds.has(attachment.messageId)));
        }
    }
    return {results, attachments};
}

// Gmail: autorizzazione OAuth e allegati in sola lettura.
app.get("/auth/gmail/start", (req, res) => {
    try {
        const origin = oauthOriginForRequest(req);
        const authorizationUrl = getAuthorizationUrl(req.user.id, readAlertBlockId(req), {
            origin,
            frontendOrigin: origin
        });
        if (req.query?.format === "json") return res.json({authorizationUrl});
        res.redirect(authorizationUrl);
    }
    catch (error) {
        res.status(500).json({
            message: error instanceof Error ? error.message : "Impossibile avviare Gmail"
        });
    }
});

app.get("/auth/gmail/callback", async (req, res) => {
    try {
        if (typeof req.query.code !== "string" || typeof req.query.state !== "string") {
            throw new Error("Google non ha restituito un'autorizzazione valida");
        }
        if (hasPendingGoogleCalendarAuthorization(req.query.state)) {
            const authorisation = await exchangeGoogleCalendarAuthorizationCode(req.query.code, req.query.state);
            const callbackOrigin = authorisation.frontendOrigin || FRONTEND_ORIGIN;
            const blockId = authorisation.blockId;
            return res.redirect(oauthCompletionUrl("calendar", blockId, callbackOrigin));
        }
        const authorisation = await exchangeAuthorizationCode(req.query.code, req.query.state, req.user?.id);
        const callbackOrigin = authorisation.frontendOrigin || FRONTEND_ORIGIN;
        const blockId = authorisation.blockId;
        res.redirect(oauthCompletionUrl("gmail", blockId, callbackOrigin));
    }
    catch (error) {
        res.status(400).json({
            message: error instanceof Error ? error.message : "Impossibile completare Gmail"
        });
    }
});

app.get("/auth/calendar/start", (req, res) => {
    try {
        const origin = oauthOriginForRequest(req);
        const authorizationUrl = getGoogleCalendarAuthorizationUrl(req.user.id, readAlertBlockId(req), {origin, frontendOrigin: origin});
        if (req.query?.format === "json") return res.json({authorizationUrl});
        res.redirect(authorizationUrl);
    } catch (error) { res.status(500).json({message: error instanceof Error ? error.message : "Unable to start Google Calendar"}); }
});

app.get("/calendar/google/status", (req, res) => res.json(getGoogleCalendarStatus(req.user.id, readAlertBlockId(req))));
app.post("/auth/calendar/disconnect", (req, res) => { disconnectGoogleCalendar(req.user.id, readAlertBlockId(req)); res.json({message: "Google Calendar disconnected"}); });

app.get("/email/gmail/status", (req, res) => {
    res.json(getGmailStatus(req.user.id, readAlertBlockId(req)));
});

app.post("/auth/gmail/disconnect", (req, res) => {
    disconnectGmail(req.user.id, readAlertBlockId(req));
    res.json({message: "Gmail disconnected"});
});

app.post("/email/gmail/attachments", async (req, res) => {
    try {
        const attachments = await listGmailAttachments(req.body ?? {}, req.user.id, readAlertBlockId(req));
        res.json({attachments});
    }
    catch (error) {
        res.status(400).json({
            message: error instanceof Error ? error.message : "Impossibile leggere Gmail"
        });
    }
});

app.post("/email/gmail/warnings/check", async (req, res) => {
    try {
        const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
        const checked = await checkEmailWarningsByRule("gmail", rules, req.body ?? {}, req.body?.seenByRule, req.user.id, readAlertBlockId(req));
        res.json(checked);
    }
    catch (error) {
        res.status(400).json({
            message: error instanceof Error ? error.message : "Unable to check Gmail warnings"
        });
    }
});

app.get("/email/gmail/messages/view", async (req, res) => {
    try {
        if (typeof req.query.messageId !== "string") return res.status(400).send("Missing Gmail message identifier");
        sendLocalEmailView(res, await getGmailMessageText(req.query.messageId, req.user.id, readAlertBlockId(req)));
    } catch (error) { res.status(400).send(escapeHtml(error instanceof Error ? error.message : "Unable to read Gmail message")); }
});

app.get("/email/gmail/attachments/download", async (req, res) => {
    try {
        const {messageId, attachmentId, name, mimeType} = req.query;
        if (typeof messageId !== "string" || typeof attachmentId !== "string" || typeof name !== "string") {
            return res.status(400).json({message: "Identificativo allegato Gmail mancante"});
        }
        const content = await downloadAttachment(messageId, attachmentId, req.user.id, readAlertBlockId(req));
        res.setHeader("Content-Type", typeof mimeType === "string" ? mimeType : "application/octet-stream");
        res.setHeader("Content-Disposition", `${req.query.inline === "true" ? "inline" : "attachment"}; filename="${path.basename(name).replaceAll('"', "")}"`);
        res.send(content);
    }
    catch (error) {
        res.status(400).json({
            message: error instanceof Error ? error.message : "Impossibile scaricare l'allegato Gmail"
        });
    }
});

app.post("/email/gmail/attachments/open", async (req, res) => {
    try {
        if (!isAdmin(req.user)) throw new Error("For security, files can be opened on the host computer only by the administrator. Download the file instead.");
        const {messageId, attachmentId, name} = req.body ?? {};
        if (typeof messageId !== "string" || typeof attachmentId !== "string" || typeof name !== "string") {
            return res.status(400).json({message: "Identificativo allegato Gmail mancante"});
        }
        const content = await downloadAttachment(messageId, attachmentId, req.user.id, readAlertBlockId(req));
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "folderrocket-"));
        const targetPath = path.join(directory, path.basename(name).replaceAll('"', ""));
        fs.writeFileSync(targetPath, content);
        await openWithDefaultApp(targetPath);
        res.json({message: "Allegato aperto"});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Impossibile aprire l'allegato"});
    }
});

app.post("/email/gmail/attachments/save-reference", async (req, res) => {
    try {
        const {messageId, attachmentId, name} = req.body ?? {};
        if (typeof messageId !== "string" || typeof attachmentId !== "string" || typeof name !== "string") throw new Error("Gmail attachment identifier is missing");
        const content = await downloadAttachment(messageId, attachmentId, req.user.id, readAlertBlockId(req));
        const directory = path.join(userWorkspace(req.user), ".virtual");
        fs.mkdirSync(directory, {recursive: true});
        const fileDirectory = path.join(directory, crypto.randomUUID());
        fs.mkdirSync(fileDirectory, {recursive: true});
        const targetPath = path.join(fileDirectory, path.basename(name).replaceAll('"', ""));
        fs.writeFileSync(targetPath, content);
        res.json({name: path.basename(name), path: targetPath, size: content.length, createdAt: new Date().toISOString()});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to save Gmail attachment"}); }
});

// Outlook: authorisation OAuth Microsoft Graph and read-only attachments.
app.get("/auth/outlook/start", (req, res) => {
    try {
        const origin = oauthOriginForRequest(req);
        const authorizationUrl = getOutlookAuthorizationUrl(req.user.id, readAlertBlockId(req), {
            origin,
            frontendOrigin: origin
        });
        if (req.query?.format === "json") return res.json({authorizationUrl});
        res.redirect(authorizationUrl);
    }
    catch (error) { res.status(500).json({message: error instanceof Error ? error.message : "Unable to start Outlook"}); }
});

app.get("/auth/outlook/callback", async (req, res) => {
    try {
        if (typeof req.query.code !== "string" || typeof req.query.state !== "string") throw new Error("Microsoft did not return a valid authorisation");
        const authorisation = await exchangeOutlookAuthorizationCode(req.query.code, req.query.state, req.user?.id);
        const callbackOrigin = authorisation.frontendOrigin || FRONTEND_ORIGIN;
        const blockId = authorisation.blockId;
        res.redirect(oauthCompletionUrl("outlook", blockId, callbackOrigin));
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to complete Outlook"}); }
});

app.get("/email/outlook/status", (req, res) => res.json(getOutlookStatus(req.user.id, readAlertBlockId(req))));

app.post("/auth/outlook/disconnect", (req, res) => {
    disconnectOutlook(req.user.id, readAlertBlockId(req));
    res.json({message: "Outlook disconnected"});
});

app.post("/email/outlook/attachments", async (req, res) => {
    try { res.json({attachments: await listOutlookAttachments(req.body ?? {}, req.user.id, readAlertBlockId(req))}); }
    catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to read Outlook"}); }
});

app.post("/email/outlook/warnings/check", async (req, res) => {
    try {
        const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
        const checked = await checkEmailWarningsByRule("outlook", rules, req.body ?? {}, req.body?.seenByRule, req.user.id, readAlertBlockId(req));
        res.json(checked);
    }
    catch (error) {
        res.status(400).json({
            message: error instanceof Error ? error.message : "Unable to check Outlook warnings"
        });
    }
});

app.get("/email/outlook/messages/view", async (req, res) => {
    try {
        if (typeof req.query.messageId !== "string") return res.status(400).send("Missing Outlook message identifier");
        sendLocalEmailView(res, await getOutlookMessageText(req.query.messageId, req.user.id, readAlertBlockId(req)));
    } catch (error) { res.status(400).send(escapeHtml(error instanceof Error ? error.message : "Unable to read Outlook message")); }
});

app.get("/email/outlook/attachments/download", async (req, res) => {
    try {
        const {messageId, attachmentId, name, mimeType} = req.query;
        if (typeof messageId !== "string" || typeof attachmentId !== "string" || typeof name !== "string") return res.status(400).json({message: "Outlook attachment identifier is missing"});
        const content = await downloadOutlookAttachment(messageId, attachmentId, req.user.id, readAlertBlockId(req));
        res.setHeader("Content-Type", typeof mimeType === "string" ? mimeType : "application/octet-stream");
        res.setHeader("Content-Disposition", `${req.query.inline === "true" ? "inline" : "attachment"}; filename="${path.basename(name).replaceAll('"', "")}"`);
        res.send(content);
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to download Outlook attachment"}); }
});

app.post("/email/outlook/attachments/open", async (req, res) => {
    try {
        if (!isAdmin(req.user)) throw new Error("For security, files can be opened on the host computer only by the administrator. Download the file instead.");
        const {messageId, attachmentId, name} = req.body ?? {};
        if (typeof messageId !== "string" || typeof attachmentId !== "string" || typeof name !== "string") throw new Error("Outlook attachment identifier is missing");
        const content = await downloadOutlookAttachment(messageId, attachmentId, req.user.id, readAlertBlockId(req));
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "folderrocket-"));
        const targetPath = path.join(directory, path.basename(name).replaceAll('"', ""));
        fs.writeFileSync(targetPath, content);
        await openWithDefaultApp(targetPath);
        res.json({message: "Attachment opened"});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to open Outlook attachment"}); }
});

app.post("/email/outlook/attachments/save-reference", async (req, res) => {
    try {
        const {messageId, attachmentId, name} = req.body ?? {};
        if (typeof messageId !== "string" || typeof attachmentId !== "string" || typeof name !== "string") throw new Error("Outlook attachment identifier is missing");
        const content = await downloadOutlookAttachment(messageId, attachmentId, req.user.id, readAlertBlockId(req));
        const directory = path.join(userWorkspace(req.user), ".virtual");
        fs.mkdirSync(directory, {recursive: true});
        const fileDirectory = path.join(directory, crypto.randomUUID());
        fs.mkdirSync(fileDirectory, {recursive: true});
        const targetPath = path.join(fileDirectory, path.basename(name).replaceAll('"', ""));
        fs.writeFileSync(targetPath, content);
        res.json({name: path.basename(name), path: targetPath, size: content.length, createdAt: new Date().toISOString()});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to save Outlook attachment"}); }
});

/*
    Restituisce JSON anche quando multer
    rifiuta un upload prima del route handler.
*/
app.use(
    (error, req, res, next) => {

        if (res.headersSent) {

            return next(error);

        }


        console.log(
            "ERRORE MIDDLEWARE:",
            error
        );


        res.status(
            error instanceof multer.MulterError
                ? 400
                : 500
        ).json({

            message:
                error instanceof multer.MulterError
                    ? error.message
                    : "Errore interno del server"

        });

    }
);


// ==================================================
// AVVIO SERVER
// ==================================================

const frontendBuildPath = path.join(__dirname, "..", "dist");

if (fs.existsSync(frontendBuildPath)) {
    app.use(express.static(frontendBuildPath));
    app.get("/", (req, res) => res.sendFile(path.join(frontendBuildPath, "index.html")));
}

const server = app.listen(
    PORT,
    HOST,
    () => {

        console.log(
            `Backend attivo su http://${HOST}:${PORT}`
        );

    }
);

// Scheduled alerts are evaluated by the backend, so they keep working when the
// browser is closed. The timer is unreferenced by the scheduler itself and does
// not prevent a clean server shutdown.
startEmailAlertScheduler();

// Mantiene il processo agganciato al terminale anche in ambienti che
// rilasciano prematuramente gli handle del server HTTP.
server.ref();
if (process.stdin.isTTY) process.stdin.resume();
server.on("error", error => console.error("Backend error:", error));
