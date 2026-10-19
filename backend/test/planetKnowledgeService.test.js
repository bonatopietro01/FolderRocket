const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {emptyKnowledge,normalizeKnowledge,readKnowledge,writeKnowledge,filePath,managedMarkdownRoot,ensureManagedMarkdownRoot,readiness} = require("../services/planetKnowledgeService");
const obsidianVault=require("../services/obsidianVaultService");

test("planet knowledge persistence is isolated by user and planet", async t => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-knowledge-store-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const first={...emptyKnowledge("user-1","work"),status:"ready",sourceSelectionFingerprint:"selection-a",nodes:[{id:"doc-a",type:"knowledge-document",label:"Fixture note"}],edges:[],notes:[{id:"doc-a",title:"Fixture note",markdown:"# Fixture note"}]};
    await writeKnowledge(first,root);
    assert.equal((await readKnowledge("user-1","work",root)).nodes[0].label,"Fixture note");
    assert.equal((await readKnowledge("user-2","work",root)).nodes.length,0);
    assert.equal((await readKnowledge("user-1","personal",root)).nodes.length,0);
    assert.notEqual(filePath("user-1","work",root),filePath("user-2","work",root));
});

test("planet knowledge persistence normalizes dangling edges and note content aliases", () => {
    const nodes=Array.from({length:5},(_,index)=>({id:`node-${index}`,type:"knowledge-document",label:`Note ${index}`}));
    const edges=[{id:"valid",source:"node-0",target:"node-1",type:"related"},{id:"dangling",source:"node-0",target:"missing",type:"related"}];
    const notes=Array.from({length:5},(_,index)=>({id:`note-${index}`,title:`Note ${index}`,content:"# Note"}));
    const normalized=normalizeKnowledge({...emptyKnowledge("user-1","work"),nodes,edges,notes},"user-1","work");
    assert.equal(normalized.nodes.length,5);
    assert.deepEqual(normalized.edges.map(edge=>[edge.from,edge.to]),[["node-0","node-1"]]);
    assert.equal(normalized.notes.length,5);
    assert.equal(normalized.notes[0].markdown,"# Note");
});

test("compact source descriptors persist bounded explicit links without original text",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-knowledge-descriptor-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const descriptor={version:1,sourceId:"file-a",sourceScopeId:"filesystem:root-a",title:"Source",kind:"file",locator:"C:/fixture/source.txt",contentHash:"hash-a",terms:["supplier","procurement"],summary:"A short retained evidence summary.",evidence:["source evidence"],explicitLinks:Array.from({length:50},(_,index)=>`Target ${index}`)};
    const knowledge={...emptyKnowledge("user-1","work"),status:"ready",sourceMetadata:{"file-a":{signature:"1:2:3",contentHash:"hash-a",descriptor}}};
    await writeKnowledge(knowledge,root);
    const restored=await readKnowledge("user-1","work",root);
    assert.equal(restored.sourceMetadata["file-a"].descriptor.explicitLinks.length,40);
    assert.equal(restored.sourceMetadata["file-a"].descriptor.explicitLinks[0],"Target 0");
    assert.equal("text" in restored.sourceMetadata["file-a"].descriptor,false);
});

test("planet knowledge paths reject arbitrary owner and planet identifiers", () => {
    assert.throws(()=>filePath("../user","work"),/Invalid knowledge owner or planet identifier/);
    assert.throws(()=>filePath("user-1","../vault"),/Invalid knowledge owner or planet identifier/);
});

test("readiness requires current source evidence and exposes partial and stale states",()=>{
    const knowledge={...emptyKnowledge("user-1","work"),status:"ready",sourceSelectionFingerprint:"scope-1",graphRevision:"rev-1",nodes:[{id:"doc-1",type:"knowledge-document",source:{id:"source-1"}},{id:"area-1",type:"knowledge-area"}],notes:[{id:"doc-1",markdown:"# Evidence"},{id:"area-1",markdown:"# Area"}]};
    assert.equal(readiness({enabled:true,knowledge,fingerprint:"scope-1",graphRevision:"rev-1"}).readiness,"ready");
    assert.equal(readiness({enabled:true,graphStatus:"error",knowledge,fingerprint:"scope-1",graphRevision:"rev-1"}).readiness,"error","an indexing failure remains visible even when last-good knowledge is retained");
    assert.equal(readiness({enabled:true,knowledge,fingerprint:"scope-1",graphRevision:"rev-2"}).readiness,"stale");
    assert.equal(readiness({enabled:true,knowledge:{...knowledge,status:"partial"},fingerprint:"scope-1",graphRevision:"rev-1"}).readiness,"partial");
    const structuralOnly={...knowledge,nodes:[{id:"area-1",type:"knowledge-area"}]};
    const result=readiness({enabled:true,knowledge:structuralOnly,fingerprint:"scope-1",graphRevision:"rev-1"});
    assert.equal(result.queryable,false,"structural hubs without retained source documents are not queryable evidence");
    assert.equal(result.readiness,"empty");
});

test("managed Markdown path is derived from authenticated owner and planet under runtime data",()=>{
    const root=path.join(os.tmpdir(),"managed-fixture");
    const first=managedMarkdownRoot("user-1","work",root);
    assert.equal(path.dirname(path.dirname(first)),path.resolve(root));
    assert.notEqual(first,managedMarkdownRoot("user-2","work",root));
    assert.notEqual(first,managedMarkdownRoot("user-1","personal",root));
    assert.throws(()=>managedMarkdownRoot("../user","work",root),/Invalid knowledge owner/);
});

test("managed Markdown root creation validates each derived directory",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-managed-md-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const target=await ensureManagedMarkdownRoot("user-1","work",root);
    assert.equal(target,managedMarkdownRoot("user-1","work",root));
    assert.ok((await fs.stat(target)).isDirectory());
});

test("managed Markdown publishes only current notes and prunes untouched superseded notes",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-managed-publish-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const vaultPath=await ensureManagedMarkdownRoot("user-1","work",root);
    const first=[{id:"knowledge:doc-a",kind:"knowledge-document",sourceScopeId:"filesystem:folder-a",title:"A",content:"Current evidence A",notePath:"FolderRocket/Knowledge/a.md"},{id:"knowledge:doc-b",kind:"knowledge-document",sourceScopeId:"filesystem:folder-b",title:"B",content:"Current evidence B",notePath:"FolderRocket/Knowledge/b.md"}];
    await obsidianVault.syncVault({vaultPath,ownerId:"user-1",worldId:"work",records:first,completeSelection:true,selectedSourceScopeIds:["filesystem:folder-a","filesystem:folder-b"]});
    const next=[{...first[0],content:"Updated partial evidence A"}];
    await obsidianVault.syncVault({vaultPath,ownerId:"user-1",worldId:"work",records:next,completeSelection:true,selectedSourceScopeIds:["filesystem:folder-a"]});
    assert.match(await fs.readFile(path.join(vaultPath,"FolderRocket","Knowledge","a.md"),"utf8"),/Updated partial evidence A/);
    await assert.rejects(fs.access(path.join(vaultPath,"FolderRocket","Knowledge","b.md")),error=>error?.code==="ENOENT");
});

test("backend knowledge sync rebuilds complete snapshots and isolates unsupported sources", async () => {
    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    const start=server.indexOf("async function runKnowledgeSync(job,context)");
    const end=server.indexOf("function queueKnowledgeSyncJob",start);
    assert.ok(start>=0&&end>start,"knowledge sync implementation is present");
    const sync=server.slice(start,end);
    assert.match(sync,/if\(incompleteGraph\)\{[\s\S]*?retainPrevious\(reasons\)[\s\S]*?return;/,"an incomplete source index preserves the last complete knowledge snapshot");
    assert.match(sync,/await analyzeKnowledgeInWorker\(rawBatch/,"changed source text is analyzed only in bounded batches");
    assert.match(sync,/const compactDocuments=\[\.\.\.descriptorsById\.values\(\)\]\.map\(descriptor=>\(\{descriptor\}\)\)/,"the global rebuild receives compact descriptors rather than the full source corpus");
    assert.match(sync,/await analyzeKnowledgeInWorker\(compactDocuments/,"topics and links are recomputed across the complete compact source set");
    assert.match(sync,/old\?\.signature===signature&&addDescriptor\(candidate\.id,old\.descriptor,old\)/,"unchanged local sources reuse their retained descriptor without content extraction");
    assert.match(sync,/stats\.ctimeMs/,"local file signatures include change time as well as size and modified time");
    assert.ok(sync.indexOf("const selectedCandidates=allCandidates.filter(item=>item.selected)")<sync.indexOf("if(selectedCandidates.length>KNOWLEDGE_MAX_FILES)"),"user exclusions are applied before the selected source cap");
    const descriptorService=await fs.readFile(path.join(__dirname,"..","services","planetKnowledgeService.js"),"utf8");
    assert.match(descriptorService,/explicitLinks/,"bounded retained wiki references can be resolved across worker batches");
    assert.match(sync,/const nodeMap=new Map\(\);for\(const item of newNodes\)/,"a completed rebuild replaces the prior node set instead of carrying stale edges forward");
    assert.match(sync,/if\(!KNOWLEDGE_READABLE_EXTENSIONS\.has\(extension\)\)\{const reason=[\s\S]*?exclusions\.push\(\{sourceId:candidate\.id,reason\}\);continue;/,"unsupported formats become explicit per-source exclusions");
    assert.doesNotMatch(sync,/if\(!KNOWLEDGE_READABLE_EXTENSIONS\.has\(extension\)\)\{extractionIncomplete/,"one unsupported file does not block supported documents in the same selected scope");
    const metadataCheck=sync.indexOf("knowledgeMetadataExclusion(candidate.title,stats.size)");
    const contentRead=sync.indexOf("readFileContent(realPath)");
    assert.ok(metadataCheck>=0&&contentRead>metadataCheck,"filename and zero-byte exclusions run before local content extraction");
    const metadataStart=server.indexOf("function knowledgeMetadataExclusion(title,size)");
    const metadataEnd=server.indexOf("\n}",metadataStart)+2;
    const metadataFilter=server.slice(metadataStart,metadataEnd);
    assert.match(metadataFilter,/size===0/);
    assert.match(metadataFilter,/~\$|\.~lock\.|thumbs\.db|desktop\.ini|\.ds_store/i);
    assert.match(metadataFilter,/untitled|new document|document\s*|backup/);
    assert.match(server,/candidateCount,selectedCandidateCount,candidateLimitReached/,"the candidate API reports selected and total counts plus UI-list truncation");
});

test("backend graph contract binds freshness to content, exports managed Markdown and queues the latest generation",async()=>{
    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    assert.match(server,/const graphRevision=planetGraph\.contentRevision\(selectedGraph\)/);
    assert.match(server,/managedMarkdownPath:managedMarkdownCanonicalPath,graphRevision/);
    assert.match(server,/const managedResult=await obsidianVault\.syncVault\(\{vaultPath:scope\.managedMarkdownPath/);
    assert.match(server,/next\.managedMarkdown=\{path:scope\.managedMarkdownPath,revision:scope\.graphRevision/);
    assert.match(server,/active\.pendingGeneration\.replace\(\{scope,user\}\)/);
    assert.match(server,/knowledgePipelineQueue\.run\(\(\)=>\{[\s\S]*?runKnowledgeSync\(job/);
    assert.match(server,/selectedFolderWatcher\.createSelectedFolderWatcher/);
    assert.match(server,/refreshSelectedFolderSources\(user,worldId,scope\)/);
    assert.match(server,/app\.post\("\/worlds\/:worldId\/knowledge\/sync"[\s\S]*?scheduleSelectedFolderRefresh\(req\.user,worldId,scope\)/);
    assert.match(server,/automaticWatcher:knowledgeWatchersByScope\.has\(key\)/);
    assert.match(server,/currentKnowledge\.status!=="ready"[\s\S]*?custom Obsidian vault remains at its last complete revision/);
});
