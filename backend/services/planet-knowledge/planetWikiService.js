const path = require("node:path");

const LIMITS = Object.freeze({
    maxFiles: 250,
    maxFileBytes: 2 * 1024 * 1024,
    maxExtractedTextBytes: 25 * 1024 * 1024,
    maxIndexedFiles: 3000,
    maxDirectories: 400,
    maxDepth: 8
});
const READABLE_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".xlsx", ".md"]);

function safePreviewFailureCode(error) {
    const code = String(error?.code || "");
    const filesystemCodes = { EACCES: "permission_denied", EPERM: "permission_denied", ENOENT: "source_unavailable", ENOTDIR: "invalid_source", ELOOP: "unsafe_symlink" };
    if (filesystemCodes[code]) return filesystemCodes[code];
    const message = String(error?.message || "").toLocaleLowerCase();
    if (message.includes("private folderrocket workspace") || message.includes("inside its private")) return "workspace_validation_failed";
    if (message.includes("symbolic link")) return "unsafe_symlink";
    if (message.includes("permission") || message.includes("access")) return "permission_denied";
    if (message.includes("does not exist") || message.includes("unavailable")) return "source_unavailable";
    if (message.includes("folder") || message.includes("directory") || message.includes("path")) return "invalid_source";
    if (error?.name === "TypeError" || error?.name === "RangeError") return "preview_data_invalid";
    return "preview_scan_failed";
}

function buildPreview({ worldId, roots = [], selection, walked, maxNodes }) {
    const files = (Array.isArray(walked?.nodes) ? walked.nodes : []).filter(item => item?.type === "file");
    const excludedIds = new Set(Array.isArray(selection?.excludedFileIds) ? selection.excludedFileIds : []);
    const explicitlyExcluded = files.filter(item => item?.sourceRef?.path && excludedIds.has(item.id));
    const selected = files.filter(item => item?.sourceRef?.path && !excludedIds.has(item.id));
    const excludedFiles = explicitlyExcluded.slice(0, 50).map(item => ({ id: String(item.id), name: String(item.label || path.basename(item.sourceRef.path)), path: item.sourceRef.path, reason: "Excluded by the user from this planet's wiki." }));
    const unsupportedFiles = [];
    let supportedCount = 0, unsupportedCount = 0, oversizedCount = 0, totalBytes = 0;
    for (const item of selected) {
        const extension = String(item.details?.extension || path.extname(item.sourceRef.path)).toLowerCase();
        if (READABLE_EXTENSIONS.has(extension)) {
            supportedCount += 1;
            totalBytes += Math.max(0, Number(item.details?.size) || 0);
            if ((Number(item.details?.size) || 0) > LIMITS.maxFileBytes) oversizedCount += 1;
        } else { unsupportedCount += 1; if (unsupportedFiles.length < 50) unsupportedFiles.push({ id: String(item.id), name: String(item.label || path.basename(item.sourceRef.path)), path: item.sourceRef.path, extension }); }
    }
    const statuses = Array.isArray(walked?.sourceStatuses) ? walked.sourceStatuses : [];
    const blockers = [];
    const add = (code, count, message) => { if (count > 0) blockers.push({ code, count, message }); };
    const configuredRootIds = new Set(roots.map(item => String(item?.id || "")));
    const missingSelectedRoots = selection?.folderMode === "selected" ? (Array.isArray(selection.folderIds) ? selection.folderIds : []).filter(id => !configuredRootIds.has(String(id))) : [];
    const foldersDisabled = selection?.folders === false;
    const selectedRootsUnavailable = selection?.folderMode === "selected" && roots.length === 0;
    add("folders_disabled", foldersDisabled ? 1 : 0, "Enable folder sources for this planet before creating or rebuilding its wiki.");
    add("no_selected_roots", selectedRootsUnavailable ? 1 : 0, "Select at least one configured folder for this planet's wiki.");
    add("no_supported_files", supportedCount === 0 && !foldersDisabled ? 1 : 0, "The selected folders contain no supported files for the wiki; choose folders with supported files.");
    add("knowledge_file_limit", Math.max(0, supportedCount - LIMITS.maxFiles), `The selected scope contains more than ${LIMITS.maxFiles} supported files.`);
    add("file_size_limit", oversizedCount, `Some supported files exceed the ${LIMITS.maxFileBytes} byte per-file limit.`);
    add("estimated_text_bytes_limit", totalBytes > LIMITS.maxExtractedTextBytes ? 1 : 0, `The selected files exceed the ${LIMITS.maxExtractedTextBytes} byte estimated input budget; narrow the selected folders.`);
    add("indexed_file_limit", statuses.some(item => item.reasonCode === "file_limit") ? 1 : 0, `The metadata scan reached the ${LIMITS.maxIndexedFiles} file walk limit; narrow the selected folders.`);
    add("directory_limit", statuses.some(item => item.reasonCode === "directory_limit") ? 1 : 0, `The metadata scan reached the ${LIMITS.maxDirectories} directory limit; narrow the selected folders.`);
    add("depth_limit", statuses.some(item => item.reasonCode === "depth_limit") ? 1 : 0, `The metadata scan reached the depth ${LIMITS.maxDepth} limit; narrow the selected folders.`);
    add("graph_node_limit", statuses.some(item => item.reasonCode === "node_limit") ? 1 : 0, "The metadata scan reached the Planet Graph node limit; narrow the selected folders.");
    const failedRoots = statuses.filter(item => item.status !== "complete");
    add("source_incomplete", failedRoots.length, "One or more selected folder roots could not be scanned completely.");
    add("selected_root_missing", missingSelectedRoots.length, "One or more selected folder roots are no longer configured for this planet.");
    if (selection?.folders && roots.length && failedRoots.length === roots.length && !files.length) {
        const reasonCodes = [...new Set(failedRoots.map(item => String(item.reasonCode || "")).filter(value => /^[a-z_]{1,40}$/u.test(value)))].slice(0, 5);
        blockers.push({ code: "source_unavailable", count: failedRoots.length, ...(reasonCodes.length ? { reasonCodes } : {}), message: "The selected folder roots are unavailable or unreadable." });
    }
    const candidateCount = supportedCount + unsupportedCount;
    const unavailable = foldersDisabled || selectedRootsUnavailable || blockers.some(item => item.code === "source_unavailable") || Boolean(selection?.folders && selection?.folderMode === "selected" && selection.folderIds?.length && missingSelectedRoots.length === selection.folderIds.length && !roots.length);
    const readiness = unavailable ? "unavailable" : blockers.length ? "requires-narrowing" : "ready";
    return { worldId, readiness, candidateCount, supportedCount, unsupportedCount, excludedCount: explicitlyExcluded.length, excludedFiles, unsupportedFiles, oversizedCount, totalBytes, limits: LIMITS, blockers };
}

function pageSummary(note) {
    const source = note?.source && typeof note.source === "object" ? note.source : {};
    const markdown = String(note?.markdown || note?.content || "");
    const refs = [...new Set([source.id, source.sourceId, note?.sourceId, ...(Array.isArray(source.sourceIds) ? source.sourceIds : [])].filter(value => typeof value === "string" && value))];
    const summaryMatch = markdown.match(/\n(?:>\s*)?([^\n#][^\n]{30,220})/u);
    const rawKind = String(note?.kind || source.kind || inferKind(markdown));
    const provenance = note?.provenance || source.provenance || (rawKind === "knowledge-topic" ? { method: "local-lexical-topic", confidence: "uncertain-lexical-grouping", interpretation: "A repeated term groups sources lexically; it does not establish a verified semantic topic." } : null);
    return {
        id: String(note?.id || ""), title: String(note?.title || "Untitled page"),
        kind: normalizeKind(rawKind), sourceCount: refs.length,
        updatedAt: String(note?.updatedAt || ""), ...(summaryMatch ? { summary: summaryMatch[1].trim() } : {}),
        ...(provenance ? { provenance } : {})
    };
}
function normalizeKind(kind) {
    if (kind === "knowledge-area") return "area";
    if (kind === "knowledge-topic") return "topic";
    if (["knowledge-project", "knowledge-procedure", "knowledge-entity"].includes(kind)) return "label";
    if (["knowledge-document", "graph-source", "graph-source-page"].includes(kind)) return "source";
    if (kind === "graph-source-index") return "home";
    return kind;
}
function inferKind(markdown) {
    const type = markdown.match(/^knowledge_type:\s*([\w-]+)/mu)?.[1];
    return type || "knowledge-note";
}
function listPages(notes, { query = "", kind = "", cursor = "", limit = 50 } = {}) {
    const safeLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 50));
    const normalizedQuery = String(query).trim().toLocaleLowerCase();
    const pages = (Array.isArray(notes) ? notes : []).map(pageSummary)
        .filter(item => item.id && (!kind || item.kind === kind))
        .filter(item => !normalizedQuery || `${item.title} ${item.summary || ""} ${item.kind}`.toLocaleLowerCase().includes(normalizedQuery))
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
    const cursorIndex = cursor ? pages.findIndex(item => item.id === cursor) + 1 : 0;
    const start = Math.max(0, cursorIndex);
    const selected = pages.slice(start, start + safeLimit);
    return { total: pages.length, pageSize: selected.length, nextCursor: start + safeLimit < pages.length ? selected.at(-1)?.id || "" : "", pages: selected };
}
function resolvePage(notes, pageId, sourceMetadata = {}) {
    const note = (Array.isArray(notes) ? notes : []).find(item => item && item.id === pageId);
    if (!note) return null;
    const source = note.source && typeof note.source === "object" ? note.source : {};
    const sourceRefs = [...new Set([source.id, source.sourceId, note.sourceId, ...(Array.isArray(source.sourceIds) ? source.sourceIds : [])].filter(value => typeof value === "string" && value))]
        .map(id => {const descriptor=sourceMetadata?.[id]?.descriptor||{};return { id, path: String(descriptor.locator || source.path || source.locator || ""), updatedAt: String(descriptor.updatedAt || source.updatedAt || note.updatedAt || "") };});
    const markdown = String(note.markdown || note.content || "");
    const linkIds = [...markdown.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/gu)].map(match => match[1].trim());
    const byTarget = new Map((Array.isArray(notes) ? notes : []).map(item => [String(item.noteTarget || item.title || item.id), item]));
    const links = linkIds.map(id => byTarget.get(id)).filter(Boolean).map(item => ({ id: String(item.id), title: String(item.title || item.id), kind: pageSummary(item).kind }));
    return { id: String(note.id), title: String(note.title || "Untitled page"), kind: pageSummary(note).kind, updatedAt: String(note.updatedAt || ""), markdown, sourceRefs, links };
}

module.exports = { LIMITS, READABLE_EXTENSIONS, safePreviewFailureCode, buildPreview, listPages, resolvePage };
