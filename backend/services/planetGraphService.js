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

function emptyGraph(userId, worldId) {
    return {version:VERSION, userId:String(userId), worldId, status:"disabled", progress:{stage:"idle",processed:0,total:0,limitReached:false}, updatedAt:new Date().toISOString(), nodes:[], edges:[], sharedThreads:[]};
}

async function readGraph(userId, worldId, rootDirectory) {
    try {
        const value = JSON.parse(await fs.readFile(graphPath(userId, worldId, rootDirectory), "utf8"));
        if (value?.version !== VERSION || value.userId !== String(userId) || value.worldId !== worldId || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return emptyGraph(userId, worldId);
        return {...emptyGraph(userId, worldId), ...value, nodes:value.nodes, edges:value.edges, sharedThreads:Array.isArray(value.sharedThreads) ? value.sharedThreads : []};
    } catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError) return emptyGraph(userId, worldId);
        throw error;
    }
}

async function writeGraph(graph, rootDirectory) {
    const target = graphPath(graph.userId, graph.worldId, rootDirectory);
    const queueKey = target.toLocaleLowerCase();
    const previous = writes.get(queueKey) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
        await fs.mkdir(path.dirname(target), {recursive:true, mode:0o700});
        const temporary = `${target}.${process.pid}.${crypto.randomBytes(5).toString("hex")}.tmp`;
        try {
            await fs.writeFile(temporary, JSON.stringify(graph), {encoding:"utf8", mode:0o600});
            await fs.rename(temporary, target);
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

function node(type, sourceType, sourceId, label, sourceRef = {}, details = {}) {
    const id = `${type}:${stableId(sourceType, sourceId)}`;
    return {id,type,sourceType,sourceId:String(sourceId),label:String(label || type).slice(0,240),sourceRef,details,updatedAt:new Date().toISOString()};
}

function edge(type, from, to, provenance = "source") {
    if (!from || !to || from === to) return null;
    return {id:`edge:${stableId(type,from,to,provenance)}`,type,from,to,provenance};
}

function mergeGraph(existing, nodes, edges, progress = existing.progress) {
    const saved = new Map(existing.nodes.filter(item => !INDEXED_TYPES.has(item.type)).map(item => [item.id,item]));
    for (const item of nodes) saved.set(item.id,item);
    const allNodes = [...saved.values()].slice(0,MAX_NODES);
    const ids = new Set(allNodes.map(item => item.id));
    const mergedEdges = new Map(existing.edges.filter(item => ids.has(item.from) && ids.has(item.to)).map(item => [item.id,item]));
    for (const item of edges) if (ids.has(item.from) && ids.has(item.to)) mergedEdges.set(item.id,item);
    return {...existing,status:progress.stage === "complete" ? (progress.limitReached ? "partial" : "ready") : "indexing",progress,updatedAt:new Date().toISOString(),nodes:allNodes,edges:[...mergedEdges.values()].slice(0,MAX_EDGES)};
}

function mergeAdditionalGraphItems(existing,nodes=[],edges=[]) {
    const nodeMap=new Map(existing.nodes.map(item=>[item.id,item]));
    for(const item of nodes)if(item&&typeof item.id==="string")nodeMap.set(item.id,item);
    const allNodes=[...nodeMap.values()].slice(0,MAX_NODES);
    const ids=new Set(allNodes.map(item=>item.id));
    const edgeMap=new Map(existing.edges.filter(item=>ids.has(item.from)&&ids.has(item.to)).map(item=>[item.id,item]));
    for(const item of edges)if(item&&ids.has(item.from)&&ids.has(item.to))edgeMap.set(item.id,item);
    return {...existing,nodes:allNodes,edges:[...edgeMap.values()].slice(0,MAX_EDGES),updatedAt:new Date().toISOString()};
}

async function walkConfiguredFolders(folders, {maxDirectories = 400, maxFiles = 3_000, maxDepth = 8, validateRoot = async value => value, excludePaths = []} = {}) {
    const nodes = [], edges = [], visited = new Set();
    const excluded = (Array.isArray(excludePaths) ? excludePaths : []).filter(value => typeof value === "string").map(value => path.resolve(value));
    const roots = (Array.isArray(folders) ? folders : []).filter(folder => folder && folder.storage !== "imaginary" && typeof folder.path === "string" && folder.path.trim());
    let processedDirectories = 0, processedFiles = 0, limitReached = false;
    const addDirectory = async (entryPath, label, depth, parentId = "") => {
        let real;
        try { real = await fs.realpath(entryPath); } catch { return; }
        const compare = value => process.platform === "win32" ? value.toLocaleLowerCase() : value;
        if(excluded.some(value => {const left=compare(value),right=compare(real);const relative=path.relative(left,right);return relative===""||(relative!==".."&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative));}))return;
        const key = process.platform === "win32" ? real.toLocaleLowerCase() : real;
        if (visited.has(key)) return;
        visited.add(key);
        const folderNode = node("folder","filesystem",real,label,{kind:"folder",path:real});
        nodes.push(folderNode);
        if (parentId) edges.push(edge("contains",parentId,folderNode.id,"filesystem"));
        if (depth > maxDepth || processedDirectories >= maxDirectories) { limitReached = true; return; }
        let entries;
        try { entries = await fs.readdir(real,{withFileTypes:true}); } catch { return; }
        processedDirectories += 1;
        entries.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}));
        for (const entry of entries) {
            if (entry.name.startsWith(".") || (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name.toLocaleLowerCase()))) continue;
            const target = path.join(real,entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (processedDirectories >= maxDirectories) { limitReached=true; break; }
                await addDirectory(target,entry.name,depth+1,folderNode.id);
            } else if (entry.isFile()) {
                if (processedFiles >= maxFiles) { limitReached=true; break; }
                let stats; try { stats=await fs.stat(target); } catch { continue; }
                const fileNode=node("file","filesystem",target,entry.name,{kind:"file",path:target},{extension:path.extname(entry.name).toLowerCase(),size:stats.size,modifiedAt:stats.mtime.toISOString()});
                nodes.push(fileNode); edges.push(edge("contains",folderNode.id,fileNode.id,"filesystem")); processedFiles+=1;
            }
        }
    };
    for (const folder of roots) {
        if (nodes.length >= MAX_NODES) { limitReached=true; break; }
        let checked;
        try { checked=await validateRoot(folder.path); } catch { continue; }
        await addDirectory(checked,folder.name || path.basename(checked),0);
    }
    return {nodes,edges,processedDirectories,processedFiles,limitReached,configuredRoots:roots.length};
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
    const preservedNodes=existing.nodes.filter(item=>!INDEXED_TYPES.has(item.type) || item.type === "activity" || item.type === "search");
    const combined={...existing,nodes:preservedNodes,edges:existing.edges.filter(item=>preservedNodes.some(node=>node.id===item.from)&&preservedNodes.some(node=>node.id===item.to))};
    const incomingIds=new Set(nodes.map(item=>item.id));
    const sharedNodes=existing.sharedThreads.filter(item=>!incomingIds.has(`email-thread:${stableId("gmail",`${item.blockId}:${item.threadId}`)}`)).map(item=>node("email-thread","gmail",`${item.blockId}:${item.threadId}`,item.subject||"Shared email conversation",{kind:"gmail-thread",blockId:item.blockId,threadId:item.threadId,sourceWorldId:item.sourceWorldId},{accountEmail:item.accountEmail||"",shared:true,sourceWorldId:item.sourceWorldId}));
    return mergeGraph(combined,[...nodes,...sharedNodes],edges,progress);
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
        return mergeAdditionalGraphItems({...existing,nodes:preservedNodes,edges:preservedEdges},nodes,edges);
    });
}

async function addSharedThread(userId, worldId, reference, {rootDirectory} = {}) {
    if (!reference || typeof reference.threadId !== "string" || typeof reference.blockId !== "string" || typeof reference.sourceWorldId !== "string") throw new Error("Shared conversation reference is invalid.");
    return mutateGraph(userId,worldId,rootDirectory,graph=>{
        const key=`${reference.blockId}:${reference.threadId}`;
        const sharedThreads=graph.sharedThreads.filter(item=>`${item.blockId}:${item.threadId}`!==key);
        sharedThreads.push({...reference,id:`share:${stableId(userId,worldId,key)}`,sharedAt:new Date().toISOString()});
        const threadNode=node("email-thread","gmail",key,reference.subject || "Shared email conversation",{kind:"gmail-thread",blockId:reference.blockId,threadId:reference.threadId,sourceWorldId:reference.sourceWorldId},{accountEmail:reference.accountEmail || "",shared:true,sourceWorldId:reference.sourceWorldId});
        const nodes=graph.nodes.filter(item=>item.id!==threadNode.id);
        nodes.push(threadNode);
        return {...graph,sharedThreads,nodes:nodes.slice(0,MAX_NODES),updatedAt:new Date().toISOString()};
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

async function updateGraphStatus(userId,worldId,status,progress,warnings,{rootDirectory}={}) {
    return mutateGraph(userId,worldId,rootDirectory,current=>({...current,status,progress:{...current.progress,...progress},...(Array.isArray(warnings)?{warnings:warnings.slice(0,30)}:{}),updatedAt:new Date().toISOString()}));
}

async function replaceIndexedGraph(userId,worldId,nodes,edges,progress,{rootDirectory,warnings=[]}={}) {
    return mutateGraph(userId,worldId,rootDirectory,current=>({...replaceSourceGraph(current,nodes,edges,{...progress,stage:"complete"}),warnings:warnings.slice(0,30)}));
}

function enqueueIndex(key, fn) {
    if (jobs.has(key)) return false;
    const promise=Promise.resolve().then(fn).finally(()=>jobs.delete(key));
    jobs.set(key,promise);
    return true;
}

function isIndexing(userId,worldId) { return jobs.has(`${userId}:${worldId}`); }

module.exports={VERSION,MAX_NODES,MAX_EDGES,validId,stableId,emptyGraph,readGraph,writeGraph,node,edge,walkConfiguredFolders,snapshotGraphItems,listGmailBlocks,addEmailThreads,replaceSourceGraph,upsertActivity,upsertGraphData,replaceSnapshotGraphData,addSharedThread,removeSharedThread,removeWorldGraph,updateGraphStatus,replaceIndexedGraph,mutateGraph,enqueueIndex,isIndexing};
