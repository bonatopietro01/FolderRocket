require("./services/pipeErrorGuards").attachLogPipeErrorGuards([process.stdout, process.stderr]);
require("./services/hostFilesystem");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {execFile, spawn} = require("child_process");
const {Worker} = require("node:worker_threads");
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
const {matchesSavedConversationScope,conversationContactIdentity,mergeSavedChatSelectorThreads,findInboxThreadById,chatInboxPageOptions,senderInboxQuery} = require("./services/emailConversationSelectionService");
const {buildGmailAccountCatalog} = require("./services/gmailAccountCatalog");
const {buildProviderAccountCatalog} = require("./services/providerAccountCatalog");
const worldEmailAccountService = require("./services/worldEmailAccountService");
const obsidianVault = require("./services/obsidianVaultService");
const planetKnowledge = require("./services/planetKnowledgeService");
const {summarizeKnowledgeBlockers,knowledgeStatusForBlockers} = require("./services/knowledgeReadiness");
const {createSerialWorkQueue,createLatestGenerationSlot} = require("./services/planetKnowledgePipeline");
const localModelRuntime = require("./services/localModelRuntime");
const canonicalPathContainment = require("./services/canonicalPathContainment");
const {safePlanetVaultFolderName,migrateLegacyVault} = require("./services/obsidianVaultPaths");
const {getRuntimeUploadsDirectory} = require("./services/runtimePaths");
const {assertWorkspacePath} = require("./services/userPathSecurity");
const {listTreeDirectory, listTreeRoots, resolveDesktopRoot, resolveDesktopRoots, searchTreeRoots, treeRootsResponse} = require("./services/treeRocketService");
const conversationNotifications = require("./services/conversationNotificationService");
const {observeInboxThreads} = require("./services/conversationNotificationPolling");
const {getEmailAlertSettings, normalizeProviderBlock, saveEmailAlertSettings} = require("./services/emailAlertSettingsService");
const {startEmailAlertScheduler} = require("./services/emailAlertScheduler");
const knowledgeJobsByScope = new Map();
const knowledgeJobsById = new Map();
const knowledgeWatchersByScope = new Map();
const initializedKnowledgeScopes = new Set();
const knowledgePipelineQueue=createSerialWorkQueue();
const knowledgeFolderRefreshes=new Set();
const selectedFolderWatcher=require("./services/selectedFolderWatcher");
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
    downloadInlinePart,
    disconnect: disconnectGmail,
    exchangeAuthorizationCode,
    getAuthorizationUrl,
    getEmailIdentity: getGmailEmailIdentity,
    getMessageText: getGmailMessageText,
    getThread: getGmailThread,
    getThreadMetadata: getGmailThreadMetadata,
    getThreadPage: getGmailThreadPage,
    getStatus: getGmailStatus,
    listAttachments: listGmailAttachments,
    listConnectedAccounts: listGmailConnectedAccounts,
    listInboxMessages,
    listInboxThreads: listGmailInboxThreads
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
            message: req.folderRocketDiagnosticMessage
                ? safeDiagnosticText(`${req.folderRocketDiagnosticMessage}${req.folderRocketBackendErrorName ? ` (${req.folderRocketBackendErrorName})` : ""}`, 260)
                : (res.statusCode >= 500 ? `Errore backend${req.folderRocketBackendErrorName ? ` (${req.folderRocketBackendErrorName})` : ""}.` : "La richiesta è stata rifiutata o non completata."),
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
    if (req.body?.style !== undefined && !["planet", "rocky", "ringed", "glowing", "asteroid", "black-hole", "galaxy"].includes(req.body.style)) return res.status(400).json({message:"Planet style is invalid."});
    if (req.body?.color !== undefined && (typeof req.body.color !== "string" || !/^#[\da-fA-F]{6}$/.test(req.body.color))) return res.status(400).json({message:"Planet color must be a six-digit hexadecimal color."});
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
        const nextWorld = {
            ...currentWorld,
            ...(typeof req.body.aiEnabled === "boolean" ? {aiEnabled:req.body.aiEnabled} : {}),
            ...(typeof req.body.graphEnabled === "boolean" ? {graphEnabled:req.body.graphEnabled} : {}),
            ...(typeof req.body.treeRootMode === "string" ? {treeRootMode:req.body.treeRootMode} : {}),
            ...(typeof req.body.style === "string" ? {style:req.body.style} : {}),
            ...(typeof req.body.color === "string" ? {color:req.body.color.toLowerCase()} : {})
        };
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
    if(!found.world){req.folderRocketExpectedNotFound=true;return res.status(404).json({code:"WORLD_SETTINGS_NOT_FOUND",message:"Planet not found."});}
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
        const [gmailAccountsRaw,outlookAccountsRaw]=await Promise.all([listGmailConnectedAccounts(req.user.id),listOutlookConnectedAccounts(req.user.id)]);
        const selectedBlockId=selection?.blockId||"";
        const emailAccounts={
            gmail:buildProviderAccountCatalog(gmailAccountsRaw,found.settings,{provider:"gmail",worldId,selectedBlockId:selection?.provider==="gmail"?selectedBlockId:""}),
            outlook:buildProviderAccountCatalog(outlookAccountsRaw,found.settings,{provider:"outlook",worldId,selectedBlockId:selection?.provider==="outlook"?selectedBlockId:""})
        };
        const currentSettings=readDashboardPreferences(req.user.id)||{};
        const currentWorld=currentSettings.worlds?.[worldId]||found.world;
        const style=currentWorld.style;
        const world=selection?{...currentWorld,style,emailAccount:{...selection,email:selection.email||((selection.provider==="gmail"?gmailAccountsRaw:outlookAccountsRaw).find(item=>item.blockId===selection.blockId)?.email||"")}}:{...currentWorld,style,emailAccount:null};
        const storedConflict=!Object.hasOwn(currentWorld,"emailAccount")&&resolved.conflict;
        res.json({world,emailAccountConflict:storedConflict,emailAccountCandidates:resolved.candidates,emailAccounts,emailAccountMigrated:migrated});
    } catch(error) {res.status(500).json({message:error instanceof Error?error.message:"Unable to read planet settings."});}
});

function validWorldId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value); }
function respondGraphStorageUnavailable(res,error) {
    if(error?.code!=="GRAPH_STORAGE_UNAVAILABLE")return false;
    res.status(503).json({code:"GRAPH_STORAGE_UNAVAILABLE",retryable:true,message:"Planet graph storage is temporarily unavailable. Retry the operation shortly."});
    return true;
}
function readWorldRecord(userId,worldId) {
    const settings=readDashboardPreferences(userId)||{};
    const worlds=settings.worlds&&typeof settings.worlds==="object"&&!Array.isArray(settings.worlds)?settings.worlds:{};
    const world=worlds[worldId]||((worldId==="work"||worldId==="personal")?{}:null);
    return {settings,world,worlds};
}
function readWorldDashboard(settings,worldId) {
    return settings.worlds?.[worldId]?.dashboard || (worldId==="work"?legacyWorkspaceDashboard(settings):{});
}
function graphFolderRootsForWorld(settings,worldId,sourceSelection) {
    const configured=readWorldDashboard(settings,worldId);
    const roots=Array.isArray(configured?.folders)?configured.folders.filter(folder=>folder&&folder.storage!=="imaginary"&&typeof folder.id==="string"&&typeof folder.path==="string"&&folder.path.trim()):[];
    if(sourceSelection?.folderMode!=="selected")return roots;
    const selected=new Set(Array.isArray(sourceSelection.folderIds)?sourceSelection.folderIds:[]);
    return roots.filter(folder=>selected.has(folder.id));
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
function retainLastGoodGraphSources(existingGraph,nodes,edges,sourceStatuses,roots=[]) {
    const byId=new Map(nodes.map(item=>[item.id,item]));
    const retainedSourceIds=new Set();
    const rootsBySource=new Map(roots.filter(item=>item&&typeof item.id==="string").map(item=>[`folder:${item.id}`,item]));
    for(const status of sourceStatuses.filter(item=>item.status==="partial"||item.status==="failed")) {
        const root=status.type==="folder"?rootsBySource.get(status.sourceId):null;
        const sourcePath=root?.path||"";
        const ids=planetGraph.sourceOwnedNodeIds(existingGraph,status,sourcePath);
        for(const item of existingGraph.nodes)if(ids.has(item.id)) {
            retainedSourceIds.add(item.id);
            if(!byId.has(item.id))byId.set(item.id,item);
        }
    }
    const nextNodes=[...byId.values()];
    const nextIds=new Set(nextNodes.map(item=>item.id));
    const nextEdges=new Map(edges.filter(item=>item&&nextIds.has(item.from)&&nextIds.has(item.to)).map(item=>[item.id,item]));
    for(const item of existingGraph.edges) {
        if(!item||!nextIds.has(item.from)||!nextIds.has(item.to))continue;
        if(retainedSourceIds.has(item.from)||retainedSourceIds.has(item.to))nextEdges.set(item.id,item);
    }
    return {nodes:nextNodes,edges:[...nextEdges.values()]};
}
async function collectPlanetGmailSource({userId,source,sourceSelection,accountCatalog,existingGraph}) {
    const account=accountCatalog.find(item=>item.blockId===source.blockId);
    if(!account)return {nodes:[],edges:[],warnings:[],status:planetGraph.sourceStatus({sourceId:`gmail:${source.blockId}`,type:"gmail",label:"Gmail",status:"failed",reasonCode:"provider_unavailable",message:"The Gmail account selected for this planet is not connected.",retryable:true})};
    const nodes=[],edges=[],warnings=[];
    let reasonCode="",message="",status="complete",processed=0,total=0;
    try {
        const listing=await listGmailInboxThreads({maxResults:100},userId,source.blockId);
        const scopedThreads=listing.threads.map(item=>({...item,accountEmail:account.email||""}));
        const selectedIds=sourceSelection.threadMode==="selected"?new Set(sourceSelection.threadIds):null;
        let sourceThreads=existingGraph.conversationSelectionConfigured===true?scopedThreads.filter(item=>matchesSavedConversationScope(item,source.blockId,existingGraph.selectedConversations)):scopedThreads;
        if(selectedIds)sourceThreads=sourceThreads.filter(item=>selectedIds.has(item.id));
        const loadedIds=new Set(sourceThreads.map(item=>item.id));
        if(listing.nextPageToken){status="partial";reasonCode="provider_page_limit";message="Gmail indexing reached the current 100-message page limit. Narrow the selected conversations or refresh after changing the source selection.";warnings.push(message);}
        planetGraph.addEmailThreads(nodes,edges,source.blockId,account.email||"",sourceThreads);
        processed=sourceThreads.length;total=listing.threads.length;
        const explicitlyWantedIds=selectedIds
            ?sourceSelection.threadIds.filter(id=>existingGraph.conversationSelectionConfigured!==true||existingGraph.selectedConversations.some(saved=>saved.blockId===source.blockId&&saved.threadId===id))
            :existingGraph.conversationSelectionConfigured===true?existingGraph.selectedConversations.filter(saved=>saved.blockId===source.blockId).map(saved=>saved.threadId):[];
        for(const threadId of explicitlyWantedIds) {
            if(loadedIds.has(threadId))continue;
            try {
                const metadataThread=await getGmailThreadMetadata(threadId,userId,source.blockId);
                planetGraph.addEmailThreads(nodes,edges,source.blockId,account.email||"",[metadataThread]);
                loadedIds.add(threadId);processed+=1;
            } catch {
                status="partial";reasonCode="selected_item_missing";message="One or more saved conversations could not be loaded from Gmail.";warnings.push(message);
            }
        }
        if(selectedIds) {
            const missing=explicitlyWantedIds.filter(id=>!loadedIds.has(id));
            if(missing.length&&reasonCode!="selected_item_missing"){status="partial";reasonCode="selected_item_missing";message=`${missing.length} selected conversation(s) could not be loaded from the current Gmail account.`;warnings.push(message);}
        }
    } catch {
        return {nodes:[],edges:[],warnings:["The selected Gmail source could not be reached."],status:planetGraph.sourceStatus({sourceId:`gmail:${source.blockId}`,type:"gmail",label:"Gmail",status:"failed",reasonCode:"provider_unavailable",message:"The selected Gmail source could not be reached. Check its connection and retry.",retryable:true,processed:0,total:0})};
    }
    return {nodes,edges,warnings,status:planetGraph.sourceStatus({sourceId:`gmail:${source.blockId}`,type:"gmail",label:account.email||"Gmail",status,reasonCode,message,processed,total,retryable:status!=="complete"})};
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

function defaultObsidianVaultPath(user,worldId,worldName=worldId) {
    return path.join(userWorkspace(user),".folderrocket","obsidian",safePlanetVaultFolderName(worldName,worldId));
}

function verifiedVaultMarker(vaultPath,user,worldId) {
    try {
        const marker=JSON.parse(fs.readFileSync(path.join(vaultPath,".folderrocket","vault.json"),"utf8"));
        return marker?.ownerId===String(user.id)&&marker?.worldId===worldId;
    } catch { return false; }
}

function preferredObsidianVaultPath(user,worldId,worldName) {
    const target=defaultObsidianVaultPath(user,worldId,worldName);
    if(verifiedVaultMarker(target,user,worldId))return target;
    const legacy=defaultObsidianVaultPath(user,worldId,worldId);
    return verifiedVaultMarker(legacy,user,worldId)?legacy:target;
}

function assertObsidianVaultPath(user,candidate,{allowMissing=true}={}) {
    return assertWorkspacePath(userWorkspace(user),candidate,{allowMissing});
}

function readWorldObsidian(user,worldId) {
    const found=readWorldRecord(user.id,worldId);
    if(!found.world)return null;
    const stored=found.world.obsidian&&typeof found.world.obsidian==="object"?found.world.obsidian:{};
    const canonical=preferredObsidianVaultPath(user,worldId,found.world.name||worldId);
    let vaultPath=canonical;
    if(typeof stored.vaultPath==="string"&&stored.vaultPath) {
        try {vaultPath=assertObsidianVaultPath(user,stored.vaultPath,{allowMissing:true});}
        catch {vaultPath=canonical;}
    }
    return {...found,config:{enabled:stored.enabled===true,autoSync:stored.autoSync===true,vaultPath,sourceSelection:obsidianVault.normalizeSourceSelection(stored.sourceSelection),lastSyncAt:typeof stored.lastSyncAt==="string"?stored.lastSyncAt:"",status:typeof stored.status==="string"?stored.status:"idle",lastResult:stored.lastResult&&typeof stored.lastResult==="object"?stored.lastResult:null}};
}

app.get("/worlds/:worldId/obsidian",requireAuthenticated,(req,res)=>{
    const worldId=String(req.params.worldId||"");const state=readWorldObsidian(req.user,worldId);
    if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    if(!state)return res.status(404).json({message:"Planet not found."});
    res.json({config:state.config,openSupported:process.env.FOLDERROCKET_DESKTOP==="1",uri:`obsidian://open?path=${encodeURIComponent(state.config.vaultPath)}`});
});

app.get("/worlds/:worldId/obsidian/folders",requireAuthenticated,(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const dashboard=readWorldDashboard(found.settings,worldId);
    const folders=(Array.isArray(dashboard?.folders)?dashboard.folders:[]).filter(item=>item&&item.storage!=="imaginary"&&typeof item.id==="string"&&typeof item.name==="string"&&typeof item.path==="string"&&item.path.trim()).map(item=>({id:item.id.slice(0,120),name:item.name.slice(0,180),path:item.path.slice(0,1024)}));
    res.json({folders,fileTypes:obsidianVault.GRAPH_FILE_TYPES,worldId});
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
    if(req.body?.autoSync!==undefined&&typeof req.body.autoSync!=="boolean")return res.status(400).json({message:"Automatic Obsidian sync setting is invalid."});
    try {
        const current=found.world.obsidian&&typeof found.world.obsidian==="object"?found.world.obsidian:{};
        const canonical=defaultObsidianVaultPath(req.user,worldId,found.world.name||worldId);
        const requested=typeof req.body?.vaultPath==="string"&&req.body.vaultPath.trim()?req.body.vaultPath:current.vaultPath||preferredObsidianVaultPath(req.user,worldId,found.world.name||worldId);
        const vaultPath=assertObsidianVaultPath(req.user,requested,{allowMissing:true});
        const existingVault=awaitlessStat(vaultPath);
        if(existingVault&& !existingVault.isDirectory())throw new Error("The selected Obsidian vault path is not a folder.");
        if(Object.hasOwn(req.body||{},"sourceSelection")) {
            const value=req.body.sourceSelection;
            const invalid=Object.entries(value||{}).some(([key,item])=>key==="version"?(item!==1&&item!==obsidianVault.SOURCE_SELECTION_VERSION):obsidianVault.SOURCE_KEYS.includes(key)?typeof item!=="boolean":key==="threadMode"?["all","selected"].includes(item)===false:key==="threadIds"?(!Array.isArray(item)||item.length>500||item.some(id=>typeof id!=="string"||!id||id.length>300)):key==="folderMode"?["all","selected"].includes(item)===false:key==="folderIds"?(!Array.isArray(item)||item.length>200||item.some(id=>typeof id!=="string"||!/^[a-zA-Z0-9_-]{1,120}$/.test(id))):key==="fileTypeMode"?["all","selected"].includes(item)===false:key==="fileTypes"?(!Array.isArray(item)||item.length>obsidianVault.GRAPH_FILE_TYPES.length||item.some(type=>typeof type!=="string"||!obsidianVault.GRAPH_FILE_TYPES.includes(type.toLowerCase()))):key==="excludedFileIds"?(!Array.isArray(item)||item.length>500||item.some(id=>typeof id!=="string"||!/^file:[a-f0-9]{32}$/.test(id))):key==="includeSubfolders"?typeof item!=="boolean":true);
            if(!value||typeof value!=="object"||Array.isArray(value)||invalid)throw new Error("Obsidian source selection must contain valid category flags and supported folder, file type, and conversation selections.");
        }
        const sourceSelection=Object.hasOwn(req.body||{},"sourceSelection")?obsidianVault.normalizeSourceSelection(req.body.sourceSelection,current.sourceSelection):obsidianVault.normalizeSourceSelection(current.sourceSelection);
        const next={...current,enabled:typeof req.body?.enabled==="boolean"?req.body.enabled:current.enabled===true,autoSync:typeof req.body?.autoSync==="boolean"?req.body.autoSync:current.autoSync===true,vaultPath,sourceSelection,status:current.status||"idle"};
        writeDashboardPreferences(req.user.id,{...found.settings,worlds:{...found.worlds,[worldId]:{...found.world,obsidian:next}}});
        res.json({config:next,openSupported:process.env.FOLDERROCKET_DESKTOP==="1",uri:`obsidian://open?path=${encodeURIComponent(vaultPath)}`});
    } catch(error) {res.status(400).json({message:error instanceof Error?error.message:"Unable to save Obsidian settings."});}
});

function awaitlessStat(filePath) {try{return fs.statSync(filePath);}catch(error){if(error?.code==="ENOENT")return null;throw error;}}
function knowledgeNoteRecords(notes,worldId,fingerprint){
    return (Array.isArray(notes)?notes:[]).slice(0,planetKnowledge.MAX_NOTES).filter(note=>note&&typeof note.id==="string"&&typeof note.title==="string"&&typeof (note.markdown||note.content)==="string").map(note=>{
        const rawName=typeof note.fileName==="string"?String(note.fileName).split(/[\\/]/).pop():`${obsidianVault.safeSlug(note.title)}-${planetKnowledge.documentFingerprint(note.id).slice(0,12)}.md`;
        const fileName=(rawName.toLowerCase().endsWith(".md")?rawName:`${rawName}.md`).replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").slice(0,160);
        const source=note.source&&typeof note.source==="object"?note.source:{};const sourceId=String(source.id||source.sourceId||note.sourceId||note.id).slice(0,300);
        const sourceScopeId=String(note.sourceScopeId||source.sourceScopeId||source.scopeId||`knowledge:${fingerprint}`).slice(0,300);
        const markdown=String(note.markdown||note.content).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u,"").trim();
        const kind=String(note.kind||source.kind||"knowledge-note").slice(0,80);
        const folder=kind==="knowledge-area"?"Areas":"";
        return {id:`knowledge:${note.id.slice(0,260)}`,kind,sourceId,sourceScopeId,title:note.title.slice(0,300),updatedAt:String(note.updatedAt||new Date().toISOString()).slice(0,80),content:markdown.slice(0,12_000),notePath:`FolderRocket/Knowledge/${folder?`${folder}/`:""}${fileName}`};
    });
}

const KNOWLEDGE_READABLE_EXTENSIONS=new Set([".pdf",".docx",".txt",".xlsx",".md"]);
const KNOWLEDGE_MAX_FILES=250, KNOWLEDGE_MAX_ACTIVITY=30, KNOWLEDGE_MAX_FILE_BYTES=2*1024*1024, KNOWLEDGE_MAX_TOTAL_BYTES=25*1024*1024, KNOWLEDGE_BATCH_SIZE=8;
function knowledgeMetadataExclusion(title,size){
    const name=String(title||"").trim();
    const stem=name.replace(/\.[^.]+$/u,"");
    if(size===0)return "Empty file; skipped before local text extraction.";
    if(/^(?:~\$|\.~lock\.|thumbs\.db$|desktop\.ini$|\.ds_store$)/i.test(name))return "Temporary or operating-system file; skipped before local text extraction.";
    if(/^(?:untitled|new document|document\s*\d*|backup(?:\s*\d*)?)$/i.test(stem))return "Generic temporary file name; skipped before local text extraction.";
    return "";
}
function knowledgeScopeKey(userId,worldId){return `${String(userId)}\0${worldId}`;}
function publicKnowledgeJob(job){return job?{jobId:job.id,status:job.status,stage:job.stage,processed:job.processed,total:job.total,exclusions:job.exclusions,startedAt:job.startedAt,updatedAt:job.updatedAt,error:job.error||"",supportsPause:true,supportsCancel:true}:null;}
function knowledgeNodeSourceId(item){return String(item?.source?.id||item?.sourceId||item?.source?.sourceId||"");}
function knowledgeNoteSourceIds(item){const source=item?.source&&typeof item.source==="object"?item.source:{};return [...new Set([source.id,source.sourceId,item?.sourceId,...(Array.isArray(source.sourceIds)?source.sourceIds:[])].filter(value=>typeof value==="string"&&value))];}
function expectedKnowledgeGraphSourceIds(scope){
    const ids=[];
    if(scope.selection.folders)for(const root of scope.roots)ids.push(`folder:${root.id}`);
    if(scope.selection.snapshots)ids.push("snapshot");
    if(scope.selection.email&&scope.emailSelection?.provider==="gmail")ids.push(`gmail:${scope.emailSelection.blockId}`);
    return [...new Set(ids)].sort();
}
function selectedKnowledgeGraph(graph,scope){
    const selected=obsidianVault.filterGraphBySources(graph,scope.selection,{emailBlockIds:scope.emailSelection?.provider==="gmail"?[scope.emailSelection.blockId]:[],folderRoots:scope.roots});
    const expected=new Set(expectedKnowledgeGraphSourceIds(scope));
    const statuses=(Array.isArray(graph.sourceStatuses)?graph.sourceStatuses:[]).filter(item=>expected.has(String(item.sourceId||"")));
    selected.sourceStatuses=statuses;
    selected.status=statuses.some(item=>item.status==="indexing")?"indexing":statuses.some(item=>item.status!=="complete")?"partial":"ready";
    selected.progress={...(graph.progress||{}),limitReached:statuses.some(item=>item.progress?.limitReached===true)};
    return selected;
}
function selectedKnowledgeBlockers(graph,scope){
    const statuses=new Map((Array.isArray(graph.sourceStatuses)?graph.sourceStatuses:[]).map(item=>[String(item.sourceId||""),item]));
    const blockers=[];
    for(const sourceId of expectedKnowledgeGraphSourceIds(scope)){
        const source=statuses.get(sourceId);
        if(source?.status==="complete")continue;
        const isEmail=sourceId.startsWith("gmail:");
        const fallbackLabel=isEmail?"Selected Gmail source":sourceId==="snapshot"?"Selected snapshots":"Selected folder source";
        const candidateLabel=String(source?.label||fallbackLabel).replace(/[\r\n\0]/g," ").slice(0,100);
        const rawLabel=/[\\/]|\b[A-Za-z]:/u.test(candidateLabel)?fallbackLabel:candidateLabel;
        blockers.push({sourceId:sourceId.slice(0,180),label:rawLabel,status:String(source?.status||"unknown").slice(0,24),reasonCode:"source_index_incomplete",action:isEmail?"Check the selected Gmail source status, then retry Sync now.":"Check that this selected source is available and readable, then retry Sync now.",retryable:source?.retryable===true});
    }
    if(scope.selection.email&&scope.selection.threadMode!=="selected")blockers.push({sourceId:"email-selection",label:"Email conversation selection",status:"incomplete",reasonCode:"content_unavailable",action:"Select specific Gmail conversations or turn off the email source, then retry Sync now.",retryable:false});
    else if(scope.selection.email&&scope.emailSelection?.provider&&scope.emailSelection.provider!=="gmail")blockers.push({sourceId:"email-selection",label:"Selected email source",status:"unavailable",reasonCode:"content_unavailable",action:"Choose a connected Gmail source or turn off the email source, then retry Sync now.",retryable:false});
    return blockers.slice(0,20);
}
function knowledgeContentBlockers(exclusions,scope,graph){
    const statuses=new Map((Array.isArray(graph?.sourceStatuses)?graph.sourceStatuses:[]).map(item=>[String(item.sourceId||""),item]));
    const nodes=new Map((Array.isArray(graph?.nodes)?graph.nodes:[]).map(item=>[String(item.id||""),item]));
    const blockers=[],seen=new Set();
    for(const exclusion of (Array.isArray(exclusions)?exclusions:[]).slice(0,500)){
        const reason=String(exclusion?.reason||"");
        if(!reason||/excluded by the user|exact duplicate|duplicate content|temporary or operating-system|generic temporary|too little retained context|text extraction is unavailable for|unsupported/i.test(reason))continue;
        let reasonCode="";
        if(/selected-source limit|at most \d+ explicitly selected|conversation limit/i.test(reason))reasonCode="selected_source_limit";
        else if(/limit|exceeds the .*byte|maximum.*reached|node limit|edge limit|note limit/i.test(reason))reasonCode="knowledge_limit";
        else if(/missing|outside the authorized|outside the selected|no readable|could not be read|could not be extracted|unavailable|permission|no current local knowledge note/i.test(reason))reasonCode="content_unavailable";
        if(!reasonCode)continue;
        const excludedId=String(exclusion.sourceId||"");
        const node=nodes.get(excludedId);
        const graphSourceId=String(node?.sourceRef?.graphSourceId||"");
        const emailSource=excludedId.startsWith("gmail:")||excludedId==="email"||excludedId==="email-selection";
        const sourceId=graphSourceId||(
            emailSource&&scope.emailSelection?.provider==="gmail"?`gmail:${scope.emailSelection.blockId}`:
            excludedId.startsWith("snapshot")||excludedId.startsWith("folderrocket:activity")?"snapshot":
            excludedId===""?"selected-content":
            "selected-content"
        );
        const key=`${sourceId}:${reasonCode}`;if(seen.has(key))continue;seen.add(key);
        const source=statuses.get(sourceId);
        const fallback=emailSource?"Selected Gmail conversations":sourceId==="snapshot"?"Selected snapshots":"Selected source content";
        const sourceLabel=String(source?.label||fallback).replace(/[\r\n\0]/g," ").slice(0,100);
        const label=/[\\/]|\b[A-Za-z]:/u.test(sourceLabel)?fallback:sourceLabel;
        const action=reasonCode==="knowledge_limit"||reasonCode==="selected_source_limit"
            ?"Reduce the selected source items or scope, then retry Sync now."
            :emailSource?"Check the selected Gmail conversation and retry Sync now.":"Restore access to this selected source, then retry Sync now.";
        blockers.push({sourceId:sourceId.slice(0,180),label,status:String(source?.status==="complete"?"partial":source?.status||"partial").slice(0,24),reasonCode,action,retryable:reasonCode==="content_unavailable"});
        if(blockers.length>=20)break;
    }
    return blockers;
}
function safeKnowledgeBlockerSummary(blockers,extra={}){
    const counts={};for(const blocker of blockers)if(["source_index_incomplete","selected_source_limit","content_unavailable","knowledge_limit"].includes(blocker.reasonCode))counts[blocker.reasonCode]=(counts[blocker.reasonCode]||0)+1;
    if(extra.selectedSourceLimit)counts.selected_source_limit=1;
    if(extra.contentIncomplete)counts.content_unavailable=1;
    if(extra.knowledgeLimit)counts.knowledge_limit=1;
    const reasonCodes=["source_index_incomplete","selected_source_limit","content_unavailable","knowledge_limit"].filter(code=>counts[code]);
    const summary=reasonCodes.length?"Review the selected source status and resolve the listed limits or unavailable content before syncing again.":"Selected sources are ready for local knowledge sync.";
    return {reasonCodes,counts,blockers:blockers.slice(0,20),summary};
}
function knowledgeReadinessFingerprint(scope,graph,reasonSummary){
    const selected=selectedKnowledgeGraph(graph,scope);
    return planetKnowledge.fingerprint({selection:scope.selection,roots:scope.roots.map(item=>({id:item.id,path:path.resolve(item.path)})).sort((a,b)=>a.id.localeCompare(b.id)),email:scope.selection.email?{provider:scope.emailSelection?.provider||"",blockId:scope.emailSelection?.blockId||"",threadMode:scope.selection.threadMode,threadIds:[...scope.selection.threadIds].sort()}:null,evidenceRevision:planetGraph.contentRevision(selected),reasonCodes:reasonSummary.reasonCodes,blockers:reasonSummary.blockers.map(({sourceId,status,reasonCode,action,retryable})=>({sourceId,status,reasonCode,action,retryable}))});
}
async function knowledgeScope(req,worldId){
    const found=readWorldRecord(req.user.id,worldId);if(!found.world)return null;
    const selection=obsidianVault.normalizeSourceSelection(found.world.obsidian?.sourceSelection);
    const roots=selection.folders?graphFolderRootsForWorld(found.settings,worldId,selection):[];
    const emailSelection=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
    const vaultPath=readWorldObsidian(req.user,worldId)?.config?.vaultPath||"";
    const canonicalVaultPath=canonicalPathContainment.canonicalPath(vaultPath);
    const managedMarkdownPath=planetKnowledge.managedMarkdownRoot(req.user.id,worldId);
    const managedMarkdownCanonicalPath=canonicalPathContainment.canonicalPath(managedMarkdownPath);
    const graph=await planetGraph.readGraph(req.user.id,worldId);
    const selectedGraph=selectedKnowledgeGraph(graph,{selection,roots,emailSelection});
    const graphRevision=planetGraph.contentRevision(selectedGraph);
    const fingerprint=planetKnowledge.fingerprint({selection,roots:roots.map(item=>({id:item.id,path:path.resolve(item.path)})).sort((a,b)=>a.id.localeCompare(b.id)),excludedVaultPath:canonicalVaultPath,managedMarkdownPath:managedMarkdownCanonicalPath,graphRevision,email:selection.email?{provider:emailSelection?.provider||"",blockId:emailSelection?.blockId||"",threadMode:selection.threadMode,threadIds:[...selection.threadIds].sort()}:null});
    return {...found,selection,roots,emailSelection,vaultPath,canonicalVaultPath,managedMarkdownPath,graphRevision,fingerprint};
}
function knowledgeReadiness({enabled,graphStatus,knowledge,fingerprint,graphRevision,job}){
    const result=planetKnowledge.readiness({enabled,graphStatus,knowledge,fingerprint,graphRevision});
    if(job&&!["completed","cancelled","failed"].includes(job.status)&&!['disabled','indexing','stale'].includes(result.readiness))return {...result,readiness:"preparing",knowledgeStatus:"preparing"};
    return result;
}
function knowledgeCandidates(graph,selection,vaultPaths=[]){
    const excluded=new Set(selection.excludedFileIds||[]);
    const roots=Array.isArray(vaultPaths)?vaultPaths:[vaultPaths];
    return (Array.isArray(graph?.nodes)?graph.nodes:[]).filter(item=>item?.type==="file"&&typeof item.sourceRef?.path==="string"&&!roots.some(root=>isKnowledgeFileInsideVault(root,item.sourceRef.path))).map(item=>({id:item.id,title:String(item.label||path.basename(item.sourceRef.path)).slice(0,240),sourceScopeId:`filesystem:${item.sourceRef.graphSourceId||""}`,extension:String(item.details?.extension||path.extname(item.sourceRef.path)).toLowerCase(),selected:!excluded.has(item.id)})).sort((a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:"base"}));
}
function isKnowledgeFileInsideVault(vaultPath,candidatePath){
    if(typeof vaultPath!=="string"||!vaultPath||typeof candidatePath!=="string"||!candidatePath)return false;
    const vaultLexical=path.resolve(vaultPath),candidateLexical=path.resolve(candidatePath);
    const vaultCanonical=canonicalPathContainment.canonicalPath(vaultPath),candidateCanonical=canonicalPathContainment.canonicalPath(candidatePath);
    return [[vaultLexical,candidateLexical],[vaultCanonical,candidateCanonical],[vaultCanonical,candidateLexical],[vaultLexical,candidateCanonical]].some(([root,candidate])=>canonicalPathContainment.isWithinCanonicalRoot(root,candidate));
}
function setKnowledgeJob(job,values={}){Object.assign(job,values,{updatedAt:new Date().toISOString()});}
function scheduleKnowledgeGeneration(job,user,worldId,scope){
    return knowledgePipelineQueue.run(()=>{
        const pending=job.pendingGeneration.take();
        const desiredScope=pending?.scope||scope,desiredUser=pending?.user||user;
        job.activeScopeFingerprint=desiredScope.fingerprint;
        return runKnowledgeSync(job,{user:desiredUser,worldId,scope:desiredScope});
    });
}
function scheduleBackendHeavy(work){return knowledgePipelineQueue.run(work);}
function scheduleSelectedFolderRefresh(user,worldId,scope){
    const key=knowledgeScopeKey(user.id,worldId);if(knowledgeFolderRefreshes.has(key))return;
    knowledgeFolderRefreshes.add(key);
    knowledgePipelineQueue.run(async()=>{
        try{await refreshSelectedFolderSources(user,worldId,scope);const latest=await knowledgeScope({user},worldId);if(latest){await maintainKnowledgeWatcher(user,worldId,latest);queueKnowledgeSyncJob(user,worldId,latest);}}
        catch{}
        finally{knowledgeFolderRefreshes.delete(key);}
    });
}
async function refreshSelectedFolderSources(user,worldId,scope){
    const latest=await knowledgeScope({user},worldId);if(!latest||!latest.selection.folders||!latest.roots.length)return;
    const rootsFingerprint=value=>JSON.stringify(value.roots.map(item=>({id:item.id,path:path.resolve(item.path)})).sort((a,b)=>a.id.localeCompare(b.id)));
    if(rootsFingerprint(latest)!==rootsFingerprint(scope))return;
    const configuredVaultPath=latest.vaultPath||"";
    const excludedPaths=[canonicalPathContainment.canonicalPath(configuredVaultPath),canonicalPathContainment.canonicalPath(latest.managedMarkdownPath)].filter(Boolean);
    const graph=await planetGraph.readGraph(user.id,worldId);
    const indexingStatuses=graph.sourceStatuses.filter(item=>!item.sourceId.startsWith("folder:")).concat(latest.roots.map(item=>planetGraph.sourceStatus({sourceId:`folder:${item.id}`,type:"folder",label:item.name||"Folder",status:"indexing",message:"Folder changes are being indexed.",retryable:true})));
    await planetGraph.updateGraphStatus(user.id,worldId,"indexing",{stage:"folders",processed:0,total:latest.roots.length,limitReached:false},undefined,{sourceStatuses:indexingStatuses});
    let walked;
    try{walked=await planetGraph.walkConfiguredFolders(latest.roots,{maxDirectories:400,maxFiles:3000,maxDepth:8,maxNodes:Math.max(0,planetGraph.MAX_NODES-1),excludePaths:excludedPaths,includeSubfolders:latest.selection.includeSubfolders,fileTypes:latest.selection.fileTypeMode==="selected"?latest.selection.fileTypes:null,validateRoot:async candidate=>{const safe=assertUserPath(user,candidate);const real=await fs.promises.realpath(safe);if(!(await fs.promises.stat(real)).isDirectory())throw Object.assign(new Error("Configured path is not a folder."),{code:"ENOTDIR"});return real;}});}
    catch{
        let current=await planetGraph.readGraph(user.id,worldId);
        for(const root of latest.roots){const status=planetGraph.sourceStatus({sourceId:`folder:${root.id}`,type:"folder",label:root.name||"Folder",status:"failed",reasonCode:"source_read_failed",message:"FolderRocket could not refresh this folder source.",retryable:true});current=await planetGraph.replaceIndexedSourceGraph(user.id,worldId,status,[],[],{sourcePath:root.path,sourceStatuses:current.sourceStatuses});}
        return current;
    }
    const worldNode=planetGraph.node("world","folderrocket",worldId,String(latest.world.name||worldId),{kind:"world",worldId});
    let current=await planetGraph.readGraph(user.id,worldId);
    for(const status of walked.sourceStatuses){
        const root=latest.roots.find(item=>`folder:${item.id}`===status.sourceId);
        const canonicalRoot=root?canonicalPathContainment.canonicalPath(root.path):"";
        const nodes=walked.nodes.filter(item=>item.sourceRef?.graphSourceId===status.sourceId||canonicalRoot&&canonicalPathContainment.isWithinCanonicalRoot(canonicalRoot,item.sourceRef?.path||""));
        const ids=new Set([worldNode.id,...nodes.map(item=>item.id)]);
        const edges=walked.edges.filter(item=>ids.has(item.from)&&ids.has(item.to));
        current=await planetGraph.replaceIndexedSourceGraph(user.id,worldId,status,[worldNode,...nodes],edges,{sourcePath:root?.path||"",sourceStatuses:current.sourceStatuses});
    }
    return current;
}
async function maintainKnowledgeWatcher(user,worldId,scope){
    const key=knowledgeScopeKey(user.id,worldId),current=knowledgeWatchersByScope.get(key);
    if(!scope.selection.folders||!scope.roots.length){current?.watcher.dispose();knowledgeWatchersByScope.delete(key);return;}
    const watchRoots=[];
    for(const root of scope.roots){try{const safe=assertUserPath(user,root.path),real=await fs.promises.realpath(safe);if((await fs.promises.stat(real)).isDirectory())watchRoots.push({...root,path:real});}catch{}}
    if(!watchRoots.length){current?.watcher.dispose();knowledgeWatchersByScope.delete(key);return;}
    const rootsSignature=JSON.stringify(watchRoots.map(item=>({id:item.id,path:item.path})).sort((a,b)=>a.id.localeCompare(b.id)));
    if(current?.fingerprint===scope.fingerprint&&current.rootsSignature===rootsSignature)return;
    current?.watcher.dispose();
    const watcher=selectedFolderWatcher.createSelectedFolderWatcher({roots:watchRoots,onChange:async()=>{
        scheduleSelectedFolderRefresh(user,worldId,scope);
    }});
    knowledgeWatchersByScope.set(key,{fingerprint:scope.fingerprint,rootsSignature,watcher});
}
function disposeKnowledgeWatchersForUser(userId){
    const prefix=`${String(userId)}\0`;
    for(const [key,entry] of knowledgeWatchersByScope){if(key.startsWith(prefix)){entry.watcher.dispose();knowledgeWatchersByScope.delete(key);}}
    for(const key of initializedKnowledgeScopes)if(key.startsWith(prefix))initializedKnowledgeScopes.delete(key);
}
async function waitKnowledgeBatch(job){
    while(job.status==="paused"&&!job.controller.signal.aborted)await new Promise(resolve=>setTimeout(resolve,120));
    if(job.controller.signal.aborted)throw Object.assign(new Error("Knowledge sync cancelled."),{name:"AbortError"});
}
function boundedKnowledgeArray(value,limit){return Array.isArray(value)?value.slice(0,limit):[];}
function analyzeKnowledgeInWorker(documents,limits,signal){
    if(!documents.length)return Promise.resolve({nodes:[],edges:[],notes:[],exclusions:[]});
    const modulePath=path.join(__dirname,"services","localKnowledgeEngine.js");
    const source="const {parentPort,workerData}=require('node:worker_threads');try{const engine=require(workerData.modulePath);const result=engine.analyzeKnowledgeDocuments({documents:workerData.documents,limits:workerData.limits});parentPort.postMessage({ok:true,result});}catch(error){parentPort.postMessage({ok:false,error:String(error&&error.message||error)});}";
    return new Promise((resolve,reject)=>{
        const worker=new Worker(source,{eval:true,workerData:{modulePath,documents,limits}});let settled=false;
        const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener("abort",abort);void worker.terminate();if(error)reject(error);else resolve(value);};
        const abort=()=>finish(Object.assign(new Error("Knowledge sync cancelled."),{name:"AbortError"}));
        signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)return abort();
        worker.once("message",message=>message?.ok?finish(null,message.result):finish(new Error(message?.error||"Local knowledge analysis failed.")));
        worker.once("error",error=>finish(error));worker.once("exit",code=>{if(!settled&&code!==0)finish(new Error("Local knowledge worker stopped unexpectedly."));});
    });
}

async function runKnowledgeSync(job,context){
    const {user,worldId,scope}=context;job.scopeFingerprint=scope.fingerprint;const previous=await planetKnowledge.readKnowledge(user.id,worldId);
    const start={...previous};
    try{
        const runtimeStatus=await localModelRuntime.inspect();
        const effectiveSummaryMode=runtimeStatus.available?"model-assisted":"extractive";
        const effectiveModelName=runtimeStatus.available?runtimeStatus.modelName:"";
        const maxGeneratedSummaries=runtimeStatus.available?8:0;let generatedSummaryCount=0;
        const graph=await planetGraph.readGraph(user.id,worldId);
        const expectedSourceIds=new Set(expectedKnowledgeGraphSourceIds(scope));
        const selectedGraph=selectedKnowledgeGraph(graph,scope);
        const selectedBlockers=selectedKnowledgeBlockers(graph,scope);
        const graphStatuses=new Map((Array.isArray(graph.sourceStatuses)?graph.sourceStatuses:[]).map(item=>[item.sourceId,item.status]));
        const incompleteGraph=selectedBlockers.length>0||selectedGraph.progress?.limitReached===true;
        const retainPrevious=(reasonList)=>{
            const reasons=reasonList.slice(0,500);
            return planetKnowledge.writeKnowledge({...previous,status:"partial",progress:{...previous.progress,stage:"incomplete",limitReached:true},exclusions:reasons,updatedAt:new Date().toISOString()});
        };
        if(incompleteGraph){
            const reasons=[{sourceId:"graph:index",reason:"The current Planet Graph source index is incomplete; the last complete knowledge graph was retained."}];
            const reasonSummary=safeKnowledgeBlockerSummary(selectedBlockers.length?selectedBlockers:[{sourceId:"aggregate:graph",label:"Selected source index",status:"partial",reasonCode:"source_index_incomplete",action:"Refresh the selected sources, then retry Sync now.",retryable:true}]);
            await retainPrevious(reasons);setKnowledgeJob(job,{status:"completed",stage:"incomplete",processed:0,total:0,exclusions:reasons,reasonSummary});return;
        }
        const incompleteSources=graph.sourceStatuses.filter(item=>expectedSourceIds.has(item.sourceId)&&!['complete'].includes(item.status));
        const completeSourceIds=new Set(graph.sourceStatuses.filter(item=>item.status==="complete").map(item=>item.sourceId));
        const scopedGraph=selectedGraph;
        scopedGraph.nodes=scopedGraph.nodes.filter(item=>{
            if(item.type==="file"||item.type==="folder")return !item.sourceRef?.graphSourceId||completeSourceIds.has(item.sourceRef.graphSourceId);
            if(["activity","search","calendar-event","note","reminder"].includes(item.type))return completeSourceIds.has("snapshot");
            if(["email-thread","email-message"].includes(item.type))return completeSourceIds.has(`gmail:${item.sourceRef?.blockId||""}`);
            return true;
        });
        const evidenceNodeIds=new Set(scopedGraph.nodes.map(item=>item.id));scopedGraph.edges=scopedGraph.edges.filter(item=>evidenceNodeIds.has(item.from)&&evidenceNodeIds.has(item.to));
        const allCandidates=knowledgeCandidates(scopedGraph,scope.selection,[scope.vaultPath,scope.managedMarkdownPath]);
        const selectedCandidates=allCandidates.filter(item=>item.selected);
        const exclusions=incompleteSources.map(source=>({sourceId:source.sourceId,reason:source.message||"This selected source is not fully indexed; its retained index is not used as current evidence."}));
        for(const id of scope.selection.excludedFileIds||[])exclusions.push({sourceId:id,reason:"Excluded by the user from Planet knowledge."});
        if(selectedCandidates.length>KNOWLEDGE_MAX_FILES)exclusions.push({sourceId:"",reason:`Selected-source limit reached; ${selectedCandidates.length-KNOWLEDGE_MAX_FILES} selected local files were not processed. Unselected exclusions do not count toward the limit.`});
        const candidates=selectedCandidates.slice(0,KNOWLEDGE_MAX_FILES);
        const priorMetadata=previous.sourceMetadata&&typeof previous.sourceMetadata==="object"?previous.sourceMetadata:{};
        const sourceMetadata={},descriptorsById=new Map(),unchangedSourceIds=new Set(),seenContentHashes=new Set();
        const rawBatch=[],explicitEdges=[];let totalBytes=0,textBytes=0,inspected=0,processed=0,extractionIncomplete=false;
        const addDescriptor=(sourceId,descriptor,metadata)=>{
            const normalized=planetKnowledge.normalizeDescriptor(descriptor);
            if(effectiveSummaryMode==="model-assisted"&&(normalized?.summaryMethod!=="model-assisted"||normalized?.modelName!==effectiveModelName))return false;
            if(effectiveSummaryMode==="extractive"&&normalized?.summaryMethod==="model-assisted")return false;
            if(!normalized||!metadata?.contentHash||normalized.contentHash!==metadata.contentHash||seenContentHashes.has(normalized.contentHash))return false;
            seenContentHashes.add(normalized.contentHash);descriptorsById.set(sourceId,normalized);sourceMetadata[sourceId]={...metadata,descriptor:normalized};unchangedSourceIds.add(sourceId);return true;
        };
        const flushRawBatch=async()=>{
            if(!rawBatch.length)return;
            if(runtimeStatus.available&&generatedSummaryCount<maxGeneratedSummaries){
                const engine=require("./services/localKnowledgeEngine");
                for(const document of rawBatch){
                    await waitKnowledgeBatch(job);
                    if(generatedSummaryCount>=maxGeneratedSummaries)break;
                    generatedSummaryCount+=1;
                    try{
                        const built=engine.buildKnowledgeSummaryPrompt({sourceText:document.content,title:document.title,limits:{maxDocumentChars:100_000,maxPromptChars:10_000,maxSummaryChars:900,maxEvidenceChars:240}});
                        if(!built?.prompt)continue;
                        const candidate=await localModelRuntime.generate(built.prompt,{signal:job.controller.signal,maxOutputChars:built.maxOutputChars,timeoutMs:20_000});
                        if(typeof candidate==="string"&&candidate)document.generatedSummary={candidate,modelName:effectiveModelName};
                    }catch(error){if(error?.name==="AbortError")throw error;}
                }
            }
            await waitKnowledgeBatch(job);setKnowledgeJob(job,{stage:"analyzing-batch",processed,total:candidates.length+KNOWLEDGE_MAX_ACTIVITY+20,exclusions});
            const result=await analyzeKnowledgeInWorker(rawBatch,{maxDocuments:KNOWLEDGE_BATCH_SIZE,maxNodes:500,maxEdges:1_500,maxNotes:500,maxDocumentChars:100_000,maxNoteChars:4_000,maxPairComparisons:40_000},job.controller.signal);
            for(const value of Array.isArray(result?.descriptors)?result.descriptors:[]){
                const descriptor=planetKnowledge.normalizeDescriptor(value);if(!descriptor)continue;
                if(seenContentHashes.has(descriptor.contentHash)){const reason="Exact duplicate content already retained from another selected source.";sourceMetadata[descriptor.sourceId]={...(sourceMetadata[descriptor.sourceId]||{}),contentHash:descriptor.contentHash,excludedReason:reason};exclusions.push({sourceId:descriptor.sourceId,reason});continue;}
                seenContentHashes.add(descriptor.contentHash);descriptorsById.set(descriptor.sourceId,descriptor);sourceMetadata[descriptor.sourceId]={...(sourceMetadata[descriptor.sourceId]||{}),contentHash:descriptor.contentHash,descriptor};
            }
            for(const item of Array.isArray(result?.exclusions)?result.exclusions:[]){
                const sourceId=String(item?.sourceId||item?.id||""),reason=String(item?.reason||"Local analysis excluded this item.").slice(0,240);exclusions.push({sourceId,reason});if(sourceId&&sourceMetadata[sourceId])sourceMetadata[sourceId].excludedReason=reason;
            }
            explicitEdges.push(...(Array.isArray(result?.edges)?result.edges.filter(edge=>edge?.type==="direct-link").slice(0,1_500-explicitEdges.length):[]));
            processed+=rawBatch.length;rawBatch.length=0;
        };
        const queueRaw=async(document)=>{rawBatch.push(document);if(rawBatch.length>=KNOWLEDGE_BATCH_SIZE)await flushRawBatch();};
        setKnowledgeJob(job,{status:"running",stage:"scanning",processed:0,total:candidates.length,exclusions});
        for(const candidate of candidates){
            await waitKnowledgeBatch(job);inspected+=1;setKnowledgeJob(job,{stage:"extracting",processed:inspected,total:candidates.length,exclusions});
            const node=scopedGraph.nodes.find(item=>item.id===candidate.id);const candidatePath=node?.sourceRef?.path;
            if(!candidatePath){extractionIncomplete=true;exclusions.push({sourceId:candidate.id,reason:"The indexed file no longer has an authorized local path."});continue;}
            const extension=candidate.extension;
            let safePath,realPath,stats;
            try{safePath=assertUserPath(user,candidatePath);realPath=await fs.promises.realpath(safePath);assertUserPath(user,realPath);stats=await fs.promises.stat(realPath);if(!stats.isFile())throw new Error("not a file");}
            catch(error){extractionIncomplete=true;exclusions.push({sourceId:candidate.id,reason:"The selected file is missing or outside the authorized workspace."});continue;}
            if(isKnowledgeFileInsideVault(scope.vaultPath,realPath)||isKnowledgeFileInsideVault(scope.managedMarkdownPath,realPath)){sourceMetadata[candidate.id]={excludedReason:"FolderRocket knowledge output and the configured Obsidian vault are excluded from knowledge intake."};exclusions.push({sourceId:candidate.id,reason:"FolderRocket knowledge output and the configured Obsidian vault are excluded from knowledge intake."});continue;}
            let withinSelectedRoot=false;for(const root of scope.roots){try{const rootPath=await fs.promises.realpath(assertUserPath(user,root.path));if(isPathWithin(rootPath,realPath)){withinSelectedRoot=true;break;}}catch{}}
            if(!withinSelectedRoot){extractionIncomplete=true;exclusions.push({sourceId:candidate.id,reason:"The file is outside the selected folder roots."});continue;}
            if(stats.size>KNOWLEDGE_MAX_FILE_BYTES){extractionIncomplete=true;exclusions.push({sourceId:candidate.id,reason:`File exceeds the ${KNOWLEDGE_MAX_FILE_BYTES} byte per-file extraction limit.`});continue;}
            const signature=`${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}:${stats.mtime.toISOString()}`,old=priorMetadata[candidate.id];
            const metadataExclusion=knowledgeMetadataExclusion(candidate.title,stats.size);
            if(metadataExclusion){sourceMetadata[candidate.id]={signature,excludedReason:metadataExclusion};exclusions.push({sourceId:candidate.id,reason:metadataExclusion});continue;}
            if(!KNOWLEDGE_READABLE_EXTENSIONS.has(extension)){const reason=`Local text extraction is unavailable for ${extension||"this file type"}.`;sourceMetadata[candidate.id]={signature,excludedReason:reason};exclusions.push({sourceId:candidate.id,reason});continue;}
            if(old?.signature===signature&&addDescriptor(candidate.id,old.descriptor,old))continue;
            if(old?.signature===signature&&old?.contentHash&&seenContentHashes.has(old.contentHash)){const reason="Exact duplicate content already retained from another selected source.";sourceMetadata[candidate.id]={...old,signature,excludedReason:reason};exclusions.push({sourceId:candidate.id,reason});continue;}
            if(old?.signature===signature&&old?.excludedReason){sourceMetadata[candidate.id]={...old,signature};exclusions.push({sourceId:candidate.id,reason:old.excludedReason});continue;}
            totalBytes+=stats.size;if(totalBytes>KNOWLEDGE_MAX_TOTAL_BYTES){extractionIncomplete=true;exclusions.push({sourceId:candidate.id,reason:"The sync reached its 25 MB total local input limit."});continue;}
            let content="";try{content=extension===".md"?await fs.promises.readFile(realPath,"utf8"):String(await readFileContent(realPath)||"");}catch{content="";}
            if(content==="Formato non supportato")content="";
            content=content.slice(0,100_000);if(!content.trim()){extractionIncomplete=true;exclusions.push({sourceId:candidate.id,reason:"No readable local text was extracted from this file."});continue;}
            const documentBytes=Buffer.byteLength(content,"utf8");if(textBytes+documentBytes>KNOWLEDGE_MAX_TOTAL_BYTES){extractionIncomplete=true;exclusions.push({sourceId:candidate.id,reason:"The sync reached its 25 MB total extracted-text limit."});continue;}textBytes+=documentBytes;
            const contentHash=planetKnowledge.documentFingerprint(content);
            if(old?.contentHash===contentHash&&addDescriptor(candidate.id,old.descriptor,{...old,signature,contentHash}))continue;
            sourceMetadata[candidate.id]={signature,contentHash};
            await queueRaw({id:candidate.id,sourceId:candidate.id,sourceType:"filesystem",kind:"file",title:candidate.title,sourceScopeId:candidate.sourceScopeId,locator:realPath,content,updatedAt:stats.mtime.toISOString(),contentHash,metadata:{extension,size:stats.size,modifiedAt:stats.mtime.toISOString(),sourceScopeId:candidate.sourceScopeId,planetId:worldId}});
        }
        const allOperationalNodes=scopedGraph.nodes.filter(item=>item&&((scope.selection.activity&&["activity","search"].includes(item.type))||(scope.selection.snapshots&&["calendar-event","note","reminder"].includes(item.type))||(scope.selection.alerts&&["alert","email-alert"].includes(item.type))));
        const operationalNodes=allOperationalNodes.slice(0,KNOWLEDGE_MAX_ACTIVITY);
        if(allOperationalNodes.length>KNOWLEDGE_MAX_ACTIVITY){extractionIncomplete=true;exclusions.push({sourceId:"folderrocket:activity",reason:`FolderRocket activity limit reached; only ${KNOWLEDGE_MAX_ACTIVITY} records are considered per sync.`});}
        for(const item of operationalNodes){
            await waitKnowledgeBatch(job);const details=item.details&&typeof item.details==="object"?item.details:{};const sourceRef=item.sourceRef&&typeof item.sourceRef==="object"?item.sourceRef:{};
            const sourceScopeId=item.type==="alert"||item.type==="email-alert"?`alerts:${String(item.sourceType||sourceRef.provider||"mail")}:${String(sourceRef.blockId||"")}`:item.type==="activity"||item.type==="search"?"snapshot:activity":item.type==="calendar-event"?"snapshot:calendar":"snapshot:planet-notes";
            const signature=planetKnowledge.documentFingerprint(`${item.updatedAt||""}\0${item.label||""}\0${JSON.stringify(details)}`),old=priorMetadata[item.id];
            if(old?.signature===signature&&addDescriptor(item.id,old.descriptor,old))continue;
            if(old?.signature===signature&&old?.contentHash&&seenContentHashes.has(old.contentHash)){const reason="Exact duplicate content already retained from another selected source.";sourceMetadata[item.id]={...old,signature,excludedReason:reason};exclusions.push({sourceId:item.id,reason});continue;}
            const content=[`Action or record: ${String(item.label||item.type)}`,`Type: ${item.type}`,`Updated: ${String(item.updatedAt||details.updatedAt||details.at||"")}`,`Details: ${JSON.stringify(details).slice(0,4_000)}`,`Referenced files: ${(Array.isArray(details.files)?details.files:[]).slice(0,20).join("; ")}`].join("\n");
            if(textBytes+Buffer.byteLength(content,"utf8")>KNOWLEDGE_MAX_TOTAL_BYTES){extractionIncomplete=true;exclusions.push({sourceId:item.id,reason:"The sync reached its 25 MB total extracted-text limit."});continue;}
            textBytes+=Buffer.byteLength(content,"utf8");
            const contentHash=planetKnowledge.documentFingerprint(content);if(content.trim().length<80){const reason="FolderRocket activity contains too little retained context.";sourceMetadata[item.id]={signature,contentHash,excludedReason:reason};exclusions.push({sourceId:item.id,reason});continue;}
            sourceMetadata[item.id]={signature,contentHash};
            await queueRaw({id:item.id,sourceId:item.id,sourceType:item.sourceType||"folderrocket",kind:`folderrocket-${item.type}`,title:String(item.label||item.type).slice(0,240),sourceScopeId,locator:String(sourceRef.path||details.at||"FolderRocket activity"),content,updatedAt:String(item.updatedAt||details.at||""),contentHash,metadata:{sourceScopeId,planetId:worldId,signature}});
        }
        if(allOperationalNodes.length>KNOWLEDGE_MAX_ACTIVITY)exclusions.push({sourceId:"folderrocket:activity",reason:`FolderRocket activity limit reached; only ${KNOWLEDGE_MAX_ACTIVITY} records are considered per sync.`});
        const selectedThreads=scope.selection.email&&scope.selection.threadMode==="selected"?scope.selection.threadIds:[];
        if(scope.selection.email&&scope.selection.threadMode!=="selected")exclusions.push({sourceId:"email",reason:"Choose specific conversation IDs before adding email knowledge; broad mailbox intake is disabled."});
        if(scope.selection.email&&selectedThreads.length&&!scope.emailSelection?.provider){extractionIncomplete=true;exclusions.push({sourceId:"email",reason:"No email account is selected for this planet."});}
        if(scope.selection.email&&selectedThreads.length&&scope.emailSelection?.provider!=="gmail"){extractionIncomplete=true;exclusions.push({sourceId:"email",reason:"Local knowledge intake currently supports explicitly selected Gmail conversations only."});}
        if(scope.selection.email&&selectedThreads.length&&scope.emailSelection?.provider==="gmail"){
            if(!scope.emailSelection.blockId){extractionIncomplete=true;exclusions.push({sourceId:"email",reason:"No Gmail account is selected for this planet."});}
            else for(const threadId of selectedThreads.slice(0,20)){
                await waitKnowledgeBatch(job);
                try{
                    const metadataThread=await getGmailThreadMetadata(threadId,user.id,scope.emailSelection.blockId);if(metadataThread.id&&metadataThread.id!==threadId)throw new Error("Selected Gmail thread identity did not match.");
                    const signature=planetKnowledge.documentFingerprint(`${metadataThread.updatedAt||""}\0${metadataThread.messageCount||0}\0${metadataThread.subject||""}`),id=`gmail:${scope.emailSelection.blockId}:${threadId}`,old=priorMetadata[id];
                    if(old?.signature===signature&&addDescriptor(id,old.descriptor,old))continue;
                    if(old?.signature===signature&&old?.contentHash&&seenContentHashes.has(old.contentHash)){const reason="Exact duplicate content already retained from another selected source.";sourceMetadata[id]={...old,signature,excludedReason:reason};exclusions.push({sourceId:id,reason});continue;}
                    const thread=await getGmailThreadPage(threadId,user.id,scope.emailSelection.blockId,{maxResults:10});if(thread.id&&thread.id!==threadId)throw new Error("Selected Gmail thread identity did not match.");if(thread.hasMore)exclusions.push({sourceId:`gmail:${threadId}`,reason:"Only the most recent 10 messages in this selected conversation are included per sync."});const content=(thread.messages||[]).slice(-10).map(message=>`${message.subject||""}\n${String(message.text||"").slice(0,10_000)}`).join("\n\n").slice(0,100_000);
                    if(!content.trim()){extractionIncomplete=true;exclusions.push({sourceId:`gmail:${threadId}`,reason:"No readable message text was available."});continue;}
                    if(textBytes+Buffer.byteLength(content,"utf8")>KNOWLEDGE_MAX_TOTAL_BYTES){extractionIncomplete=true;exclusions.push({sourceId:`gmail:${threadId}`,reason:"The sync reached its 25 MB total extracted-text limit."});continue;}textBytes+=Buffer.byteLength(content,"utf8");
                    const contentHash=planetKnowledge.documentFingerprint(content);
                    if(old?.contentHash===contentHash&&addDescriptor(id,old.descriptor,{...old,signature,contentHash}))continue;
                    sourceMetadata[id]={contentHash,signature};
                    await queueRaw({id,sourceId:id,sourceType:"gmail",kind:"email-conversation",title:String(thread.messages?.[0]?.subject||threadId).slice(0,240),sourceScopeId:`gmail:${scope.emailSelection.blockId}`,locator:threadId,content,updatedAt:thread.messages?.at(-1)?.receivedAt||new Date().toISOString(),contentHash,metadata:{blockId:scope.emailSelection.blockId,threadId,sourceScopeId:`gmail:${scope.emailSelection.blockId}`,planetId:worldId}});
                }catch{extractionIncomplete=true;exclusions.push({sourceId:`gmail:${threadId}`,reason:"The explicitly selected conversation could not be read from its connected account."});}
            }
            if(selectedThreads.length>20){extractionIncomplete=true;exclusions.push({sourceId:"email",reason:"Conversation limit reached; at most 20 explicitly selected conversations are read per sync."});}
        }
        if(scope.selection.email&&selectedThreads.length&&scope.emailSelection?.provider==="gmail"){
            const loaded=new Set([...descriptorsById.values()].filter(item=>item.kind==="email-conversation").map(item=>item.locator));
            if(selectedThreads.slice(0,20).some(id=>!loaded.has(id)))extractionIncomplete=true;
        }
        await flushRawBatch();
        const compactDocuments=[...descriptorsById.values()].map(descriptor=>({descriptor}));
        setKnowledgeJob(job,{stage:"analyzing-global",processed,total:compactDocuments.length,exclusions});await waitKnowledgeBatch(job);
        const result=await analyzeKnowledgeInWorker(compactDocuments,{maxDocuments:300,maxNodes:500,maxEdges:1_500,maxNotes:500,maxDocumentChars:100_000,maxNoteChars:4_000,maxPairComparisons:40_000},job.controller.signal);
        const canonicalDescriptors=(Array.isArray(result?.descriptors)?result.descriptors:[]).map(planetKnowledge.normalizeDescriptor).filter(Boolean);
        const canonicalSourceIds=new Set(canonicalDescriptors.map(item=>item.sourceId));
        for(const [sourceId,metadata] of Object.entries(sourceMetadata))if(metadata?.descriptor&&!canonicalSourceIds.has(sourceId)){
            const reason="Duplicate or low-signal source omitted from the canonical knowledge graph.";
            metadata.excludedReason=reason;delete metadata.descriptor;metadata.nodeIds=[];metadata.noteIds=[];
            if(!exclusions.some(item=>item.sourceId===sourceId))exclusions.push({sourceId,reason});
        }
        const newNodes=boundedKnowledgeArray(result?.nodes,planetKnowledge.MAX_NODES),newEdges=boundedKnowledgeArray(result?.edges,planetKnowledge.MAX_EDGES),newNotes=boundedKnowledgeArray(result?.notes,planetKnowledge.MAX_NOTES);
        exclusions.push(...boundedKnowledgeArray(result?.exclusions,300).map(item=>({sourceId:String(item?.sourceId||item?.id||""),reason:String(item?.reason||item?.message||"Local analysis excluded this item.").slice(0,240)})));
        const nodeMap=new Map();for(const item of newNodes)if(item?.id)nodeMap.set(item.id,item);
        const nodes=[...nodeMap.values()].slice(0,planetKnowledge.MAX_NODES),nodeIds=new Set(nodes.map(item=>item.id));
        const edgeMap=new Map();for(const edge of newEdges){const from=edge?.from||edge?.source,to=edge?.to||edge?.target;if(nodeIds.has(from)&&nodeIds.has(to))edgeMap.set(edge.id||`${from}:${to}`,{...edge,from,to});}
        const previousNodeById=new Map(previous.nodes.map(item=>[item.id,item]));
        for(const edge of previous.edges){
            if(edge?.type!=="direct-link")continue;
            const from=edge.from||edge.source,to=edge.to||edge.target,sourceId=String(previousNodeById.get(from)?.source?.id||"");
            if(unchangedSourceIds.has(sourceId)&&nodeIds.has(from)&&nodeIds.has(to))edgeMap.set(edge.id||`${from}:${to}`,{...edge,from,to});
        }
        for(const edge of explicitEdges){const from=edge?.from||edge?.source,to=edge?.to||edge?.target;if(nodeIds.has(from)&&nodeIds.has(to))edgeMap.set(edge.id||`${from}:${to}`,{...edge,from,to});}
        const noteMap=new Map(newNotes.filter(item=>item?.id).map(item=>[item.id,item])),nodeById=new Map(nodes.map(item=>[item.id,item]));
        for(const edge of edgeMap.values())if(edge.type==="direct-link"){
            const source=nodeById.get(edge.from),target=nodeById.get(edge.to),note=noteMap.get(edge.from);if(!source||!target||!note)continue;
            const link=`- [[${target.noteTarget||target.label}|${String(target.label||target.id).replace(/[\r\n\[\]]/g," ")}]] (explicit source link)`;
            const markdown=String(note.markdown||note.content||"");if(!markdown.includes(link)){note.markdown=`${markdown}\n${link}`.slice(0,4_000);note.content=note.markdown;}
        }
        for(const descriptor of canonicalDescriptors){
            const sourceId=descriptor.sourceId,nodesForSource=nodes.filter(item=>knowledgeNodeSourceId(item)===sourceId||(Array.isArray(item.sources)&&item.sources.some(source=>source?.id===sourceId))),notesForSource=[...noteMap.values()].filter(item=>knowledgeNoteSourceIds(item).includes(sourceId));
            sourceMetadata[sourceId]={...(sourceMetadata[sourceId]||{}),descriptor,nodeIds:nodesForSource.map(item=>item.id),noteIds:notesForSource.map(item=>item.id)};
        }
        const limited=nodes.length>planetKnowledge.MAX_NODES||edgeMap.size>planetKnowledge.MAX_EDGES||noteMap.size>planetKnowledge.MAX_NOTES;
        const contentBlockers=knowledgeContentBlockers(exclusions,scope,graph);
        const fallbackBlocker=extractionIncomplete&&!contentBlockers.length?[{sourceId:"selected-content",label:"Selected source content",status:"partial",reasonCode:"content_unavailable",action:"Review the selected source status and restore any unavailable content, then retry Sync now.",retryable:true}]:[];
        const reasonSummary=safeKnowledgeBlockerSummary([...contentBlockers,...fallbackBlocker],{selectedSourceLimit:selectedCandidates.length>KNOWLEDGE_MAX_FILES,contentIncomplete:extractionIncomplete,knowledgeLimit:limited});
        const next={...previous,status:knowledgeStatusForBlockers(reasonSummary),progress:{stage:"complete",processed:candidates.length+selectedThreads.length,total:candidates.length+selectedThreads.length,limitReached:limited||extractionIncomplete||selectedCandidates.length>KNOWLEDGE_MAX_FILES},sourceSelectionFingerprint:scope.fingerprint,graphRevision:scope.graphRevision,sourceMetadata,nodes:nodes.slice(0,planetKnowledge.MAX_NODES),edges:[...edgeMap.values()].slice(0,planetKnowledge.MAX_EDGES),notes:[...noteMap.values()].slice(0,planetKnowledge.MAX_NOTES),exclusions:exclusions.slice(0,500),updatedAt:new Date().toISOString()};
        const latestScope=await knowledgeScope({user},worldId);if(!latestScope||latestScope.fingerprint!==scope.fingerprint)throw Object.assign(new Error("Planet source selection changed during knowledge sync."),{name:"AbortError"});
        setKnowledgeJob(job,{status:"running",stage:"writing",processed:next.progress.processed,total:next.progress.total,exclusions:next.exclusions});
        const managedRecords=knowledgeNoteRecords(next.notes,worldId,scope.fingerprint);
        const selectedScopes=[...new Set(managedRecords.map(item=>item.sourceScopeId).filter(Boolean))];
        await planetKnowledge.ensureManagedMarkdownRoot(user.id,worldId);
        const managedResult=await obsidianVault.syncVault({vaultPath:scope.managedMarkdownPath,worldId,ownerId:user.id,worldName:String(scope.world.name||worldId).slice(0,80),records:managedRecords,completeSelection:true,selectedSourceScopeIds:selectedScopes});
        next.managedMarkdown={path:scope.managedMarkdownPath,revision:scope.graphRevision,status:next.status,updatedAt:new Date().toISOString(),complete:next.status==="ready",written:managedResult.written,unchanged:managedResult.unchanged};
        await planetKnowledge.writeKnowledge(next);setKnowledgeJob(job,{status:"completed",stage:"complete",processed:next.progress.processed,total:next.progress.total,reasonSummary});
    }catch(error){
        if(error?.name==="AbortError"||job.controller.signal.aborted){await planetKnowledge.writeKnowledge({...start,status:"cancelled",progress:{...start.progress,stage:"cancelled"},updatedAt:new Date().toISOString()}).catch(()=>{});setKnowledgeJob(job,{status:"cancelled",stage:"cancelled"});}
        else{await planetKnowledge.writeKnowledge({...start,status:"error",progress:{...start.progress,stage:"error"},updatedAt:new Date().toISOString()}).catch(()=>{});setKnowledgeJob(job,{status:"failed",stage:"failed",error:"Local knowledge sync failed. The last complete knowledge graph was kept."});}
    }finally{
        const key=knowledgeScopeKey(user.id,worldId);const pending=!job.controller.signal.aborted?job.pendingGeneration.take():null;
        if(pending){setKnowledgeJob(job,{status:"queued",stage:"queued-latest",processed:0,total:0,exclusions:[]});scheduleKnowledgeGeneration(job,pending.user,worldId,pending.scope);}
        else{if(knowledgeJobsByScope.get(key)===job)knowledgeJobsByScope.delete(key);if(typeof job.resolve==="function")job.resolve(job);}
        while(knowledgeJobsById.size>100){const oldest=knowledgeJobsById.keys().next().value;if(knowledgeJobsById.get(oldest)?.status!=="running"&&knowledgeJobsById.get(oldest)?.status!=="paused"&&knowledgeJobsById.get(oldest)?.status!=="queued")knowledgeJobsById.delete(oldest);else break;}
    }
}
function queueKnowledgeSyncJob(user,worldId,scope){
    const key=knowledgeScopeKey(user.id,worldId);const active=knowledgeJobsByScope.get(key);
    if(active&&!['completed','cancelled','failed'].includes(active.status)){if((active.activeScopeFingerprint||active.scopeFingerprint)!==scope.fingerprint)active.pendingGeneration.replace({scope,user});else active.pendingGeneration.clear();return active;}
    if(active)knowledgeJobsByScope.delete(key);
    const job={id:crypto.randomUUID(),userId:String(user.id),worldId,status:"queued",stage:"queued",processed:0,total:0,exclusions:[],startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),controller:new AbortController(),scopeFingerprint:scope.fingerprint,activeScopeFingerprint:scope.fingerprint,pendingGeneration:createLatestGenerationSlot()};
    job.done=new Promise(resolve=>{job.resolve=resolve;});knowledgeJobsByScope.set(key,job);knowledgeJobsById.set(job.id,job);scheduleKnowledgeGeneration(job,user,worldId,scope);return job;
}

app.get("/worlds/:worldId/knowledge",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    const scope=await knowledgeScope(req,worldId);if(!scope)return res.status(404).json({message:"Planet not found."});
    await maintainKnowledgeWatcher(req.user,worldId,scope);
    try{
        const knowledge=await planetKnowledge.readKnowledge(req.user.id,worldId);const key=knowledgeScopeKey(req.user.id,worldId);const job=knowledgeJobsByScope.get(key)||null;
        const graph=await planetGraph.readGraph(req.user.id,worldId);const scopedGraph=obsidianVault.filterGraphBySources(graph,scope.selection,{emailBlockIds:scope.emailSelection?.provider==="gmail"?[scope.emailSelection.blockId]:[],folderRoots:scope.roots});
        if(req.query.summary==="1"){
            const blockers=selectedKnowledgeBlockers(graph,scope);
            const active=job&&!['completed','cancelled','failed'].includes(job.status);
            const matchingJob=job&&(job.scopeFingerprint===scope.fingerprint||job.activeScopeFingerprint===scope.fingerprint)?job:null;
            const matchingKnowledge=knowledge.sourceSelectionFingerprint===scope.fingerprint;
            const extra=matchingKnowledge&&knowledge.status==="partial"&&!blockers.length?{contentIncomplete:true}:{};
            const contentBlockers=matchingKnowledge&&knowledge.status==="partial"?knowledgeContentBlockers(knowledge.exclusions,scope,graph):[];
            const reasonSummary=blockers.length?safeKnowledgeBlockerSummary(blockers):matchingJob?.reasonSummary?.reasonCodes?.length?{...matchingJob.reasonSummary,blockers:matchingJob.reasonSummary.blockers||contentBlockers}:contentBlockers.length?safeKnowledgeBlockerSummary(contentBlockers,extra):safeKnowledgeBlockerSummary([],extra);
            const readinessFingerprint=knowledgeReadinessFingerprint(scope,graph,reasonSummary);
            const status=blockers.some(item=>item.status==="indexing")||active?"indexing":reasonSummary.reasonCodes.length||blockers.length?"blocked":"ready";
            return res.json({worldId,status,sourceSelectionFingerprint:scope.fingerprint,revision:scope.graphRevision,readinessFingerprint,reasonSummary:{reasonCodes:reasonSummary.reasonCodes||[],counts:reasonSummary.counts||{},blockers:(reasonSummary.blockers||[]).slice(0,20)}});
        }
        const allCandidates=knowledgeCandidates(scopedGraph,scope.selection,[scope.vaultPath,scope.managedMarkdownPath]);const candidateCount=allCandidates.length,selectedCandidateCount=allCandidates.filter(item=>item.selected).length,candidateLimitReached=candidateCount>500;
        const candidates=allCandidates.slice(0,500).map(({id,title,sourceScopeId,extension,selected})=>({id,title,sourceScopeId,extension,selected}));
        const matches=knowledge.sourceSelectionFingerprint===scope.fingerprint;const activeJob=publicKnowledgeJob(job);
        res.json({worldId,knowledge:{nodes:knowledge.nodes,edges:knowledge.edges,notes:knowledge.notes,managedMarkdown:knowledge.managedMarkdown||null},candidates,candidateCount,selectedCandidateCount,candidateLimitReached,status:activeJob?.status||(!knowledge.sourceSelectionFingerprint?knowledge.status:matches?knowledge.status:"stale"),progress:activeJob?{stage:activeJob.stage,processed:activeJob.processed,total:activeJob.total}:knowledge.progress,job:activeJob,limits:{maxFiles:KNOWLEDGE_MAX_FILES,maxActivity:KNOWLEDGE_MAX_ACTIVITY,maxConversations:20,maxDocuments:300,maxCandidates:500,candidateLimitReached,maxFileBytes:KNOWLEDGE_MAX_FILE_BYTES,maxTotalBytes:KNOWLEDGE_MAX_TOTAL_BYTES,maxNodes:planetKnowledge.MAX_NODES,maxEdges:planetKnowledge.MAX_EDGES,maxNotes:planetKnowledge.MAX_NOTES,batchSize:KNOWLEDGE_BATCH_SIZE,externalAi:false,automaticWatcher:knowledgeWatchersByScope.has(key)},exclusions:activeJob?.exclusions?.length?activeJob.exclusions:knowledge.exclusions,sourceSelection:scope.selection,sourceSelectionFingerprint:scope.fingerprint,revision:scope.graphRevision,stale:!matches&&Boolean(knowledge.sourceSelectionFingerprint),updatedAt:knowledge.updatedAt});
    }catch(error){res.status(500).json({message:error instanceof Error?error.message:"Unable to read local planet knowledge."});}
});

app.get("/local-model/status",requireAuthenticated,async(req,res)=>{
    try{const status=await localModelRuntime.inspect();res.json({enabled:status.enabled,configured:status.configured,runtimeAvailable:status.runtimeAvailable,modelConfigured:status.modelConfigured,modelDetected:status.modelDetected,available:status.available,modelName:status.modelName,models:status.models,error:status.error,remoteCalls:false,automaticInstall:false});}
    catch{res.json({enabled:false,configured:false,runtimeAvailable:false,modelConfigured:false,modelDetected:false,available:false,modelName:"",models:[],error:"Local model runtime status is unavailable.",remoteCalls:false,automaticInstall:false});}
});

app.post("/worlds/:worldId/knowledge/sync",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    const scope=await knowledgeScope(req,worldId);if(!scope)return res.status(404).json({message:"Planet not found."});
    await maintainKnowledgeWatcher(req.user,worldId,scope);
    if(scope.selection.folders&&scope.roots.length)scheduleSelectedFolderRefresh(req.user,worldId,scope);
    const job=queueKnowledgeSyncJob(req.user,worldId,scope);
    const current=await planetKnowledge.readKnowledge(req.user.id,worldId);res.status(202).json({jobId:job.id,status:job.status,latestGenerationQueued:job.pendingGeneration.hasPending||job.scopeFingerprint!==scope.fingerprint,progress:{stage:job.stage,processed:job.processed||0,total:job.total||0},knowledge:{nodes:current.nodes,edges:current.edges,notes:current.notes,managedMarkdown:current.managedMarkdown||null}});
});

app.post("/worlds/:worldId/knowledge/query",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    const scope=await knowledgeScope(req,worldId);if(!scope)return res.status(404).json({message:"Planet not found."});
    const query=typeof req.body?.question==="string"?req.body.question.trim().slice(0,600):"";if(!query)return res.status(400).json({message:"Enter a question to search this planet's local knowledge."});
    try{
        const knowledge=await planetKnowledge.readKnowledge(req.user.id,worldId);if(!knowledge.sourceSelectionFingerprint||knowledge.sourceSelectionFingerprint!==scope.fingerprint||!planetKnowledge.readiness({enabled:true,knowledge,fingerprint:scope.fingerprint,graphRevision:scope.graphRevision}).queryable)return res.status(409).json({message:"Current source evidence is not ready for this planet. Run or retry local knowledge sync first."});
        const engine=require("./services/localKnowledgeEngine");const result=await engine.retrieveKnowledge({nodes:knowledge.nodes,edges:knowledge.edges,query,limit:8});
        res.json({...result,externalAi:false,sourceSelectionFingerprint:knowledge.sourceSelectionFingerprint,revision:knowledge.graphRevision||"",readiness:knowledge.status});
    }catch(error){res.status(500).json({message:error instanceof Error?error.message:"Unable to query local planet knowledge."});}
});

app.post("/worlds/:worldId/knowledge/jobs/:jobId/:action",requireAuthenticated,(req,res)=>{
    const worldId=String(req.params.worldId||""),action=String(req.params.action||"");if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    const found=graphWorld(req,res,worldId);if(!found)return;const job=knowledgeJobsById.get(req.params.jobId);
    if(!job||job.userId!==String(req.user.id)||job.worldId!==worldId)return res.status(404).json({message:"Knowledge job not found."});
    if(action==="pause"&&job.status==="running")setKnowledgeJob(job,{status:"paused",stage:"paused"});
    else if(action==="resume"&&job.status==="paused")setKnowledgeJob(job,{status:"running",stage:"resuming"});
    else if(action==="cancel"&&!['completed','cancelled','failed'].includes(job.status)){job.controller.abort();setKnowledgeJob(job,{status:"cancelled",stage:"cancelled"});}
    else if(!["pause","resume","cancel"].includes(action))return res.status(404).json({message:"Unknown knowledge job action."});
    res.json({job:publicKnowledgeJob(job)});
});

app.post("/worlds/:worldId/obsidian/sync",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const state=readWorldObsidian(req.user,worldId);
    if(!validWorldId(worldId))return res.status(400).json({message:"Invalid planet identifier."});
    if(!state)return res.status(404).json({message:"Planet not found."});
    if(!state.config.enabled)return res.status(409).json({message:"Enable Obsidian for this planet before syncing."});
    try {
        const initialStoredVaultPath=typeof state.world.obsidian?.vaultPath==="string"?state.world.obsidian.vaultPath:"";
        let vaultPath=assertObsidianVaultPath(req.user,state.config.vaultPath,{allowMissing:true});
        const namedPath=defaultObsidianVaultPath(req.user,worldId,state.world.name||worldId);
        const legacyPath=defaultObsidianVaultPath(req.user,worldId,worldId);
        if(vaultPath.toLocaleLowerCase()===legacyPath.toLocaleLowerCase()&&namedPath.toLocaleLowerCase()!==legacyPath.toLocaleLowerCase()) {
            const migration=await migrateLegacyVault({legacyPath,targetPath:namedPath,ownerId:req.user.id,worldId});
            vaultPath=assertObsidianVaultPath(req.user,migration.path,{allowMissing:false});
            const latestSettings=readDashboardPreferences(req.user.id)||state.settings;
            const latestWorlds=latestSettings.worlds&&typeof latestSettings.worlds==="object"?latestSettings.worlds:{};
            const latestWorld=latestWorlds[worldId]||state.world;
            const latestObsidian=latestWorld.obsidian&&typeof latestWorld.obsidian==="object"?latestWorld.obsidian:{};
            const latestStoredVaultPath=typeof latestObsidian.vaultPath==="string"?latestObsidian.vaultPath:"";
            if(latestStoredVaultPath!==initialStoredVaultPath)throw new Error("The configured Obsidian vault changed during migration; retry with the current vault.");
            const migratedWorld={...latestWorld,obsidian:{...latestObsidian,vaultPath}};
            const migratedSettings={...latestSettings,worlds:{...latestWorlds,[worldId]:migratedWorld}};
            writeDashboardPreferences(req.user.id,migratedSettings);
            state.settings=migratedSettings;state.world=migratedWorld;state.config={...state.config,vaultPath};
        }
        const graph=await planetGraph.readGraph(req.user.id,worldId);
        const worldName=String(state.world.name||worldId).slice(0,80);
        const sourceSelection=obsidianVault.normalizeSourceSelection(state.config.sourceSelection);
        let warnings=[];
        const emailSelection=worldEmailAccountService.resolveWorldEmailAccount(state.world,state.settings,worldId).selection;
        const selectedEmailBlocks=emailSelection?.provider==="gmail"?[emailSelection.blockId]:[];
        const syncFolderRoots=graphFolderRootsForWorld(state.settings,worldId,sourceSelection);
        const selectedGraph=obsidianVault.filterGraphBySources(graph,sourceSelection,{emailBlockIds:selectedEmailBlocks,folderRoots:syncFolderRoots});
        let currentKnowledge=await planetKnowledge.readKnowledge(req.user.id,worldId);
        const currentScope=await knowledgeScope(req,worldId);if(!currentScope)throw new Error("Planet knowledge scope is no longer available.");
        if(canonicalPathContainment.canonicalPath(currentScope.vaultPath)!==canonicalPathContainment.canonicalPath(vaultPath))throw new Error("The configured Obsidian vault changed during sync; retry with the current vault.");
        const sourceSelectionFingerprint=currentScope.fingerprint;const job=queueKnowledgeSyncJob(req.user,worldId,currentScope);await job.done;
        if(job.status!=="completed")throw new Error("Local knowledge sync did not complete. The existing Obsidian vault was left unchanged.");
        currentKnowledge=await planetKnowledge.readKnowledge(req.user.id,worldId);
        const currentKnowledgeMatches=currentKnowledge.sourceSelectionFingerprint===sourceSelectionFingerprint;
        if(!currentKnowledgeMatches||currentKnowledge.status!=="ready") {
            const latestGraph=await planetGraph.readGraph(req.user.id,worldId);
            const selectedBlockers=selectedKnowledgeBlockers(latestGraph,currentScope);
            const baseSummary=currentKnowledgeMatches&&job.reasonSummary?.reasonCodes?.length
                ?job.reasonSummary
                :summarizeKnowledgeBlockers({sourceSelectionChanged:!currentKnowledgeMatches,contentIncomplete:currentKnowledgeMatches});
            const contentBlockers=currentKnowledgeMatches?knowledgeContentBlockers(currentKnowledge.exclusions,currentScope,latestGraph):[];
            const reasonSummary=selectedBlockers.length?safeKnowledgeBlockerSummary(selectedBlockers):job.reasonSummary?.blockers?.length?job.reasonSummary:contentBlockers.length?safeKnowledgeBlockerSummary(contentBlockers):{...baseSummary,blockers:currentKnowledgeMatches?[{sourceId:"selected-content",label:"Selected source content",status:"partial",reasonCode:"content_unavailable",action:"Review the selected source status and restore any unavailable content, then retry Sync now.",retryable:true}]:[]};
            const readinessFingerprint=knowledgeReadinessFingerprint(currentScope,latestGraph,reasonSummary);
            return res.status(409).json({code:"KNOWLEDGE_INCOMPLETE",message:"The selected sources are incomplete. The managed local Markdown was updated, and the custom Obsidian vault remains at its last complete revision.",summary:reasonSummary.summary,reasonSummary:{reasonCodes:reasonSummary.reasonCodes,counts:reasonSummary.counts,blockers:(reasonSummary.blockers||[]).slice(0,20)},readinessFingerprint});
        }
        const graphRecords=knowledgeNoteRecords(currentKnowledge.notes,worldId,sourceSelectionFingerprint);
        const records=[...graphRecords];
        const selectedSourceScopeIds=new Set();
        for(const key of obsidianVault.SOURCE_KEYS)if(sourceSelection[key])selectedSourceScopeIds.add(`client-category:${key}`);
        if(sourceSelection.folders)for(const root of syncFolderRoots)selectedSourceScopeIds.add(`filesystem:folder:${root.id}`);
        if(sourceSelection.email&&emailSelection?.provider==="gmail")selectedSourceScopeIds.add(`gmail:${emailSelection.blockId}`);
        if(sourceSelection.activity)selectedSourceScopeIds.add("snapshot:activity");
        if(sourceSelection.snapshots) {
            selectedSourceScopeIds.add("snapshot:calendar");
            selectedSourceScopeIds.add("snapshot:planet-notes");
        }
        if(currentKnowledgeMatches)for(const record of graphRecords)if(record.sourceScopeId)selectedSourceScopeIds.add(record.sourceScopeId);
        if(currentKnowledgeMatches)selectedSourceScopeIds.add(`knowledge:${sourceSelectionFingerprint}`);
        const graphStatuses=new Map((Array.isArray(graph.sourceStatuses)?graph.sourceStatuses:[]).map(item=>[item.sourceId,item.status]));
        let completeSelection=selectedKnowledgeBlockers(graph,currentScope).length===0&&expectedKnowledgeGraphSourceIds(currentScope).every(sourceId=>graphStatuses.get(sourceId)==="complete");
        const lateBlockers=selectedKnowledgeBlockers(graph,currentScope);
        if(Array.isArray(req.body?.records)&&req.body.records.length>500){completeSelection=false;lateBlockers.push({sourceId:"client-record-limit",label:"Supplied sync records",status:"limited",reasonCode:"selected_source_limit",action:"Reduce the number of supplied records to 500 or fewer, then retry Sync now.",retryable:false});}
        if(Array.isArray(req.body?.attachments)&&req.body.attachments.length>40){completeSelection=false;lateBlockers.push({sourceId:"selected-attachment-limit",label:"Selected attachments",status:"limited",reasonCode:"selected_source_limit",action:"Reduce the selected attachments to 40 or fewer, then retry Sync now.",retryable:false});}
        if(sourceSelection.email&&emailSelection?.provider!=="gmail"){
            completeSelection=false;
            if(!lateBlockers.some(item=>item.sourceId==="email-selection"))lateBlockers.push({sourceId:"email-selection",label:"Selected email source",status:"unavailable",reasonCode:"content_unavailable",action:"Choose a connected Gmail source or turn off the email source, then retry Sync now.",retryable:false});
        }
        if(sourceSelection.email&&sourceSelection.threadMode==="selected") {
            const exportedThreadIds=new Set(selectedGraph.nodes.filter(item=>item.type==="email-thread").map(item=>item.sourceRef?.threadId).filter(Boolean));
            const omitted=sourceSelection.threadIds.filter(id=>!exportedThreadIds.has(id));
            if(omitted.length){completeSelection=false;warnings.push(`${omitted.length} selected conversation(s) are not currently present in the planet graph and were not exported.`);lateBlockers.push({sourceId:`gmail:${emailSelection?.blockId||"selected"}`.slice(0,180),label:"Selected Gmail conversations",status:"incomplete",reasonCode:"content_unavailable",action:"Refresh the selected Gmail conversations, then retry Sync now.",retryable:true});}
        }
        records.unshift({id:`overview:${worldId}`,kind:"overview",sourceId:worldId,title:`${worldName} · FolderRocket`,updatedAt:graph.updatedAt||"",content:`This vault contains the FolderRocket records available for the **${worldName}** planet.\n\n- Graph status: ${graph.status}\n- Indexed records: ${graph.nodes.length}\n- Knowledge notes: ${graphRecords.length}\n\nKnowledge notes are created locally from the selected folder sources and explicitly selected Gmail conversations. FolderRocket does not scan the mailbox for Obsidian sync. Client-held notes, reminders, Daily Jobs and File Studio activity are included only when supplied by FolderRocket during sync.\n`});
        const allowedKinds=new Set(["post-it","ai-post-it","reminder","daily-job","activity","file-studio","file-studio-operation","downloaded-attachment"]);
        const clientRecords=[];let clientTextBytes=0;
        for(const item of (Array.isArray(req.body?.records)?req.body.records:[]).slice(0,500)) {
            if(!item||typeof item.id!=="string"||!item.id||typeof item.kind!=="string"||!allowedKinds.has(item.kind))continue;
            const content=typeof item.content==="string"?item.content.slice(0,10_000):"";clientTextBytes+=Buffer.byteLength(content,"utf8");
            if(clientTextBytes>2*1024*1024)throw new Error("Obsidian sync records exceed the 2 MB content limit.");
            const category=obsidianVault.sourceCategory(item.kind);
            clientRecords.push({id:`client:${item.kind}:${item.id.slice(0,180)}`,kind:item.kind,title:typeof item.title==="string"?item.title.slice(0,300):item.kind,sourceId:item.id.slice(0,300),sourceScopeId:`client-category:${category}`,updatedAt:typeof item.updatedAt==="string"?item.updatedAt.slice(0,80):"",content});
        }
        const filteredClientRecords=obsidianVault.filterRecordsBySources(clientRecords,sourceSelection);
        records.push(...filteredClientRecords);
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
        const selection=emailSelection;
        if(!["ready","partial","indexing"].includes(graph.status))warnings.push(`Planet graph data is not ready (status: ${graph.status}); only supplied client records can be synced.`);
        if(selection?.provider==="gmail"&&sourceSelection.email){
            if(sourceSelection.threadMode!=="selected"||!sourceSelection.threadIds.length){completeSelection=false;warnings.push("Choose specific Gmail conversations before adding email knowledge; Obsidian sync does not scan the mailbox.");if(!lateBlockers.some(item=>item.sourceId==="email-selection"))lateBlockers.push({sourceId:"email-selection",label:"Email conversation selection",status:"incomplete",reasonCode:"content_unavailable",action:"Select specific Gmail conversations or turn off the email source, then retry Sync now.",retryable:false});}
            else {const metadata=currentKnowledge.sourceMetadata||{};const missing=sourceSelection.threadIds.filter(id=>!metadata[`gmail:${selection.blockId}:${id}`]);if(missing.length){completeSelection=false;warnings.push(`${missing.length} selected conversation(s) have no current local knowledge note and were omitted.`);lateBlockers.push({sourceId:`gmail:${selection.blockId}`.slice(0,180),label:"Selected Gmail conversations",status:"incomplete",reasonCode:"content_unavailable",action:"Restore the selected Gmail conversation data, then retry Sync now.",retryable:true});}}
        } else if(selection?.provider==="outlook"&&sourceSelection.email){completeSelection=false;warnings.push("Outlook conversation knowledge is not supported yet; only explicitly selected Gmail conversations can be processed locally.");}
        else if(sourceSelection.email){completeSelection=false;warnings.push("No email account is selected for this planet.");}
        if(!completeSelection){
            const reasonSummary=safeKnowledgeBlockerSummary(lateBlockers.length?lateBlockers:[{sourceId:"selected-content",label:"Selected source content",status:"incomplete",reasonCode:"content_unavailable",action:"Review the selected source status and retry Sync now.",retryable:true}]);
            const readinessFingerprint=knowledgeReadinessFingerprint(currentScope,graph,reasonSummary);
            return res.status(409).json({code:"KNOWLEDGE_INCOMPLETE",message:"The selected sources are incomplete. The custom Obsidian vault remains at its last complete revision.",summary:reasonSummary.summary,reasonSummary:{reasonCodes:reasonSummary.reasonCodes,counts:reasonSummary.counts,blockers:reasonSummary.blockers},readinessFingerprint});
        }
        const attachmentResult=sourceSelection.attachments?await obsidianVault.copyDownloadedAttachments({vaultPath,attachments:safeAttachments}):{copied:0,unchanged:0,totalBytes:0,records:[]};
        records.push(...attachmentResult.records);
        const suppliedKinds=new Set(clientRecords.map(item=>item.kind));
        if(!["post-it","ai-post-it","reminder"].some(kind=>suppliedKinds.has(kind)))warnings.push("No post-it or reminder records were supplied by the client; these items are stored in client state and are not readable from the backend.");
        if(!["daily-job","activity"].some(kind=>suppliedKinds.has(kind))&&!records.some(item=>item.kind==="activity"))warnings.push("No Daily Jobs records were supplied by the client.");
        if(!["file-studio","file-studio-operation"].some(kind=>suppliedKinds.has(kind)))warnings.push("No File Studio operation records were supplied by the client.");
        if(!attachmentResult.copied&&!attachmentResult.unchanged)warnings.push("No previously downloaded local attachments were supplied; Obsidian sync does not download email attachments automatically.");
        for(const key of obsidianVault.SOURCE_KEYS)if(!sourceSelection[key])warnings.push(`Obsidian source category "${key}" is disabled.`);
        const hasScopedSelectionChange=obsidianVault.SOURCE_KEYS.some(key=>!sourceSelection[key])||sourceSelection.threadMode==="selected"||sourceSelection.threadIds.length>0||sourceSelection.excludedFileIds.length>0||sourceSelection.folderMode==="selected"||sourceSelection.fileTypeMode==="selected"||sourceSelection.includeSubfolders===false;
        const result=await obsidianVault.syncVault({vaultPath,worldId,ownerId:req.user.id,worldName,records,completeSelection,selectedSourceScopeIds:[...selectedSourceScopeIds]});
        if(result.omitted)warnings.push(`The local Obsidian note limit is ${obsidianVault.MAX_NOTES}; ${result.omitted} selected record(s) were not written. Reduce selected sources and sync again.`);
        if(result.warning)warnings.push(result.warning);
        if(hasScopedSelectionChange&&(!completeSelection||result.omitted))warnings.push("Some previously generated notes were retained because this sync could not verify a complete result for the current source selection.");
        if(result.prunedFromDeselected)warnings.push(`${result.prunedFromDeselected} unchanged generated note(s) from deselected sources were removed from this planet's FolderRocket output.`);
        const latest=readDashboardPreferences(req.user.id)||{};const worlds=latest.worlds&&typeof latest.worlds==="object"?latest.worlds:{};const current=worlds[worldId]||state.world;const obsidianConfig=current.obsidian||state.config;
        const saved={...obsidianConfig,vaultPath,lastSyncAt:result.status==="ready"?result.lastSyncAt:obsidianConfig.lastSyncAt||"",status:result.status,lastResult:{total:result.total,written:result.written,unchanged:result.unchanged,conflicts:result.conflicts,warnings}};
        writeDashboardPreferences(req.user.id,{...latest,worlds:{...worlds,[worldId]:{...current,obsidian:saved}}});
        const bySource={};
        for(const record of records) {const category=obsidianVault.sourceCategory(record.kind);bySource[category]=(bySource[category]||0)+1;}
        res.json({config:saved,result:{...result,counts:{graphRecords:graphRecords.length,clientRecords:filteredClientRecords.length,attachments:attachmentResult.records.length,bySource},sourceSelection,attachments:{copied:attachmentResult.copied,unchanged:attachmentResult.unchanged,bytes:attachmentResult.totalBytes},warnings,openSupported:process.env.FOLDERROCKET_DESKTOP==="1",uri:`obsidian://open?path=${encodeURIComponent(vaultPath)}`}});
    } catch(error) {res.status(400).json({message:error instanceof Error?error.message:"Unable to sync this planet to Obsidian."});}
});

app.get("/worlds/:worldId/graph",requireAuthenticated,async(req,res)=>{
    const found=graphWorld(req,res,String(req.params.worldId||""));if(!found)return;
    try {
        const storedGraph=await planetGraph.readGraph(req.user.id,req.params.worldId);
        const sourceSelection=obsidianVault.normalizeSourceSelection(found.world.obsidian?.sourceSelection);
        const emailSelection=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,req.params.worldId).selection;
        const selectedEmailBlocks=emailSelection?.provider==="gmail"?[emailSelection.blockId]:[];
        const folderRoots=graphFolderRootsForWorld(found.settings,req.params.worldId,sourceSelection);
        const vaultPath=readWorldObsidian(req.user,req.params.worldId)?.config?.vaultPath||"";
        const managedMarkdownPath=planetKnowledge.managedMarkdownRoot(req.user.id,req.params.worldId);
        const graph=obsidianVault.filterGraphBySources(storedGraph,sourceSelection,{emailBlockIds:selectedEmailBlocks,folderRoots});
        graph.nodes=graph.nodes.filter(item=>!(typeof item?.sourceRef?.path==="string"&&(isKnowledgeFileInsideVault(vaultPath,item.sourceRef.path)||isKnowledgeFileInsideVault(managedMarkdownPath,item.sourceRef.path))));
        const graphNodeIds=new Set(graph.nodes.map(item=>item.id));graph.edges=graph.edges.filter(item=>graphNodeIds.has(item.from)&&graphNodeIds.has(item.to));
        const excludedFileIds=new Set(sourceSelection.excludedFileIds||[]);if(excludedFileIds.size){graph.nodes=graph.nodes.filter(item=>!excludedFileIds.has(item.id));const visibleIds=new Set(graph.nodes.map(item=>item.id));graph.edges=graph.edges.filter(item=>visibleIds.has(item.from)&&visibleIds.has(item.to));}
        const knowledge=await planetKnowledge.readKnowledge(req.user.id,req.params.worldId);
        const revision=planetGraph.contentRevision(storedGraph);
        const fingerprint=planetKnowledge.fingerprint({selection:sourceSelection,roots:(sourceSelection.folders?folderRoots:[]).map(item=>({id:item.id,path:path.resolve(item.path)})).sort((a,b)=>a.id.localeCompare(b.id)),excludedVaultPath:canonicalPathContainment.canonicalPath(vaultPath),managedMarkdownPath:canonicalPathContainment.canonicalPath(managedMarkdownPath),graphRevision:revision,email:sourceSelection.email?{provider:emailSelection?.provider||"",blockId:emailSelection?.blockId||"",threadMode:sourceSelection.threadMode,threadIds:[...sourceSelection.threadIds].sort()}:null});
        const activeKnowledgeJob=knowledgeJobsByScope.get(knowledgeScopeKey(req.user.id,req.params.worldId));
        const readiness=knowledgeReadiness({enabled:found.world.graphEnabled===true,graphStatus:storedGraph.status,knowledge,fingerprint,graphRevision:revision,job:activeKnowledgeJob});
        if(knowledge.sourceSelectionFingerprint&&knowledge.sourceSelectionFingerprint===fingerprint){
            const nodeIds=new Set(graph.nodes.map(item=>item.id));for(const item of knowledge.nodes)if(item?.id&&!nodeIds.has(item.id)){graph.nodes.push(item);nodeIds.add(item.id);}
            const available=new Set(graph.nodes.map(item=>item.id));graph.edges.push(...knowledge.edges.filter(item=>available.has(item.from)&&available.has(item.to)));graph.knowledgeUpdatedAt=knowledge.updatedAt;
        }
        const progress=activeKnowledgeJob?{stage:activeKnowledgeJob.stage,processed:activeKnowledgeJob.processed,total:activeKnowledgeJob.total}:storedGraph.progress||{stage:"idle",processed:0,total:0};
        if(req.query.summary==="1")return res.json({enabled:found.world.graphEnabled===true,...readiness,graphStatus:storedGraph.status,progress,revision,sourceSelectionFingerprint:fingerprint,knowledgeUpdatedAt:knowledge.updatedAt,managedMarkdown:knowledge.managedMarkdown||null,sourceStatuses:storedGraph.sourceStatuses||[]});
        res.json({enabled:found.world.graphEnabled===true,graph,sourceSelection,...readiness,graphStatus:storedGraph.status,progress,revision,sourceSelectionFingerprint:fingerprint,knowledgeUpdatedAt:knowledge.updatedAt,managedMarkdown:knowledge.managedMarkdown||null});
    } catch(error) {res.status(500).json({message:error instanceof Error?error.message:"Unable to read this planet graph."});}
});

app.get("/worlds/:worldId/graph/chats",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const selectedAccount=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
    if(selectedAccount?.provider==="outlook")return res.status(501).json({provider:"outlook",providerUnsupported:true,message:"Outlook conversation selection is not supported yet."});
    if(!selectedAccount||selectedAccount.provider!=="gmail")return res.status(409).json({message:"Select a connected Gmail account for this planet before adding conversations to its graph."});
    try {
        const accounts=await listGmailConnectedAccounts(req.user.id);
        const account=accounts.find(item=>item.blockId===selectedAccount.blockId);
        if(!account)return res.status(424).json({message:"The selected Gmail account is no longer connected."});
        const listing=await listGmailInboxThreads(chatInboxPageOptions(req.query.pageToken,req.query.query),req.user.id,selectedAccount.blockId);
        const graph=await planetGraph.readGraph(req.user.id,worldId);
        const saved=graph.selectedConversations.filter(item=>item.blockId===selectedAccount.blockId);
        const threads=mergeSavedChatSelectorThreads(listing.threads,saved,selectedAccount.blockId).map(item=>({threadId:item.id,blockId:selectedAccount.blockId,subject:item.subject||"(no subject)",snippet:item.snippet||"",updatedAt:item.updatedAt||"",messageCount:item.messageCount||0,sender:conversationContactIdentity(item.messages,account.email),selected:item.selected===true}));
        res.json({provider:"gmail",accountEmail:account.email||"",threads,nextPageToken:listing.nextPageToken||""});
    } catch(error) {if(respondGraphStorageUnavailable(res,error))return;res.status(502).json({message:error instanceof Error?error.message:"Unable to load Gmail conversations for this planet graph."});}
});

app.post("/worlds/:worldId/graph/chats",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const selectedAccount=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
    if(selectedAccount?.provider==="outlook")return res.status(501).json({provider:"outlook",providerUnsupported:true,message:"Outlook conversation selection is not supported yet."});
    const blockId=typeof req.body?.blockId==="string"?req.body.blockId:"";
    const threadId=typeof req.body?.threadId==="string"?req.body.threadId:"";
    if(!selectedAccount||selectedAccount.provider!=="gmail"||selectedAccount.blockId!==blockId)return res.status(403).json({message:"Choose a real inbox conversation from the Gmail account selected for this planet."});
    if(!threadId||threadId.length>300||req.body?.selected!==undefined&&typeof req.body.selected!=="boolean"||req.body?.pageToken!==undefined&&(typeof req.body.pageToken!=="string"||req.body.pageToken.length>5000)||req.body?.query!==undefined&&(typeof req.body.query!=="string"||req.body.query.length>200))return res.status(400).json({message:"Conversation selection is invalid."});
    try {
        const graph=await planetGraph.readGraph(req.user.id,worldId);
        const current=graph.selectedConversations.find(item=>item.blockId===blockId&&item.threadId===threadId);
        if(req.body?.selected===false) {
            if(current)await planetGraph.unselectConversation(req.user.id,worldId,blockId,threadId);
            return res.json({selected:false,threadId,blockId});
        }
        const accounts=await listGmailConnectedAccounts(req.user.id);const account=accounts.find(item=>item.blockId===blockId);
        if(!account)return res.status(424).json({message:"The selected Gmail account is no longer connected."});
        const listing=await listGmailInboxThreads(chatInboxPageOptions(req.body?.pageToken,req.body?.query),req.user.id,blockId);
        const thread=findInboxThreadById(listing.threads,threadId);
        if(!thread)return res.status(404).json({message:"That conversation is not present in the authenticated Gmail inbox page. Refresh the selector and try again."});
        const emailSourceEnabled=obsidianVault.normalizeSourceSelection(found.world.obsidian?.sourceSelection).email!==false;
        await planetGraph.selectConversation(req.user.id,worldId,{provider:"gmail",blockId,threadId,accountEmail:account.email||"",subject:thread.subject||"(no subject)",sender:conversationContactIdentity(thread.messages,account.email)},{includeNode:emailSourceEnabled});
        res.json({selected:true,threadId,blockId});
    } catch(error) {if(respondGraphStorageUnavailable(res,error))return;res.status(502).json({message:error instanceof Error?error.message:"Unable to save this conversation to the planet graph."});}
});

app.post("/worlds/:worldId/graph/index",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    if(found.world.graphEnabled!==true)return res.status(409).json({message:"Enable Create graph in this planet's settings first."});
    const key=`${req.user.id}:${worldId}`;
    if(planetGraph.isIndexing(req.user.id,worldId))return res.status(202).json({message:"Graph indexing is already in progress.",status:"indexing"});
    const requestedRetry=typeof req.body?.retrySourceId==="string"?req.body.retrySourceId.trim():"";
    if(req.body?.retrySourceId!==undefined&&(typeof req.body.retrySourceId!=="string"||!requestedRetry||requestedRetry.length>240))return res.status(400).json({message:"Graph source retry reference is invalid."});
    const initial=await planetGraph.readGraph(req.user.id,worldId);
    const initialSelection=obsidianVault.normalizeSourceSelection(found.world.obsidian?.sourceSelection);
    const initialRoots=initialSelection.folders?graphFolderRootsForWorld(found.settings,worldId,initialSelection):[];
    const initialAccounts=initialSelection.email?selectedWorldGmailBlocks(found.settings,worldId):[];
    const folderRetry=requestedRetry.startsWith("folder:")?initialRoots.find(item=>`folder:${item.id}`===requestedRetry):null;
    const gmailRetry=requestedRetry.startsWith("gmail:")?initialAccounts.find(item=>`gmail:${item.blockId}`===requestedRetry):null;
    const snapshotRetry=requestedRetry==="snapshot"&&initialSelection.snapshots;
    if(requestedRetry&&!folderRetry&&!gmailRetry&&!snapshotRetry)return res.status(409).json({message:"That graph source is not currently selected for this planet. Refresh the source selection and try again."});
    const startingStatuses=requestedRetry
        ?planetGraph.normalizeSourceStatuses([...initial.sourceStatuses.filter(item=>item.sourceId!==requestedRetry),planetGraph.sourceStatus({sourceId:requestedRetry,type:requestedRetry.startsWith("folder:")?"folder":requestedRetry.startsWith("gmail:")?"gmail":"snapshot",label:folderRetry?.name||gmailRetry?.blockId||"Planet snapshot",status:"indexing",message:"This source is being refreshed.",retryable:true})])
        :[
            ...initialRoots.map(item=>planetGraph.sourceStatus({sourceId:`folder:${item.id}`,type:"folder",label:item.name||"Folder",status:"indexing",message:"This folder source is being indexed.",retryable:true})),
            ...initialAccounts.map(item=>planetGraph.sourceStatus({sourceId:`gmail:${item.blockId}`,type:"gmail",label:"Gmail",status:"indexing",message:"The selected Gmail source is being indexed.",retryable:true})),
            ...(initialSelection.snapshots?[planetGraph.sourceStatus({sourceId:"snapshot",type:"snapshot",label:"Planet activity",status:"indexing",message:"Selected planet activity is being indexed.",retryable:true})]:[])
        ];
    try {await planetGraph.writeGraph({...initial,status:"indexing",sourceStatuses:startingStatuses,progress:{stage:"starting",processed:0,total:startingStatuses.length,limitReached:false},updatedAt:new Date().toISOString(),warnings:[]});}
    catch(error) {if(respondGraphStorageUnavailable(res,error))return;return res.status(500).json({message:"Unable to save planet graph state."});}
    const snapshotProvided=Object.hasOwn(req.body||{},"snapshot")&&req.body.snapshot&&typeof req.body.snapshot==="object"&&!Array.isArray(req.body.snapshot);
    const snapshot=snapshotProvided?req.body.snapshot:{};
    const accepted=planetGraph.enqueueIndex(key,()=>scheduleBackendHeavy(async()=>{
        const warnings=[];let limitReached=false;
        try {
            const latest=readWorldRecord(req.user.id,worldId);
            if(latest.world?.graphEnabled!==true) {await planetGraph.updateGraphStatus(req.user.id,worldId,"disabled",{stage:"stopped",processed:0,total:0},warnings);return;}
            const obsidianConfig=latest.world?.obsidian&&typeof latest.world.obsidian==="object"?latest.world.obsidian:null;
            const sourceSelection=obsidianVault.normalizeSourceSelection(obsidianConfig?.sourceSelection);
            const roots=sourceSelection.folders?graphFolderRootsForWorld(latest.settings,worldId,sourceSelection):[];
            const accounts=sourceSelection.email?selectedWorldGmailBlocks(latest.settings,worldId):[];
            const sourceStillSelected=!requestedRetry
                ||(requestedRetry.startsWith("folder:")&&roots.some(item=>`folder:${item.id}`===requestedRetry))
                ||(requestedRetry.startsWith("gmail:")&&accounts.some(item=>`gmail:${item.blockId}`===requestedRetry))
                ||(requestedRetry==="snapshot"&&sourceSelection.snapshots);
            if(!sourceStillSelected){const current=await planetGraph.readGraph(req.user.id,worldId);const remainingStatuses=current.sourceStatuses.filter(item=>item.sourceId!==requestedRetry);const progress={...current.progress,stage:"complete"};await planetGraph.writeGraph({...current,status:planetGraph.statusForSources?planetGraph.statusForSources(remainingStatuses,progress):"ready",progress,sourceStatuses:remainingStatuses,warnings:[],updatedAt:new Date().toISOString()});return;}
            if(sourceSelection.folderMode==="selected") {
                const selectedIds=new Set(roots.map(item=>item.id));
                const missing=sourceSelection.folderIds.filter(id=>!selectedIds.has(id));
                if(missing.length)warnings.push(`${missing.length} selected folder root(s) are no longer configured and were skipped.`);
            }
            const configuredVaultPath=readWorldObsidian(req.user,worldId)?.config?.vaultPath||"";
            const excludedVaultPath=canonicalPathContainment.canonicalPath(configuredVaultPath);
            const managedMarkdownPath=planetKnowledge.managedMarkdownRoot(req.user.id,worldId);
            const excludedRoots=[excludedVaultPath,canonicalPathContainment.canonicalPath(managedMarkdownPath)].filter(Boolean);
            const current=readWorldRecord(req.user.id,worldId);
            if(current.world?.graphEnabled!==true) {await planetGraph.updateGraphStatus(req.user.id,worldId,"disabled",{stage:"stopped",processed:0,total:0},warnings);return;}
            const worldNode=planetGraph.node("world","folderrocket",worldId,String(latest.world?.name||worldId),{kind:"world",worldId});
            const indexFolders=async targetRoots=>planetGraph.walkConfiguredFolders(targetRoots,{maxDirectories:400,maxFiles:3000,maxDepth:8,maxNodes:Math.max(0,planetGraph.MAX_NODES-1),excludePaths:excludedRoots,includeSubfolders:sourceSelection.includeSubfolders,fileTypes:sourceSelection.fileTypeMode==="selected"?sourceSelection.fileTypes:null,onProgress:async folderProgress=>{
                const currentGraph=await planetGraph.readGraph(req.user.id,worldId);
                const sourceStatuses=currentGraph.sourceStatuses.map(item=>item.sourceId!==folderProgress.sourceId?item:planetGraph.sourceStatus({...item,status:"indexing",message:"Folder indexing is in progress.",processed:Math.max(item.processed,folderProgress.processed),total:0,retryable:true}));
                await planetGraph.updateGraphStatus(req.user.id,worldId,"indexing",{stage:"folders",processed:Math.max(Number(currentGraph.progress?.processed)||0,folderProgress.overallProcessed),total:0,limitReached:currentGraph.progress?.limitReached===true},undefined,{sourceStatuses});
            },validateRoot:async candidate=>{
                const safe=assertUserPath(req.user,candidate);const real=await fs.promises.realpath(safe);const info=await fs.promises.stat(real);if(!info.isDirectory())throw Object.assign(new Error("Configured path is not a folder."),{code:"ENOTDIR"});return real;
            }});
            if(requestedRetry) {
                if(requestedRetry.startsWith("folder:")) {
                    const sourceRoot=roots.find(item=>`folder:${item.id}`===requestedRetry);
                    if(!sourceRoot)return;
                    const walked=await indexFolders([sourceRoot]);const status=walked.sourceStatuses[0]||planetGraph.sourceStatus({sourceId:requestedRetry,type:"folder",label:sourceRoot.name||"Folder",status:"failed",reasonCode:"source_unavailable",message:"The folder source could not be indexed.",retryable:true});
                    if(walked.limitReached)limitReached=true;
                    const graph=await planetGraph.readGraph(req.user.id,worldId);
                    const result=await planetGraph.replaceIndexedSourceGraph(req.user.id,worldId,status,[worldNode,...walked.nodes],walked.edges,{sourcePath:sourceRoot.path,sourceStatuses:graph.sourceStatuses});
                    if(status.message)warnings.push(`${status.label}: ${status.message}`);
                    if(warnings.length)await planetGraph.updateGraphStatus(req.user.id,worldId,result.status,result.progress,warnings);
                    return;
                }
                if(requestedRetry==="snapshot") {
                    const graph=await planetGraph.readGraph(req.user.id,worldId);
                    const status=snapshotProvided
                        ?planetGraph.sourceStatus({sourceId:"snapshot",type:"snapshot",label:"Planet activity",status:"complete",processed:planetGraph.snapshotGraphItems(snapshot).nodes.length,total:0})
                        :planetGraph.sourceStatus({sourceId:"snapshot",type:"snapshot",label:"Planet activity",status:"failed",reasonCode:"snapshot_unavailable",message:"The planet snapshot was not provided; the last successful snapshot remains available.",retryable:true});
                    const items=snapshotProvided?planetGraph.snapshotGraphItems(snapshot):{nodes:[],edges:[]};
                    const result=await planetGraph.replaceIndexedSourceGraph(req.user.id,worldId,status,[...items.nodes],items.edges,{sourceStatuses:graph.sourceStatuses});
                    if(status.message)warnings.push(status.message);
                    if(warnings.length)await planetGraph.updateGraphStatus(req.user.id,worldId,result.status,result.progress,warnings);
                    return;
                }
                const source=accounts.find(item=>`gmail:${item.blockId}`===requestedRetry);
                if(!source)return;
                let accountCatalog=[];
                try {accountCatalog=await listGmailConnectedAccounts(req.user.id);} catch {}
                const graph=await planetGraph.readGraph(req.user.id,worldId);
                const indexed=await collectPlanetGmailSource({userId:req.user.id,source,sourceSelection,accountCatalog,existingGraph:graph});
                const worldWithSource=[worldNode,...indexed.nodes];
                const result=await planetGraph.replaceIndexedSourceGraph(req.user.id,worldId,indexed.status,worldWithSource,indexed.edges,{sourceStatuses:graph.sourceStatuses});
                if(indexed.warnings.length)await planetGraph.updateGraphStatus(req.user.id,worldId,result.status,result.progress,indexed.warnings);
                return;
            }

            const existingGraph=await planetGraph.readGraph(req.user.id,worldId);
            let walked={nodes:[],edges:[],processedDirectories:0,processedFiles:0,configuredRoots:0,limitReached:false,sourceStatuses:[]};
            if(sourceSelection.folders&&roots.length)walked=await indexFolders(roots);
            if(sourceSelection.folderMode==="selected") {
                const selectedIds=new Set(roots.map(item=>item.id));
                for(const missingId of sourceSelection.folderIds.filter(id=>!selectedIds.has(id))) {
                    const status=planetGraph.sourceStatus({sourceId:`folder:${missingId}`,type:"folder",label:"Selected folder",status:"skipped",reasonCode:"selected_item_missing",message:"This selected folder is no longer configured for the planet."});
                    walked.sourceStatuses.push(status);warnings.push(`${status.label}: ${status.message}`);
                }
            }
            const nodes=[worldNode,...walked.nodes];const edges=[];
            for(const root of roots) {
                const rootNode=walked.nodes.find(item=>item.type==="folder"&&path.resolve(item.sourceRef?.path||"").toLowerCase()===path.resolve(root.path).toLowerCase());
                if(rootNode)edges.push(planetGraph.edge("contains",worldNode.id,rootNode.id,"configured-world-folder"));
            }
            let snapshotStatus=null;
            if(sourceSelection.snapshots) {
                if(snapshotProvided) {
                    const snapshotData=planetGraph.snapshotGraphItems(snapshot);nodes.push(...snapshotData.nodes);edges.push(...snapshotData.edges);
                    snapshotStatus=planetGraph.sourceStatus({sourceId:"snapshot",type:"snapshot",label:"Planet activity",status:"complete",processed:snapshotData.nodes.length,total:0});
                } else {
                    snapshotStatus=planetGraph.sourceStatus({sourceId:"snapshot",type:"snapshot",label:"Planet activity",status:"failed",reasonCode:"snapshot_unavailable",message:"The planet snapshot was not provided; the last successful snapshot remains available.",retryable:true});
                    warnings.push(snapshotStatus.message);
                }
            }
            let accountCatalog=[];let accountCatalogAvailable=true;
            try {accountCatalog=await listGmailConnectedAccounts(req.user.id);} catch {accountCatalogAvailable=false;}
            const sourceStatuses=[...walked.sourceStatuses];
            if(snapshotStatus)sourceStatuses.push(snapshotStatus);
            await planetGraph.updateGraphStatus(req.user.id,worldId,"indexing",{stage:"gmail",processed:walked.processedDirectories+walked.processedFiles,total:roots.length+accounts.length},warnings);
            if(sourceSelection.email)for(const source of accounts) {
                const indexed=await collectPlanetGmailSource({userId:req.user.id,source,sourceSelection,accountCatalog:accountCatalogAvailable?accountCatalog:[],existingGraph});
                nodes.push(...indexed.nodes);edges.push(...indexed.edges);sourceStatuses.push(indexed.status);warnings.push(...indexed.warnings);
            }
            const alerts=sourceSelection.alerts?require("./services/emailAlertSettingsService").getEmailAlertSettings(req.user.id,worldId):{};
            for(const provider of ["gmail","outlook"]) for(const [blockId,block] of Object.entries(alerts[provider]?.blocks||{})) {
                const selected=provider==="gmail"?accounts.some(item=>item.blockId===blockId):true;
                if(!selected)continue;
                for(const rule of (block.rules||[]).filter(item=>item.enabled)) nodes.push(planetGraph.node("alert",provider,`${blockId}:${rule.id}`,rule.label,{kind:"email-alert",provider,blockId,ruleId:rule.id},{query:rule.query.slice(0,240),color:rule.color}));
            }
            const retained=retainLastGoodGraphSources(existingGraph,nodes,edges,sourceStatuses,roots);
            limitReached=walked.limitReached;
            const currentAfterIndex=readWorldRecord(req.user.id,worldId);
            if(currentAfterIndex.world?.graphEnabled!==true) {await planetGraph.updateGraphStatus(req.user.id,worldId,"disabled",{stage:"stopped",processed:walked.processedDirectories+walked.processedFiles,total:roots.length},warnings);return;}
            const progress={stage:"complete",processed:walked.processedDirectories+walked.processedFiles,total:roots.length,limitReached};
            const linkedEdges=planetGraph.addWorldMembershipEdges(worldId,worldNode,retained.nodes,retained.edges);
            await planetGraph.replaceIndexedGraph(req.user.id,worldId,retained.nodes,linkedEdges,progress,{warnings,sourceStatuses});
        } catch(error) {
            const current=await planetGraph.readGraph(req.user.id,worldId);
            await planetGraph.writeGraph({...current,status:"error",sourceStatuses:planetGraph.failIndexingSources(current.sourceStatuses),progress:{...current.progress,stage:"error"},warnings:[...warnings,"Planet graph indexing stopped because an internal source could not be processed."].slice(0,30),updatedAt:new Date().toISOString()}).catch(()=>{});
        } finally {
            const latest=readWorldRecord(req.user.id,worldId);
            if(latest.world?.graphEnabled===true){
                const latestScope=await knowledgeScope({user:req.user},worldId).catch(()=>null);
                if(latestScope){await maintainKnowledgeWatcher(req.user,worldId,latestScope);queueKnowledgeSyncJob(req.user,worldId,latestScope);}
            }
        }
    }));
    if(!accepted)return res.status(202).json({message:"Graph indexing is already in progress.",status:"indexing"});
    res.status(202).json({message:"Graph indexing started.",status:"indexing"});
});

app.post("/worlds/:worldId/graph/activity",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    if(found.world.graphEnabled!==true)return res.status(409).json({message:"This planet graph is disabled."});
    try {
        const activity=req.body?.activity;
        if(activity?.worldId!==worldId)return res.status(400).json({message:"The activity does not belong to this planet."});
        const sourceSelection=obsidianVault.normalizeSourceSelection(found.world.obsidian?.sourceSelection);
        if(!sourceSelection.activity)return res.status(409).json({message:"Activity graph indexing is disabled in this planet's Obsidian source selection."});
        if(activity.destination){const safe=assertUserPath(req.user,activity.destination,{allowMissing:true});activity.destination=safe;}
        const graph=await planetGraph.upsertActivity(req.user.id,worldId,activity);
        res.status(202).json({accepted:["ready","partial","indexing"].includes(graph.status),updatedAt:graph.updatedAt});
    } catch(error) {if(respondGraphStorageUnavailable(res,error))return;res.status(400).json({message:error instanceof Error?error.message:"Unable to add the operation to this planet graph."});}
});

app.post("/worlds/:worldId/graph/snapshot",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    if(found.world.graphEnabled!==true)return res.status(409).json({message:"This planet graph is disabled."});
    try {
        const snapshot=req.body?.snapshot&&typeof req.body.snapshot==="object"?req.body.snapshot:{};
        const sourceSelection=obsidianVault.normalizeSourceSelection(found.world.obsidian?.sourceSelection);
        if(!sourceSelection.snapshots)return res.status(409).json({message:"Snapshot graph indexing is disabled in this planet's Obsidian source selection."});
        const items=planetGraph.snapshotGraphItems(snapshot);
        const graph=await planetGraph.replaceSnapshotGraphData(req.user.id,worldId,items.nodes,items.edges);
        res.status(202).json({accepted:true,status:graph.status,updatedAt:graph.updatedAt});
    } catch(error) {if(respondGraphStorageUnavailable(res,error))return;res.status(400).json({message:error instanceof Error?error.message:"Unable to update this planet graph."});}
});

app.get("/worlds/:worldId/email/conversations",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    try {
        const graph=await planetGraph.readGraph(req.user.id,worldId);
        const requested=typeof req.query.blockId==="string"?req.query.blockId:"";
        const activeAccount=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
        if(activeAccount?.provider==="outlook")return res.status(501).json({provider:"outlook",providerUnsupported:true,message:"Outlook messages are connected, but this FolderRocket build does not yet provide real Outlook conversation threads."});
        const selected=activeAccount?.provider==="gmail"?[{blockId:activeAccount.blockId}]:[];
        const requestedSource=requested?selected.find(item=>item.blockId===requested):null;
        if(requested&&!requestedSource)return res.status(403).json({message:"Choose a Gmail account selected for this planet."});
        const sender=typeof req.query.sender==="string"?req.query.sender.trim().toLowerCase():"";
        let senderQuery="";
        if(sender) {try {senderQuery=senderInboxQuery(sender);} catch {return res.status(400).json({message:"Sender email address is invalid."});}}
        if(sender&&!requestedSource)return res.status(400).json({message:"Select this planet’s Gmail account to load messages from a sender."});
        let threads=[];let nextPageToken="";
        const accounts=await listGmailConnectedAccounts(req.user.id);
        for(const source of requestedSource?[requestedSource]:selected) {
            if(!accounts.some(item=>item.blockId===source.blockId))continue;
            const listing=await listGmailInboxThreads({maxResults:sender?20:40,pageToken:requestedSource?String(req.query.pageToken||""):"",query:sender?senderQuery:"newer_than:30d"},req.user.id,source.blockId);
            const inboxItems=listing.threads.map(item=>({...item,blockId:source.blockId,accountEmail:accounts.find(account=>account.blockId===source.blockId)?.email||"",shared:false}));
            const saved=graph.selectedConversations.filter(item=>item.blockId===source.blockId);
            const senderScopedItems=sender?inboxItems.filter(item=>conversationContactIdentity(item.messages,item.accountEmail)===sender):inboxItems.filter(item=>matchesSavedConversationScope(item,source.blockId,saved));
            const byThread=new Map(senderScopedItems.map(item=>[item.id,item]));
            for(const reference of saved)if(!byThread.has(reference.threadId))byThread.set(reference.threadId,{id:reference.threadId,threadId:reference.threadId,blockId:source.blockId,subject:reference.subject||"(no subject)",snippet:"",updatedAt:reference.selectedAt||"",messageCount:0,messages:reference.sender?[{sender:reference.sender}]:[],accountEmail:accounts.find(account=>account.blockId===source.blockId)?.email||"",shared:false});
            threads.push(...byThread.values());
            if(requestedSource)nextPageToken=listing.nextPageToken||"";
        }
        const localKeys=new Set(threads.map(item=>`${item.blockId}:${item.id}`));
        const shared=sender?[]:graph.sharedThreads.filter(item=>!localKeys.has(`${item.blockId}:${item.threadId}`)).map(item=>({id:item.threadId,threadId:item.threadId,blockId:item.blockId,subject:item.subject||"Shared email conversation",snippet:"",updatedAt:item.sharedAt,messageCount:0,messages:[],accountEmail:item.accountEmail||"",shared:true,sourceWorldId:item.sourceWorldId,sourceWorldName:found.settings.worlds?.[item.sourceWorldId]?.name||item.sourceWorldId,available:accountsHasConnection(req.user.id,item.blockId)}));
        res.json({threads:[...threads,...shared].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))),nextPageToken,selectedBlockId:requestedSource?.blockId||selected[0]?.blockId||""});
    } catch(error) {
        const failure=classifyGmailConversationFailure(error);
        req.folderRocketBackendErrorName=failure.diagnosticType;
        res.status(failure.status).json({code:failure.code,message:"FolderRocket could not load Gmail conversations. Check the selected account connection and retry."});
    }
});

app.get("/worlds/:worldId/email/notifications",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const selected=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
    if(!selected)return res.json({count:0,supported:true,configured:false,accountId:"",threadIds:[]});
    if(selected.provider==="outlook")return res.status(501).json({code:"provider_unsupported",message:"Outlook inbox notifications are not available yet. Gmail notifications are supported for the selected account."});
    if(selected.provider!=="gmail")return res.status(400).json({code:"provider_invalid",message:"The email provider selected for this planet is not supported."});
    try {
        const accounts=await listGmailConnectedAccounts(req.user.id);
        if(!accounts.some(item=>item.blockId===selected.blockId))return res.status(409).json({code:"account_not_connected",message:"The Gmail account selected for this planet is no longer connected. Reconnect it in the planet settings."});
        const listing=await listGmailInboxThreads({maxResults:20},req.user.id,selected.blockId);
        const observation=await observeInboxThreads({
            recordMessages:conversationNotifications.recordMessages,
            scope:{userId:req.user.id,worldId,provider:"gmail",accountId:selected.blockId},
            threads:listing.threads,
            mode:"sync"
        });
        res.json({...observation,supported:true,configured:true,accountId:selected.blockId});
    } catch(error) {
        const providerStatus=Number(error?.status);
        const status=[401,403,429].includes(providerStatus)?providerStatus:502;
        const code=status===401||status===403?"provider_auth_required":status===429?"provider_rate_limited":"provider_unavailable";
        const message=status===401||status===403
            ? "Gmail access needs attention. Reconnect the selected account and approve its existing FolderRocket permissions."
            : status===429
                ? "Gmail is temporarily rate-limited. Try checking notifications again shortly."
                : "FolderRocket could not check Gmail notifications. Check the selected account connection and try again.";
        res.status(status).json({code,message});
    }
});

app.post("/worlds/:worldId/email/notifications/acknowledge",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const selected=worldEmailAccountService.resolveWorldEmailAccount(found.world,found.settings,worldId).selection;
    if(!selected)return res.json({count:0,supported:true,configured:false});
    if(selected.provider==="outlook")return res.status(501).json({code:"provider_unsupported",message:"Outlook notification acknowledgement is not available yet."});
    if(selected.provider!=="gmail")return res.status(400).json({code:"provider_invalid",message:"The email provider selected for this planet is not supported."});
    const threadIds=Array.isArray(req.body?.threadIds)?[...new Set(req.body.threadIds.filter(id=>typeof id==="string"&&id.length>0&&id.length<=300))].slice(0,100):[];
    if(!threadIds.length)return res.json({count:0,supported:true,configured:true});
    try {
        const accounts=await listGmailConnectedAccounts(req.user.id);
        if(!accounts.some(item=>item.blockId===selected.blockId))return res.status(409).json({code:"account_not_connected",message:"The Gmail account selected for this planet is no longer connected. Reconnect it in the planet settings."});
        let count=0;
        for(const threadId of threadIds) {
            const result=await conversationNotifications.acknowledgeMessages({userId:req.user.id,worldId,provider:"gmail",accountId:selected.blockId,threadId});
            count+=result.count;
        }
        res.json({count,supported:true,configured:true});
    } catch(error) {res.status(500).json({code:"notification_storage_error",message:"FolderRocket could not update its local notification checkpoint. Try again."});}
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
        const before=req.query.before===undefined?undefined:Number(req.query.before);
        const pageSize=req.query.limit===undefined?10:Number(req.query.limit);
        if(before!==undefined&&(!Number.isInteger(before)||before<0)||!Number.isInteger(pageSize)||pageSize<1||pageSize>20)return res.status(400).json({message:"Conversation message page is invalid."});
        const thread=await getGmailThreadPage(threadId,req.user.id,source.blockId,{before,maxResults:pageSize});
        res.json({...thread,blockId:source.blockId,accountEmail:accounts.find(item=>item.blockId===source.blockId)?.email||"",shared:source.shared,sourceWorldId:source.sourceWorldId});
    } catch(error) {
        const failure=classifyGmailConversationFailure(error);
        req.folderRocketBackendErrorName=failure.diagnosticType;
        res.status(failure.status).json({code:failure.code,message:"FolderRocket could not load this Gmail conversation. Check the selected account connection and retry."});
    }
});

function classifyGmailConversationFailure(error) {
    const providerStatus=Number(error?.status||error?.statusCode);
    const code=providerStatus===401||providerStatus===403
        ? "provider_auth_required"
        : providerStatus===429
            ? "provider_rate_limited"
            : "provider_unavailable";
    const status=code==="provider_auth_required"?502:code==="provider_rate_limited"?503:502;
    const errorCode=typeof error?.code==="string"&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:"";
    const errorName=typeof error?.name==="string"&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name)?error.name:"Error";
    return {code,status,diagnosticType:`Gmail:${errorCode||errorName}`};
}

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
            const replyResult=await require("./services/sentReplyGraphUpdate").recordSentReplyGraphUpdate({sent,threadId,updateGraph:async()=>{
                const messageNode=planetGraph.node("email-message","gmail",`${source.blockId}:${sent.id||crypto.randomUUID()}`,subject||"Sent reply",{kind:"gmail-message",blockId:source.blockId,messageId:sent.id||"",threadId},{at:new Date().toISOString()});
                const threadNode=planetGraph.node("email-thread","gmail",`${source.blockId}:${threadId}`,subject||"Email conversation",{kind:"gmail-thread",blockId:source.blockId,threadId});
                if(found.world.graphEnabled===true)await planetGraph.upsertGraphData(req.user.id,worldId,[threadNode,messageNode],[planetGraph.edge("contains",threadNode.id,messageNode.id,"gmail-reply")]);
            }});
            res.json(replyResult);
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
    } catch(error) {if(respondGraphStorageUnavailable(res,error))return;res.status(502).json({message:error instanceof Error?error.message:"Unable to share this conversation reference."});}
});

app.delete("/worlds/:worldId/email/conversations/:threadId/share",requireAuthenticated,async(req,res)=>{
    const worldId=String(req.params.worldId||"");const found=graphWorld(req,res,worldId);if(!found)return;
    const blockId=typeof req.query.blockId==="string"?req.query.blockId:"";const threadId=String(req.params.threadId||"");
    try {
        const graph=await planetGraph.readGraph(req.user.id,worldId);if(!graph.sharedThreads.some(item=>item.threadId===threadId&&item.blockId===blockId))return res.status(404).json({message:"This shared reference was not found in this planet."});
        await planetGraph.removeSharedThread(req.user.id,worldId,blockId,threadId);res.json({message:"Conversation reference removed from this planet."});
    } catch(error) {if(respondGraphStorageUnavailable(res,error))return;res.status(500).json({message:error instanceof Error?error.message:"Unable to remove this planet's conversation reference."});}
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
    if(req.user)disposeKnowledgeWatchersForUser(req.user.id);
    removeSession(getCookie(req, "folderrocket_session"));
    clearSessionCookie(res);
    res.json({message: "Signed out."});
});

app.get("/auth/me", (req, res) => {
    if (!req.user) return res.status(401).json({message: "Sign in required."});
    const settings=readDashboardPreferences(req.user.id)||{};
    for(const [worldId,world] of Object.entries(settings.worlds||{})){
        if(world?.graphEnabled!==true)continue;
        const scopeKey=knowledgeScopeKey(req.user.id,worldId);
        if(initializedKnowledgeScopes.has(scopeKey))continue;
        initializedKnowledgeScopes.add(scopeKey);
        void knowledgeScope(req,worldId).then(async scope=>{
            if(!scope){initializedKnowledgeScopes.delete(scopeKey);return;}
            await maintainKnowledgeWatcher(req.user,worldId,scope);
            if(scope.selection.folders&&scope.roots.length){scheduleSelectedFolderRefresh(req.user,worldId,scope);queueKnowledgeSyncJob(req.user,worldId,scope);}
        }).catch(()=>{initializedKnowledgeScopes.delete(scopeKey);});
    }
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

async function resolvedUserDesktopRoots() {
    const candidates=await resolveDesktopRoots();
    const roots=[];const seen=new Set();
    for(const candidate of candidates) {
        try {
            const real=await fs.promises.realpath(candidate);const stats=await fs.promises.stat(real);
            if(!stats.isDirectory())continue;
            const key=process.platform==="win32"?real.toLocaleLowerCase():real;
            if(!seen.has(key)){seen.add(key);roots.push(real);}
        } catch(error) { if(error?.code!=="ENOENT"&&error?.code!=="ENOTDIR"&&error?.code!=="EACCES"&&error?.code!=="EPERM")throw error; }
    }
    return roots;
}

async function assertTreeRequestPath(req,candidate,mode="computer") {
    if(mode!=="desktop")return assertUserPath(req.user,candidate);
    if(typeof candidate!=="string"||!candidate.trim())throw new Error("Choose a Desktop folder first.");
    const real=await fs.promises.realpath(path.resolve(candidate));
    const allowed=await resolvedUserDesktopRoots();
    if(!allowed.some(root=>isPathWithin(root,real)))throw new Error("This account can only browse folders inside the current Windows Desktop roots.");
    return real;
}

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
        let desktopRoots=[];
        if(mode==="desktop") {
            // Pass the known Windows locations through to the service so it
            // can return accessible roots plus explicit unavailable-root metadata.
            desktopRoots=await resolveDesktopRoots();
        }
        const roots = await listTreeRoots({workspacePath:userWorkspace(req.user), administrator:isAdmin(req.user), mode, desktopRoots});
        res.json(treeRootsResponse(roots,mode,worldId));
    } catch (error) {
        res.status(500).json({message: error instanceof Error ? error.message : "Unable to load folder roots."});
    }
});

app.post("/filesystem/tree-children", requireAuthenticated, async (req, res) => {
    try {
        const mode=req.body?.mode==="desktop"?"desktop":"computer";
        if(req.body?.worldId!==undefined&&!validWorldId(req.body.worldId))return res.status(400).json({message:"Invalid planet identifier."});
        let directory = await assertTreeRequestPath(req,req.body?.path,mode);
        if (mode!=="desktop"&&!isAdmin(req.user)) {
            const [workspaceRealPath, directoryRealPath] = await Promise.all([
                fs.promises.realpath(userWorkspace(req.user)),
                fs.promises.realpath(directory)
            ]);
            if (!isPathWithin(workspaceRealPath, directoryRealPath)) {
                return res.status(403).json({message: "This account can only use folders inside its private FolderRocket workspace."});
            }
            directory = directoryRealPath;
        }
        const folderOffset=Number.isInteger(req.body?.folderOffset)?Math.max(0,req.body.folderOffset):0;
        const fileOffset=Number.isInteger(req.body?.fileOffset)?Math.max(0,req.body.fileOffset):0;
        const contents = await listTreeDirectory(directory, {includeFiles: req.body?.includeFiles === true, includeFolderFileCounts: req.body?.includeFolderFileCounts === true, folderOffset, fileOffset});
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
        let desktopRoots=[];
        if(mode==="desktop") {
            desktopRoots=await resolveDesktopRoots();
        }
        const roots = await listTreeRoots({workspacePath:userWorkspace(req.user),administrator:isAdmin(req.user),mode,desktopRoots});
        const results = await searchTreeRoots(roots, query);
        res.json({...results,partial:roots.partial===true,unavailableRoots:roots.unavailableRoots||[]});
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
        const {messageId, attachmentId, partId, name, mimeType} = req.query;
        if (typeof messageId !== "string" || typeof name !== "string" || (typeof attachmentId !== "string" && typeof partId !== "string") || (typeof attachmentId === "string" && typeof partId === "string")) {
            return res.status(400).json({message: "Identificativo allegato Gmail mancante"});
        }
        const inlinePart=typeof partId==="string"?await downloadInlinePart(messageId,partId,req.user.id,readAlertBlockId(req)):null;
        const content=inlinePart?.content||await downloadAttachment(messageId,attachmentId,req.user.id,readAlertBlockId(req));
        const contentType=inlinePart?.mimeType||(typeof mimeType === "string" ? mimeType : "application/octet-stream");
        const fileName=path.basename(inlinePart?.name||name).replaceAll('"', "");
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `${req.query.inline === "true" ? "inline" : "attachment"}; filename="${fileName}"`);
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
server.on("close",()=>{for(const entry of knowledgeWatchersByScope.values())entry.watcher.dispose();knowledgeWatchersByScope.clear();});
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
