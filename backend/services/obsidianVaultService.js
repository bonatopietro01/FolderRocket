const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_NOTES = 2_000;
const MANIFEST_NAME = "manifest.json";
const META_DIRECTORY = ".folderrocket";
const GENERATED_DIRECTORY = "FolderRocket";

function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function safeSlug(value) {
    const result = String(value || "note").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    return result || "note";
}
function safeText(value, max = 12_000) { return String(value ?? "").replace(/\u0000/g, "").slice(0, max); }
function yamlString(value) { return JSON.stringify(safeText(value, 600)); }
function stableFilename(record) { return record.kind === "overview" ? "README.md" : `${safeSlug(record.title)}-${hash(record.id).slice(0, 12)}.md`; }

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
    const output = [];
    const seen = new Set();
    for (const record of Array.isArray(records) ? records : []) {
        if (!record || typeof record.id !== "string" || !record.id || typeof record.kind !== "string") continue;
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        output.push({id:record.id.slice(0, 300), kind:record.kind.slice(0, 80), sourceId:String(record.sourceId || record.id).slice(0, 300), title:String(record.title || record.kind).slice(0, 300), content:safeText(record.content || ""), updatedAt:typeof record.updatedAt === "string" ? record.updatedAt : ""});
        if (output.length >= MAX_NOTES) break;
    }
    return output;
}

async function readJson(filePath, fallback) {
    try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
    catch (error) { if (error?.code === "ENOENT" || error instanceof SyntaxError) return fallback; throw error; }
}

async function atomicWrite(filePath, data) {
    await fs.mkdir(path.dirname(filePath), {recursive:true, mode:0o700});
    const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    try {
        await fs.writeFile(temporary, data, {encoding:"utf8", mode:0o600, flag:"wx"});
        await fs.rename(temporary, filePath);
    } catch (error) {
        await fs.rm(temporary, {force:true}).catch(() => {});
        throw error;
    }
}

async function initializeVault(vaultPath, {worldId, ownerId, worldName}) {
    await fs.mkdir(vaultPath, {recursive:true, mode:0o700});
    const markerPath = path.join(vaultPath, META_DIRECTORY, "vault.json");
    const marker = await readJson(markerPath, null);
    if (marker && (marker.worldId !== worldId || marker.ownerId !== String(ownerId))) throw new Error("This folder is already assigned to another FolderRocket user or planet.");
    await atomicWrite(markerPath, JSON.stringify({version:1,ownerId:String(ownerId),worldId,worldName:safeText(worldName || worldId,80),createdAt:marker?.createdAt || new Date().toISOString()}, null, 2));
}

async function syncVault({vaultPath, worldId, ownerId, worldName, records}) {
    const safeRecords = normalizeRecords(records);
    await initializeVault(vaultPath, {worldId,ownerId,worldName});
    const metadataPath = path.join(vaultPath, META_DIRECTORY, MANIFEST_NAME);
    const manifest = await readJson(metadataPath, {version:1,ownerId:String(ownerId),worldId,files:{}});
    if (manifest.ownerId !== String(ownerId) || manifest.worldId !== worldId) throw new Error("The FolderRocket vault manifest belongs to another user or planet.");
    manifest.files = manifest.files && typeof manifest.files === "object" && !Array.isArray(manifest.files) ? manifest.files : {};
    const outputDirectory = path.join(vaultPath, GENERATED_DIRECTORY);
    await fs.mkdir(outputDirectory, {recursive:true, mode:0o700});
    let written = 0, unchanged = 0, conflicts = 0;
    for (const record of safeRecords) {
        const filename = stableFilename(record);
        const relativePath = path.join(GENERATED_DIRECTORY, filename);
        const filePath = path.join(vaultPath, relativePath);
        const contents = toMarkdown(record, worldId);
        const contentHash = hash(contents);
        const previous = manifest.files[record.id] || {};
        let existing = "";
        try { existing = await fs.readFile(filePath, "utf8"); }
        catch (error) { if (error?.code !== "ENOENT") throw error; }
        if (existing && (!previous.generatedHash || hash(existing) !== previous.generatedHash)) {
            conflicts += 1;
            const conflictHash = hash(contents).slice(0, 12);
            const conflictDirectory = path.join(vaultPath, GENERATED_DIRECTORY, "conflicts");
            const conflictPath = path.join(conflictDirectory, `${path.basename(filename, ".md")}-${conflictHash}.md`);
            const conflictRelative=path.relative(vaultPath, conflictPath);
            if (!previous.conflicts?.includes(conflictRelative)) {
                await fs.mkdir(conflictDirectory, {recursive:true, mode:0o700});
                try { await fs.writeFile(conflictPath, contents, {encoding:"utf8", mode:0o600, flag:"wx"}); } catch (error) { if (error?.code !== "EEXIST") throw error; }
                previous.conflicts = [...(previous.conflicts || []), path.relative(vaultPath, conflictPath)];
            }
            previous.lastSyncAt = new Date().toISOString();
            previous.pendingHash = contentHash;
            manifest.files[record.id]={...previous,kind:record.kind,path:relativePath,conflicts:previous.conflicts?.includes(conflictRelative)?previous.conflicts:[...(previous.conflicts||[]),conflictRelative],lastSyncAt:previous.lastSyncAt,pendingHash:contentHash};
            continue;
        }
        if (existing && hash(existing) === contentHash) unchanged += 1;
        else { await atomicWrite(filePath, contents); written += 1; }
        manifest.files[record.id] = {...previous, kind:record.kind,path:relativePath,generatedHash:contentHash,lastSyncAt:new Date().toISOString(),pendingHash:""};
    }
    manifest.updatedAt = new Date().toISOString();
    await atomicWrite(metadataPath, JSON.stringify(manifest, null, 2));
    return {status:conflicts ? "conflict" : "ready",vaultPath,lastSyncAt:manifest.updatedAt,total:safeRecords.length,written,unchanged,conflicts,warning:conflicts ? "Some generated notes were edited in Obsidian. FolderRocket preserved them and wrote updated versions under FolderRocket/conflicts." : ""};
}

async function copyDownloadedAttachments({vaultPath,attachments}) {
    const safeAttachments=Array.isArray(attachments)?attachments.slice(0,40):[];
    const targetDirectory=path.join(vaultPath,GENERATED_DIRECTORY,"attachments");
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
        await fs.mkdir(targetDirectory,{recursive:true,mode:0o700});
        try {await fs.copyFile(source,target,require("node:fs").constants.COPYFILE_EXCL);copied+=1;}
        catch(error) {if(error?.code==="EEXIST")unchanged+=1;else throw error;}
        output.push({id:`attachment:${key}`,kind:"downloaded-attachment",sourceId:source,title:displayName,updatedAt:stats.mtime.toISOString(),content:`Local file: [[attachments/${filename}]]\nSize: ${stats.size} bytes`});
    }
    return {copied,unchanged,totalBytes,records:output};
}

function graphRecords(graph, worldName) {
    const output = [];
    const linksByNodeId=new Map();
    for (const item of Array.isArray(graph?.nodes) ? graph.nodes : []) {
        if (!item || !item.id || !item.type) continue;
        const title = safeText(item.label || item.type, 300);
        const kind = item.type;
        const sourceId = String(item.sourceId || item.id);
        const refPath = typeof item.sourceRef?.path === "string" ? item.sourceRef.path : "";
        const body = [];
        body.push(`Planet: ${worldName}`);
        body.push(`Type: ${kind}`);
        if (refPath) body.push(`Path: ${refPath}`);
        if (typeof item.details?.at === "string") body.push(`Date: ${item.details.at}`);
        if (typeof item.details?.updatedAt === "string") body.push(`Updated: ${item.details.updatedAt}`);
        if (typeof item.details?.size === "number") body.push(`Size: ${item.details.size} bytes`);
        if (typeof item.details?.extension === "string") body.push(`Extension: ${item.details.extension}`);
        if (typeof item.details?.messageCount === "number") body.push(`Messages: ${item.details.messageCount}`);
        if (typeof item.details?.accountEmail === "string" && item.details.accountEmail) body.push(`Account: ${item.details.accountEmail}`);
        if (typeof item.details?.files === "string") body.push(`Files: ${item.details.files}`);
        const record={id:`graph:${item.id}`,kind,title,sourceId,updatedAt:item.updatedAt,content:body.join("\n\n")};
        output.push(record);
        linksByNodeId.set(item.id,stableFilename(record).replace(/\.md$/i,""));
    }
    for (const item of Array.isArray(graph?.edges) ? graph.edges : []) {
        if (!item?.id || !item.from || !item.to) continue;
        const from=linksByNodeId.get(item.from)||safeText(item.from,200);
        const to=linksByNodeId.get(item.to)||safeText(item.to,200);
        output.push({id:`relation:${item.id}`,kind:"relation",title:`${item.type || "related"} relationship`,sourceId:item.id,updatedAt:"",content:`From: [[${from}]]\nTo: [[${to}]]`});
    }
    return output.slice(0, MAX_NOTES);
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

module.exports = {MAX_NOTES, safeSlug, toMarkdown, normalizeRecords, initializeVault, syncVault, copyDownloadedAttachments, graphRecords, markdownEmailThread};
