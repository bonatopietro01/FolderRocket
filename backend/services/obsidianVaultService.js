const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_NOTES = 2_000;
const MANIFEST_NAME = "manifest.json";
const META_DIRECTORY = ".folderrocket";
const GENERATED_DIRECTORY = "FolderRocket";
const SOURCE_SELECTION_VERSION = 2;
const SOURCE_KEYS = ["folders", "email", "alerts", "activity", "snapshots", "clientNotes", "attachments"];
const GRAPH_FILE_TYPES = [".pdf", ".doc", ".docx", ".rtf", ".txt", ".md", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3", ".mp4", ".mov", ".avi", ".mkv"];

function normalizeSourceSelection(value, fallback) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const previous = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
    const version = Number.isInteger(source.version) && source.version > 0 ? source.version : SOURCE_SELECTION_VERSION;
    const result = {version:SOURCE_SELECTION_VERSION};
    for (const key of SOURCE_KEYS) {
        const candidate = Object.hasOwn(source, key) ? source[key] : previous[key];
        result[key] = typeof candidate === "boolean" ? candidate : true;
    }
    const threadMode = Object.hasOwn(source, "threadMode") ? source.threadMode : previous.threadMode;
    result.threadMode = threadMode === "selected" ? "selected" : "all";
    const ids = Array.isArray(source.threadIds) ? source.threadIds : Array.isArray(previous.threadIds) ? previous.threadIds : [];
    result.threadIds = [...new Set(ids.filter(item => typeof item === "string" && item.length > 0 && item.length <= 300))].slice(0, 500);
    const legacy = version < 2;
    const folderMode = Object.hasOwn(source, "folderMode") ? source.folderMode : previous.folderMode;
    result.folderMode = folderMode === "selected" ? "selected" : "all";
    const folderIds = Array.isArray(source.folderIds) ? source.folderIds : Array.isArray(previous.folderIds) ? previous.folderIds : [];
    result.folderIds = [...new Set(folderIds.filter(item => typeof item === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(item)))].slice(0, 200);
    const fileTypeMode = Object.hasOwn(source, "fileTypeMode") ? source.fileTypeMode : previous.fileTypeMode;
    result.fileTypeMode = fileTypeMode === "selected" ? "selected" : "all";
    const fileTypes = Array.isArray(source.fileTypes) ? source.fileTypes : Array.isArray(previous.fileTypes) ? previous.fileTypes : [];
    result.fileTypes = [...new Set(fileTypes.filter(item => typeof item === "string" && GRAPH_FILE_TYPES.includes(item.toLowerCase())).map(item => item.toLowerCase()))].slice(0, GRAPH_FILE_TYPES.length);
    const excludedFileIds = Array.isArray(source.excludedFileIds) ? source.excludedFileIds : Array.isArray(previous.excludedFileIds) ? previous.excludedFileIds : [];
    result.excludedFileIds = [...new Set(excludedFileIds.filter(item => typeof item === "string" && /^file:[a-f0-9]{32}$/.test(item)))].slice(0, 500);
    result.includeSubfolders = Object.hasOwn(source, "includeSubfolders") ? source.includeSubfolders !== false : Object.hasOwn(previous, "includeSubfolders") ? previous.includeSubfolders !== false : true;
    // Version 1 stored only a boolean category; preserving its meaning means indexing all configured roots and file types.
    if (legacy) { result.folderMode = "all"; result.fileTypeMode = "all"; result.includeSubfolders = true; }
    return result;
}

function sourceCategory(kind) {
    if (["folder", "file"].includes(kind)) return "folders";
    if (kind.startsWith("email-") || ["email-thread", "email-message", "email-conversation"].includes(kind)) return "email";
    if (kind === "alert" || kind === "email-alert") return "alerts";
    if (["activity", "search", "operation", "file-studio-operation", "file-studio"].includes(kind)) return "activity";
    if (["snapshot", "calendar-event", "reminder"].includes(kind)) return "snapshots";
    if (["downloaded-attachment", "attachment"].includes(kind)) return "attachments";
    if (["overview", "relation", "graph-source", "graph-source-page", "graph-source-index"].includes(kind)) return "always";
    return "clientNotes";
}

function filterRecordsBySources(records, sourceSelection) {
    const selection = normalizeSourceSelection(sourceSelection);
    return (Array.isArray(records) ? records : []).filter(record => {
        const category = sourceCategory(String(record?.kind || ""));
        return category === "always" || selection[category] !== false;
    });
}

function pathIsWithin(rootPath, candidatePath) {
    if (typeof rootPath !== "string" || typeof candidatePath !== "string" || !rootPath || !candidatePath) return false;
    const path = require("node:path");
    const root = path.resolve(rootPath);
    const candidate = path.resolve(candidatePath);
    const normalize = value => process.platform === "win32" ? value.toLocaleLowerCase() : value;
    const relative = normalize(path.relative(root, candidate));
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function filterGraphBySources(graph, sourceSelection, {emailBlockIds,folderRoots} = {}) {
    const selection = normalizeSourceSelection(sourceSelection);
    const allowedEmailBlocks = Array.isArray(emailBlockIds) ? new Set(emailBlockIds.filter(item => typeof item === "string" && item)) : null;
    const selectedRoots = Array.isArray(folderRoots) ? folderRoots.filter(item => item && typeof item.path === "string" && item.path) : [];
    const selectedRootMode = selection.folderMode === "selected";
    const hasRootScope = Array.isArray(folderRoots);
    const allowedFileTypes = new Set(selection.fileTypes);
    const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).filter(item => {
        const emailNode = item?.sourceType === "gmail" || item?.sourceType === "gmail-contact" || item?.sourceRef?.kind === "email-address";
        if (emailNode) {
            if (selection.email === false) return false;
            if (allowedEmailBlocks && item?.type !== "person" && !allowedEmailBlocks.has(item?.sourceRef?.blockId) && item?.details?.shared !== true && !item?.sourceRef?.sourceWorldId) return false;
            const threadId = item?.sourceRef?.threadId;
            return selection.threadMode !== "selected" || !threadId || item?.sourceType === "gmail-contact" || selection.threadIds.includes(threadId);
        }
        const category = sourceCategory(String(item?.type || ""));
        if (category === "folders") {
            if (selection.folders === false) return false;
            const nodePath = typeof item?.sourceRef?.path === "string" ? item.sourceRef.path : "";
            if (!nodePath) return !selectedRootMode && !hasRootScope;
            if (hasRootScope && !selectedRoots.some(root => pathIsWithin(root.path, nodePath))) return false;
            if (item.type === "folder" && selection.includeSubfolders === false && hasRootScope && !selectedRoots.some(root => pathIsWithin(root.path, nodePath) && pathIsWithin(nodePath, root.path))) return false;
            if (item.type === "file") {
                if (selection.fileTypeMode === "selected" && !allowedFileTypes.has(String(item.details?.extension || require("node:path").extname(nodePath)).toLowerCase())) return false;
                if (selection.includeSubfolders === false && hasRootScope && !selectedRoots.some(root => pathIsWithin(root.path, require("node:path").dirname(nodePath)) && pathIsWithin(require("node:path").dirname(nodePath), root.path))) return false;
            }
        }
        return category === "always" || selection[category] !== false;
    });
    if (selection.email && (selection.threadMode === "selected" || allowedEmailBlocks)) {
        const messageIds = new Set(nodes.filter(item => item.type === "email-message").map(item => item.id));
        const contactIds = new Set((Array.isArray(graph?.edges) ? graph.edges : []).filter(edge => edge?.provenance === "gmail-header" && messageIds.has(edge.to)).map(edge => edge.from));
        for (let index = nodes.length - 1; index >= 0; index--) {
            if ((nodes[index].sourceType === "gmail-contact" || nodes[index].type === "person") && !contactIds.has(nodes[index].id)) nodes.splice(index, 1);
        }
    }
    const nodeIds = new Set(nodes.map(item => item.id));
    const edges = (Array.isArray(graph?.edges) ? graph.edges : []).filter(item => nodeIds.has(item?.from) && nodeIds.has(item?.to));
    return {...graph, nodes, edges};
}

function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function safeSlug(value) {
    const result = String(value || "note").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    return result || "note";
}
function safeText(value, max = 12_000) { return String(value ?? "").replace(/\u0000/g, "").slice(0, max); }
function yamlString(value) { return JSON.stringify(safeText(value, 600)); }
function stableFilename(record) { return record.kind === "overview" ? "README.md" : `${safeSlug(record.title)}-${hash(record.id).slice(0, 12)}.md`; }

function safeNotePath(record) {
    const supplied = typeof record?.notePath === "string" ? record.notePath.replace(/\\/g, "/") : "";
    const candidate = supplied || (record?.kind === "overview" ? `${GENERATED_DIRECTORY}/README.md` : `${GENERATED_DIRECTORY}/Entities/${stableFilename(record)}`);
    const parts = candidate.split("/");
    const allowedPath = candidate === `${GENERATED_DIRECTORY}/README.md` || parts.length >= 3 && ["Entities", "Sources", "Knowledge"].includes(parts[1]);
    if (!allowedPath || parts[0] !== GENERATED_DIRECTORY || parts.some(part => !part || part === "." || part === "..") || !candidate.toLowerCase().endsWith(".md")) {
        return record?.kind === "overview" ? `${GENERATED_DIRECTORY}/README.md` : `${GENERATED_DIRECTORY}/Entities/${stableFilename(record)}`;
    }
    return parts.join("/");
}

function safeManagedNotePath(value) {
    if (typeof value !== "string") return "";
    const candidate = value.replace(/\\/g, "/");
    const parts = candidate.split("/");
    const allowedPath = parts.length >= 3 && ["Entities", "Sources", "Knowledge"].includes(parts[1]);
    if (!allowedPath || parts[0] !== GENERATED_DIRECTORY || parts.some(part => !part || part === "." || part === "..") || !candidate.toLowerCase().endsWith(".md") || parts[1].toLowerCase() === "conflicts") return "";
    return parts.join("/");
}

function isGraphManagedRecordId(value) {
    return typeof value === "string" && (value.startsWith("graph:") || value.startsWith("graph-source:") || value.startsWith("graph-source-page:") || value.startsWith("graph-source-index:") || value.startsWith("knowledge:"));
}

function wikiLink(record) {
    const pathWithoutExtension = safeNotePath(record).replace(/\.md$/i, "");
    const alias = safeText(record.title || record.kind || "Note", 160).replace(/[\r\n\[\]|]/g, " ").trim() || "Note";
    return `[[${pathWithoutExtension}|${alias}]]`;
}

function stripMissingGeneratedNoteLinks(content, records) {
    const available = new Set(records.map(record => safeNotePath(record).replace(/\.md$/i, "").toLocaleLowerCase()));
    return String(content || "").replace(/\[\[(FolderRocket\/(?:Entities|Sources)\/[^\]|#]+)(?:\|[^\]]*)?\]\]/g, (match, target) => available.has(target.toLocaleLowerCase()) ? match : "");
}

function noteIndexPages({records, idPrefix, titlePrefix, scopeId, sourceId, worldName, folder}) {
    const pages = [];
    for (let offset = 0; offset < records.length; offset += 30) {
        const pageNumber = Math.floor(offset / 30) + 1;
        const chunk = records.slice(offset, offset + 30);
        pages.push({
            id:`${idPrefix}:${pageNumber}`,
            kind:"graph-source-page",
            title:`${titlePrefix} · ${pageNumber}`,
            sourceId,
            sourceScopeId:scopeId,
            updatedAt:"",
            notePath:`${GENERATED_DIRECTORY}/Sources/${folder}-${pageNumber}.md`,
            content:`Planet: ${safeText(worldName || "FolderRocket", 120)}\n\n${chunk.map(wikiLink).join("\n")}`
        });
    }
    return pages;
}

function toMarkdown(record, worldId) {
    const properties = [
        "---",
        `folderrocketId: ${yamlString(record.id)}`,
        `kind: ${yamlString(record.kind)}`,
        `worldId: ${yamlString(worldId)}`,
        `sourceId: ${yamlString(record.sourceId || record.id)}`,
        `updatedAt: ${yamlString(record.updatedAt || "unknown")}`,
        "---",
        "",
        `# ${safeText(record.title || "Untitled", 300).replace(/[\r\n]+/g, " ")}`,
        "",
        safeText(record.content || "", 12_000).trim(),
        ""
    ];
    return properties.join("\n");
}

function normalizeRecords(records) {
    return normalizeRecordBatch(records).records;
}

function normalizeRecordBatch(records) {
    const output = [];
    const seen = new Set();
    let omitted = 0;
    for (const record of Array.isArray(records) ? records : []) {
        if (!record || typeof record.id !== "string" || !record.id || typeof record.kind !== "string") continue;
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        if (output.length >= MAX_NOTES) { omitted += 1; continue; }
        output.push({id:record.id.slice(0, 300), kind:record.kind.slice(0, 80), sourceId:String(record.sourceId || record.id).slice(0, 300), sourceScopeId:typeof record.sourceScopeId === "string" ? record.sourceScopeId.slice(0, 300) : "", title:String(record.title || record.kind).slice(0, 300), content:safeText(record.content || ""), updatedAt:typeof record.updatedAt === "string" ? record.updatedAt : "", notePath:safeNotePath(record)});
    }
    return {records:output,omitted};
}

async function readJson(filePath, fallback) {
    try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
    catch (error) { if (error?.code === "ENOENT" || error instanceof SyntaxError) return fallback; throw error; }
}

async function atomicWrite(filePath, data, {vaultPath}={}) {
    if(!vaultPath)throw new Error("A FolderRocket vault root is required for managed writes.");
    await ensureVaultPath(vaultPath,filePath,{createParents:true,targetType:"file"});
    const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    try {
        await fs.writeFile(temporary, data, {encoding:"utf8", mode:0o600, flag:"wx"});
        await ensureVaultPath(vaultPath,filePath,{createParents:false,targetType:"file"});
        await fs.rename(temporary, filePath);
        await ensureVaultPath(vaultPath,filePath,{createParents:false,targetType:"file"});
    } catch (error) {
        try { await ensureVaultPath(vaultPath,temporary,{createParents:false,targetType:"file"}); await fs.rm(temporary,{force:true}); } catch {}
        throw error;
    }
}

async function ensureVaultRoot(vaultPath,{create=false}={}) {
    const root=path.resolve(vaultPath);
    let stats;
    try{stats=await fs.lstat(root);}
    catch(error){if(error?.code!=="ENOENT"||!create)throw error;await fs.mkdir(root,{recursive:true,mode:0o700});stats=await fs.lstat(root);}
    if(stats.isSymbolicLink()||!stats.isDirectory())throw new Error("The Obsidian vault root must be a real directory.");
    return {root,realRoot:await fs.realpath(root)};
}

async function ensureVaultPath(vaultPath,targetPath,{createParents=false,targetType="file"}={}) {
    const {root,realRoot}=await ensureVaultRoot(vaultPath);
    const target=path.resolve(targetPath),relative=path.relative(root,target);
    if(!relative||relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error("Managed Obsidian path is outside its vault.");
    const parts=relative.split(path.sep),directories=targetType==="directory"?parts:parts.slice(0,-1);
    let current=root;
    for(const part of directories){
        current=path.join(current,part);
        let stats;
        try{stats=await fs.lstat(current);}
        catch(error){if(error?.code!=="ENOENT")throw error;if(!createParents&&targetType!=="directory")return target;await fs.mkdir(current,{mode:0o700});stats=await fs.lstat(current);}
        if(stats.isSymbolicLink()||!stats.isDirectory())throw new Error("A managed Obsidian directory is a symlink or is not a directory.");
        const real=await fs.realpath(current);
        const within=path.relative(realRoot,real);
        if(within===".."||within.startsWith(`..${path.sep}`)||path.isAbsolute(within))throw new Error("Managed Obsidian directory resolves outside its vault.");
    }
    if(targetType==="directory")return target;
    try{
        const stats=await fs.lstat(target);
        if(stats.isSymbolicLink()||!stats.isFile())throw new Error("A managed Obsidian note is not a regular file.");
        const real=await fs.realpath(target),within=path.relative(realRoot,real);
        if(within===".."||within.startsWith(`..${path.sep}`)||path.isAbsolute(within))throw new Error("Managed Obsidian file resolves outside its vault.");
    }catch(error){if(error?.code!=="ENOENT")throw error;}
    return target;
}

async function initializeVault(vaultPath, {worldId, ownerId, worldName}) {
    await ensureVaultRoot(vaultPath,{create:true});
    const markerPath = path.join(vaultPath, META_DIRECTORY, "vault.json");
    await ensureVaultPath(vaultPath,markerPath,{createParents:true,targetType:"file"});
    const marker = await readJson(markerPath, null);
    if (marker && (marker.worldId !== worldId || marker.ownerId !== String(ownerId))) throw new Error("This folder is already assigned to another FolderRocket user or planet.");
    await atomicWrite(markerPath, JSON.stringify({version:1,ownerId:String(ownerId),worldId,worldName:safeText(worldName || worldId,80),createdAt:marker?.createdAt || new Date().toISOString()}, null, 2),{vaultPath});
}

async function syncVaultUnlocked({vaultPath, worldId, ownerId, worldName, records, completeSelection = false, selectedSourceScopeIds}) {
    const normalized = normalizeRecordBatch(records);
    const safeRecords = normalized.records;
    await initializeVault(vaultPath, {worldId,ownerId,worldName});
    const metadataPath = path.join(vaultPath, META_DIRECTORY, MANIFEST_NAME);
    await ensureVaultPath(vaultPath,metadataPath,{createParents:true,targetType:"file"});
    const manifest = await readJson(metadataPath, {version:1,ownerId:String(ownerId),worldId,files:{}});
    if (manifest.ownerId !== String(ownerId) || manifest.worldId !== worldId) throw new Error("The FolderRocket vault manifest belongs to another user or planet.");
    manifest.files = manifest.files && typeof manifest.files === "object" && !Array.isArray(manifest.files) ? manifest.files : {};
    const outputDirectory = path.join(vaultPath, GENERATED_DIRECTORY);
    await ensureVaultPath(vaultPath,outputDirectory,{createParents:true,targetType:"directory"});
    let written = 0, unchanged = 0, conflicts = 0, pruned = 0, prunedFromDeselected = 0, retainedEdited = 0;
    for (const record of safeRecords) {
        const relativePath = safeNotePath(record);
        const filePath = path.join(vaultPath, ...relativePath.split("/"));
        await ensureVaultPath(vaultPath,filePath,{createParents:true,targetType:"file"});
        let syncRecord = record;
        if (record.kind === "overview") {
            const sourceHubs = safeRecords.filter(item => item.kind === "graph-source-index");
            const rootLinks = sourceHubs.length ? sourceHubs : safeRecords.filter(item => item.kind === "graph-source");
            if (rootLinks.length) syncRecord = {...record, content:`${record.content || ""}\n\n## Sources\n\n${rootLinks.map(wikiLink).join("\n")}`};
        }
        syncRecord = {...syncRecord, content:stripMissingGeneratedNoteLinks(syncRecord.content, safeRecords)};
        const contents = toMarkdown(syncRecord, worldId);
        const contentHash = hash(contents);
        const previous = manifest.files[record.id] || {};
        let existing = "";
        try { existing = await fs.readFile(filePath, "utf8"); }
        catch (error) { if (error?.code !== "ENOENT") throw error; }
        if (existing && (!previous.generatedHash || hash(existing) !== previous.generatedHash)) {
            conflicts += 1;
            const conflictHash = hash(contents).slice(0, 12);
            const conflictDirectory = path.join(vaultPath, GENERATED_DIRECTORY, "conflicts");
            const conflictPath = path.join(conflictDirectory, `${path.basename(relativePath, ".md")}-${conflictHash}.md`);
            await ensureVaultPath(vaultPath,conflictPath,{createParents:true,targetType:"file"});
            const conflictRelative=path.relative(vaultPath, conflictPath).replace(/\\/g, "/");
            if (!previous.conflicts?.includes(conflictRelative)) {
                try { await fs.writeFile(conflictPath, contents, {encoding:"utf8", mode:0o600, flag:"wx"}); await ensureVaultPath(vaultPath,conflictPath,{createParents:false,targetType:"file"}); } catch (error) { if (error?.code !== "EEXIST") throw error; }
                previous.conflicts = [...(previous.conflicts || []), conflictRelative];
            }
            previous.lastSyncAt = new Date().toISOString();
            previous.pendingHash = contentHash;
            manifest.files[record.id]={...previous,kind:record.kind,path:relativePath,sourceScopeId:record.sourceScopeId,conflicts:previous.conflicts?.includes(conflictRelative)?previous.conflicts:[...(previous.conflicts||[]),conflictRelative],lastSyncAt:previous.lastSyncAt,pendingHash:contentHash};
            continue;
        }
        if (existing && hash(existing) === contentHash) unchanged += 1;
        else { await atomicWrite(filePath, contents,{vaultPath}); written += 1; }
        manifest.files[record.id] = {...previous, kind:record.kind,path:relativePath,sourceScopeId:record.sourceScopeId,generatedHash:contentHash,lastSyncAt:new Date().toISOString(),pendingHash:""};
    }
    const currentRecordIds = new Set(safeRecords.map(record => record.id));
    const hasSelectedScopeSnapshot = Array.isArray(selectedSourceScopeIds);
    const selectedScopes = new Set(hasSelectedScopeSnapshot ? selectedSourceScopeIds.filter(item => typeof item === "string" && item.length > 0 && item.length <= 300) : []);
    let legacyUnscopedRetained = 0, retainedConflicts = 0;
    if (completeSelection === true && hasSelectedScopeSnapshot && normalized.omitted === 0) {
        for (const [recordId, entry] of Object.entries(manifest.files)) {
            const graphRecord = isGraphManagedRecordId(recordId) || recordId.startsWith("email:");
            const clientRecord = recordId.startsWith("client:");
            if (!graphRecord && !clientRecord) continue;
            if (entry?.retainedAsManual === true) continue;
            if (typeof entry?.sourceScopeId !== "string" || !entry.sourceScopeId) { legacyUnscopedRetained += 1; continue; }
            if (currentRecordIds.has(recordId)) continue;
            if (clientRecord && (!entry.sourceScopeId.startsWith("client-category:") || selectedScopes.has(entry.sourceScopeId) || entry.sourceScopeId === "client-category:attachments")) continue;
            if (graphRecord && !/^(filesystem:|gmail:|snapshot:|alerts:|folderrocket:|knowledge:)/.test(entry.sourceScopeId)) continue;
            const relativePath = safeManagedNotePath(entry.path);
            if (!relativePath || typeof entry.generatedHash !== "string" || !entry.generatedHash) continue;
            if (entry.conflicts?.length) { retainedConflicts += 1; continue; }
            const filePath = path.join(vaultPath, ...relativePath.split("/"));
            await ensureVaultPath(vaultPath,filePath,{createParents:false,targetType:"file"});
            let stats;
            try { stats = await fs.lstat(filePath); }
            catch (error) {
                if (error?.code === "ENOENT") { delete manifest.files[recordId]; continue; }
                throw error;
            }
            if (!stats.isFile() || stats.isSymbolicLink()) continue;
            const existing = await fs.readFile(filePath, "utf8");
            if (hash(existing) !== entry.generatedHash) {
                manifest.files[recordId] = {...entry,sourceScopeId:"",retainedAsManual:true};
                retainedEdited += 1;
                continue;
            }
            await ensureVaultPath(vaultPath,filePath,{createParents:false,targetType:"file"});
            await fs.unlink(filePath);
            await ensureVaultPath(vaultPath,filePath,{createParents:false,targetType:"file"});
            delete manifest.files[recordId];
            pruned += 1;
            if (!selectedScopes.has(entry.sourceScopeId)) prunedFromDeselected += 1;
        }
    }
    const previousUpdatedAt = typeof manifest.updatedAt === "string" ? manifest.updatedAt : "";
    const syncAt = new Date().toISOString();
    manifest.updatedAt = syncAt;
    if (!conflicts) manifest.lastSuccessfulSyncAt = syncAt;
    else if (!manifest.lastSuccessfulSyncAt) manifest.lastSuccessfulSyncAt = previousUpdatedAt;
    await atomicWrite(metadataPath, JSON.stringify(manifest, null, 2),{vaultPath});
    const warnings = [];
    if (conflicts) warnings.push("Some generated notes were edited in Obsidian. FolderRocket preserved them and wrote updated versions under FolderRocket/conflicts.");
    if (retainedEdited) warnings.push(`${retainedEdited} edited generated note(s) no longer match the selected sources and were retained as manual notes.`);
    if (legacyUnscopedRetained) warnings.push(`${legacyUnscopedRetained} legacy generated note(s) lack source scope metadata and were retained.`);
    if (retainedConflicts) warnings.push(`${retainedConflicts} conflicted generated note(s) and their copies were retained for review.`);
    return {status:conflicts ? "conflict" : "ready",vaultPath,lastSyncAt:manifest.lastSuccessfulSyncAt || "",attemptedAt:syncAt,total:safeRecords.length,omitted:normalized.omitted,written,unchanged,conflicts,pruned,prunedFromDeselected,retainedEdited,legacyUnscopedRetained,retainedConflicts,warning:warnings.join(" ")};
}

const syncLocks = new Map();
async function syncVault(options) {
    const key = `${String(options?.ownerId || "")}\0${String(options?.worldId || "")}\0${path.resolve(options?.vaultPath || ".")}`;
    const previous = syncLocks.get(key) || Promise.resolve();
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    const chain = previous.catch(() => {}).then(() => hold);
    syncLocks.set(key, chain);
    await previous.catch(() => {});
    try { return await syncVaultUnlocked(options || {}); }
    finally {
        release();
        if (syncLocks.get(key) === chain) syncLocks.delete(key);
    }
}

async function copyDownloadedAttachments({vaultPath,attachments}) {
    const safeAttachments=Array.isArray(attachments)?attachments.slice(0,40):[];
    const targetDirectory=path.join(vaultPath,GENERATED_DIRECTORY,"attachments");
    await ensureVaultRoot(vaultPath,{create:true});
    await ensureVaultPath(vaultPath,targetDirectory,{createParents:true,targetType:"directory"});
    let copied=0,unchanged=0,totalBytes=0;
    const output=[];
    for(const item of safeAttachments) {
        const source=typeof item?.path==="string"?item.path:"";
        if(!source)continue;
        const stats=await fs.stat(source);
        if(!stats.isFile())throw new Error("A synced attachment path is not a file.");
        if(stats.size>25*1024*1024)throw new Error(`${path.basename(source)} exceeds the per-file Obsidian attachment limit.`);
        totalBytes+=stats.size;
        if(totalBytes>100*1024*1024)throw new Error("Local attachments exceed the total Obsidian sync limit of 100 MB.");
        const displayName=path.basename(source);
        const key=hash(`${path.resolve(source)}\0${stats.size}\0${stats.mtimeMs}`).slice(0,12);
        const filename=`${safeSlug(path.parse(displayName).name)}-${key}${path.extname(displayName).slice(0,16)}`;
        const target=path.join(targetDirectory,filename);
        await ensureVaultPath(vaultPath,target,{createParents:false,targetType:"file"});
        try {await fs.copyFile(source,target,require("node:fs").constants.COPYFILE_EXCL);await ensureVaultPath(vaultPath,target,{createParents:false,targetType:"file"});copied+=1;}
        catch(error) {if(error?.code==="EEXIST")unchanged+=1;else throw error;}
        output.push({id:`attachment:${key}`,kind:"downloaded-attachment",sourceId:source,title:displayName,updatedAt:stats.mtime.toISOString(),content:`Local file: [[${GENERATED_DIRECTORY}/attachments/${filename}]]\nSize: ${stats.size} bytes`});
    }
    return {copied,unchanged,totalBytes,records:output};
}

function graphRecords(graph, worldName) {
    const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).filter(item => item && typeof item.id === "string" && item.id && typeof item.type === "string" && item.type);
    const edges = (Array.isArray(graph?.edges) ? graph.edges : []).filter(edge => edge && typeof edge.from === "string" && typeof edge.to === "string" && typeof edge.provenance === "string" && edge.provenance);
    const recordsByNodeId = new Map();
    const sourceGroups = new Map();
    const sourceForNode = item => {
        const ref = item.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
        if (item.sourceType === "filesystem" && typeof ref.graphSourceId === "string" && ref.graphSourceId) {
            return {id:`filesystem:${ref.graphSourceId}`, title:item.type === "folder" && ref.path ? safeText(item.label || path.basename(ref.path), 180) : safeText(ref.graphSourceId, 180), detail:ref.path ? `Root: ${safeText(ref.path, 1_000)}` : "", sourceId:ref.graphSourceId};
        }
        if (item.sourceType === "gmail" && typeof ref.blockId === "string" && ref.blockId) {
            return {id:`gmail:${ref.blockId}`, title:safeText(item.details?.accountEmail || "Gmail account", 180), detail:item.details?.accountEmail ? `Account: ${safeText(item.details.accountEmail, 240)}` : "", sourceId:ref.blockId};
        }
        if (item.type === "alert" && typeof ref.blockId === "string" && ref.blockId) {
            return {id:`alerts:${safeSlug(item.sourceType || ref.provider || "mail")}:${ref.blockId}`, title:`${safeText(item.sourceType || ref.provider || "Mail", 60)} alerts`, detail:"Configured email alert", sourceId:ref.blockId};
        }
        if (["folderrocket", "calendar", "sticky-note"].includes(item.sourceType) && ["activity", "search", "calendar-event", "reminder", "note"].includes(item.type)) {
            const category = item.type === "calendar-event" ? "calendar" : item.type === "reminder" || item.type === "note" ? "planet-notes" : "activity";
            const title = category === "calendar" ? "Calendar events" : category === "planet-notes" ? "Planet notes and reminders" : "Planet activity";
            return {id:`snapshot:${category}`, title, detail:"Selected planet snapshot", sourceId:"snapshot"};
        }
        return null;
    };

    for (const item of nodes) {
        const source = sourceForNode(item);
        const title = safeText(item.label || item.type, 300);
        const ref = item.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
        const details = item.details && typeof item.details === "object" ? item.details : {};
        const body = [`Planet: ${safeText(worldName || "FolderRocket", 120)}`, `Type: ${safeText(item.type, 80)}`];
        if (typeof ref.path === "string" && ref.path) body.push(`Path: ${safeText(ref.path, 1_000)}`);
        if (typeof details.at === "string") body.push(`Date: ${safeText(details.at, 80)}`);
        if (typeof details.updatedAt === "string") body.push(`Updated: ${safeText(details.updatedAt, 80)}`);
        if (typeof details.size === "number" && Number.isFinite(details.size)) body.push(`Size: ${details.size} bytes`);
        if (typeof details.extension === "string") body.push(`Extension: ${safeText(details.extension, 30)}`);
        if (typeof details.messageCount === "number" && Number.isFinite(details.messageCount)) body.push(`Messages: ${details.messageCount}`);
        if (typeof details.accountEmail === "string" && details.accountEmail) body.push(`Account: ${safeText(details.accountEmail, 240)}`);
        const record = {id:`graph:${item.id}`,kind:item.type,title,sourceId:String(item.sourceId || item.id),sourceScopeId:source?.id || "",updatedAt:item.updatedAt,content:body.join("\n\n"),notePath:`${GENERATED_DIRECTORY}/Entities/${stableFilename({id:`graph:${item.id}`,title})}`};
        recordsByNodeId.set(item.id, {record, source});
        if (source) {
            if (!sourceGroups.has(source.id)) sourceGroups.set(source.id, {...source, nodes:[]});
            sourceGroups.get(source.id).nodes.push(item.id);
        }
    }

    for (const edge of edges) {
        if (edge.provenance !== "gmail-header") continue;
        const contact = recordsByNodeId.get(edge.from);
        const message = recordsByNodeId.get(edge.to);
        if (!contact || contact.source || !message?.source?.id.startsWith("gmail:")) continue;
        contact.source = message.source;
        contact.record.sourceScopeId = message.source.id;
        if (!sourceGroups.has(message.source.id)) sourceGroups.set(message.source.id, {...message.source,nodes:[]});
        sourceGroups.get(message.source.id).nodes.push(edge.from);
    }

    for (const [nodeId, entry] of recordsByNodeId) if (!entry.source) recordsByNodeId.delete(nodeId);

    const sourceRecords = new Map();
    const sourcePages = [];
    for (const source of sourceGroups.values()) {
        const record = {id:`graph-source:${hash(source.id)}`,kind:"graph-source",title:source.title,sourceId:source.sourceId,sourceScopeId:source.id,updatedAt:"",notePath:`${GENERATED_DIRECTORY}/Sources/${safeSlug(source.title)}-${hash(source.id).slice(0, 12)}.md`,content:[source.detail, `Planet: ${safeText(worldName || "FolderRocket", 120)}`, "Source records:"].filter(Boolean).join("\n\n")};
        sourceRecords.set(source.id, record);
        source.nodes.forEach(nodeId => {
            const entry = recordsByNodeId.get(nodeId);
            if (entry) entry.record.content += `\n\nSource: ${wikiLink(record)}`;
        });
        const sourceEntities = source.nodes.map(nodeId => recordsByNodeId.get(nodeId)?.record).filter(Boolean);
        if (sourceEntities.length <= 30) record.content += `\n\n${sourceEntities.map(wikiLink).join("\n")}`;
        else {
            const pages = noteIndexPages({records:sourceEntities,idPrefix:`graph-source-page:${hash(source.id)}`,titlePrefix:source.title,scopeId:source.id,sourceId:source.sourceId,worldName,folder:`${safeSlug(source.title)}-${hash(source.id).slice(0, 8)}`});
            sourcePages.push(...pages);
            record.content += `\n\n${pages.map(wikiLink).join("\n")}`;
        }
    }

    const adjacency = new Map();
    for (const edge of edges) {
        if (!recordsByNodeId.has(edge.from) || !recordsByNodeId.has(edge.to)) continue;
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Map());
        if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Map());
        if (!adjacency.get(edge.from).has(edge.to)) adjacency.get(edge.from).set(edge.to, edge);
        if (!adjacency.get(edge.to).has(edge.from)) adjacency.get(edge.to).set(edge.from, edge);
    }
    for (const [nodeId, entry] of recordsByNodeId) {
        const neighbors = [...(adjacency.get(nodeId) || new Map())].map(([id, edge]) => ({entry:recordsByNodeId.get(id), edge})).filter(item => item.entry);
        let related = "";
        for (const {entry:neighbor,edge} of neighbors) {
            const line = `- ${safeText(edge.type || "Related", 80)} (${safeText(edge.provenance, 160)}): ${wikiLink(neighbor.record)}\n`;
            if (entry.record.content.length + related.length + line.length > 10_000) break;
            related += line;
        }
        if (related) entry.record.content += `\n\n## Related records\n\n${related.trimEnd()}`;
    }

    const hubs = [...sourceRecords.values()];
    const sourceIndexes = hubs.length > 30 ? noteIndexPages({records:hubs,idPrefix:"graph-source-index",titlePrefix:"Planet sources",scopeId:"folderrocket:source-index",sourceId:"folderrocket:source-index",worldName,folder:"source-index"}).map(record => ({...record,kind:"graph-source-index"})) : [];
    return [...hubs, ...sourceIndexes, ...sourcePages, ...[...recordsByNodeId.values()].map(entry => entry.record)];
}

function markdownEmailThread(thread, accountEmail, worldId) {
    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    const content = [`Account: ${accountEmail || ""}`, `Planet: ${worldId}`, "", ...messages.flatMap(message => [
        `## ${safeText(message.from || "Email", 300)}${message.receivedAt ? ` · ${safeText(message.receivedAt, 60)}` : ""}`,
        "",
        safeText(message.text || "", 8_000),
        "",
        ...(Array.isArray(message.attachments) && message.attachments.length ? [`Attachments: ${message.attachments.map(item => safeText(item.name, 180)).join(", ")}`, ""] : [])
    ])].join("\n");
    return {id:`email:${thread.id}`,kind:"email-conversation",sourceId:thread.id,title:thread.messages?.[0]?.subject || thread.id,updatedAt:messages.at(-1)?.receivedAt || new Date().toISOString(),content};
}

module.exports = {MAX_NOTES, SOURCE_KEYS, SOURCE_SELECTION_VERSION, GRAPH_FILE_TYPES, normalizeSourceSelection, sourceCategory, filterRecordsBySources, filterGraphBySources, safeSlug, toMarkdown, normalizeRecords, normalizeRecordBatch, initializeVault, syncVault, copyDownloadedAttachments, graphRecords, markdownEmailThread};
