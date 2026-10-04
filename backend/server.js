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
let addManualDeadlineModule;
let syncArchiveModule;
let archiveWorkQueue = Promise.resolve();

function enqueueArchiveWork(work) {
    archiveWorkQueue = archiveWorkQueue.then(work, work).catch(error => {
        console.error("Archive background processing failed:", error);
    });
}

function getXlsx() { return xlsxModule ??= require("xlsx"); }
function readFileContent(...args) { return (readFileContentModule ??= require("./ai/reader"))(...args); }
function analyzeDocument(...args) { return (analyzeDocumentModule ??= require("./ai/analyzer"))(...args); }
function saveFileInfo(...args) { return (saveFileInfoModule ??= require("./database/excelManager"))(...args); }
function checkFolderDeadlines(...args) { return (checkFolderDeadlinesModule ??= require("./services/deadlineService").checkFolderDeadlines)(...args); }
function addManualDeadline(...args) { return (addManualDeadlineModule ??= require("./services/deadlineService").addManualDeadline)(...args); }
function syncArchive(...args) { return (syncArchiveModule ??= require("./services/archiveService").syncArchive)(...args); }

const {moveToTrash} = require("./services/trashService");
const {executeCopyBatch, executeMoveBatch, moveFilePortable, pathExists} = require("./services/fileBatchService");
const {searchFiles} = require("./services/searchService");
const {readDashboardPreferences, writeDashboardPreferences} = require("./services/userPreferencesService");
const planetGraph = require("./services/planetGraphService");
const {buildGmailAccountCatalog} = require("./services/gmailAccountCatalog");
const worldEmailAccountService = require("./services/worldEmailAccountService");
const obsidianVault = require("./services/obsidianVaultService");
const {getRuntimeUploadsDirectory} = require("./services/runtimePaths");
const {assertWorkspacePath} = require("./services/userPathSecurity");
const {listTreeDirectory, listTreeRoots, resolveDesktopRoot, searchTreeRoots} = require("./services/treeRocketService");
const {getEmailAlertSettings, normalizeProviderBlock, saveEmailAlertSettings} = require("./services/emailAlertSettingsService");
const {startEmailAlertScheduler} = require("./services/emailAlertScheduler");
const {migrateLegacyConnections} = require("./services/emailTokenStore");
const {addAuditEvent, listAuditEvents} = require("./services/auditLogService");
const {analyzeDomainPage, analyzeProjection, downloadDomainFile, listDomainDownloads, readDomainPreview} = require("./services/projectionAnalysisService");
const {createStickyNote, invokeWorldAssistant} = require("./services/stickyNoteAiService");
const {recordDiagnostic, listDiagnostics, clearDiagnostics, flushDiagnostics, hasStorageWarning, safeText: safeDiagnosticText} = require("./services/diagnosticsService");
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
    createReplyDraft: createGmailReplyDraft,
    sendEmail: sendGmailEmail,
    sendReply: sendGmailReply,
    downloadAttachment,
    disconnect: disconnectGmail,
    exchangeAuthorizationCode,
    getAuthorizationUrl,
    getEmailIdentity: getGmailEmailIdentity,
    getMessageText: getGmailMessageText,
    getThread: getGmailThread,
    getStatus: getGmailStatus,
    listAttachments: listGmailAttachments,
    listConnectedAccounts: listGmailConnectedAccounts,
    listInboxMessages,
    listInboxThreads
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
    sendEmail: sendOutlookEmail,
    downloadAttachment: downloadOutlookAttachment,
    disconnect: disconnectOutlook,
    exchangeAuthorizationCode: exchangeOutlookAuthorizationCode,
    getAuthorizationUrl: getOutlookAuthorizationUrl,
    getEmailIdentity: getOutlookEmailIdentity,
    getMessageText: getOutlookMessageText,
    getStatus: getOutlookStatus,
    listAttachments: listOutlookAttachments,
    listConnectedAccounts: listOutlookConnectedAccounts,
    listInboxMessages: listOutlookInboxMessages,
    listTeamsChats,
    listJoinedTeams,
    listTeamChannels,
    listTeamsDirectoryNextPage,
    listTeamsChatMessages,
    listTeamsChannelMessages,
    listTeamsNextPage
} = require("./services/outlookService");

const app = express();
const PORT = Number(process.env.PORT || process.env.FOLDERROCKET_PORT) || 3000;
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
    if (!isAdmin(user)) assertWorkspacePath(userWorkspace(user), resolved, {allowMissing});
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
    const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = [filePath];
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

function convertExcelToPdf(sourcePath, targetPath) {
    const source = Buffer.from(sourcePath, "utf16le").toString("base64");
    const target = Buffer.from(targetPath, "utf16le").toString("base64");
    const script = [
        "$ErrorActionPreference = 'Stop'",
        `$source = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${source}'))`,
        `$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${target}'))`,
        "$excel = $null; $workbook = $null",
        "try {",
        "  $excel = New-Object -ComObject Excel.Application",
        "  $excel.Visible = $false",
        "  $excel.DisplayAlerts = $false",
        "  $workbook = $excel.Workbooks.Open($source, 0, $true)",
        "  foreach ($sheet in $workbook.Worksheets) {",
        "    $sheet.PageSetup.Zoom = $false",
        "    $sheet.PageSetup.FitToPagesWide = 1",
        "    $sheet.PageSetup.FitToPagesTall = $false",
        "  }",
        "  $workbook.ExportAsFixedFormat(0, $target)",
        "} finally {",
        "  if ($workbook) { $workbook.Close($false) }",
        "  if ($excel) { $excel.Quit() }",
        "  [GC]::Collect()",
        "  [GC]::WaitForPendingFinalizers()",
        "}"
    ].join("; ");
    try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch { /* Excel will report a useful write error. */ }
    return new Promise((resolve, reject) => {
        const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {windowsHide: true});
        let error = "";
        child.stderr.on("data", data => { error += data.toString(); });
        child.on("error", reject);
        child.on("close", code => code === 0 && fs.existsSync(targetPath)
            ? resolve()
            : reject(new Error(error.trim() || "Microsoft Excel could not create the PDF. Check that Excel is installed.")));
    });
}

function spreadsheetToText(sourcePath) {
    const XLSX = getXlsx();
    const workbook = XLSX.readFile(sourcePath, {cellDates: true});
    return workbook.SheetNames.map(sheetName => {
        const table = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], {FS: "\t", RS: "\r\n", blankrows: true});
        return workbook.SheetNames.length > 1 ? `[${sheetName}]\r\n${table}` : table;
    }).join("\r\n\r\n");
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
        credentials: true,
        exposedHeaders: ["X-FolderRocket-Diagnostic-Id"]
    })
);


// ==================================================
// ACCOUNT ACCESS AND PRIVATE WORKSPACES
// ==================================================

app.use((req, res, next) => {
    req.user = authenticateRequest(req);
    const suppliedRequestId = req.get("X-FolderRocket-Diagnostic-Id") || "";
    const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedRequestId) ? suppliedRequestId : crypto.randomUUID();
    const startedAt = Date.now();
    req.folderRocketRequestId = requestId;
    res.setHeader("X-FolderRocket-Diagnostic-Id", requestId);
    const originalJson = res.json.bind(res);
    res.json = body => {
        if (res.statusCode >= 400 && body && typeof body.message === "string") {
            req.folderRocketDiagnosticMessage = safeDiagnosticText(body.message, 260);
        }
        return originalJson(body);
    };
    res.on("finish", () => {
        if (res.statusCode < 400 || !req.user || req.path === "/diagnostics" || req.folderRocketExpectedNotFound) return;
        const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id");
        const rawWorldId = typeof req.query?.worldId === "string" ? req.query.worldId : req.params?.worldId || req.get("X-FolderRocket-World-Id");
        const routeCategory = route.split("/").filter(Boolean)[0] || "backend";
        recordDiagnostic(req.user.id, {
            id: requestId,
            type: "http",
            severity: res.statusCode >= 500 ? "error" : "warning",
            category: routeCategory,
            message: req.folderRocketDiagnosticMessage || (res.statusCode >= 500 ? `Errore backend${req.folderRocketBackendErrorName ? ` (${req.folderRocketBackendErrorName})` : ""}.` : "La richiesta è stata rifiutata o non completata."),
            route,
            screen: safeDiagnosticText(req.get("X-FolderRocket-Screen") || "backend", 100),
            component: route,
            stack: req.folderRocketBackendErrorStack || "",
            method: req.method,
            status: res.statusCode,
            worldId: rawWorldId,
            requestId,
            durationMs: Date.now() - startedAt
        });
    });
    next();
});

// Authentication and request IDs run before parsing so malformed JSON errors
// can still be attributed to the signed-in account without recording the body.
app.use(express.json({limit: "6mb"}));

app.get("/diagnostics", requireAuthenticated, async (req, res) => {
        const [userEvents, systemEvents] = await Promise.all([listDiagnostics(req.user.id), listDiagnostics("system")]);
        res.json({events: [...userEvents, ...systemEvents].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 400), storageWarning:hasStorageWarning()});
});

app.delete("/diagnostics", requireAuthenticated, async (req, res) => {
    const [userCleared, systemCleared] = await Promise.all([clearDiagnostics(req.user.id), clearDiagnostics("system")]);
    if (!userCleared || !systemCleared) return res.status(500).json({message:"Non è stato possibile svuotare i registri locali."});
    res.json({message: "Diagnostica del backend svuotata."});
});

app.put("/settings/worlds/:worldId", requireAuthenticated, async (req, res) => {
    const worldId = typeof req.params.worldId === "string" ? req.params.worldId.trim() : "";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(worldId) || ["__proto__", "prototype", "constructor"].includes(worldId)) {
        return res.status(400).json({message: "Identificativo del pianeta non valido."});
    }
    if (req.body?.aiEnabled !== undefined && typeof req.body.aiEnabled !== "boolean") return res.status(400).json({message: "Stato AI del pianeta non valido."});
    if (req.body?.graphEnabled !== undefined && typeof req.body.graphEnabled !== "boolean") return res.status(400).json({message: "Stato del grafo non valido."});
    if (req.body?.treeRootMode !== undefined && !["computer", "desktop"].includes(req.body.treeRootMode)) return res.status(400).json({message:"Tree Rocket root mode is invalid."});
    const normaliseProfiles = value => {
        if (!Array.isArray(value) || value.length > 100) throw new Error("Configurazione agente o skill non valida.");
        const seen = new Set();
        return value.filter(profile => profile && typeof profile.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(profile.id) && typeof profile.name === "string")
            .map(profile => {
                if (seen.has(profile.id)) throw new Error("Gli identificativi dei profili devono essere univoci.");
                seen.add(profile.id);
                return {
                    id: profile.id,
                    name: profile.name.trim().slice(0, 60) || "Assistente",
                    description: typeof profile.description === "string" ? profile.description.slice(0, 240) : "",
                    instructions: typeof profile.instructions === "string" ? profile.instructions.slice(0, 2000) : "",
                    enabled: Boolean(profile.enabled),
                    model: profile.model === "gpt-4.1" ? "gpt-4.1" : "gpt-4.1-mini",
                    capabilities: Array.isArray(profile.capabilities) ? [...new Set(profile.capabilities.filter(capability => ["search-files", "draft-post-it"].includes(capability)))] : []
                };
            });
    };
    const existing = readDashboardPreferences(req.user.id) || {};
    const currentWorlds = existing.worlds && typeof existing.worlds === "object" && !Array.isArray(existing.worlds) ? existing.worlds : {};
    try {
        const currentWorld = currentWorlds[worldId] || {};
        const nextWorld = {...currentWorld, ...(typeof req.body.aiEnabled === "boolean" ? {aiEnabled:req.body.aiEnabled} : {}), ...(typeof req.body.graphEnabled === "boolean" ? {graphEnabled:req.body.graphEnabled} : {}), ...(typeof req.body.treeRootMode === "string" ? {treeRootMode:req.body.treeRootMode} : {})};
        if (Object.hasOwn(req.body || {}, "emailAccount")) {
            const selection = worldEmailAccountService.normalizeEmailAccount(req.body.emailAccount);
            if (selection) {
                const catalog = selection.provider === "gmail" ? await listGmailConnectedAccounts(req.user.id) : await listOutlookConnectedAccounts(req.user.id);
                const account = catalog.find(item => item.blockId === selection.blockId);
                if (!account) throw new Error("This email account is not connected to FolderRocket.");
                nextWorld.emailAccount = {...selection,email:typeof account.email === "string" ? account.email : ""};
            } else nextWorld.emailAccount = null;
        }
        if (req.body.name !== undefined) {
            if (typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.length > 40) throw new Error("Nome del pianeta non valido.");
            nextWorld.name = req.body.name.trim();
        }
        for (const key of ["agents", "skills"]) {
            if (req.body[key] !== undefined) nextWorld[key] = normaliseProfiles(req.body[key]);
        }
        if (req.body.activityNotifications !== undefined) {
            const service = require("./services/worldActivityEmailService");
            let config = service.normalizeWorldActivityNotifications(req.body.activityNotifications);
            const previous = currentWorld.activityNotifications || {};
            if (config.enabled) {
                const accounts = config.senderProvider === "gmail" ? await listGmailConnectedAccounts(req.user.id) : config.senderProvider === "outlook" ? await listOutlookConnectedAccounts(req.user.id) : [];
                const account = accounts.find(item => item.blockId === config.senderBlockId);
                if (!account) throw new Error("Select a connected sender account for this planet.");
                config = service.validForEnable(config, account.canSend === true);
                if (previous.enabled !== true || !config.anchorDate) config.anchorDate = service.localDateKey(new Date(), config.timeZone);
            } else config.anchorDate = previous.anchorDate || config.anchorDate;
            nextWorld.activityNotifications = {...config, snapshot:previous.snapshot || {activities:[],calendarEvents:[],reminders:[]}, runtime:previous.runtime || {}};
        }
        writeDashboardPreferences(req.user.id, {...existing, worlds: {...currentWorlds, [worldId]: nextWorld}});
    } catch (error) {
        return res.status(400).json({message:error instanceof Error ? error.message : "Configurazione del pianeta non valida."});
    }
    res.json({message: "Impostazione AI del pianeta salvata."});
});

app.get("/settings/worlds/:worldId", requireAuthenticated, async (req, res) => {
    const worldId=String(req.params.worldId || "").trim();
    if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    const found=readWorldRecord(req.user.id,worldId);
    if(!found.world)return res.status(404).json({message:"Planet not found."});
    try {
        const resolved=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId);
        let selection=resolved.selection;
        let migrated=false;
        if(resolved.migrated && selection) {
            const accounts=selection.provider==="gmail"?await listGmailConnectedAccounts(req.user.id):await listOutlookConnectedAccounts(req.user.id);
            if(accounts.some(item=>item.blockId===selection.blockId)) {
                const worlds={...found.worlds,[worldId]:{...found.world,emailAccount:{...selection,email:accounts.find(item=>item.blockId===selection.blockId)?.email||""}}};
                writeDashboardPreferences(req.user.id,{...found.settings,worlds});
                migrated=true;
            } else selection=null;
        }
        const [gmailAccounts,outlookAccounts]=await Promise.all([listGmailConnectedAccounts(req.user.id),listOutlookConnectedAccounts(req.user.id)]);
        const world=selection?{...found.world,emailAccount:{...selection,email:selection.email||((selection.provider==="gmail"?gmailAccounts:outlookAccounts).find(item=>item.blockId===selection.blockId)?.email||"")}}:{...found.world,emailAccount:null};
        const storedConflict=!Object.hasOwn(found.world,"emailAccount")&&resolved.conflict;
        res.json({world,emailAccountConflict:storedConflict,emailAccountCandidates:resolved.candidates,emailAccounts:{gmail:gmailAccounts,outlook:outlookAccounts},emailAccountMigrated:migrated});
    } catch(error) {res.status(500).json({message:error instanceof Error?error.message:"Unable to read planet settings."});}
});

function validWorldId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value); }
function readWorldRecord(userId,worldId) {
    const settings=readDashboardPreferences(userId)||{};
    const worlds=settings.worlds&&typeof settings.worlds==="object"&&!Array.isArray(settings.worlds)?settings.worlds:{};
    const world=worlds[worldId]||((worldId==="work"||worldId==="personal")?{}:null);
    return {settings,world,worlds};
}
function readWorldDashboard(settings,worldId) {
    return settings.worlds?.[worldId]?.dashboard || (worldId==="work"?legacyWorkspaceDashboard(settings):{});
}
function selectedWorldGmailBlocks(settings,worldId) {
    const world=settings?.worlds?.[worldId]||{};
    const resolved=worldEmailAccountService.resolveWorldEmailAccount(world,settings,worldId);
    const selected=resolved.selection;
    if(!selected||selected.provider!=="gmail")return [];
    return [{blockId:selected.blockId,sourceBlockId:selected.blockId}];
}
function selectedGmailBlock(settings,worldId,requestedBlockId) {
    const selected=selectedWorldGmailBlocks(settings,worldId);
    return selected.find(item=>item.blockId===requestedBlockId) || (!requestedBlockId&&selected.length===1?selected[0]:null) || null;
}
function graphMimeType(filePath) {
    const extension=path.extname(filePath).toLowerCase();
    return ({".pdf":"application/pdf",".txt":"text/plain",".csv":"text/csv",".doc":"application/msword",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",".xls":"application/vnd.ms-excel",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",".ppt":"application/vnd.ms-powerpoint",".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".webp":"image/webp",".mp3":"audio/mpeg",".mp4":"video/mp4"})[extension]||"application/octet-stream";
}

function graphWorld(req,res,worldId) {
    if(!validWorldId(worldId)){res.status(400).json({message:"Invalid planet identifier."});return null;}
    const found=readWorldRecord(req.user.id,worldId);
    if(!found.world){res.status(404).json({message:"Planet not found."});return null;}
    return found;
}

function defaultObsidianVaultPath(user,worldId) {
    return path.join(userWorkspace(user),".folderrocket","obsidian",worldId);
}

function assertObsidianVaultPath(user,candidate,{allowMissing=true}={}) {
    return assertWorkspacePath(userWorkspace(user),candidate,{allowMissing});
}

function readWorldObsidian(user,worldId) {
    const found=readWorldRecord(user.id,worldId);
    if(!found.world)return null;
    const stored=found.world.obsidian&&typeof found.world.obsidian==="object"?found.world.obsidian:{};
    const canonical=defaultObsidianVaultPath(user,worldId);
    let vaultPath=canonical;
    if(typeof stored.vaultPath==="string"&&stored.vaultPath) {
        try {vaultPath=assertObsidianVaultPath(user,stored.vaultPath,{allowMissing:true});}
        catch {vaultPath=canonical;}
    }
    return {...found,config:{enabled:stored.enabled===true,vaultPath,lastSyncAt:typeof stored.lastSyncAt==="string"?stored.lastSyncAt:"",status:typeof stored.status==="string"?stored.status:"idle",lastResult:stored.lastResult&&typeof stored.lastResult==="object"?stored.lastResult:null}};
}

app.get("/worlds/:worldId/obsidian",requireAuthenticated,(req,res)=>{
    const worldId=String(req.params.worldId||"");const state=readWorldObsidian(req.user,worldId);
    if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    if(!state)return res.status(404).json({message:"Planet not found."});
    res.json({config:state.config,openSupported:process.env.FOLDERROCKET_DESKTOP==="1",uri:`obsidian://open?path=${encodeURIComponent(state.config.vaultPath)}`});
});

app.post("/worlds/:worldId/obsidian/pick-folder",requireAuthenticated,requireAdministrator,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    try {
        const selected=await chooseParentFolderOnHost();
        if(!selected)return res.status(204).end();
        const vaultPath=assertObsidianVaultPath(req.user,selected,{allowMissing:true});
        res.json({vaultPath});
    } catch(error) {res.status(400).json({message:error instanceof Error?error.message:"Unable to select a safe Obsidian vault folder."});}
});

app.put("/worlds/:worldId/obsidian",requireAuthenticated,(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    if(req.body?.enabled!==undefined&&typeof req.body.enabled!=="boolean")return res.status(400).json({message:"Obsidian setting is invalid."});
    try {
        const current=found.world.obsidian&&typeof found.world.obsidian==="object"?found.world.obsidian:{};
        const canonical=defaultObsidianVaultPath(req.user,worldId);
        const requested=typeof req.body?.vaultPath==="string"&&req.body.vaultPath.trim()?req.body.vaultPath:current.vaultPath||canonical;
        const vaultPath=assertObsidianVaultPath(req.user,requested,{allowMissing:true});
        const existingVault=awaitlessStat(vaultPath);
        if(existingVault&& !existingVault.isDirectory())throw new Error("The selected Obsidian vault path is not a folder.");
        const next={...current,enabled:typeof req.body?.enabled==="boolean"?req.body.enabled:current.enabled===true,vaultPath,status:current.status||"idle"};
        writeDashboardPreferences(req.user.id,{...found.settings,worlds:{...found.worlds,[worldId]:{...found.world,obsidian:next}}});
        res.json({config:next,openSupported:process.env.FOLDERROCKET_DESKTOP==="1",uri:`obsidian://open?path=${encodeURIComponent(vaultPath)}`});
    } catch(error) {res.status(400).json({message:error instanceof Error?error.message:"Unable to save Obsidian settings."});}
});

function awaitlessStat(filePath) {try{return fs.statSync(filePath);}catch(error){if(error?.code==="ENOENT")return null;throw error;}}

app.post("/worlds/:worldId/obsidian/sync",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const state=readWorldObsidian(req.user,worldId);
    if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    if(!state)return res.status(404).json({message:"Planet not found."});
    if(!state.config.enabled)return res.status(409).json({message:"Enable Obsidian for this planet before syncing."});
    try {
        const vaultPath=assertObsidianVaultPath(req.user,state.config.vaultPath,{allowMissing:true});
        const graph=await planetGraph.readGraph(req.user.id,worldId);
        const worldName=String(state.world.name||worldId).slice(0,80);
        const records=obsidianVault.graphRecords(graph,worldName);
        records.unshift({id:`overview:${worldId}`,kind:"overview",sourceId:worldId,title:`${worldName} · FolderRocket`,updatedAt:graph.updatedAt||"",content:`This vault contains the FolderRocket records available for the **${worldName}** planet.\n\n- Graph status: ${graph.status}\n- Indexed records: ${graph.nodes.length}\n- Relationships: ${graph.edges.length}\n\nFolder and file entries contain metadata and local paths. Email records contain the selected account's latest synced conversations. Client-held notes, reminders, Daily Jobs and File Studio activity are included only when supplied by the FolderRocket client during sync.\n`});
        const allowedKinds=new Set(["post-it","ai-post-it","reminder","daily-job","activity","file-studio","file-studio-operation","downloaded-attachment"]);
        const clientRecords=[];let clientTextBytes=0;
        for(const item of (Array.isArray(req.body?.records)?req.body.records:[]).slice(0,500)) {
            if(!item||typeof item.id!=="string"||!item.id||typeof item.kind!=="string"||!allowedKinds.has(item.kind))continue;
            const content=typeof item.content==="string"?item.content.slice(0,10_000):"";clientTextBytes+=Buffer.byteLength(content,"utf8");
            if(clientTextBytes>2*1024*1024)throw new Error("Obsidian sync records exceed the 2 MB content limit.");
            clientRecords.push({id:`client:${item.kind}:${item.id.slice(0,180)}`,kind:item.kind,title:typeof item.title==="string"?item.title.slice(0,300):item.kind,sourceId:item.id.slice(0,300),updatedAt:typeof item.updatedAt==="string"?item.updatedAt.slice(0,80):"",content});
        }
        records.push(...clientRecords);
        const requestedAttachments=Array.isArray(req.body?.attachments)?req.body.attachments.slice(0,40):[];
        const safeAttachments=[];let attachmentBytes=0;
        for(const attachment of requestedAttachments) {
            const candidate=assertUserPath(req.user,attachment?.path);
            const real=await fs.promises.realpath(candidate);assertUserPath(req.user,real);
            if(isPathWithin(vaultPath,real))throw new Error("An Obsidian vault file cannot be synced back into its own vault.");
            const stats=await fs.promises.stat(real);if(!stats.isFile())throw new Error("A synced attachment path is not a file.");
            attachmentBytes+=stats.size;if(attachmentBytes>100*1024*1024)throw new Error("Local attachments exceed the total Obsidian sync limit of 100 MB.");
            safeAttachments.push({path:real});
        }
        const attachmentResult=await obsidianVault.copyDownloadedAttachments({vaultPath,attachments:safeAttachments});
        records.push(...attachmentResult.records);
        const selection=worldEmailAccountService.resolveWorldEmailAccount(state.world,state.settings,worldId).selection;
        let warnings=[];
        if(!["ready","partial","indexing"].includes(graph.status))warnings.push(`Planet graph data is not ready (status: ${graph.status}); only supplied client records can be synced.`);
        if(selection?.provider==="gmail") {
            const accounts=await listGmailConnectedAccounts(req.user.id);
            if(!accounts.some(item=>item.blockId===selection.blockId))warnings.push("The selected Gmail account is disconnected; email conversations were omitted.");
            else {
                try {
                    const listing=await listGmailInboxThreads({maxResults:25},req.user.id,selection.blockId);
                    const threads=await Promise.all(listing.threads.slice(0,25).map(thread=>getGmailThread(thread.id,req.user.id,selection.blockId)));
                    records.push(...threads.map(thread=>obsidianVault.markdownEmailThread(thread,accounts.find(item=>item.blockId===selection.blockId)?.email||"",worldId)));
                    if(listing.nextPageToken)warnings.push("Only the newest 25 Gmail conversations are synced per manual sync.");
                } catch(error) {warnings.push(error instanceof Error?`Gmail content could not be synced: ${error.message}`:"Gmail content could not be synced.");}
            }
        } else if(selection?.provider==="outlook") warnings.push("Outlook is selected for this planet, but the current conversation integration does not expose real thread identifiers; Outlook conversation notes were skipped.");
        else warnings.push("No email account is selected for this planet.");
        const suppliedKinds=new Set(clientRecords.map(item=>item.kind));
        if(!["post-it","ai-post-it","reminder"].some(kind=>suppliedKinds.has(kind)))warnings.push("No post-it or reminder records were supplied by the client; these items are stored in client state and are not readable from the backend.");
        if(!["daily-job","activity"].some(kind=>suppliedKinds.has(kind))&&!records.some(item=>item.kind==="activity"))warnings.push("No Daily Jobs records were supplied by the client.");
        if(!["file-studio","file-studio-operation"].some(kind=>suppliedKinds.has(kind)))warnings.push("No File Studio operation records were supplied by the client.");
        if(!attachmentResult.copied&&!attachmentResult.unchanged)warnings.push("No previously downloaded local attachments were supplied; Obsidian sync does not download email attachments automatically.");
        const result=await obsidianVault.syncVault({vaultPath,worldId,ownerId:req.user.id,worldName,records});
        const latest=readDashboardPreferences(req.user.id)||{};const worlds=latest.worlds&&typeof latest.worlds==="object"?latest.worlds:{};const current=worlds[worldId]||state.world;const obsidianConfig=current.obsidian||state.config;
        const saved={...obsidianConfig,lastSyncAt:result.lastSyncAt,status:result.status,lastResult:{total:result.total,written:result.written,unchanged:result.unchanged,conflicts:result.conflicts,warnings}};
        writeDashboardPreferences(req.user.id,{...latest,worlds:{...worlds,[worldId]:{...current,obsidian:saved}}});
        res.json({config:saved,result:{...result,attachments:{copied:attachmentResult.copied,unchanged:attachmentResult.unchanged,bytes:attachmentResult.totalBytes},warnings,openSupported:process.env.FOLDERROCKET_DESKTOP==="1",uri:`obsidian://open?path=${encodeURIComponent(vaultPath)}`}});
    } catch(error) {res.status(400).json({message:error instanceof Error?error.message:"Unable to sync this planet to Obsidian."});}
});

app.get("/worlds/:worldId/graph",requireAuthenticated,async(req,res)=>{
    const found=graphWorld(req,res,String(req.params.worldId||""));if(!found)return;
    try {
        const graph=await planetGraph.readGraph(req.user.id,req.params.worldId);
        res.json({enabled:found.world.graphEnabled===true,graph});
    } catch(error) {res.status(500).json({message:error instanceof Error?error.message:"Unable to read this planet graph."});}
});

app.post("/worlds/:worldId/graph/index",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    if(found.world.graphEnabled!==true)return res.status(409).json({message:"Enable Create graph in this planet's settings first."});
    const key=`${req.user.id}:${worldId}`;
    if(planetGraph.isIndexing(req.user.id,worldId))return res.status(202).json({message:"Graph indexing is already in progress.",status:"indexing"});
    const initial=await planetGraph.readGraph(req.user.id,worldId);
    await planetGraph.writeGraph({...initial,status:"indexing",progress:{stage:"starting",processed:0,total:0,limitReached:false},updatedAt:new Date().toISOString(),warnings:[]});
    const snapshot=req.body?.snapshot&&typeof req.body.snapshot==="object"?req.body.snapshot:{};
    const accepted=planetGraph.enqueueIndex(key,async()=>{
        const warnings=[];let limitReached=false;
        try {
            const latest=readWorldRecord(req.user.id,worldId);
            if(latest.world?.graphEnabled!==true) {await planetGraph.updateGraphStatus(req.user.id,worldId,"disabled",{stage:"stopped",processed:0,total:0},warnings);return;}
            const dashboard=readWorldDashboard(latest.settings,worldId);
            const roots=Array.isArray(dashboard?.folders)?dashboard.folders:[];
            await planetGraph.updateGraphStatus(req.user.id,worldId,"indexing",{stage:"folders",processed:0,total:roots.length},warnings);
            const obsidianConfig=latest.world?.obsidian&&typeof latest.world.obsidian==="object"?latest.world.obsidian:null;
            const excludedRoots=obsidianConfig?.vaultPath?[obsidianConfig.vaultPath]:[];
            const walked=await planetGraph.walkConfiguredFolders(roots,{maxDirectories:400,maxFiles:3000,maxDepth:8,excludePaths:excludedRoots,validateRoot:async candidate=>{
                const safe=assertUserPath(req.user,candidate);const real=await fs.promises.realpath(safe);const info=await fs.promises.stat(real);if(!info.isDirectory())throw new Error("Configured path is not a folder.");return real;
            }});
            limitReached=walked.limitReached;
            const worldNode=planetGraph.node("world","folderrocket",worldId,String(latest.world?.name||worldId),{kind:"world",worldId});
            const nodes=[worldNode,...walked.nodes];const edges=[];
            for(const root of roots) {
                if(root?.storage==="imaginary"||typeof root?.path!=="string")continue;
                const rootNode=walked.nodes.find(item=>item.type==="folder"&&path.resolve(item.sourceRef?.path||"").toLowerCase()===path.resolve(root.path).toLowerCase());
                if(rootNode)edges.push(planetGraph.edge("contains",worldNode.id,rootNode.id,"configured-world-folder"));
            }
            const snapshotData=planetGraph.snapshotGraphItems(snapshot);
            nodes.push(...snapshotData.nodes);edges.push(...snapshotData.edges);
            const accountCatalog=await listGmailConnectedAccounts(req.user.id).catch(()=>[]);
            const accounts=selectedWorldGmailBlocks(latest.settings,worldId);
            await planetGraph.updateGraphStatus(req.user.id,worldId,"indexing",{stage:"gmail",processed:walked.processedDirectories+walked.processedFiles,total:walked.configuredRoots},warnings);
            for(const source of accounts) {
                if(!accountCatalog.some(item=>item.blockId===source.blockId)) {warnings.push("One configured Gmail account is not connected; its conversations were not indexed.");continue;}
                try {
                    const listing=await listGmailInboxThreads({maxResults:100},req.user.id,source.blockId);
                    const sourceThreads=listing.threads;
                    if(listing.nextPageToken) {limitReached=true;warnings.push("Gmail indexing is limited to the first 100 inbox messages per selected account. Refresh to continue later.");}
                    const account=accountCatalog.find(item=>item.blockId===source.blockId);
                    planetGraph.addEmailThreads(nodes,edges,source.blockId,account?.email||"",sourceThreads);
                } catch(error) {warnings.push(error instanceof Error?`Gmail source unavailable: ${error.message}`:"A Gmail source could not be indexed.");}
            }
            const alerts=require("./services/emailAlertSettingsService").getEmailAlertSettings(req.user.id,worldId);
            for(const provider of ["gmail","outlook"]) for(const [blockId,block] of Object.entries(alerts[provider]?.blocks||{})) {
                const selected=provider==="gmail"?accounts.some(item=>item.blockId===blockId):true;
                if(!selected)continue;
                for(const rule of (block.rules||[]).filter(item=>item.enabled)) nodes.push(planetGraph.node("alert",provider,`${blockId}:${rule.id}`,rule.label,{kind:"email-alert",provider,blockId,ruleId:rule.id},{query:rule.query.slice(0,240),color:rule.color}));
            }
            const current=readWorldRecord(req.user.id,worldId);
            if(current.world?.graphEnabled!==true) {await planetGraph.updateGraphStatus(req.user.id,worldId,"disabled",{stage:"stopped",processed:walked.processedDirectories+walked.processedFiles,total:walked.configuredRoots},warnings);return;}
            const progress={stage:"complete",processed:walked.processedDirectories+walked.processedFiles,total:walked.configuredRoots,limitReached:limitReached||walked.limitReached};
            await planetGraph.replaceIndexedGraph(req.user.id,worldId,nodes,edges,progress,{warnings});
        } catch(error) {
            const current=await planetGraph.readGraph(req.user.id,worldId);
            await planetGraph.writeGraph({...current,status:"error",progress:{...current.progress,stage:"error"},warnings:[...warnings,error instanceof Error?error.message:"Graph indexing failed."].slice(0,30),updatedAt:new Date().toISOString()}).catch(()=>{});
        }
    });
    if(!accepted)return res.status(202).json({message:"Graph indexing is already in progress.",status:"indexing"});
    res.status(202).json({message:"Graph indexing started.",status:"indexing"});
});

app.post("/worlds/:worldId/graph/activity",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    if(found.world.graphEnabled!==true)return res.status(409).json({message:"This planet graph is disabled."});
    try {
        const activity=req.body?.activity;
        if(activity?.worldId!==worldId)return res.status(400).json({message:"The activity does not belong to this planet."});
        if(activity.destination){const safe=assertUserPath(req.user,activity.destination,{allowMissing:true});activity.destination=safe;}
        const graph=await planetGraph.upsertActivity(req.user.id,worldId,activity);
        res.status(202).json({accepted:["ready","partial","indexing"].includes(graph.status),updatedAt:graph.updatedAt});
    } catch(error) {res.status(400).json({message:error instanceof Error?error.message:"Unable to add the operation to this planet graph."});}
});

app.post("/worlds/:worldId/graph/snapshot",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    if(found.world.graphEnabled!==true)return res.status(409).json({message:"This planet graph is disabled."});
    try {
        const snapshot=req.body?.snapshot&&typeof req.body.snapshot==="object"?req.body.snapshot:{};
        const items=planetGraph.snapshotGraphItems(snapshot);
        const graph=await planetGraph.replaceSnapshotGraphData(req.user.id,worldId,items.nodes,items.edges);
        res.status(202).json({accepted:true,status:graph.status,updatedAt:graph.updatedAt});
    } catch(error) {res.status(400).json({message:error instanceof Error?error.message:"Unable to update this planet graph."});}
});

app.get("/worlds/:worldId/email/conversations",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    try {
        const graph=await planetGraph.readGraph(req.user.id,worldId);
        const requested=typeof req.query.blockId==="string"?req.query.blockId:"";
        const activeAccount=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
        if(activeAccount?.provider==="outlook")return res.status(501).json({provider:"outlook",providerUnsupported:true,message:"Outlook messages are connected, but this FolderRocket build does not yet provide real Outlook conversation threads."});
        const selected=selectedWorldGmailBlocks(found.settings,worldId);
        const requestedSource=requested?selected.find(item=>item.blockId===requested):null;
        if(requested&&!requestedSource)return res.status(403).json({message:"Choose a Gmail account selected for this planet."});
        let threads=[];let nextPageToken="";
        const accounts=await listGmailConnectedAccounts(req.user.id);
        for(const source of requestedSource?[requestedSource]:selected) {
            if(!accounts.some(item=>item.blockId===source.blockId))continue;
            const listing=await listGmailInboxThreads({maxResults:40,pageToken:requestedSource?String(req.query.pageToken||""):""},req.user.id,source.blockId);
            threads.push(...listing.threads.map(item=>({...item,blockId:source.blockId,accountEmail:accounts.find(account=>account.blockId===source.blockId)?.email||"",shared:false})));
            if(requestedSource)nextPageToken=listing.nextPageToken;
        }
        const localKeys=new Set(threads.map(item=>`${item.blockId}:${item.id}`));
        const shared=graph.sharedThreads.filter(item=>!localKeys.has(`${item.blockId}:${item.threadId}`)).map(item=>({id:item.threadId,threadId:item.threadId,blockId:item.blockId,subject:item.subject||"Shared email conversation",snippet:"",updatedAt:item.sharedAt,messageCount:0,messages:[],accountEmail:item.accountEmail||"",shared:true,sourceWorldId:item.sourceWorldId,sourceWorldName:found.settings.worlds?.[item.sourceWorldId]?.name||item.sourceWorldId,available:accountsHasConnection(req.user.id,item.blockId)}));
        res.json({threads:[...threads,...shared].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))),nextPageToken,selectedBlockId:requestedSource?.blockId||selected[0]?.blockId||""});
    } catch(error) {res.status(502).json({message:error instanceof Error?error.message:"Unable to load Gmail conversations."});}
});

function accountsHasConnection(userId,blockId) {
    try {return require("./services/emailTokenStore").getConnection("gmail",userId,blockId)!=null;} catch {return false;}
}

async function resolveWorldThread(userId,settings,worldId,threadId,requestedBlockId) {
    const selected=selectedGmailBlock(settings,worldId,requestedBlockId);
    if(selected)return {...selected,shared:false,sourceWorldId:worldId};
    const graph=await planetGraph.readGraph(userId,worldId);
    const reference=graph.sharedThreads.find(item=>item.threadId===threadId&&(!requestedBlockId||item.blockId===requestedBlockId));
    return reference?{blockId:reference.blockId,shared:true,sourceWorldId:reference.sourceWorldId,reference}:null;
}

app.get("/worlds/:worldId/email/conversations/:threadId",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const threadId=String(req.params.threadId||"");
    const activeAccount=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
    if(activeAccount?.provider==="outlook")return res.status(501).json({provider:"outlook",providerUnsupported:true,message:"Outlook conversation threads are not supported yet."});
    try {
        const source=await resolveWorldThread(req.user.id,found.settings,worldId,threadId,typeof req.query.blockId==="string"?req.query.blockId:"");
        if(!source)return res.status(403).json({message:"This conversation is not selected for or shared with this planet."});
        const accounts=await listGmailConnectedAccounts(req.user.id);
        if(!accounts.some(item=>item.blockId===source.blockId))return res.status(424).json({message:"The Gmail account used by this shared conversation is unavailable. Reconnect it in its source planet."});
        const thread=await getGmailThread(threadId,req.user.id,source.blockId);
        res.json({...thread,blockId:source.blockId,accountEmail:accounts.find(item=>item.blockId===source.blockId)?.email||"",shared:source.shared,sourceWorldId:source.sourceWorldId});
    } catch(error) {res.status(502).json({message:error instanceof Error?error.message:"Unable to open this Gmail conversation."});}
});

app.post("/worlds/:worldId/email/conversations/:threadId/reply",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const threadId=String(req.params.threadId||"");
    const activeAccount=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
    if(activeAccount?.provider==="outlook")return res.status(501).json({provider:"outlook",providerUnsupported:true,message:"Replying to Outlook conversation threads is not supported yet."});
    try {
        const source=await resolveWorldThread(req.user.id,found.settings,worldId,threadId,typeof req.body?.blockId==="string"?req.body.blockId:"");
        if(!source)return res.status(403).json({message:"This conversation is not selected for or shared with this planet."});
        const accounts=await listGmailConnectedAccounts(req.user.id);const account=accounts.find(item=>item.blockId===source.blockId);
        if(!account)return res.status(424).json({message:"The Gmail account for this conversation is unavailable."});
        if(account.canSend===false)return res.status(403).json({message:"Reconnect this Gmail account with sending permission to reply."});
        const to=typeof req.body?.to==="string"?req.body.to:"";const text=typeof req.body?.text==="string"?req.body.text:"";
        if(!text.trim())return res.status(400).json({message:"Write a message before replying."});
        let attachmentBytes=0;
        const attachments=Array.isArray(req.body?.attachments)?await Promise.all(req.body.attachments.slice(0,10).map(async item=>{
            const filePath=assertUserPath(req.user,item?.path);const stats=await fs.promises.stat(filePath);if(!stats.isFile())throw new Error("A reply attachment is not a file.");if(stats.size>20*1024*1024)throw new Error(`${path.basename(filePath)} exceeds the Gmail attachment limit.`);
            attachmentBytes+=stats.size;if(attachmentBytes>20*1024*1024)throw new Error("Combined Gmail reply attachments exceed 20 MB.");
            return {path:filePath,name:path.basename(filePath),mimeType:graphMimeType(filePath)};
        })):[];
        const mode=req.body?.mode==="send"?"send":"draft";const originalMessageId=typeof req.body?.originalMessageId==="string"?req.body.originalMessageId:"";const references=typeof req.body?.references==="string"?req.body.references:"";const subject=typeof req.body?.subject==="string"?req.body.subject:"";
        if(mode==="send") {
            const sent=await sendGmailReply({threadId,to,subject,text,attachments,originalMessageId,references},req.user.id,source.blockId);
            const messageNode=planetGraph.node("email-message","gmail",`${source.blockId}:${sent.id||crypto.randomUUID()}`,subject||"Sent reply",{kind:"gmail-message",blockId:source.blockId,messageId:sent.id||"",threadId},{at:new Date().toISOString()});
            const threadNode=planetGraph.node("email-thread","gmail",`${source.blockId}:${threadId}`,subject||"Email conversation",{kind:"gmail-thread",blockId:source.blockId,threadId});
            if(found.world.graphEnabled===true)await planetGraph.upsertGraphData(req.user.id,worldId,[threadNode,messageNode],[planetGraph.edge("contains",threadNode.id,messageNode.id,"gmail-reply")]);
            res.json({message:"Reply sent in the Gmail conversation.",messageId:sent.id||"",threadId:sent.threadId||threadId});
        } else {
            const draft=await createGmailReplyDraft({threadId,to,subject,text,attachments,originalMessageId,references},req.user.id,source.blockId);
            res.json({message:"Reply saved as a Gmail draft.",draftId:draft?.id||"",threadId});
        }
    } catch(error) {const message=error instanceof Error?error.message:"Unable to reply to this Gmail conversation.";res.status(/permission|scope|insufficient|access denied/i.test(message)?403:400).json({message:/permission|scope|insufficient|access denied/i.test(message)?"Reconnect this Gmail account and grant sending permission to reply.":message});}
});

app.post("/worlds/:worldId/email/conversations/:threadId/share",requireAuthenticated,async(req,res)=>{
    const sourceWorldId=String(req.params.worldId||"");const sourceWorld=graphWorld(req,res,sourceWorldId);if(!sourceWorld)return;
    const threadId=String(req.params.threadId||"");const blockId=typeof req.body?.blockId==="string"?req.body.blockId:"";
    const source=selectedGmailBlock(sourceWorld.settings,sourceWorldId,blockId);if(!source)return res.status(403).json({message:"Select the Gmail account for this conversation in the source planet first."});
    try {
        const accounts=await listGmailConnectedAccounts(req.user.id);const account=accounts.find(item=>item.blockId===source.blockId);if(!account)return res.status(424).json({message:"The source Gmail account is no longer connected."});
        const thread=await getGmailThread(threadId,req.user.id,source.blockId);const subject=thread.messages.at(-1)?.subject||"Shared email conversation";
        const targets=Array.isArray(req.body?.targetWorldIds)?[...new Set(req.body.targetWorldIds.filter(planetGraph.validId))].slice(0,20):[];
        if(!targets.length)return res.status(400).json({message:"Choose at least one destination planet."});
        const shared=[];
        for(const targetWorldId of targets) {
            if(targetWorldId===sourceWorldId)continue;
            const target=readWorldRecord(req.user.id,targetWorldId);if(!target.world)return res.status(404).json({message:"One destination planet is unavailable."});
            await planetGraph.addSharedThread(req.user.id,targetWorldId,{sourceWorldId,blockId:source.blockId,threadId,accountEmail:account.email||"",subject});shared.push(targetWorldId);
        }
        res.json({message:"Conversation reference shared with the selected planets.",worldIds:shared});
    } catch(error) {res.status(502).json({message:error instanceof Error?error.message:"Unable to share this conversation reference."});}
});

app.delete("/worlds/:worldId/email/conversations/:threadId/share",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const blockId=typeof req.query.blockId==="string"?req.query.blockId:"";const threadId=String(req.params.threadId||"");
    try {
        const graph=await planetGraph.readGraph(req.user.id,worldId);if(!graph.sharedThreads.some(item=>item.threadId===threadId&&item.blockId===blockId))return res.status(404).json({message:"This shared reference was not found in this planet."});
        await planetGraph.removeSharedThread(req.user.id,worldId,blockId,threadId);res.json({message:"Conversation reference removed from this planet."});
    } catch(error) {res.status(500).json({message:error instanceof Error?error.message:"Unable to remove this planet's conversation reference."});}
});

function readWorldActivityConfig(userId, worldId) {
    const settings = readDashboardPreferences(userId) || {};
    const world = settings.worlds?.[worldId] || {};
    return {settings, world, config:require("./services/worldActivityEmailService").normalizeWorldActivityNotifications(world.activityNotifications)};
}

app.get("/settings/worlds/:worldId/activity-notifications", requireAuthenticated, (req, res) => {
    const worldId = String(req.params.worldId || "").trim();
    if (!validWorldId(worldId)) return res.status(400).json({message:"Invalid planet identifier."});
    const {config, world} = readWorldActivityConfig(req.user.id, worldId);
    const runtime = world.activityNotifications?.runtime && typeof world.activityNotifications.runtime === "object" ? world.activityNotifications.runtime : {};
    res.json({config, runtime, nextDigestAt:require("./services/worldActivityEmailService").nextDigestAt(world.activityNotifications, runtime), scheduler:"Runs every 30 seconds while FolderRocket backend is active."});
});

app.put("/settings/worlds/:worldId/activity-notifications", requireAuthenticated, (req, res) => {
    const worldId = String(req.params.worldId || "").trim();
    if (!validWorldId(worldId)) return res.status(400).json({message:"Invalid planet identifier."});
    const service = require("./services/worldActivityEmailService");
    try {
        const {settings, world, config:previous} = readWorldActivityConfig(req.user.id, worldId);
        let config = service.normalizeWorldActivityNotifications(req.body?.config);
        if (config.enabled) {
            const accountList = config.senderProvider === "gmail" ? awaitableListGmailAccounts(req.user.id) : awaitableListOutlookAccounts(req.user.id);
            if (accountList instanceof Promise) throw new Error("Account catalog is loading; retry saving in a moment.");
            const account = accountList.find(item => item.blockId === config.senderBlockId);
            if (!account) throw new Error("Select a connected sender account for this planet.");
            config = service.validForEnable(config, account.canSend === true);
            if (!previous.enabled || !previous.anchorDate) config.anchorDate = service.localDateKey(new Date(), config.timeZone);
        } else config.anchorDate = previous.anchorDate || config.anchorDate;
        const currentNotifications = world.activityNotifications && typeof world.activityNotifications === "object" ? world.activityNotifications : {};
        const nextWorld = {...world, activityNotifications:{...config, snapshot:currentNotifications.snapshot || {activities:[],calendarEvents:[],reminders:[]}, runtime:currentNotifications.runtime || {}}};
        writeDashboardPreferences(req.user.id, {...settings, worlds:{...(settings.worlds || {}), [worldId]:nextWorld}});
        res.json({config, runtime:nextWorld.activityNotifications.runtime});
    } catch (error) { res.status(400).json({message:error instanceof Error ? error.message : "Unable to save world digest settings."}); }
});

function awaitableListGmailAccounts(userId) {
    try { return require("./services/emailTokenStore").listConnections("gmail", userId).map(connection => ({blockId:connection.blockId,canSend:!connection.scopes || String(connection.scopes).split(/\s+/).includes("https://www.googleapis.com/auth/gmail.compose")})); }
    catch { return []; }
}
function awaitableListOutlookAccounts(userId) {
    try { return require("./services/emailTokenStore").listConnections("outlook", userId).map(connection => ({blockId:connection.blockId,canSend:String(connection.scopes || "").split(/\s+/).includes("https://graph.microsoft.com/Mail.Send")})); }
    catch { return []; }
}

app.post("/settings/worlds/:worldId/activity-snapshot", requireAuthenticated, (req, res) => {
    const worldId = String(req.params.worldId || "").trim();
    if (!validWorldId(worldId)) return res.status(400).json({message:"Invalid planet identifier."});
    const {settings, world} = readWorldActivityConfig(req.user.id, worldId);
    const current = world.activityNotifications && typeof world.activityNotifications === "object" ? world.activityNotifications : {};
    if (current.enabled !== true) return res.status(409).json({message:"Activity notifications are disabled for this planet."});
    const snapshot = require("./services/worldActivityEmailService").selectActivitySnapshotSources(req.body?.snapshot, current.sources);
    writeDashboardPreferences(req.user.id, {...settings, worlds:{...(settings.worlds || {}), [worldId]:{...world, activityNotifications:{...current, snapshot}}}});
    res.json({saved:true, updatedAt:snapshot.updatedAt});
});

app.post("/settings/worlds/:worldId/activity-notifications/preview", requireAuthenticated, (req, res) => {
    const worldId = String(req.params.worldId || "").trim();
    if (!validWorldId(worldId)) return res.status(400).json({message:"Invalid planet identifier."});
    try {
        const {world} = readWorldActivityConfig(req.user.id, worldId);
        const digest = require("./services/worldActivityEmailService").buildWorldActivityDigest({worldName:String(req.body?.worldName || world.name || "Workspace").slice(0,80), config:req.body?.config, snapshot:req.body?.snapshot, emailAlerts:world.emailAlerts});
        res.json({preview:digest});
    } catch (error) { res.status(400).json({message:error instanceof Error ? error.message : "Unable to build digest preview."}); }
});

app.post("/settings/worlds/:worldId/activity-notifications/test", requireAuthenticated, async (req, res) => {
    const worldId = String(req.params.worldId || "").trim();
    if (!validWorldId(worldId)) return res.status(400).json({message:"Invalid planet identifier."});
    try {
        const {settings, world} = readWorldActivityConfig(req.user.id, worldId);
        const config = require("./services/worldActivityEmailService").normalizeWorldActivityNotifications(req.body?.config);
        const accounts = config.senderProvider === "gmail" ? await listGmailConnectedAccounts(req.user.id) : await listOutlookConnectedAccounts(req.user.id);
        const account = accounts.find(item => item.blockId === config.senderBlockId);
        if (!account) throw new Error("The selected sender account is no longer connected.");
        require("./services/worldActivityEmailService").validForEnable({...config, enabled:true, sources:config.sources.length ? config.sources : ["dailyActivities"]}, account.canSend === true);
        const digest = require("./services/worldActivityEmailService").buildWorldActivityDigest({worldName:String(req.body?.worldName || world.name || "Workspace").slice(0,80), config, snapshot:req.body?.snapshot, emailAlerts:world.emailAlerts});
        const sender = config.senderProvider === "gmail" ? sendGmailEmail : sendOutlookEmail;
        await sender({to:config.recipient, subject:`Test · ${digest.subject}`, text:digest.text}, req.user.id, config.senderBlockId);
        const activityNotifications = world.activityNotifications && typeof world.activityNotifications === "object" ? world.activityNotifications : {};
        const history = require("./services/worldActivityEmailService").appendDigestHistory(activityNotifications.runtime, {at:new Date().toISOString(),kind:"test",status:"sent"});
        writeDashboardPreferences(req.user.id, {...settings, worlds:{...(settings.worlds || {}), [worldId]:{...world, activityNotifications:{...activityNotifications, runtime:history}}}});
        res.json({sent:true, message:"Test email sent at your explicit request."});
    } catch (error) { res.status(400).json({message:error instanceof Error ? error.message : "Unable to send test email."}); }
});

app.put("/settings/active-world", requireAuthenticated, (req, res) => {
    const worldId = typeof req.body?.worldId === "string" ? req.body.worldId.trim() : "";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(worldId) || ["__proto__", "prototype", "constructor"].includes(worldId)) {
        return res.status(400).json({message: "Identificativo del pianeta attivo non valido."});
    }
    const existing = readDashboardPreferences(req.user.id) || {};
    writeDashboardPreferences(req.user.id, {...existing, activeWorldId: worldId});
    res.json({message: "Pianeta attivo aggiornato."});
});

app.post("/worlds/:worldId/ai/invoke", requireAuthenticated, async (req, res) => {
    const worldId = typeof req.params.worldId === "string" ? req.params.worldId.trim() : "";
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(worldId) || ["__proto__", "prototype", "constructor"].includes(worldId)) {
        return res.status(400).json({message: "Identificativo del pianeta non valido."});
    }
    const settings = readDashboardPreferences(req.user.id) || {};
    if (settings.activeWorldId !== worldId) return res.status(403).json({message: "Per richiamare agenti o skill, entra prima nel pianeta corrispondente."});
    if (settings.worlds?.[worldId]?.aiEnabled !== true) return res.status(403).json({message: "Attiva prima l’AI nelle impostazioni di questo pianeta."});
    const {kind, name, instructions, prompt, worldName, profileId, model, capabilities} = req.body || {};
    if (!(["agent", "skill"].includes(kind)) || typeof name !== "string" || typeof prompt !== "string") {
        return res.status(400).json({message: "Profilo o richiesta AI non validi."});
    }
    try {
        const worldSettings = settings.worlds?.[worldId] || {};
        const profileList = Array.isArray(worldSettings[kind === "agent" ? "agents" : "skills"]) ? worldSettings[kind === "agent" ? "agents" : "skills"] : [];
        if (profileList.length && typeof profileId !== "string") return res.status(400).json({message:"Seleziona un profilo salvato per questo pianeta."});
        const savedProfile = typeof profileId === "string" ? profileList.find(profile => profile?.id === profileId) : null;
        if (profileId && profileList.length && !savedProfile) return res.status(404).json({message:"Il profilo non appartiene a questo pianeta o non è stato salvato."});
        if (savedProfile && !savedProfile.enabled) return res.status(403).json({message:"Questo agente o skill è disattivato nel pianeta."});
        const dashboard = worldSettings.dashboard || (worldId === "work" ? legacyWorkspaceDashboard(settings) : {});
        const folders = (Array.isArray(dashboard?.folders) ? dashboard.folders : []).filter(folder => folder && folder.storage !== "imaginary" && typeof folder.path === "string" && folder.path.trim()).slice(0, 12).map(folder => folder.path);
        const result = await invokeWorldAssistant({
            worldName: typeof worldName === "string" ? worldName.slice(0, 80) : "",
            kind,
            name: savedProfile?.name || name,
            instructions: savedProfile?.instructions ?? instructions,
            prompt,
            model: savedProfile?.model || model,
            capabilities: savedProfile?.capabilities || capabilities,
            folders
        });
        res.json(result);
    } catch (error) {
        console.warn("FolderRocket shared AI invocation failed:", error instanceof Error ? error.name : "unknown error");
        res.status(502).json({message: "Richiamo AI non riuscito. Controlla la sezione Diagnostica e la connessione AI."});
    }
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

function readWorkspaceWorldId(request) {
    const value = typeof request.query?.worldId === "string" ? request.query.worldId.trim() : "";
    return /^[a-zA-Z0-9_-]{1,80}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value) ? value : "";
}

function readWorkspaceWorldName(request) {
    const value = typeof request.query?.worldName === "string" ? request.query.worldName : "";
    return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
}

const WORLD_DASHBOARD_SETTING_KEYS = ["folders", "dashboardWidths", "dashboardHeight", "searchFolderIds", "sourceBlocks", "rightSourceBlocks"];

function legacyWorkspaceDashboard(settings) {
    return Object.fromEntries(WORLD_DASHBOARD_SETTING_KEYS.filter(key => Object.hasOwn(settings || {}, key)).map(key => [key, settings[key]]));
}

app.get("/settings/dashboard", (req, res) => {
    if (!req.user) return res.status(401).json({message: "Sign in required."});
    const settings = readDashboardPreferences(req.user.id) || {};
    const worldId = readWorkspaceWorldId(req);
    if (!worldId) return res.json({settings});
    const worldDashboard = settings.worlds?.[worldId]?.dashboard;
    res.json({settings: worldDashboard || (worldId === "work" ? legacyWorkspaceDashboard(settings) : null)});
});

app.put("/settings/dashboard", (req, res) => {
    try {
        if (!req.user) throw new Error("Sign in required.");
        const settings = req.body?.settings;
        if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Invalid dashboard settings.");
        const existing = readDashboardPreferences(req.user.id) || {};
        const worldId = readWorkspaceWorldId(req);
        if (worldId) {
            const worlds = existing.worlds && typeof existing.worlds === "object" && !Array.isArray(existing.worlds) ? existing.worlds : {};
            const legacy = worldId === "work" && !worlds[worldId]?.dashboard ? legacyWorkspaceDashboard(existing) : {};
            writeDashboardPreferences(req.user.id, {
                ...existing,
                worlds: {...worlds, [worldId]: {...worlds[worldId], dashboard: {...legacy, ...settings}}}
            });
            return res.json({message: "Dashboard settings saved."});
        }
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

app.delete("/settings/worlds/:worldId", requireAuthenticated, (req, res) => {
    try {
        const worldId = typeof req.params.worldId === "string" ? req.params.worldId.trim() : "";
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(worldId) || ["__proto__", "prototype", "constructor"].includes(worldId)) throw new Error("Invalid world identifier.");
        const existing = readDashboardPreferences(req.user.id) || {};
        const worlds = existing.worlds && typeof existing.worlds === "object" && !Array.isArray(existing.worlds) ? {...existing.worlds} : {};
        delete worlds[worldId];
        const next = {...existing, worlds};
        if (worldId === "work") {
            for (const key of WORLD_DASHBOARD_SETTING_KEYS) delete next[key];
            delete next.emailAlerts;
        }
        writeDashboardPreferences(req.user.id, next);
        void planetGraph.removeWorldGraph(req.user.id, worldId).catch(error => console.warn("Unable to remove planet graph", error));
        res.json({message: "World settings removed."});
    } catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Unable to remove world settings."});
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

function getScopedProviderSettings(userId, provider, blockId, worldId = "") {
    const settings = getEmailAlertSettings(userId, worldId);
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
        }, worldId);
        return {settings: saved, providerSettings: saved[provider].blocks[blockId]};
    }
    return {settings, providerSettings: normalizeProviderBlock({})};
}

app.get("/email/alerts/settings/:provider", requireAuthenticated, (req, res) => {
    const provider = req.params.provider;
    if (provider !== "gmail" && provider !== "outlook") return res.status(400).json({message: "Unknown email provider."});
    const scoped = getScopedProviderSettings(req.user.id, provider, readAlertBlockId(req), readWorkspaceWorldId(req));
    res.json({providerSettings: scoped.providerSettings, favorites: scoped.settings.favorites});
});

app.put("/email/alerts/settings/:provider", requireAuthenticated, (req, res) => {
    try {
        const provider = req.params.provider;
        if (provider !== "gmail" && provider !== "outlook") throw new Error("Unknown email provider.");
        const providerSettings = req.body?.providerSettings;
        if (!providerSettings || typeof providerSettings !== "object" || Array.isArray(providerSettings)) throw new Error("Invalid provider alert settings.");
        const worldId = readWorkspaceWorldId(req);
        const current = getEmailAlertSettings(req.user.id, worldId);
        const blockId = readAlertBlockId(req);
        const previousProviderSettings = blockId ? current[provider].blocks?.[blockId] : current[provider];
        const selectedAccountId = value => value === null
            ? null
            : /^[a-zA-Z0-9_-]{1,120}$/.test(value || "") ? value : blockId;
        const gmailAccountChanged = provider === "gmail" && blockId
            && selectedAccountId(previousProviderSettings?.accountBlockId) !== selectedAccountId(providerSettings.accountBlockId);
        const next = blockId ? {
            ...current,
            [provider]: {
                ...current[provider],
                blocks: {
                    ...current[provider].blocks,
                    // Browser edits must never erase results written by the scheduler.
                    [blockId]: {...providerSettings, runtime: gmailAccountChanged ? {} : (current[provider].blocks?.[blockId]?.runtime ?? {})}
                }
            },
            favorites: Array.isArray(req.body?.favorites) ? req.body.favorites : current.favorites
        } : {
            ...current,
            // Legacy non-block route kept for backward compatibility.
            [provider]: {...providerSettings, runtime: current[provider].runtime},
            favorites: Array.isArray(req.body?.favorites) ? req.body.favorites : current.favorites
        };
        const saved = saveEmailAlertSettings(req.user.id, next, worldId);
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
        if (error?.status === 404) {
            req.folderRocketExpectedNotFound = true;
            return res.status(404).json({code:"REMOTE_PAGE_NOT_FOUND", message:"La pagina del sito non esiste (404). Controlla l’indirizzo o aprila direttamente nel browser."});
        }
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
            await fs.promises.mkdir(destination, {recursive: true});


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


            while (await pathExists(path.join(destination, finalName))) {

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
            await moveFilePortable(file.path, newPath);


            console.log(
                "FILE SALVATO:",
                newPath
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


            // The file operation finishes immediately. Archive extraction and AI
            // analysis continue in the background so they cannot freeze uploads.
            res.json({
                message: archiveEnabled ? "File saved. Archive analysis is running in the background." : "File salvato correttamente",
                location: newPath,
                name: finalName,
                archiveQueued: archiveEnabled
            });

            if (archiveEnabled) {
                setImmediate(() => {
                    enqueueArchiveWork(async () => {
                        let analysis = {azienda:"",posizione:"",tipoDocumento:"",competenze:[],esperienza:"",aiStatus:"Not analysed"};
                        let content = "";
                        try {
                            const extractedContent = await readFileContent(newPath);
                            if (typeof extractedContent === "string") content = extractedContent;
                        } catch (readError) {
                            console.error("Archive reader failed:", readError);
                        }
                        if (!content || content === "Formato non supportato") {
                            analysis.aiStatus = content === "Formato non supportato" ? "Warning: unsupported file format" : "Warning: no readable text extracted";
                        } else {
                            try {
                                analysis = await analyzeDocument(content, archiveColumns);
                                analysis.aiStatus = "Success";
                            } catch (analysisError) {
                                analysis.aiStatus = `Error: ${analysisError instanceof Error ? analysisError.message : String(analysisError)}`;
                            }
                        }
                        await saveFileInfo(destination, finalName, analysis, archiveColumns);
                        console.log("ARCHIVIO AGGIORNATO AUTOMATICAMENTE:", finalName);
                    });
                });
            }

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

            const levels = Array.isArray(req.body.levels) ? req.body.levels : undefined;


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

                    urgentDays,

                    levels

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

app.post("/deadlines/manual", async (req, res) => {
    try {
        const folderPath = assertUserPath(req.user, req.body?.path);
        const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 180) : "";
        const expirationDate = typeof req.body?.expirationDate === "string" ? req.body.expirationDate : "";
        const watchDays = Math.max(1, Number(req.body?.watchDays) || 30);
        const urgentDays = Math.max(0, Number(req.body?.urgentDays) || 7);
        const levels = Array.isArray(req.body?.levels) ? req.body.levels : undefined;
        if (!label) throw new Error("Describe what you want to track.");
        if (!levels && urgentDays >= watchDays) throw new Error("Urgent days must be less than watch days.");
        res.status(201).json({result: await addManualDeadline(folderPath, {label, expirationDate, watchDays, urgentDays, levels})});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to create the deadline."}); }
});

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

app.get("/applications/catalog", requireAuthenticated, async (req, res) => {
    try {
        const result = await require("./services/windowsTask").windowsTask("open-application.ps1", {list:true}, 25000);
        const applications = Array.isArray(result?.applications) ? result.applications.filter(item => item && typeof item.name === "string" && typeof item.appId === "string") : [];
        res.json({applications, source:"Windows Start menu"});
    } catch (error) { res.status(400).json({message:error.message || "Unable to read the Windows Start menu catalog."}); }
});

app.post("/applications/open-installed", requireAuthenticated, async (req, res) => {
    try {
        const appId = typeof req.body?.appId === "string" ? req.body.appId.trim() : "";
        if (!appId || appId.length > 512) throw new Error("Invalid application identifier.");
        res.json(await require("./services/windowsTask").windowsTask("open-application.ps1", {appId}));
    } catch (error) { res.status(400).json({message:error.message || "Unable to open the selected Start menu application."}); }
});

app.post("/applications/open", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        if (typeof req.body?.appId === "string" && req.body.appId.trim()) {
            if (req.body.appId.length > 512) throw new Error("Invalid application identifier.");
            res.json(await require("./services/windowsTask").windowsTask("open-application.ps1", {appId:req.body.appId}));
        } else {
            if (typeof req.body?.name !== "string" || !req.body.name.trim() || req.body.name.length > 120) throw new Error("Invalid application name.");
            res.json(await require("./services/windowsTask").windowsTask("open-application.ps1", {name: req.body.name}));
        }
    } catch (error) { res.status(400).json({message: error.message || "Unable to open application."}); }
});

app.post("/applications/discover", requireAuthenticated, requireAdministrator, async (req, res) => {
    try {
        const appId = String(req.body?.appId || "");
        if (!/^[a-zA-Z0-9_-]{1,120}$/.test(appId)) throw new Error("Invalid application identifier.");
        const extensions = [...new Set((Array.isArray(req.body?.extensions) ? req.body.extensions : []).map(value => String(value).replace(/^\./, "").toLowerCase()).filter(value => /^[a-z0-9]{1,12}$/.test(value)))];
        if (!extensions.length) throw new Error("Select at least one file type for this application.");
        const cachedOnly = Boolean(req.body?.cachedOnly);
        const roots = [os.homedir(), process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer].filter(Boolean);
        if (process.platform === "win32") for (let code = 68; code <= 90; code += 1) {
            const root = String.fromCharCode(code) + ":\\";
            if (fs.existsSync(root)) roots.push(root);
        }
        const controller = new AbortController();
        const cancel = () => controller.abort();
        res.on("close", cancel);
        try {
            res.status(200);
            res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.flushHeaders();
            const send = payload => { if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(payload)}\n`); };
            const cache = require("./services/applicationDiscoveryCache");
            const previous = cache.read(req.user.id, appId, extensions);
            if (cachedOnly) {
                const files = previous?.files ?? [];
                const folders = new Map();
                for (const file of files) {
                    const directory = path.dirname(file.path);
                    folders.set(directory, (folders.get(directory) || 0) + 1);
                }
                send({type:"complete", result:{files, folders:[...folders].map(([path, count]) => ({path, count})).sort((a, b) => b.count - a.count), skipped:0, cached:true, cacheMiss:!previous}});
                if (!res.destroyed && !res.writableEnded) res.end();
                return;
            }
            const result = await require("./services/applicationDiscoveryService").discoverApplicationFiles(roots, extensions, {signal:controller.signal, previous, onProgress:progress => send({type:"progress", ...progress})});
            cache.write(req.user.id, appId, extensions, result);
            const {directories, ...response} = result;
            send({type:"complete", result:response});
            if (!res.destroyed && !res.writableEnded) res.end();
        } finally { res.off("close", cancel); }
    } catch (error) {
        const message=error instanceof Error?error.message:"Unable to scan application files.";
        if (res.headersSent) { if (!res.destroyed && !res.writableEnded) res.end(`${JSON.stringify({type:"error",message})}\n`); }
        else res.status(400).json({message});
    }
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

app.post("/list-folder-files", async (req, res) => {
    try {
        const folder = assertUserPath(req.user, req.body?.folder, {allowMissing:true});
        const folderStats = await fs.promises.stat(folder).catch(() => null);
        if (!folderStats) {
            req.folderRocketExpectedNotFound = true;
            return res.status(404).json({code:"FOLDER_NOT_FOUND", message:"Questa cartella non è più disponibile. Ricollega la cartella o aggiorna il percorso salvato."});
        }
        if (!folderStats.isDirectory()) {
            throw new Error("Il percorso della cartella non è valido o non è accessibile");
        }
        const entries = await fs.promises.readdir(folder, {withFileTypes: true});
        const readEntry = async entry => {
            const entryPath = path.join(folder, entry.name);
            const stats = await fs.promises.stat(entryPath).catch(() => null);
            return stats ? {entry, entryPath, stats} : null;
        };
        const inspected = (await Promise.all(entries.map(readEntry))).filter(Boolean);
        const files = inspected
            .filter(item => item.entry.isFile() && !["archivio.xlsx", "scadenze.xlsx"].includes(item.entry.name.toLowerCase()))
            .map(item => ({name: item.entry.name, path: item.entryPath, createdAt: item.stats.birthtime.toISOString(), size: item.stats.size}))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        // Directory entries are returned separately. The frontend requests their
        // contents only after the user expands a folder, so a large tree never
        // blocks the initial folder view.
        const folders = inspected
            .filter(item => item.entry.isDirectory())
            .map(item => ({name: item.entry.name, path: item.entryPath, createdAt: item.stats.birthtime.toISOString()}))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"}));
        res.json({files, folders});
    }
    catch (error) {
        res.status(400).json({message: error instanceof Error ? error.message : "Impossibile leggere la cartella"});
    }
});

app.get("/filesystem/tree-roots", requireAuthenticated, async (req, res) => {
    try {
        const worldId=typeof req.query.worldId==="string"?req.query.worldId:"";
        if(worldId&&!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
        let mode=typeof req.query.mode==="string"?req.query.mode:"";
        if(!mode&&worldId) {
            const record=readWorldRecord(req.user.id,worldId);
            if(!record.world)return res.status(404).json({message:"Planet not found."});
            mode=record.world.treeRootMode==="desktop"?"desktop":"computer";
        }
        if(!mode)mode="computer";
        if(!["computer","desktop"].includes(mode))return res.status(400).json({message:"Tree Rocket root mode is invalid."});
        let desktopRoot;
        if(mode==="desktop") {
            const candidate=await resolveDesktopRoot();
            try {desktopRoot=await fs.promises.realpath(assertUserPath(req.user,candidate));}
            catch(error) {return res.status(403).json({message:error instanceof Error?error.message:"Desktop access is not available to this account."});}
        }
        const roots = await listTreeRoots({workspacePath:userWorkspace(req.user), administrator:isAdmin(req.user), mode, desktopRoot});
        res.json({roots,mode,worldId:worldId||undefined});
    } catch (error) {
        res.status(500).json({message: error instanceof Error ? error.message : "Unable to load folder roots."});
    }
});

app.post("/filesystem/tree-children", requireAuthenticated, async (req, res) => {
    try {
        let directory = assertUserPath(req.user, req.body?.path);
        if (!isAdmin(req.user)) {
            const [workspaceRealPath, directoryRealPath] = await Promise.all([
                fs.promises.realpath(userWorkspace(req.user)),
                fs.promises.realpath(directory)
            ]);
            if (!isPathWithin(workspaceRealPath, directoryRealPath)) {
                return res.status(403).json({message: "This account can only use folders inside its private FolderRocket workspace."});
            }
            directory = directoryRealPath;
        }
        const contents = await listTreeDirectory(directory, {includeFiles: req.body?.includeFiles === true, includeFolderFileCounts: req.body?.includeFolderFileCounts === true});
        res.json(contents);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to read this folder.";
        const filesystemCode = String(error?.code || "");
        const status = message.includes("only use files inside") || message.includes("only use folders inside") || filesystemCode === "EACCES" || filesystemCode === "EPERM" ? 403 : filesystemCode === "ENOENT" || filesystemCode === "ENOTDIR" ? 404 : 400;
        res.status(status).json({message});
    }
});

app.post("/filesystem/tree-search", requireAuthenticated, async (req, res) => {
    try {
        const query = typeof req.body?.query === "string" ? req.body.query.trim().slice(0, 100) : "";
        const worldId=typeof req.body?.worldId==="string"?req.body.worldId:"";
        if(worldId&&!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
        let mode=typeof req.body?.mode==="string"?req.body.mode:"";
        if(!mode&&worldId) {
            const record=readWorldRecord(req.user.id,worldId);
            if(!record.world)return res.status(404).json({message:"Planet not found."});
            mode=record.world.treeRootMode==="desktop"?"desktop":"computer";
        }
        if(!mode)mode="computer";
        if(!["computer","desktop"].includes(mode))return res.status(400).json({message:"Tree Rocket root mode is invalid."});
        let desktopRoot;
        if(mode==="desktop") {
            const candidate=await resolveDesktopRoot();
            try {desktopRoot=await fs.promises.realpath(assertUserPath(req.user,candidate));}
            catch(error) {return res.status(403).json({message:error instanceof Error?error.message:"Desktop access is not available to this account."});}
        }
        const roots = await listTreeRoots({workspacePath:userWorkspace(req.user),administrator:isAdmin(req.user),mode,desktopRoot});
        const results = await searchTreeRoots(roots, query);
        res.json(results);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to search folders and files.";
        const status = message.includes("at least two characters") ? 400 : 500;
        res.status(status).json({message});
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

async function prepareFileBatch(user, body, {collectConflicts = false} = {}) {
    const destination = assertUserPath(user, body?.destination);
    const destinationStats = await fs.promises.stat(destination).catch(() => null);
    if (!destinationStats?.isDirectory()) throw new Error("Select a valid destination folder");
    const requested = Array.isArray(body?.items)
        ? body.items.filter(item => item && typeof item.path === "string").map(item => ({path:item.path,name:item.name,conflict:item.conflict}))
        : (Array.isArray(body?.paths) ? body.paths.filter(item => typeof item === "string").map(item => ({path:item})) : []);
    const operations = [];
    const conflicts = [];
    const skipped = [];
    const targetKeys = new Set();
    for (const item of requested) {
        const sourcePath = assertUserPath(user, item.path);
        const sourceStats = await fs.promises.stat(sourcePath).catch(() => null);
        if (!sourceStats?.isFile()) throw new Error(`${path.basename(sourcePath)} is no longer available`);
        const requestedName = typeof item.name === "string" && item.name.trim() ? path.basename(item.name.trim()) : path.basename(sourcePath);
        if (!requestedName || requestedName === "." || requestedName === "..") throw new Error("One destination file name is invalid");
        let targetPath = path.join(destination, requestedName);
        const targetKeyFor = value => process.platform === "win32" ? value.toLowerCase() : value;
        let targetKey = targetKeyFor(targetPath);
        const samePath = path.resolve(sourcePath) === path.resolve(targetPath);
        if (targetKeys.has(targetKey)) throw new Error(`${requestedName} would be created more than once`);
        const targetExists = !samePath && await pathExists(targetPath);
        const conflict = ["rename", "replace", "skip"].includes(item.conflict) ? item.conflict : "";
        if ((targetExists || targetKeys.has(targetKey)) && !conflict) {
            if (!collectConflicts) throw new Error(`${requestedName} already exists in the destination folder`);
            conflicts.push({sourcePath, name: requestedName, targetPath});
            continue;
        }
        if (conflict === "skip") {
            skipped.push({name: requestedName, path: targetPath, sourcePath});
            continue;
        }
        if (conflict === "rename" && targetExists) {
            targetPath = nextAvailableFilePath(destination, requestedName);
            targetKey = targetKeyFor(targetPath);
        }
        if (conflict === "replace" && !targetExists) {
            // If the file no longer conflicts, continue with a normal move.
        }
        if (targetKeys.has(targetKey)) throw new Error(`${path.basename(targetPath)} would be created more than once`);
        targetKeys.add(targetKey);
        operations.push({sourcePath, targetPath, samePath, replaceExisting: conflict === "replace" && targetExists});
    }
    return collectConflicts ? {operations, conflicts, skipped} : operations;
}

app.post("/files/move", async (req, res) => {
    try {
        const prepared = await prepareFileBatch(req.user, req.body, {collectConflicts: true});
        if (prepared.conflicts.length) return res.status(409).json({message: "Some destination files already exist.", conflicts: prepared.conflicts});
        const moved = await executeMoveBatch(prepared.operations);
        res.json({moved, skipped: prepared.skipped});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to move files"}); }
});

app.post("/files/copy", async (req, res) => {
    try {
        const operations = await prepareFileBatch(req.user, req.body);
        const copied = await executeCopyBatch(operations);
        res.json({copied});
    } catch (error) { res.status(400).json({message: error instanceof Error ? error.message : "Unable to copy files"}); }
});

app.post("/daily-job/undo", async (req, res) => {
    try {
        const undo = req.body?.undo;
        if (undo?.type === "move") {
            const requested = Array.isArray(undo.entries) ? undo.entries : [];
            const operations = [];
            const destinations = new Set();
            for (const entry of requested) {
                const currentPath = assertUserPath(req.user, entry?.to);
                const originalPath = assertUserPath(req.user, entry?.from, {allowMissing:true});
                const stats = await fs.promises.stat(currentPath).catch(() => null);
                if (!stats?.isFile()) throw new Error(`${path.basename(currentPath)} is no longer available`);
                if (await pathExists(originalPath)) throw new Error(`${path.basename(originalPath)} already exists in its original folder`);
                const key = process.platform === "win32" ? originalPath.toLowerCase() : originalPath;
                if (destinations.has(key)) throw new Error("The undo operation contains duplicate destinations");
                destinations.add(key);
                operations.push({sourcePath:currentPath,targetPath:originalPath,samePath:false});
            }
            await executeMoveBatch(operations);
            return res.json({message:"File operation undone."});
        }
        if (undo?.type === "trash-created") {
            const paths = Array.isArray(undo.paths) ? undo.paths.map(value => assertUserPath(req.user, value)) : [];
            for (const targetPath of paths) {
                const stats = await fs.promises.stat(targetPath).catch(() => null);
                if (!stats?.isFile()) throw new Error(`${path.basename(targetPath)} is no longer available`);
            }
            for (const targetPath of paths) await moveToTrash(targetPath);
            return res.json({message:"Created files moved to the Recycle Bin."});
        }
        throw new Error("This Daily Job entry cannot be undone.");
    } catch (error) { res.status(400).json({message:error instanceof Error?error.message:"Unable to undo this operation."}); }
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
        const allPreferences = readDashboardPreferences(req.user.id) || {};
        const worldId = readWorkspaceWorldId(req);
        const dashboard = worldId
            ? allPreferences.worlds?.[worldId]?.dashboard || (worldId === "work" ? legacyWorkspaceDashboard(allPreferences) : {})
            : allPreferences;
        const blocks = [
            ...(Array.isArray(dashboard?.sourceBlocks) ? dashboard.sourceBlocks : []),
            ...(Array.isArray(dashboard?.rightSourceBlocks) ? dashboard.rightSourceBlocks : [])
        ];
        const sources = [];
        const seenAccounts = new Set();
        const gmailAccounts = await listGmailConnectedAccounts(req.user.id);
        const outlookAccounts = await listOutlookConnectedAccounts(req.user.id);
        let gmailIndex = 0;
        let outlookIndex = 0;
        for (const block of blocks) {
            if (!block || typeof block.id !== "string" || !["gmail", "outlook", "teams"].includes(block.type)) continue;
            if (block.accountBlockId === null) continue;
            const provider = block.type === "teams" ? "outlook" : block.type;
            const blockId = /^[a-zA-Z0-9_-]{1,120}$/.test(block.accountBlockId || "") ? block.accountBlockId : block.id;
            const accountKey = `${provider}:${blockId}`;
            if (seenAccounts.has(accountKey)) continue;
            seenAccounts.add(accountKey);
            const index = provider === "gmail" ? ++gmailIndex : ++outlookIndex;
            const status = provider === "gmail" ? getGmailStatus(req.user.id, blockId) : getOutlookStatus(req.user.id, blockId);
            if (!status.connected) continue;
            const account = (provider === "gmail" ? gmailAccounts : outlookAccounts).find(item => item.blockId === blockId);
            const email = account?.email || "";
            sources.push({provider, blockId, email, label: email || account?.label || `${provider === "gmail" ? "Gmail" : "Outlook"} source ${index}`});
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
            const spreadsheetExtensions = [".xlsx", ".xls", ".xlsm", ".xlsb", ".ods"];
            const displayedSourceName = requestedNames.get(sourcePath) || path.basename(sourcePath);
            const targetPath = path.join(path.dirname(sourcePath), `${path.basename(displayedSourceName, path.extname(displayedSourceName))}_converted.${targetFormat}`);
            if (targetFormat === "pdf") {
                if (sourceExtension === ".pdf") fs.copyFileSync(sourcePath, targetPath);
                else if ([".doc", ".docx"].includes(sourceExtension)) await convertWordToPdf(sourcePath, targetPath);
                else if ([".png", ".jpg", ".jpeg"].includes(sourceExtension)) await convertImageToPdf(sourcePath, targetPath);
                else if (spreadsheetExtensions.includes(sourceExtension)) await convertExcelToPdf(sourcePath, targetPath);
                else {
                    const content = sourceExtension === ".csv" ? fs.readFileSync(sourcePath, "utf8") : await readFileContent(sourcePath);
                    if (!content || content === "Formato non supportato") throw new Error(`${path.basename(sourcePath)} non può essere convertito in PDF`);
                    writeTextPdf(targetPath, path.basename(sourcePath), content);
                }
            } else if (targetFormat === "txt") {
                const content = spreadsheetExtensions.includes(sourceExtension)
                    ? spreadsheetToText(sourcePath)
                    : sourceExtension === ".csv" ? fs.readFileSync(sourcePath, "utf8") : await readFileContent(sourcePath);
                if (!content || content === "Formato non supportato") throw new Error(`${path.basename(sourcePath)} non può essere convertito in TXT`);
                fs.writeFileSync(targetPath, content, "utf8");
            } else if (targetFormat === "csv" && spreadsheetExtensions.includes(sourceExtension)) {
                const XLSX = getXlsx();
                const workbook = XLSX.readFile(sourcePath);
                fs.writeFileSync(targetPath, XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]), "utf8");
            } else if (targetFormat === "xlsx" && [".csv", ".xls", ".xlsm", ".xlsb", ".ods"].includes(sourceExtension)) {
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
            frontendOrigin: origin,
            worldId: readWorkspaceWorldId(req),
            worldName: readWorkspaceWorldName(req)
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

app.get("/email/gmail/accounts", requireAuthenticated, async (req, res) => {
    try {
        const accounts = await listGmailConnectedAccounts(req.user.id);
        const preferences = readDashboardPreferences(req.user.id) || {};
        res.json({accounts: buildGmailAccountCatalog(accounts, preferences)});
    }
    catch { res.status(502).json({message:"Impossibile leggere gli account Gmail collegati."}); }
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
            frontendOrigin: origin,
            includeTeams: req.query?.teams === "1",
            includeSend: req.query?.send === "1"
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

app.get("/email/outlook/accounts", requireAuthenticated, async (req, res) => {
    try { res.json({accounts: await listOutlookConnectedAccounts(req.user.id)}); }
    catch { res.status(502).json({message:"Impossibile leggere gli account Outlook collegati."}); }
});

function respondTeamsError(res, error) {
    const message = error instanceof Error ? error.message : "Unable to load Microsoft Teams.";
    if (error?.status === 403 || /insufficientprivileges|permission|scope|consent/i.test(message)) {
        return res.status(403).json({needsConsent: true, message: "Microsoft Teams needs additional Microsoft Graph permissions. Reconnect the selected Microsoft account and approve access; channel messages may require administrator consent."});
    }
    if (/not connected|reconnect outlook/i.test(message)) return res.status(401).json({needsConsent: true, message: "Connect or reconnect the Microsoft account selected for this planet."});
    return res.status(400).json({message});
}

app.get("/teams/chats", requireAuthenticated, async (req, res) => {
    try {
        const blockId = readAlertBlockId(req);
        if (!getOutlookStatus(req.user.id, blockId).connected) return res.status(401).json({needsConsent: true, message: "Connect the Microsoft account selected for this planet."});
        const page = typeof req.query.cursor === "string" && req.query.cursor
            ? await listTeamsDirectoryNextPage(req.query.cursor, "chats", req.user.id, blockId)
            : await listTeamsChats(req.user.id, blockId);
        res.json({chats: page.items, nextLink: page.nextLink || ""});
    } catch (error) { respondTeamsError(res, error); }
});

app.get("/teams/groups", requireAuthenticated, async (req, res) => {
    try {
        const blockId = readAlertBlockId(req);
        if (!getOutlookStatus(req.user.id, blockId).connected) return res.status(401).json({needsConsent: true, message: "Connect the Microsoft account selected for this planet."});
        const page = typeof req.query.cursor === "string" && req.query.cursor
            ? await listTeamsDirectoryNextPage(req.query.cursor, "teams", req.user.id, blockId)
            : await listJoinedTeams(req.user.id, blockId);
        res.json({teams: page.items, nextLink: page.nextLink || ""});
    } catch (error) { respondTeamsError(res, error); }
});

app.get("/teams/groups/:teamId/channels", requireAuthenticated, async (req, res) => {
    try {
        const blockId = readAlertBlockId(req);
        if (!getOutlookStatus(req.user.id, blockId).connected) return res.status(401).json({needsConsent: true, message: "Connect the Microsoft account selected for this planet."});
        const page = typeof req.query.cursor === "string" && req.query.cursor
            ? await listTeamsDirectoryNextPage(req.query.cursor, "channels", req.user.id, blockId)
            : await listTeamChannels(req.params.teamId, req.user.id, blockId);
        res.json({channels: page.items, nextLink: page.nextLink || ""});
    } catch (error) { respondTeamsError(res, error); }
});

app.get("/teams/messages", requireAuthenticated, async (req, res) => {
    try {
        const blockId = readAlertBlockId(req);
        if (!getOutlookStatus(req.user.id, blockId).connected) return res.status(401).json({needsConsent: true, message: "Connect the Microsoft account selected for this planet."});
        let page;
        if (typeof req.query.cursor === "string" && req.query.cursor) page = await listTeamsNextPage(req.query.cursor, req.user.id, blockId, typeof req.query.parentId === "string" ? req.query.parentId : "");
        else {
            const kind = req.query.kind === "channel" ? "channel" : req.query.kind === "chat" ? "chat" : "";
            const identifier = typeof req.query.id === "string" ? req.query.id : "";
            if (!kind || !identifier) return res.status(400).json({message: "Choose a chat or channel first."});
            page = kind === "chat"
                ? await listTeamsChatMessages(identifier, req.user.id, blockId)
                : await listTeamsChannelMessages(typeof req.query.teamId === "string" ? req.query.teamId : "", identifier, req.user.id, blockId);
        }
        res.json({messages: page.messages, nextLink: page.nextLink || ""});
    } catch (error) { respondTeamsError(res, error); }
});

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


        req.folderRocketBackendErrorName = error instanceof Error ? error.name : "UnknownError";
        req.folderRocketBackendErrorStack = safeDiagnosticText(error instanceof Error ? error.stack : "", 2000);
        console.warn("FolderRocket request parser failed:", req.folderRocketRequestId, req.folderRocketBackendErrorName);


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

        recordDiagnostic("system", {type:"backend", severity:"info", category:"lifecycle", message:"Backend avviato", route:"backend/server.js", resolved:true});

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
server.on("error", error => {
    recordDiagnostic("system", {type:"backend", severity:"critical", category:"lifecycle", message:`Backend non avviato (${error.name || "errore"})`, route:"backend/server.js"});
    console.error("Backend error:", error.name || "unknown error");
});
let fatalBackendExitStarted = false;
process.on("uncaughtException", error => {
    if (fatalBackendExitStarted) return;
    fatalBackendExitStarted = true;
    const forceExit = setTimeout(() => process.exit(1), 5000);
    void recordDiagnostic("system", {type:"backend", severity:"critical", category:"lifecycle", message:`Eccezione backend non gestita (${error.name || "errore"})`, route:"backend/server.js", stack:error.stack})
        .then(() => flushDiagnostics())
        .finally(() => { clearTimeout(forceExit); process.exit(1); });
});

let shuttingDown = false;
function shutDownBackend() {
    if (shuttingDown) return;
    shuttingDown = true;
    recordDiagnostic("system", {type:"backend", severity:"info", category:"lifecycle", message:"Arresto del backend richiesto", route:"backend/server.js", resolved:true});
    process.stdin.pause();
    const forceExit = setTimeout(() => process.exit(0), 15000);
    forceExit.unref?.();
    server.close(() => {
        void Promise.all([archiveWorkQueue.catch(() => {}), flushDiagnostics()]).finally(() => process.exit(0));
    });
}

if (process.env.FOLDERROCKET_DESKTOP === "1") {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", data => {
        if (String(data).split(/\r?\n/).some(command => command.trim() === "shutdown")) shutDownBackend();
    });
    process.stdin.on("end", shutDownBackend);
}
process.on("SIGINT", shutDownBackend);
process.on("SIGTERM", shutDownBackend);
