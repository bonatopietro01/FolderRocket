const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {getRuntimeDataDirectory} = require("./runtimePaths");

const VERSION = 1;
const MAX_NODES = 8_000;
const MAX_EDGES = 12_000;
const INDEXED_TYPES = new Set(["world", "folder", "file", "email-thread", "email-message", "person", "calendar-event", "note", "reminder", "alert"]);
const SNAPSHOT_TYPES = new Set(["activity", "search", "calendar-event", "note", "reminder"]);
const EXCLUDED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "folderrocket_trash", "cargorocket"]);
const jobs = new Map();
const writes = new Map();
const mutations = new Map();
const TRANSIENT_RENAME_CODES=new Set(["EPERM","EACCES","EBUSY"]);
const GRAPH_RENAME_ATTEMPTS=5;
const GRAPH_RENAME_DELAYS=[50,100,200,400];

function wait(milliseconds){return new Promise(resolve=>setTimeout(resolve,milliseconds));}

async function renameGraphFileWithRetry(temporary,target,{rename=fs.rename,sleep=wait}={}) {
    for(let attempt=0;attempt<GRAPH_RENAME_ATTEMPTS;attempt++) {
        try{return await rename(temporary,target);}
        catch(error) {
            if(!TRANSIENT_RENAME_CODES.has(error?.code))throw error;
            if(attempt===GRAPH_RENAME_ATTEMPTS-1) {
                const unavailable=new Error("Planet graph storage is temporarily unavailable.");
                unavailable.code="GRAPH_STORAGE_UNAVAILABLE";
                unavailable.causeCode=error.code;
                throw unavailable;
            }
            await sleep(GRAPH_RENAME_DELAYS[attempt]);
        }
    }
}

function validId(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
}

function graphPath(userId, worldId, rootDirectory = path.join(getRuntimeDataDirectory(), "planet-graphs")) {
    if (!validId(String(userId)) || !validId(worldId)) throw new Error("Invalid graph owner or planet identifier.");
    const owner = crypto.createHash("sha256").update(String(userId)).digest("hex");
    return path.join(rootDirectory, owner, `${worldId}.json`);
}

function stableId(...parts) {
    return crypto.createHash("sha256").update(parts.map(value => String(value ?? "")).join("\0")).digest("hex").slice(0, 32);
}

// A source-content revision intentionally excludes status/progress timestamps. Indexing
// progress must not make retained knowledge stale, while any indexed evidence change must.
function contentRevision(graph) {
    const nodes=(Array.isArray(graph?.nodes)?graph.nodes:[]).map(item=>({
        id:String(item?.id||""),type:String(item?.type||""),sourceType:String(item?.sourceType||""),
        label:String(item?.label||""),sourceRef:item?.sourceRef||{},details:item?.details||{}
    })).sort((a,b)=>a.id.localeCompare(b.id));
    const edges=(Array.isArray(graph?.edges)?graph.edges:[]).map(item=>({from:String(item?.from||""),to:String(item?.to||""),type:String(item?.type||""),provenance:item?.provenance||null})).sort((a,b)=>`${a.from}\0${a.to}\0${a.type}`.localeCompare(`${b.from}\0${b.to}\0${b.type}`));
    const sources=normalizeSourceStatuses(graph?.sourceStatuses).map(item=>({sourceId:item.sourceId,status:item.status,reasonCode:item.reasonCode,processed:item.processed,total:item.total})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
    return crypto.createHash("sha256").update(JSON.stringify({nodes,edges,sources})).digest("hex");
}

function emptyGraph(userId, worldId) {
    return {version:VERSION, userId:String(userId), worldId, status:"disabled", progress:{stage:"idle",processed:0,total:0,limitReached:false}, updatedAt:new Date().toISOString(), nodes:[], edges:[], sourceStatuses:[], sharedThreads:[], selectedConversations:[],conversationSelectionConfigured:true};
}

async function readGraph(userId, worldId, rootDirectory) {
    try {
        const value = JSON.parse(await fs.readFile(graphPath(userId, worldId, rootDirectory), "utf8"));
        if (value?.version !== VERSION || value.userId !== String(userId) || value.worldId !== worldId || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return emptyGraph(userId, worldId);
        return {...emptyGraph(userId, worldId), ...value, nodes:value.nodes, edges:value.edges, sourceStatuses:normalizeSourceStatuses(value.sourceStatuses), sharedThreads:Array.isArray(value.sharedThreads) ? value.sharedThreads : [], selectedConversations:Array.isArray(value.selectedConversations)?value.selectedConversations:[],conversationSelectionConfigured:Object.hasOwn(value,"conversationSelectionConfigured")?value.conversationSelectionConfigured===true:false};
    } catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError) return emptyGraph(userId, worldId);
        throw error;
    }
}

async function writeGraph(graph, rootDirectory, options={}) {
    const target = graphPath(graph.userId, graph.worldId, rootDirectory);
    const queueKey = target.toLocaleLowerCase();
    const previous = writes.get(queueKey) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
        await fs.mkdir(path.dirname(target), {recursive:true, mode:0o700});
        const temporary = `${target}.${process.pid}.${crypto.randomBytes(5).toString("hex")}.tmp`;
        try {
            await fs.writeFile(temporary, JSON.stringify(graph), {encoding:"utf8", mode:0o600});
            await renameGraphFileWithRetry(temporary,target,options);
        } catch (error) {
            await fs.rm(temporary, {force:true}).catch(() => {});
            throw error;
        }
    });
    writes.set(queueKey, next);
    try { await next; }
    finally { if (writes.get(queueKey) === next) writes.delete(queueKey); }
    return graph;
}

async function mutateGraph(userId,worldId,rootDirectory,transform) {
    const target=graphPath(userId,worldId,rootDirectory);
    const key=target.toLocaleLowerCase();
    const previous=mutations.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
        const current=await readGraph(userId,worldId,rootDirectory);
        const updated=await transform(current);
        await writeGraph(updated,rootDirectory);
        return updated;
    });
    mutations.set(key,next);
    try{return await next;}finally{if(mutations.get(key)===next)mutations.delete(key);}
}

const SOURCE_STATUS_VALUES = new Set(["complete", "partial", "failed", "skipped", "indexing"]);
const SOURCE_TYPES = new Set(["folder", "gmail", "snapshot", "aggregate"]);
const SOURCE_REASON_CODES = new Set([
    "source_unavailable", "permission_denied", "invalid_source", "source_read_failed",
    "file_stat_failed", "directory_limit", "file_limit", "depth_limit", "node_limit",
    "edge_limit", "provider_unavailable", "provider_page_limit", "selected_item_missing",
    "source_disabled", "snapshot_unavailable"
]);

function normalizeSourceStatuses(value) {
    if (!Array.isArray(value)) return [];
    const entries=value.slice(0,200);
    const aggregate=value.find(item=>item?.type==="aggregate"&&item.sourceId==="aggregate:graph");
    if(aggregate&&!entries.includes(aggregate))entries[entries.length===200?199:entries.length]=aggregate;
    return entries.filter(item => item && typeof item.sourceId === "string" && item.sourceId.length <= 240 && SOURCE_TYPES.has(item.type) && SOURCE_STATUS_VALUES.has(item.status)).map(item => ({
        sourceId:item.sourceId,
        type:item.type,
        label:String(item.label || item.type).slice(0, 180),
        status:item.status,
        reasonCode:SOURCE_REASON_CODES.has(item.reasonCode) ? item.reasonCode : "",
        message:String(item.message || "").replace(/[\r\n\0]+/g, " ").slice(0, 240),
        processed:Number.isFinite(Number(item.processed)) ? Math.max(0, Math.floor(Number(item.processed))) : 0,
        total:Number.isFinite(Number(item.total)) ? Math.max(0, Math.floor(Number(item.total))) : 0,
        retryable:item.retryable === true,
        ...(Array.isArray(item.issues)&&item.issues.length ? {issues:item.issues.slice(0,20).filter(issue=>issue&&["source","global"].includes(issue.scope)&&SOURCE_REASON_CODES.has(issue.reasonCode)).map(issue=>({scope:issue.scope,reasonCode:issue.reasonCode,message:String(issue.message||"").replace(/[\r\n\0]+/g," ").slice(0,240),retryable:issue.retryable===true}))} : {}),
        updatedAt:typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt)) ? item.updatedAt : new Date().toISOString()
    }));
}

function sourceStatus({sourceId, type, label, status, reasonCode = "", message = "", processed = 0, total = 0, retryable = false, issues = []} = {}) {
    if (typeof sourceId !== "string" || sourceId.length > 240 || !SOURCE_TYPES.has(type) || !SOURCE_STATUS_VALUES.has(status)) throw new Error("Graph source status is invalid.");
    return normalizeSourceStatuses([{sourceId,type,label,status,reasonCode,message,processed,total,retryable,issues,updatedAt:new Date().toISOString()}])[0];
}

function failIndexingSources(value,message="Planet graph indexing stopped before this source could finish. Retry this source.") {
    return normalizeSourceStatuses(value).map(item=>item.status==="indexing"
        ?sourceStatus({...item,status:"failed",reasonCode:"source_read_failed",message,retryable:true})
        :item);
}

function node(type, sourceType, sourceId, label, sourceRef = {}, details = {}) {
    const id = `${type}:${stableId(sourceType, sourceId)}`;
    return {id,type,sourceType,sourceId:String(sourceId),label:String(label || type).slice(0,240),sourceRef,details,updatedAt:new Date().toISOString()};
}

function edge(type, from, to, provenance = "source") {
    if (!from || !to || from === to) return null;
    return {id:`edge:${stableId(type,from,to,provenance)}`,type,from,to,provenance};
}

function aggregateLimitStatus(nodeCount, edgeCount) {
    const nodeLimited = nodeCount > MAX_NODES;
    const edgeLimited = edgeCount > MAX_EDGES;
    if (!nodeLimited && !edgeLimited) return null;
    const reasonCode = nodeLimited ? "node_limit" : "edge_limit";
    const limits = [nodeLimited ? `nodes (${nodeCount} > ${MAX_NODES})` : "", edgeLimited ? `links (${edgeCount} > ${MAX_EDGES})` : ""].filter(Boolean).join(" and ");
    return sourceStatus({
        sourceId:"aggregate:graph",type:"aggregate",label:"Combined graph",status:"partial",reasonCode,
        message:`The combined graph reached its local ${limits} limit. Reduce selected sources or records, then run a full refresh. Individual sources remain available and are not marked failed.`,
        processed:nodeLimited?MAX_NODES:MAX_EDGES,total:nodeLimited?nodeCount:edgeCount,retryable:false
    });
}

function withAggregateLimitStatus(sourceStatuses, nodeCount, edgeCount) {
    const statuses=normalizeSourceStatuses(sourceStatuses).filter(item=>item.type!=="aggregate");
    const limitStatus=aggregateLimitStatus(nodeCount,edgeCount);
    if(limitStatus)statuses.push(limitStatus);
    return normalizeSourceStatuses(statuses);
}

function mergeGraph(existing, nodes, edges, progress = existing.progress) {
    const saved = new Map(existing.nodes.filter(item => !INDEXED_TYPES.has(item.type)).map(item => [item.id,item]));
    for (const item of nodes) saved.set(item.id,item);
    const rawNodes = [...saved.values()];
    const allNodes = rawNodes.slice(0,MAX_NODES);
    const ids = new Set(allNodes.map(item => item.id));
    const mergedEdges = new Map(existing.edges.filter(item => ids.has(item.from) && ids.has(item.to)).map(item => [item.id,item]));
    for (const item of edges) if (ids.has(item.from) && ids.has(item.to)) mergedEdges.set(item.id,item);
    const rawEdges=[...mergedEdges.values()];
    const aggregateStatus=aggregateLimitStatus(rawNodes.length,rawEdges.length);
    const sourceStatuses=withAggregateLimitStatus(existing.sourceStatuses,rawNodes.length,rawEdges.length);
    const nextProgress={...progress,limitReached:progress.limitReached===true||Boolean(aggregateStatus)};
    const warnings=Array.isArray(existing.warnings)?existing.warnings.slice():[];
    if(aggregateStatus&&!warnings.includes(aggregateStatus.message))warnings.push(aggregateStatus.message);
    return {...existing,status:progress.stage === "complete" ? (nextProgress.limitReached ? "partial" : "ready") : "indexing",progress:nextProgress,sourceStatuses,updatedAt:new Date().toISOString(),nodes:allNodes,edges:rawEdges.slice(0,MAX_EDGES),warnings:warnings.slice(0,30)};
}

function mergeAdditionalGraphItems(existing,nodes=[],edges=[]) {
    const nodeMap=new Map(existing.nodes.map(item=>[item.id,item]));
    for(const item of nodes)if(item&&typeof item.id==="string")nodeMap.set(item.id,item);
    const rawNodes=[...nodeMap.values()];
    const allNodes=rawNodes.slice(0,MAX_NODES);
    const ids=new Set(allNodes.map(item=>item.id));
    const edgeMap=new Map(existing.edges.filter(item=>ids.has(item.from)&&ids.has(item.to)).map(item=>[item.id,item]));
    for(const item of edges)if(item&&ids.has(item.from)&&ids.has(item.to))edgeMap.set(item.id,item);
    const rawEdges=[...edgeMap.values()];
    const aggregateStatus=aggregateLimitStatus(rawNodes.length,rawEdges.length);
    const sourceStatuses=withAggregateLimitStatus(existing.sourceStatuses,rawNodes.length,rawEdges.length);
    const progress={...existing.progress,limitReached:existing.progress?.limitReached===true||Boolean(aggregateStatus)};
    const warnings=Array.isArray(existing.warnings)?existing.warnings.slice():[];
    if(aggregateStatus&&!warnings.includes(aggregateStatus.message))warnings.push(aggregateStatus.message);
    return {...existing,status:aggregateStatus&&existing.status!="indexing"?"partial":existing.status,progress,sourceStatuses,nodes:allNodes,edges:rawEdges.slice(0,MAX_EDGES),warnings:warnings.slice(0,30),updatedAt:new Date().toISOString()};
}

async function walkConfiguredFolders(folders, {maxDirectories = 400, maxFiles = 3_000, maxDepth = 8, maxNodes = MAX_NODES, validateRoot = async value => value, excludePaths = [], includeSubfolders = true, fileTypes = null, onProgress, progressBatchSize = 100} = {}) {
    const nodes = [], edges = [], visited = new Set(), sourceStatuses = [];
    const excluded = (Array.isArray(excludePaths) ? excludePaths : []).filter(value => typeof value === "string").map(value => path.resolve(value));
    const roots = (Array.isArray(folders) ? folders : []).filter(folder => folder && folder.storage !== "imaginary" && typeof folder.path === "string" && folder.path.trim());
    const allowedFileTypes = Array.isArray(fileTypes) ? new Set(fileTypes.filter(value => typeof value === "string" && value.startsWith(".")).map(value => value.toLocaleLowerCase())) : null;
    let processedDirectories = 0, processedFiles = 0, limitReached = false;
    const batchSize=Number.isFinite(Number(progressBatchSize))?Math.max(1,Math.floor(Number(progressBatchSize))):100;
    let progressQueue=Promise.resolve();
    const emitProgress=(source,force=false)=>{
        if(typeof onProgress!=="function")return;
        const processed=source.processedDirectories+source.processedFiles;
        if(!force&&processed-source.lastProgressProcessed<batchSize)return;
        source.lastProgressProcessed=processed;
        const update={sourceId:source.id,label:source.label,processed,total:0,processedDirectories:source.processedDirectories,processedFiles:source.processedFiles,overallProcessed:processedDirectories+processedFiles,limitReached};
        progressQueue=progressQueue.then(()=>onProgress(update)).catch(()=>{});
    };
    const classifyFailure = (error, stage) => {
        const code=String(error?.code || "");
        if (code === "EACCES" || code === "EPERM") return {reasonCode:"permission_denied",message:"FolderRocket does not have permission to read this source."};
        if (code === "ENOENT") return {reasonCode:"source_unavailable",message:"This source is unavailable or was moved."};
        if (code === "ENOTDIR") return {reasonCode:"invalid_source",message:"The selected source is no longer a folder."};
        return stage === "root" ? {reasonCode:"invalid_source",message:"The selected source could not be validated."} : {reasonCode:"source_read_failed",message:"FolderRocket could not read part of this source."};
    };
    const addDirectory = async (entryPath, label, depth, parentId = "", source) => {
        let real;
        try { real = await fs.realpath(entryPath); } catch (error) { const failure=classifyFailure(error,depth===0?"root":"directory");source.issue(failure);return; }
        const compare = value => process.platform === "win32" ? value.toLocaleLowerCase() : value;
        if(excluded.some(value => {const left=compare(value),right=compare(real);const relative=path.relative(left,right);return relative===""||(relative!==".."&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative));}))return;
        const key = process.platform === "win32" ? real.toLocaleLowerCase() : real;
        if (visited.has(key)) return;
        visited.add(key);
        if (nodes.length >= maxNodes) { source.issue({scope:"global",reasonCode:"node_limit",message:"The local graph node limit was reached across configured sources."});limitReached=true;return; }
        const folderNode = node("folder","filesystem",real,label,{kind:"folder",path:real,graphSourceId:source.id});
        nodes.push(folderNode);
        if (parentId) edges.push(edge("contains",parentId,folderNode.id,"filesystem"));
        if (depth > maxDepth) { source.issue({scope:"source",reasonCode:"depth_limit",message:`Folder scanning stopped at the per-source depth limit (${maxDepth}).`});limitReached=true;return; }
        if (processedDirectories >= maxDirectories) { source.issue({scope:"global",reasonCode:"directory_limit",message:`Folder scanning stopped at the global directory limit across configured sources (${maxDirectories}).`});limitReached=true;return; }
        let entries;
        try { entries = await fs.readdir(real,{withFileTypes:true}); } catch (error) { source.issue(classifyFailure(error,"directory"));return; }
        processedDirectories += 1;source.processedDirectories+=1;emitProgress(source);
        entries.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}));
        for (const entry of entries) {
            if (entry.name.startsWith(".") || (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name.toLocaleLowerCase()))) continue;
            const target = path.join(real,entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (depth === 0 && includeSubfolders === false) continue;
                if (processedDirectories >= maxDirectories) { source.issue({scope:"global",reasonCode:"directory_limit",message:`Folder scanning stopped at the global directory limit across configured sources (${maxDirectories}).`});limitReached=true; break; }
                await addDirectory(target,entry.name,depth+1,folderNode.id,source);
            } else if (entry.isFile()) {
                if (allowedFileTypes && !allowedFileTypes.has(path.extname(entry.name).toLocaleLowerCase())) continue;
                if (processedFiles >= maxFiles) { source.issue({scope:"global",reasonCode:"file_limit",message:`Folder scanning stopped at the global file limit across configured sources (${maxFiles}).`});limitReached=true; break; }
                if (nodes.length >= maxNodes) { source.issue({scope:"global",reasonCode:"node_limit",message:"The local graph node limit was reached across configured sources."});limitReached=true;break; }
                let stats; try { stats=await fs.stat(target); } catch (error) {
                    const failure=classifyFailure(error,"file");
                    source.issue({scope:"source",...(failure.reasonCode==="permission_denied"||failure.reasonCode==="source_unavailable"?failure:{...failure,reasonCode:"file_stat_failed"})});
                    continue;
                }
                const fileNode=node("file","filesystem",target,entry.name,{kind:"file",path:target,graphSourceId:source.id},{extension:path.extname(entry.name).toLowerCase(),size:stats.size,modifiedAt:stats.mtime.toISOString()});
                nodes.push(fileNode); edges.push(edge("contains",folderNode.id,fileNode.id,"filesystem")); processedFiles+=1;source.processedFiles+=1;emitProgress(source);
            }
        }
    };
    for (const folder of roots) {
        const rawId=typeof folder.id === "string" && folder.id.trim() ? folder.id.trim() : stableId(path.resolve(folder.path));
        const id=`folder:${rawId}`;
        const source={id,label:folder.name||path.basename(folder.path),processedDirectories:0,processedFiles:0,lastProgressProcessed:0,issues:[],firstIssue:null,issue(value){const issue={scope:"source",retryable:true,...value};if(!this.issues.some(item=>item.reasonCode===issue.reasonCode&&item.scope===issue.scope))this.issues.push(issue);if(!this.firstIssue)this.firstIssue=issue;}};
        if (nodes.length >= maxNodes) { limitReached=true;source.issue({scope:"global",reasonCode:"node_limit",message:"The local graph node limit was reached before this source could be read."});sourceStatuses.push(sourceStatus({sourceId:id,type:"folder",label:folder.name||path.basename(folder.path),status:"partial",reasonCode:source.firstIssue.reasonCode,message:source.firstIssue.message,retryable:true,processed:0,total:0,issues:source.issues}));continue; }
        let checked;
        try { checked=await validateRoot(folder.path); } catch (error) { const failure=classifyFailure(error,"root");source.issue({scope:"source",...failure});sourceStatuses.push(sourceStatus({sourceId:id,type:"folder",label:folder.name||path.basename(folder.path),status:"failed",reasonCode:failure.reasonCode,message:failure.message,retryable:true,processed:0,total:0,issues:source.issues}));continue; }
        const startDirectories=processedDirectories,startFiles=processedFiles;
        const startNodes=nodes.length;
        await addDirectory(checked,folder.name || path.basename(checked),0,"",source);
        if(nodes.length===startNodes&&!source.firstIssue)source.issue({reasonCode:"source_unavailable",message:"No folder data could be read from this source."});
        const failure=source.firstIssue;
        const processed=(processedDirectories-startDirectories)+(processedFiles-startFiles);
        emitProgress(source,true);
        sourceStatuses.push(sourceStatus({sourceId:id,type:"folder",label:folder.name||path.basename(checked),status:failure?(processed?"partial":"failed"):"complete",reasonCode:failure?.reasonCode||"",message:failure?.message||"",processed,total:0,retryable:Boolean(failure),issues:source.issues}));
    }
    await progressQueue;
    return {nodes,edges,processedDirectories,processedFiles,limitReached,configuredRoots:roots.length,sourceStatuses};
}

function snapshotGraphItems(snapshot = {}) {
    const nodes=[], edges=[];
    const entries=[...(Array.isArray(snapshot.activities)?snapshot.activities:[])];
    for (const item of entries.slice(-500)) {
        if (!item || typeof item.summary !== "string" || typeof item.at !== "string" || Number.isNaN(Date.parse(item.at))) continue;
        const operationId=typeof item.operationId === "string" ? item.operationId : stableId(item.kind,item.summary,item.at);
        const activityNode=node(item.kind === "search" ? "search" : "activity","folderrocket",operationId,item.summary,{kind:"activity",operationId},{at:item.at,files:Array.isArray(item.files)?item.files.slice(0,20).map(value=>String(value).slice(0,200)):[]});
        nodes.push(activityNode);
    }
    for (const item of (Array.isArray(snapshot.calendarEvents)?snapshot.calendarEvents:[]).slice(0,300)) {
        if (!item || typeof item.start !== "string" || Number.isNaN(Date.parse(item.start))) continue;
        const id=`${item.title || "Calendar event"}\0${item.start}`;
        nodes.push(node("calendar-event","calendar",id,String(item.title || "Calendar event"),{kind:"calendar",start:item.start},{start:item.start,end:item.end || ""}));
    }
    for (const item of (Array.isArray(snapshot.reminders)?snapshot.reminders:[]).slice(0,300)) {
        if (!item || typeof item.at !== "string" || Number.isNaN(Date.parse(item.at))) continue;
        const id=`${item.id || item.title || "Reminder"}\0${item.at}`;
        nodes.push(node("reminder","sticky-note",id,String(item.title || "Reminder"),{kind:"reminder",at:item.at},{at:item.at}));
    }
    for (const item of (Array.isArray(snapshot.notes)?snapshot.notes:[]).slice(0,300)) {
        if (!item || typeof item.id !== "string") continue;
        nodes.push(node("note","sticky-note",item.id,String(item.title || "Note"),{kind:"note",id:item.id},{color:String(item.color || "").slice(0,32)}));
    }
    return {nodes,edges};
}

function addWorldMembershipEdges(worldId, worldNode, nodes = [], edges = []) {
    const membershipTypes = new Set(["email-thread", "alert", "activity", "search", "calendar-event", "reminder", "note"]);
    const available = new Set(nodes.map(item => item?.id).filter(Boolean));
    const result = [...edges];
    for (const item of nodes) {
        if (!item || !membershipTypes.has(item.type) || !available.has(item.id)) continue;
        result.push(edge("contains", worldNode.id, item.id, `planet-membership:${worldId}:${item.sourceType}`));
    }
    const filesByPath = new Map(nodes.filter(item => item?.type === "file" && typeof item.sourceRef?.path === "string")
        .map(item => [process.platform === "win32" ? item.sourceRef.path.toLocaleLowerCase() : item.sourceRef.path, item]));
    for (const item of nodes) {
        if (!item || !["activity", "search"].includes(item.type) || !Array.isArray(item.details?.files)) continue;
        for (const reference of item.details.files) {
            if (typeof reference !== "string" || !/[\\/]/.test(reference)) continue;
            const key = process.platform === "win32" ? reference.toLocaleLowerCase() : reference;
            const file = filesByPath.get(key);
            if (file) result.push(edge("references", item.id, file.id, "explicit-activity-file-path"));
        }
    }
    return [...new Map(result.filter(Boolean).map(item => [item.id, item])).values()];
}

function listGmailBlocks(dashboard = {}) {
    const blocks=[...(Array.isArray(dashboard.sourceBlocks)?dashboard.sourceBlocks:[]),...(Array.isArray(dashboard.rightSourceBlocks)?dashboard.rightSourceBlocks:[])];
    const seen=new Set();
    return blocks.filter(block=>block?.type === "gmail" && block.accountBlockId !== null && typeof block.id === "string")
        .map(block=>({blockId:typeof block.accountBlockId === "string" && block.accountBlockId ? block.accountBlockId : block.id,sourceBlockId:block.id}))
        .filter(item=>{if(seen.has(item.blockId))return false;seen.add(item.blockId);return true;});
}

function addEmailThreads(nodes, edges, blockId, accountEmail, threads) {
    for (const thread of threads || []) {
        if (!thread || typeof thread.id !== "string") continue;
        const threadNode=node("email-thread","gmail",`${blockId}:${thread.id}`,thread.subject || "Email conversation",{kind:"gmail-thread",blockId,threadId:thread.id},{accountEmail,updatedAt:thread.updatedAt || "",messageCount:Number(thread.messageCount)||0});
        nodes.push(threadNode);
        for (const message of thread.messages || []) {
            if (typeof message.id !== "string") continue;
            const messageNode=node("email-message","gmail",`${blockId}:${message.id}`,message.sender || thread.subject || "Email message",{kind:"gmail-message",blockId,messageId:message.id,threadId:thread.id},{subject:thread.subject || "",at:message.receivedAt || ""});
            nodes.push(messageNode); edges.push(edge("contains",threadNode.id,messageNode.id,"gmail"));
            const address=(message.sender || "").match(/<([^>]+)>/)?.[1] || (message.sender || "").trim();
            if (address.includes("@")) {
                const person=node("person","gmail-contact",address.toLocaleLowerCase(),address,{kind:"email-address",email:address});
                nodes.push(person); edges.push(edge("sent",person.id,messageNode.id,"gmail-header"));
            }
        }
    }
}

function replaceSourceGraph(existing, nodes, edges, progress) {
    const preservedNodes=existing.nodes.filter(item=>!INDEXED_TYPES.has(item.type)&&!SNAPSHOT_TYPES.has(item.type));
    const combined={...existing,nodes:preservedNodes,edges:existing.edges.filter(item=>preservedNodes.some(node=>node.id===item.from)&&preservedNodes.some(node=>node.id===item.to))};
    const incomingIds=new Set(nodes.map(item=>item.id));
    const sharedNodes=existing.sharedThreads.filter(item=>!incomingIds.has(`email-thread:${stableId("gmail",`${item.blockId}:${item.threadId}`)}`)).map(item=>node("email-thread","gmail",`${item.blockId}:${item.threadId}`,item.subject||"Shared email conversation",{kind:"gmail-thread",blockId:item.blockId,threadId:item.threadId,sourceWorldId:item.sourceWorldId},{accountEmail:item.accountEmail||"",shared:true,sourceWorldId:item.sourceWorldId}));
    return mergeGraph(combined,[...nodes,...sharedNodes],edges,progress);
}

async function selectConversation(userId,worldId,reference,{rootDirectory,includeNode=true}={}) {
    if(!reference||reference.provider!=="gmail"||typeof reference.threadId!=="string"||!reference.threadId||reference.threadId.length>300||typeof reference.blockId!=="string"||!reference.blockId)throw new Error("Selected conversation reference is invalid.");
    return mutateGraph(userId,worldId,rootDirectory,graph=>{
        const key=`${reference.blockId}:${reference.threadId}`;
        if(!graph.selectedConversations.some(item=>`${item.blockId}:${item.threadId}`===key)&&graph.selectedConversations.length>=500)throw new Error("A planet can save at most 500 selected conversations.");
        const selectedConversations=graph.selectedConversations.filter(item=>`${item.blockId}:${item.threadId}`!==key);
        selectedConversations.push({...reference,selectedAt:new Date().toISOString()});
        const targetId=`email-thread:${stableId("gmail",key)}`;
        const existingNode=graph.nodes.find(item=>item.id===targetId);
        const selectedNode=existingNode||node("email-thread","gmail",key,reference.subject||"Selected Gmail conversation",{kind:"gmail-thread",blockId:reference.blockId,threadId:reference.threadId},{accountEmail:reference.accountEmail||"",selected:true});
        const shouldInclude=includeNode!==false;
        const selection={...graph,selectedConversations,conversationSelectionConfigured:true,updatedAt:new Date().toISOString()};
        if(shouldInclude)return existingNode?selection:mergeAdditionalGraphItems(selection,[selectedNode],[]);
        if(!existingNode?.details?.selected)return selection;
        const nodes=graph.nodes.filter(item=>item.id!==targetId);const ids=new Set(nodes.map(item=>item.id));
        return {...selection,nodes,edges:graph.edges.filter(item=>ids.has(item.from)&&ids.has(item.to))};
    });
}

async function unselectConversation(userId,worldId,blockId,threadId,{rootDirectory}={}) {
    return mutateGraph(userId,worldId,rootDirectory,graph=>{
        const key=`${blockId}:${threadId}`;
        const selectedConversations=graph.selectedConversations.filter(item=>`${item.blockId}:${item.threadId}`!==key);
        const targetId=`email-thread:${stableId("gmail",key)}`;
        const indexed=graph.nodes.some(item=>item.id===targetId&&!item.details?.selected);
        return {...graph,selectedConversations,conversationSelectionConfigured:true,nodes:indexed?graph.nodes:graph.nodes.filter(item=>item.id!==targetId),edges:indexed?graph.edges:graph.edges.filter(item=>item.from!==targetId&&item.to!==targetId),updatedAt:new Date().toISOString()};
    });
}

async function upsertActivity(userId, worldId, activity, {rootDirectory} = {}) {
    if (!activity || typeof activity.summary !== "string" || !activity.summary.trim()) throw new Error("Activity summary is required.");
    const operationId=typeof activity.operationId === "string" && activity.operationId.length <= 120 ? activity.operationId : crypto.randomUUID();
    const summary=activity.summary.slice(0,240);
    const activityNode=node(activity.kind === "search" ? "search" : "activity","folderrocket",operationId,summary,{kind:"activity",operationId},{at:typeof activity.at === "string" ? activity.at : new Date().toISOString(),files:Array.isArray(activity.files)?activity.files.slice(0,20).map(value=>String(value).slice(0,200)):[]});
    return mutateGraph(userId,worldId,rootDirectory,current=>!["ready","partial","indexing"].includes(current.status)?current:mergeAdditionalGraphItems(current,[activityNode],[]));
}

async function upsertGraphData(userId, worldId, nodes = [], edges = [], {rootDirectory} = {}) {
    return mutateGraph(userId,worldId,rootDirectory,existing=>mergeAdditionalGraphItems(existing,nodes,edges));
}

async function replaceSnapshotGraphData(userId,worldId,nodes=[],edges=[],{rootDirectory}={}) {
    return mutateGraph(userId,worldId,rootDirectory,existing=>{
        if(!["ready","partial","indexing"].includes(existing.status))return existing;
        const preservedNodes=existing.nodes.filter(item=>!SNAPSHOT_TYPES.has(item.type));
        const preservedIds=new Set(preservedNodes.map(item=>item.id));
        const preservedEdges=existing.edges.filter(item=>preservedIds.has(item.from)&&preservedIds.has(item.to));
        const worldNode=existing.nodes.find(item=>item.type==="world"&&item.sourceId===String(worldId));
        const snapshotEdges=worldNode?addWorldMembershipEdges(worldId,worldNode,[...preservedNodes,...nodes],edges):edges;
        return mergeAdditionalGraphItems({...existing,nodes:preservedNodes,edges:preservedEdges},nodes,snapshotEdges);
    });
}

async function addSharedThread(userId, worldId, reference, {rootDirectory} = {}) {
    if (!reference || typeof reference.threadId !== "string" || typeof reference.blockId !== "string" || typeof reference.sourceWorldId !== "string") throw new Error("Shared conversation reference is invalid.");
    return mutateGraph(userId,worldId,rootDirectory,graph=>{
        const key=`${reference.blockId}:${reference.threadId}`;
        const sharedThreads=graph.sharedThreads.filter(item=>`${item.blockId}:${item.threadId}`!==key);
        sharedThreads.push({...reference,id:`share:${stableId(userId,worldId,key)}`,sharedAt:new Date().toISOString()});
        const threadNode=node("email-thread","gmail",key,reference.subject || "Shared email conversation",{kind:"gmail-thread",blockId:reference.blockId,threadId:reference.threadId,sourceWorldId:reference.sourceWorldId},{accountEmail:reference.accountEmail || "",shared:true,sourceWorldId:reference.sourceWorldId});
        return mergeAdditionalGraphItems({...graph,sharedThreads,updatedAt:new Date().toISOString(),nodes:graph.nodes.filter(item=>item.id!==threadNode.id)},[threadNode],[]);
    });
}

async function removeSharedThread(userId,worldId,blockId,threadId,{rootDirectory}={}) {
    return mutateGraph(userId,worldId,rootDirectory,graph=>{
        const key=`${blockId}:${threadId}`;
        const sharedThreads=graph.sharedThreads.filter(item=>`${item.blockId}:${item.threadId}`!==key);
        const targetId=`email-thread:${stableId("gmail",key)}`;
        const hasLocalMailboxNode=graph.nodes.some(item=>item.id===targetId && !item.details?.shared);
        return {...graph,sharedThreads,nodes:hasLocalMailboxNode?graph.nodes:graph.nodes.filter(item=>item.id!==targetId),edges:graph.edges.filter(item=>item.from!==targetId&&item.to!==targetId),updatedAt:new Date().toISOString()};
    });
}

async function removeWorldGraph(userId,worldId,{rootDirectory}={}) {
    const activeJob=jobs.get(`${userId}:${worldId}`);
    if(activeJob)await activeJob.catch(()=>{});
    await fs.rm(graphPath(userId,worldId,rootDirectory),{force:true});
}

async function updateGraphStatus(userId,worldId,status,progress,warnings,{rootDirectory,sourceStatuses}={}) {
    return mutateGraph(userId,worldId,rootDirectory,current=>({...current,status,progress:{...current.progress,...progress},...(Array.isArray(warnings)?{warnings:warnings.slice(0,30)}:{}),...(Array.isArray(sourceStatuses)?{sourceStatuses:normalizeSourceStatuses(sourceStatuses)}:{}),updatedAt:new Date().toISOString()}));
}

function statusForSources(sourceStatuses, progress = {}) {
    if (sourceStatuses.some(item => item.status === "indexing")) return "indexing";
    return progress.limitReached || sourceStatuses.some(item => item.status === "partial" || item.status === "failed" || item.status === "skipped" && item.reasonCode !== "source_disabled") ? "partial" : "ready";
}

function pathIsWithin(root, candidate) {
    if (!root || !candidate) return false;
    const resolvedRoot=path.resolve(root),resolvedCandidate=path.resolve(candidate);
    const left=process.platform === "win32" ? resolvedRoot.toLocaleLowerCase() : resolvedRoot;
    const right=process.platform === "win32" ? resolvedCandidate.toLocaleLowerCase() : resolvedCandidate;
    const relative=path.relative(left,right);
    return relative===""||(relative!==".."&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative));
}

function sourceOwnedNodeIds(graph, sourceStatus, sourcePath = "") {
    const nodes=Array.isArray(graph?.nodes)?graph.nodes:[];
    if(sourceStatus.type === "folder")return new Set(nodes.filter(item=>item?.sourceType === "filesystem"&&(item.sourceRef?.graphSourceId===sourceStatus.sourceId||pathIsWithin(sourcePath,item.sourceRef?.path))).map(item=>item.id));
    if(sourceStatus.type === "snapshot")return new Set(nodes.filter(item=>SNAPSHOT_TYPES.has(item?.type)).map(item=>item.id));
    const blockId=sourceStatus.sourceId.startsWith("gmail:")?sourceStatus.sourceId.slice("gmail:".length):"";
    const messages=new Set(nodes.filter(item=>item?.type === "email-message"&&item.sourceRef?.blockId===blockId).map(item=>item.id));
    const ids=new Set(nodes.filter(item=>(item?.type === "email-thread"||item?.type === "email-message")&&item.sourceRef?.blockId===blockId).map(item=>item.id));
    for(const item of (Array.isArray(graph?.edges)?graph.edges:[]))if(item?.provenance==="gmail-header"&&messages.has(item.to))ids.add(item.from);
    return ids;
}

function mergeSourceNodes(existingNodes, incomingNodes, sourceIds, preservePrevious) {
    const nodes=new Map();
    for(const item of existingNodes)if(!sourceIds.has(item.id))nodes.set(item.id,item);
    if(preservePrevious)for(const item of existingNodes)if(sourceIds.has(item.id))nodes.set(item.id,item);
    for(const item of incomingNodes)if(item&&typeof item.id==="string")nodes.set(item.id,item);
    return [...nodes.values()];
}

async function replaceIndexedSourceGraph(userId,worldId,status,nodes=[],edges=[],{rootDirectory,sourcePath="",sourceStatuses=[]}={}) {
    const normalized=sourceStatus(status);
    return mutateGraph(userId,worldId,rootDirectory,current=>{
        const previousOwned=sourceOwnedNodeIds(current,normalized,sourcePath);
        const preservePrevious=normalized.status!=="complete";
        const finalStatus=preservePrevious&&previousOwned.size
            ?sourceStatus({...normalized,message:`${normalized.message||"The source could not be fully refreshed."} Previously indexed data remains available.`.slice(0,240)})
            :normalized;
        const nextNodes=mergeSourceNodes(current.nodes,nodes,previousOwned,preservePrevious);
        const ids=new Set(nextNodes.map(item=>item.id));
        const nextEdges=current.edges.filter(item=>ids.has(item.from)&&ids.has(item.to)&&(preservePrevious||!(previousOwned.has(item.from)||previousOwned.has(item.to))));
        for(const item of edges)if(item&&ids.has(item.from)&&ids.has(item.to))nextEdges.push(item);
        const world=nextNodes.find(item=>item.type==="world"&&item.sourceId===String(worldId));
        if(world&&normalized.type==="folder"&&sourcePath){
            const root=nextNodes.find(item=>item.type==="folder"&&path.resolve(item.sourceRef?.path||"")===path.resolve(sourcePath));
            if(root)nextEdges.push(edge("contains",world.id,root.id,"configured-world-folder"));
        }
        const dedupedEdges=[...new Map(nextEdges.filter(item=>ids.has(item.from)&&ids.has(item.to)).map(item=>[item.id,item])).values()];
        const linkedEdges=world?addWorldMembershipEdges(worldId,world,nextNodes,dedupedEdges):dedupedEdges;
        const initialStatuses=normalizeSourceStatuses([...sourceStatuses.filter(item=>item.sourceId!==finalStatus.sourceId),finalStatus]);
        const aggregateStatuses=withAggregateLimitStatus(initialStatuses,nextNodes.length,linkedEdges.length).filter(item=>item.type==="aggregate");
        const statuses=normalizeSourceStatuses([...initialStatuses.filter(item=>item.type!=="aggregate"),...aggregateStatuses]);
        const aggregateLimited=aggregateStatuses.length>0;
        const progress={...current.progress,stage:"complete",limitReached:finalStatus.status==="partial"||finalStatus.reasonCode==="node_limit"||finalStatus.reasonCode==="edge_limit"||aggregateLimited};
        const merged=mergeAdditionalGraphItems({...current,nodes:[],edges:[]},nextNodes,linkedEdges);
        const warnings=Array.isArray(current.warnings)?current.warnings.filter(item=>!String(item).startsWith("The combined graph reached its local ")):[];
        for(const item of aggregateStatuses)warnings.push(item.message);
        return {...merged,status:statusForSources(statuses,progress),progress,sourceStatuses:statuses,warnings:warnings.slice(0,30),updatedAt:new Date().toISOString()};
    });
}

async function replaceIndexedGraph(userId,worldId,nodes,edges,progress,{rootDirectory,warnings=[],sourceStatuses=[]}={}) {
    const statuses=normalizeSourceStatuses(sourceStatuses);
    return mutateGraph(userId,worldId,rootDirectory,current=>{
        const snapshotSelected=statuses.some(item=>item.sourceId==="snapshot");
        const sourceBase=snapshotSelected?current:(()=>{
            const retainedNodes=current.nodes.filter(item=>!SNAPSHOT_TYPES.has(item.type));
            const retainedIds=new Set(retainedNodes.map(item=>item.id));
            return {...current,nodes:retainedNodes,edges:current.edges.filter(item=>retainedIds.has(item.from)&&retainedIds.has(item.to))};
        })();
        const replaced=replaceSourceGraph({...sourceBase,sourceStatuses:statuses},nodes,edges,{...progress,stage:"complete",limitReached:progress.limitReached===true||statuses.some(item=>item.status==="partial"||item.status==="failed")});
        const finalStatuses=normalizeSourceStatuses([...statuses.filter(item=>item.type!=="aggregate"),...replaced.sourceStatuses.filter(item=>item.type==="aggregate")]);
        const finalProgress={...replaced.progress,limitReached:replaced.progress.limitReached===true||finalStatuses.some(item=>item.type==="aggregate")};
        const finalWarnings=[...new Set([...warnings,...finalStatuses.filter(item=>item.type==="aggregate").map(item=>item.message)])].slice(0,30);
        return {...replaced,status:statusForSources(finalStatuses,finalProgress),progress:finalProgress,sourceStatuses:finalStatuses,warnings:finalWarnings};
    });
}

function enqueueIndex(key, fn) {
    if (jobs.has(key)) return false;
    const promise=Promise.resolve().then(fn).finally(()=>jobs.delete(key));
    jobs.set(key,promise);
    return true;
}

function isIndexing(userId,worldId) { return jobs.has(`${userId}:${worldId}`); }

module.exports={VERSION,MAX_NODES,MAX_EDGES,validId,stableId,contentRevision,emptyGraph,readGraph,writeGraph,renameGraphFileWithRetry,node,edge,sourceStatus,normalizeSourceStatuses,failIndexingSources,statusForSources,walkConfiguredFolders,snapshotGraphItems,addWorldMembershipEdges,listGmailBlocks,addEmailThreads,replaceSourceGraph,replaceIndexedSourceGraph,sourceOwnedNodeIds,upsertActivity,upsertGraphData,replaceSnapshotGraphData,addSharedThread,removeSharedThread,selectConversation,unselectConversation,removeWorldGraph,updateGraphStatus,replaceIndexedGraph,mutateGraph,enqueueIndex,isIndexing};
