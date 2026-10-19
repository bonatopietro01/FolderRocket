const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {getRuntimeDataDirectory} = require("./runtimePaths");

const VERSION = 1;
const MAX_NODES = 4_000;
const MAX_EDGES = 8_000;
const MAX_NOTES = 2_000;
const MAX_SOURCE_METADATA = 600;
const writes = new Map();

function validId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
function filePath(userId, worldId, rootDirectory = path.join(getRuntimeDataDirectory(), "planet-knowledge")) {
    if (!validId(String(userId)) || !validId(worldId)) throw new Error("Invalid knowledge owner or planet identifier.");
    const owner = crypto.createHash("sha256").update(String(userId)).digest("hex");
    return path.join(rootDirectory, owner, `${worldId}.json`);
}
function managedMarkdownRoot(userId,worldId,rootDirectory=path.join(getRuntimeDataDirectory(),"planet-knowledge-vaults")){
    if(!validId(String(userId))||!validId(worldId))throw new Error("Invalid knowledge owner or planet identifier.");
    const owner=crypto.createHash("sha256").update(String(userId)).digest("hex");
    return path.join(path.resolve(rootDirectory),owner,worldId);
}
async function ensureManagedMarkdownRoot(userId,worldId,rootDirectory=path.join(getRuntimeDataDirectory(),"planet-knowledge-vaults")){
    const base=path.resolve(rootDirectory),target=managedMarkdownRoot(userId,worldId,base);
    await fs.mkdir(base,{recursive:true,mode:0o700});
    const baseStat=await fs.lstat(base);if(baseStat.isSymbolicLink()||!baseStat.isDirectory()||path.resolve(await fs.realpath(base))!==base)throw new Error("Managed knowledge storage must be a real local directory.");
    let current=base;
    for(const part of path.relative(base,target).split(path.sep)){
        current=path.join(current,part);
        try{await fs.mkdir(current,{mode:0o700});}catch(error){if(error?.code!=="EEXIST")throw error;}
        const stats=await fs.lstat(current);if(stats.isSymbolicLink()||!stats.isDirectory())throw new Error("Managed knowledge storage contains an unsafe directory.");
    }
    return target;
}
function readiness({enabled,graphStatus="",knowledge,fingerprint,graphRevision=""}={}){
    const current=Boolean(knowledge?.sourceSelectionFingerprint&&knowledge.sourceSelectionFingerprint===fingerprint&&(!graphRevision||knowledge.graphRevision===graphRevision));
    const stale=Boolean(knowledge?.sourceSelectionFingerprint&&!current);
    const sourceNodes=new Set((Array.isArray(knowledge?.nodes)?knowledge.nodes:[]).filter(item=>item?.type==="knowledge-document"&&typeof item?.source?.id==="string"&&item.source.id).map(item=>item.id));
    const noteIds=new Set((Array.isArray(knowledge?.notes)?knowledge.notes:[]).filter(item=>item&&typeof item.id==="string"&&typeof (item.markdown||item.content)==="string").map(item=>item.id));
    const evidenceCount=[...sourceNodes].filter(id=>noteIds.has(id)).length;
    const queryable=enabled===true&&current&&evidenceCount>0;
    let state;
    if(enabled!==true)state="disabled";
    else if(graphStatus==="indexing"||knowledge?.status==="indexing")state="indexing";
    else if(knowledge?.status==="preparing"||knowledge?.status==="queued"||knowledge?.status==="running")state="preparing";
    else if(graphStatus==="error")state="error";
    else if(knowledge?.status==="error")state="error";
    else if(stale)state="stale";
    else if(!current)state="empty";
    else if(queryable&&knowledge.status==="partial")state="partial";
    else if(queryable)state="ready";
    else state="empty";
    return {readiness:state,knowledgeStatus:state,knowledgeNodeCount:Array.isArray(knowledge?.nodes)?knowledge.nodes.length:0,knowledgeNoteCount:Array.isArray(knowledge?.notes)?knowledge.notes.length:0,evidenceCount,stale,queryable,revision:graphRevision||knowledge?.graphRevision||""};
}
function emptyKnowledge(userId, worldId) {
    return {version:VERSION,userId:String(userId),worldId,status:"idle",progress:{stage:"idle",processed:0,total:0,limitReached:false},sourceSelectionFingerprint:"",graphRevision:"",managedMarkdown:null,sourceMetadata:{},nodes:[],edges:[],notes:[],exclusions:[],updatedAt:new Date().toISOString()};
}
function normalizeDescriptor(value) {
    if(!value||value.version!==1||typeof value.sourceId!=="string"||typeof value.sourceScopeId!=="string")return null;
    const string=(item,max)=>typeof item==="string"?item.slice(0,max):"";
    const terms=Array.isArray(value.terms)?[...new Set(value.terms.filter(item=>typeof item==="string"&&item.length>0))].slice(0,24):[];
    const evidence=Array.isArray(value.evidence)?value.evidence.filter(item=>typeof item==="string").slice(0,8).map(item=>item.slice(0,240)):[];
    const explicitLabels=Array.isArray(value.explicitLabels)?value.explicitLabels.filter(item=>item&&typeof item.kind==="string"&&typeof item.label==="string").slice(0,12).map(item=>({kind:string(item.kind,32),label:string(item.label,100),evidence:string(item.evidence,240)})):[];
    const explicitLinks=[...new Set((Array.isArray(value.explicitLinks)?value.explicitLinks:[]).slice(0,40).map(item=>string(item,240).replace(/[\[\]<>\u0000-\u001f]/g,"").split(/[|#]/u,1)[0].trim()).filter(Boolean))];
    const summaryMethod=value.summaryMethod==="model-assisted"?"model-assisted":"extractive";
    return {version:1,sourceId:string(value.sourceId,300),sourceScopeId:string(value.sourceScopeId,300),title:string(value.title,240),kind:string(value.kind,80),locator:string(value.locator,1_000),updatedAt:string(value.updatedAt,80),contentHash:string(value.contentHash,128),terms,summary:string(value.summary,900),summaryMethod,modelName:summaryMethod==="model-assisted"?string(value.modelName,100):"",evidence,explicitLabels,explicitLinks};
}
function normalizeSourceMetadata(value) {
    if(!value||typeof value!=="object"||Array.isArray(value))return {};
    const result={};
    for(const [id,item] of Object.entries(value).slice(0,MAX_SOURCE_METADATA)){
        if(typeof id!=="string"||!id||id.length>300||!item||typeof item!=="object"||Array.isArray(item))continue;
        const entry={};
        if(typeof item.signature==="string")entry.signature=item.signature.slice(0,300);
        if(typeof item.contentHash==="string")entry.contentHash=item.contentHash.slice(0,128);
        if(Array.isArray(item.nodeIds))entry.nodeIds=[...new Set(item.nodeIds.filter(value=>typeof value==="string"&&value.length<=120))].slice(0,80);
        if(Array.isArray(item.noteIds))entry.noteIds=[...new Set(item.noteIds.filter(value=>typeof value==="string"&&value.length<=120))].slice(0,80);
        if(typeof item.excludedReason==="string")entry.excludedReason=item.excludedReason.slice(0,240);
        const descriptor=normalizeDescriptor(item.descriptor);if(descriptor)entry.descriptor=descriptor;
        result[id]=entry;
    }
    return result;
}
function normalizeKnowledge(value, userId, worldId) {
    if (!value || value.version !== VERSION || value.userId !== String(userId) || value.worldId !== worldId) return emptyKnowledge(userId,worldId);
    const nodes = Array.isArray(value.nodes) ? value.nodes.filter(item => item && typeof item.id === "string" && typeof item.type === "string").slice(0,MAX_NODES) : [];
    const nodeIds = new Set(nodes.map(item => item.id));
    const edges = Array.isArray(value.edges) ? value.edges.map(item=>item&&{...item,from:item.from||item.source,to:item.to||item.target}).filter(item => item && nodeIds.has(item.from) && nodeIds.has(item.to) && item.from !== item.to).slice(0,MAX_EDGES) : [];
    const notes = Array.isArray(value.notes) ? value.notes.filter(item => item && typeof item.id === "string" && typeof item.title === "string" && typeof (item.content??item.markdown) === "string").map(item=>({...item,content:String(item.content??item.markdown),markdown:String(item.markdown??item.content)})).slice(0,MAX_NOTES) : [];
    const progress = value.progress && typeof value.progress === "object" ? value.progress : {};
    return {...emptyKnowledge(userId,worldId),...value,nodes,edges,notes,
        exclusions:Array.isArray(value.exclusions)?value.exclusions.slice(0,500).filter(item=>item&&typeof item.reason==="string").map(item=>({sourceId:String(item.sourceId||"").slice(0,300),reason:item.reason.slice(0,240)})):[],
        sourceMetadata:normalizeSourceMetadata(value.sourceMetadata),
        progress:{stage:String(progress.stage||"idle").slice(0,40),processed:Math.max(0,Math.floor(Number(progress.processed)||0)),total:Math.max(0,Math.floor(Number(progress.total)||0)),limitReached:progress.limitReached===true},
        status:["idle","indexing","ready","partial","error","cancelled","stale"].includes(value.status)?value.status:"idle"};
}
async function readKnowledge(userId, worldId, rootDirectory) {
    try { return normalizeKnowledge(JSON.parse(await fs.readFile(filePath(userId,worldId,rootDirectory),"utf8")),userId,worldId); }
    catch(error) { if(error?.code==="ENOENT"||error instanceof SyntaxError)return emptyKnowledge(userId,worldId); throw error; }
}
async function writeKnowledge(knowledge, rootDirectory) {
    const target=filePath(knowledge.userId,knowledge.worldId,rootDirectory), key=target.toLocaleLowerCase();
    const previous=writes.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
        await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
        const temporary=`${target}.${process.pid}.${crypto.randomBytes(5).toString("hex")}.tmp`;
        try { await fs.writeFile(temporary,JSON.stringify(normalizeKnowledge(knowledge,knowledge.userId,knowledge.worldId)),{encoding:"utf8",mode:0o600,flag:"wx"}); await fs.rename(temporary,target); }
        catch(error) { await fs.rm(temporary,{force:true}).catch(()=>{}); throw error; }
    });
    writes.set(key,next);
    try { await next; } finally { if(writes.get(key)===next)writes.delete(key); }
    return knowledge;
}
function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function documentFingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

module.exports={VERSION,MAX_NODES,MAX_EDGES,MAX_NOTES,MAX_SOURCE_METADATA,validId,filePath,managedMarkdownRoot,ensureManagedMarkdownRoot,readiness,emptyKnowledge,normalizeDescriptor,normalizeSourceMetadata,normalizeKnowledge,readKnowledge,writeKnowledge,fingerprint,documentFingerprint};
