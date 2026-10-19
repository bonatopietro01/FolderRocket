const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const graphStore = require("../services/planetGraphService");
const gmail = require("../services/gmailService");
const obsidianVault = require("../services/obsidianVaultService");
const canonicalPaths = require("../services/canonicalPathContainment");

test("planet graph persistence is isolated by user and world", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-planet-graph-"));
    t.after(() => fs.rm(root, {recursive:true, force:true}));

    const workNode = graphStore.node("folder", "filesystem", "work-root", "Work", {kind:"folder", path:"C:/synthetic/work"});
    const personalNode = graphStore.node("folder", "filesystem", "personal-root", "Personal", {kind:"folder", path:"C:/synthetic/personal"});
    await graphStore.replaceIndexedGraph("user-a", "work", [workNode], [], {stage:"complete", processed:1, total:1, limitReached:false}, {rootDirectory:root});
    await graphStore.replaceIndexedGraph("user-a", "personal", [personalNode], [], {stage:"complete", processed:1, total:1, limitReached:false}, {rootDirectory:root});
    await graphStore.replaceIndexedGraph("user-b", "work", [], [], {stage:"complete", processed:0, total:0, limitReached:false}, {rootDirectory:root});

    assert.deepEqual((await graphStore.readGraph("user-a", "work", root)).nodes.map(item => item.label), ["Work"]);
    assert.deepEqual((await graphStore.readGraph("user-a", "personal", root)).nodes.map(item => item.label), ["Personal"]);
    assert.deepEqual((await graphStore.readGraph("user-b", "work", root)).nodes, []);
});

test("selected conversations persist as own-planet provider references without changing cross-planet shares", async t => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-selected-chat-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    assert.equal((await graphStore.readGraph("user-a","work",root)).conversationSelectionConfigured,true,"new planets start with an explicit empty chat selector");
    await graphStore.selectConversation("user-a","work",{provider:"gmail",blockId:"gmail-work",threadId:"provider-thread-42",subject:"Synthetic subject",accountEmail:"owner@example.test"},{rootDirectory:root});
    let graph=await graphStore.readGraph("user-a","work",root);
    assert.equal(graph.selectedConversations.length,1);
    assert.equal(graph.selectedConversations[0].threadId,"provider-thread-42");
    assert.deepEqual(graph.sharedThreads,[]);
    await graphStore.replaceIndexedGraph("user-a","work",[],[],{stage:"complete",processed:0,total:0,limitReached:false},{rootDirectory:root});
    graph=await graphStore.readGraph("user-a","work",root);
    assert.equal(graph.selectedConversations.length,1,"reindex must preserve the user's selected thread reference");
    await graphStore.unselectConversation("user-a","work","gmail-work","provider-thread-42",{rootDirectory:root});
    graph=await graphStore.readGraph("user-a","work",root);
    assert.deepEqual(graph.selectedConversations,[]);
    assert.deepEqual(graph.sharedThreads,[]);
});

test("chat selection metadata persists when email graph indexing is disabled without adding email nodes",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-chat-selection-disabled-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    await graphStore.selectConversation("user-a","work",{provider:"gmail",blockId:"gmail-work",threadId:"thread-disabled",subject:"Synthetic selected thread"},{rootDirectory:root,includeNode:false});
    const graph=await graphStore.readGraph("user-a","work",root);
    assert.equal(graph.selectedConversations.length,1,"the thread reference remains available to the selector");
    assert.equal(graph.selectedConversations[0].threadId,"thread-disabled");
    assert.ok(!graph.nodes.some(item=>item.type==="email-thread"||item.type==="email-message"),"selecting a conversation must not index it while the source is disabled");
    const filtered=obsidianVault.filterGraphBySources({...graph,nodes:[...graph.nodes,graphStore.node("email-thread","gmail","gmail-work:old-thread","Old thread",{kind:"gmail-thread",blockId:"gmail-work",threadId:"old-thread"})]}, {version:2,email:false});
    assert.ok(!filtered.nodes.some(item=>item.type==="email-thread"||item.type==="email-message"),"previously indexed email nodes are excluded from graph and vault views when email is disabled");

    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    const chatRoutes=server.slice(server.indexOf('app.get("/worlds/:worldId/graph/chats"'),server.indexOf('app.post("/worlds/:worldId/graph/index"'));
    assert.doesNotMatch(chatRoutes,/sourceSelection\)\.email===false\)return res\.status\(409\)/,"email source selection must not block chat browsing or selection metadata");
    assert.match(chatRoutes,/includeNode:emailSourceEnabled/);
});

test("legacy planet graphs without a chat-selection marker retain their prior inbox behavior",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-legacy-chat-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const legacy=graphStore.emptyGraph("user-a","work");delete legacy.conversationSelectionConfigured;await graphStore.writeGraph(legacy,root);
    assert.equal((await graphStore.readGraph("user-a","work",root)).conversationSelectionConfigured,false);
});

test("planet graph adds stable membership and only explicit activity-to-file links",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-graph-membership-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const world=graphStore.node("world","folderrocket","work","Work",{kind:"world",worldId:"work"});
    const file=graphStore.node("file","filesystem","C:/synthetic/report.pdf","report.pdf",{kind:"file",path:"C:/synthetic/report.pdf"});
    const snapshot=graphStore.snapshotGraphItems({activities:[{kind:"activity",operationId:"op-1",summary:"Reviewed report",at:"2026-10-06T10:00:00Z",files:["C:/synthetic/report.pdf"]}]});
    const edges=graphStore.addWorldMembershipEdges("work",world,[world,file,...snapshot.nodes],snapshot.edges);
    assert.ok(edges.some(item=>item.from===world.id&&item.to===snapshot.nodes[0].id&&item.provenance.startsWith("planet-membership:work:")));
    assert.ok(edges.some(item=>item.from===snapshot.nodes[0].id&&item.to===file.id&&item.provenance==="explicit-activity-file-path"));
    assert.equal(graphStore.addWorldMembershipEdges("work",world,[world,file,...snapshot.nodes],edges).filter(item=>item.id===edges.find(edge=>edge.provenance==="explicit-activity-file-path").id).length,1);
    await graphStore.replaceIndexedGraph("user-a","work",[world,file,...snapshot.nodes],edges,{stage:"complete",processed:0,total:0,limitReached:false},{rootDirectory:root});
    const persisted=await graphStore.readGraph("user-a","work",root);assert.ok(persisted.edges.length>=2);
});

test("sender conversation query is limited to a rolling 30-day inbox scope and rejects query injection",()=>{
    const {senderInboxQuery}=require("../services/emailConversationSelectionService");
    assert.equal(senderInboxQuery("Alice@example.com"),"newer_than:30d from:alice@example.com");
    assert.throws(()=>senderInboxQuery("alice@example.com OR in:anywhere"),/invalid/i);
    const server=require("node:fs").readFileSync(require("node:path").join(__dirname,"..","server.js"),"utf8");
    const route=server.slice(server.indexOf('app.get("/worlds/:worldId/email/conversations"'),server.indexOf('app.get("/worlds/:worldId/email/notifications"'));
    assert.match(route,/const selected=activeAccount\?\.provider==="gmail"\?\[\{blockId:activeAccount\.blockId\}\]:\[\]/);
    assert.match(route,/listGmailInboxThreads\(\{maxResults:sender\?20:40,[\s\S]*?query:sender\?senderQuery:"newer_than:30d"/);
    assert.match(route,/senderScopedItems=sender\?inboxItems\.filter/);
});

test("email notification routes observe the selected planet inbox in sync mode and acknowledge locally", async () => {
    const server = await fs.readFile(path.join(__dirname, "..", "server.js"), "utf8");
    const notificationRoute=server.slice(server.indexOf('app.get("/worlds/:worldId/email/notifications"'),server.indexOf('app.post("/worlds/:worldId/email/notifications/acknowledge"'));
    const acknowledgeRoute=server.slice(server.indexOf('app.post("/worlds/:worldId/email/notifications/acknowledge"'),server.indexOf("function accountsHasConnection"));
    assert.match(notificationRoute, /observeInboxThreads\(\{[\s\S]*?recordMessages:conversationNotifications\.recordMessages,[\s\S]*?scope:\{userId:req\.user\.id,worldId,provider:"gmail",accountId:selected\.blockId\},[\s\S]*?mode:"sync"[\s\S]*?\}\)/);
    assert.match(notificationRoute, /supported:true,configured:true/);
    assert.match(notificationRoute, /status\(501\)\.json\(\{code:"provider_unsupported"/);
    assert.match(notificationRoute, /status\(409\)\.json\(\{code:"account_not_connected"/);
    assert.match(notificationRoute, /res\.status\(status\)\.json\(\{code,message\}\)/);
    assert.match(acknowledgeRoute, /conversationNotifications\.acknowledgeMessages\(\{userId:req\.user\.id,worldId,provider:"gmail",accountId:selected\.blockId,threadId\}\)/);
    assert.match(acknowledgeRoute, /status\(501\)\.json\(\{code:"provider_unsupported"/);
    assert.match(acknowledgeRoute, /supported:true,configured:true/);
    assert.doesNotMatch(acknowledgeRoute, /markAsRead|users\.messages\.modify/);
});

test("conversation fetch failures expose safe retry codes and retain request correlation without provider content", async () => {
    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    const conversationRoutes=server.slice(server.indexOf('app.get("/worlds/:worldId/email/conversations"'),server.indexOf('app.get("/worlds/:worldId/email/notifications"'));
    assert.match(conversationRoutes,/classifyGmailConversationFailure\(error\)/);
    assert.match(conversationRoutes,/req\.folderRocketBackendErrorName=failure\.diagnosticType/);
    assert.match(conversationRoutes,/code:failure\.code,message:"FolderRocket could not load/);
    assert.doesNotMatch(conversationRoutes,/error\.message/);
    assert.match(server,/function classifyGmailConversationFailure\(error\)[\s\S]*?provider_auth_required[\s\S]*?provider_rate_limited[\s\S]*?provider_unavailable/);
    assert.match(server,/X-FolderRocket-Diagnostic-Id/);
    assert.match(server,/folderRocketDiagnosticMessage[\s\S]*folderRocketBackendErrorName/);
});

test("configured folder traversal is bounded and returns only metadata", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-graph-roots-"));
    t.after(() => fs.rm(root, {recursive:true, force:true}));
    const configured = path.join(root, "configured");
    await fs.mkdir(path.join(configured, "child"), {recursive:true});
    await fs.writeFile(path.join(configured, "readme.txt"), "private fixture content");
    await fs.writeFile(path.join(configured, "child", "nested.pdf"), "synthetic pdf bytes");

    const result = await graphStore.walkConfiguredFolders([{name:"Fixture", path:configured}], {maxDepth:0, validateRoot:async value => value});
    assert.equal(result.processedDirectories, 1);
    assert.equal(result.limitReached, true);
    assert.ok(result.nodes.some(item => item.type === "file" && item.label === "readme.txt"));
    assert.ok(result.nodes.every(item => !JSON.stringify(item).includes("private fixture content")));
    assert.ok(result.nodes.some(item => item.type === "folder" && item.label === "Fixture"));
});

test("graph content revision ignores progress timestamps but changes when source evidence changes",()=>{
    const graph={nodes:[{id:"file-1",type:"file",label:"report.txt",sourceRef:{path:"C:/fixture/report.txt"},details:{size:12,modifiedAt:"2026-10-01"}}],edges:[],sourceStatuses:[graphStore.sourceStatus({sourceId:"folder:a",type:"folder",label:"A",status:"complete",processed:1})],updatedAt:"first"};
    const revision=graphStore.contentRevision(graph);
    assert.equal(graphStore.contentRevision({...graph,updatedAt:"later"}),revision);
    assert.notEqual(graphStore.contentRevision({...graph,nodes:[{...graph.nodes[0],details:{size:13,modifiedAt:"2026-10-01"}}]}),revision);
});

test("folder traversal emits monotonic batched progress for a large synthetic source",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-graph-progress-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const configured=path.join(root,"configured");await fs.mkdir(path.join(configured,"nested"),{recursive:true});
    for(let index=0;index<260;index++)await fs.writeFile(path.join(index<130?configured:path.join(configured,"nested"),`fixture-${String(index).padStart(3,"0")}.txt`),"synthetic");
    const updates=[];
    const result=await graphStore.walkConfiguredFolders([{id:"large-fixture",name:"Large fixture",path:configured}],{validateRoot:async value=>value,progressBatchSize:40,onProgress:update=>updates.push(update)});
    assert.equal(result.processedFiles,260);
    assert.equal(result.sourceStatuses[0].processed,result.processedFiles+result.processedDirectories);
    assert.ok(updates.length>=5,"large walks report progress before completion");
    assert.ok(updates.length<result.processedFiles,"callbacks are batched rather than awaited for every file");
    assert.deepEqual(updates.map(item=>item.processed),updates.map(item=>item.processed).slice().sort((a,b)=>a-b),"per-source progress never moves backwards");
    assert.equal(updates.at(-1).processed,result.processedFiles+result.processedDirectories);
    assert.ok(updates.every(item=>item.sourceId==="folder:large-fixture"&&item.total===0));
});

test("folder graph indexing reports safe per-source failures and preserves permission reason codes",async()=>{
    const denied=Object.assign(new Error("fixture path must not be logged"),{code:"EACCES"});
    const result=await graphStore.walkConfiguredFolders([{id:"private-root",name:"Private" ,path:"C:/synthetic/private"}],{validateRoot:async()=>{throw denied;}});
    assert.equal(result.sourceStatuses.length,1);
    assert.deepEqual(result.sourceStatuses[0],{
        sourceId:"folder:private-root",type:"folder",label:"Private",status:"failed",reasonCode:"permission_denied",
        message:"FolderRocket does not have permission to read this source.",processed:0,total:0,retryable:true,
        issues:[{scope:"source",reasonCode:"permission_denied",message:"FolderRocket does not have permission to read this source.",retryable:true}],
        updatedAt:result.sourceStatuses[0].updatedAt
    });
    assert.doesNotMatch(JSON.stringify(result.sourceStatuses),/fixture path|C:\\synthetic/);

    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-graph-permission-"));
    try {
        const blocked=path.join(root,"blocked");await fs.mkdir(blocked);
        const originalReaddir=fs.readdir;
        try {
            fs.readdir=async(target,...args)=>path.resolve(target)===path.resolve(blocked)?Promise.reject(denied):originalReaddir.call(fs,target,...args);
            const partial=await graphStore.walkConfiguredFolders([{id:"mixed-root",name:"Mixed",path:root}],{validateRoot:async value=>value});
            assert.equal(partial.sourceStatuses[0].status,"partial","a nested failure reports partial after usable root data was indexed");
            assert.equal(partial.sourceStatuses[0].reasonCode,"permission_denied");
        } finally {fs.readdir=originalReaddir;}
    } finally {await fs.rm(root,{recursive:true,force:true});}
});

test("graph index keeps the existing full-index call and exposes additive per-source retry status",async()=>{
    const server=require("node:fs").readFileSync(path.join(__dirname,"..","server.js"),"utf8");
    const route=server.slice(server.indexOf('app.post("/worlds/:worldId/graph/index"'),server.indexOf('app.post("/worlds/:worldId/graph/activity"'));
    assert.match(route,/req\.body\?\.retrySourceId/);
    assert.match(route,/replaceIndexedSourceGraph/);
    assert.match(route,/replaceIndexedGraph/);
    assert.match(route,/sourceStatuses/);
    assert.match(route,/sourceSelection\.folders\?graphFolderRootsForWorld/);
    assert.match(route,/onProgress:async folderProgress/);
    assert.match(route,/stage:"folders"/);
    assert.deepEqual(graphStore.emptyGraph("user-a","work").sourceStatuses,[]);
});

test("aggregate node and edge caps report a non-retryable aggregate status without blaming a source",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-graph-aggregate-cap-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const completeSource=graphStore.sourceStatus({sourceId:"folder:complete",type:"folder",label:"Complete folder",status:"complete",processed:1});
    const oversizedNodes=Array.from({length:graphStore.MAX_NODES+1},(_,index)=>graphStore.node("file","filesystem",`C:/synthetic/nodes/${index}.txt`,`${index}.txt`,{kind:"file",path:`C:/synthetic/nodes/${index}.txt`}));
    const nodeResult=await graphStore.replaceIndexedGraph("user-a","node-cap",oversizedNodes,[],{stage:"complete",processed:oversizedNodes.length,total:0,limitReached:false},{rootDirectory:root,sourceStatuses:[completeSource]});
    const nodeAggregate=nodeResult.sourceStatuses.find(item=>item.sourceId==="aggregate:graph");
    assert.equal(nodeResult.nodes.length,graphStore.MAX_NODES);
    assert.equal(nodeResult.sourceStatuses.find(item=>item.sourceId==="folder:complete").status,"complete","a source must not be marked incomplete just because the combined graph was capped");
    assert.equal(nodeAggregate.type,"aggregate");assert.equal(nodeAggregate.status,"partial");assert.equal(nodeAggregate.reasonCode,"node_limit");assert.equal(nodeAggregate.retryable,false);
    assert.match(nodeAggregate.message,/combined graph.*nodes.*Reduce selected sources or records/i);
    assert.equal(nodeResult.progress.limitReached,true);
    const manyStatuses=Array.from({length:200},(_,index)=>graphStore.sourceStatus({sourceId:`folder:source-${index}`,type:"folder",label:`Source ${index}`,status:"complete"}));
    const boundedStatuses=graphStore.normalizeSourceStatuses([...manyStatuses,nodeAggregate]);
    assert.equal(boundedStatuses.length,200);assert.ok(boundedStatuses.some(item=>item.type==="aggregate"),"the aggregate cap warning remains visible when source statuses reach their storage bound");

    const edgeRoot=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-graph-edge-cap-"));t.after(()=>fs.rm(edgeRoot,{recursive:true,force:true}));
    const edgeNodes=Array.from({length:graphStore.MAX_NODES},(_,index)=>graphStore.node("folder","filesystem",`C:/synthetic/edges/${index}`,`Folder ${index}`,{kind:"folder",path:`C:/synthetic/edges/${index}`}));
    const edgeList=[];
    for(let offset=1;edgeList.length<=graphStore.MAX_EDGES;offset++)for(let index=0;index<edgeNodes.length&&edgeList.length<=graphStore.MAX_EDGES;index++)edgeList.push(graphStore.edge("related",edgeNodes[index].id,edgeNodes[(index+offset)%edgeNodes.length].id,`fixture-${offset}`));
    const edgeResult=await graphStore.replaceIndexedGraph("user-a","edge-cap",edgeNodes,edgeList,{stage:"complete",processed:edgeNodes.length,total:0,limitReached:false},{rootDirectory:edgeRoot,sourceStatuses:[completeSource]});
    const edgeAggregate=edgeResult.sourceStatuses.find(item=>item.sourceId==="aggregate:graph");
    assert.equal(edgeResult.edges.length,graphStore.MAX_EDGES);
    assert.equal(edgeResult.sourceStatuses.find(item=>item.sourceId==="folder:complete").status,"complete");
    assert.equal(edgeAggregate.reasonCode,"edge_limit");assert.equal(edgeAggregate.retryable,false);assert.match(edgeAggregate.message,/combined graph.*links/i);
    assert.equal(edgeResult.progress.limitReached,true);
});

test("single-source graph retries retain last-good source data while full refresh removes deselected sources",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-source-retry-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const world=graphStore.node("world","folderrocket","work","Work",{kind:"world",worldId:"work"});
    const folderA=graphStore.node("folder","filesystem","C:/synthetic/a","A",{kind:"folder",path:"C:/synthetic/a",graphSourceId:"folder:a"});
    const fileA=graphStore.node("file","filesystem","C:/synthetic/a/old.pdf","old.pdf",{kind:"file",path:"C:/synthetic/a/old.pdf",graphSourceId:"folder:a"});
    const folderB=graphStore.node("folder","filesystem","C:/synthetic/b","B",{kind:"folder",path:"C:/synthetic/b",graphSourceId:"folder:b"});
    const fileB=graphStore.node("file","filesystem","C:/synthetic/b/keep.txt","keep.txt",{kind:"file",path:"C:/synthetic/b/keep.txt",graphSourceId:"folder:b"});
    const activity=graphStore.node("activity","folderrocket","activity-1","Activity",{kind:"activity"});
    const thread=graphStore.node("email-thread","gmail","gmail-block:thread-1","Thread",{kind:"gmail-thread",blockId:"gmail-block",threadId:"thread-1"});
    const message=graphStore.node("email-message","gmail","gmail-block:message-1","Sender",{kind:"gmail-message",blockId:"gmail-block",messageId:"message-1",threadId:"thread-1"});
    const sourceStatuses=[
        graphStore.sourceStatus({sourceId:"folder:a",type:"folder",label:"A",status:"complete",processed:2}),
        graphStore.sourceStatus({sourceId:"folder:b",type:"folder",label:"B",status:"complete",processed:2}),
        graphStore.sourceStatus({sourceId:"gmail:gmail-block",type:"gmail",label:"Gmail",status:"complete",processed:1}),
        graphStore.sourceStatus({sourceId:"snapshot",type:"snapshot",label:"Snapshot",status:"complete",processed:1})
    ];
    const initialNodes=[world,folderA,fileA,folderB,fileB,activity,thread,message];
    const initialEdges=[graphStore.edge("contains",folderA.id,fileA.id,"filesystem"),graphStore.edge("contains",folderB.id,fileB.id,"filesystem"),graphStore.edge("contains",thread.id,message.id,"gmail")];
    await graphStore.replaceIndexedGraph("user-a","work",initialNodes,initialEdges,{stage:"complete",processed:6,total:4,limitReached:false},{rootDirectory:root,sourceStatuses});

    const stale=await graphStore.replaceIndexedSourceGraph("user-a","work",graphStore.sourceStatus({sourceId:"folder:a",type:"folder",label:"A",status:"failed",reasonCode:"permission_denied",message:"FolderRocket does not have permission to read this source.",retryable:true}),[world],[],{rootDirectory:root,sourcePath:"C:/synthetic/a",sourceStatuses});
    assert.ok(stale.nodes.some(item=>item.id===fileA.id),"failed refresh must retain the source's last-good file nodes");
    assert.ok(stale.edges.some(item=>item.from===folderA.id&&item.to===fileA.id),"failed refresh must retain the source's last-good links");
    assert.ok(stale.nodes.some(item=>item.id===fileB.id)&&stale.nodes.some(item=>item.id===thread.id)&&stale.nodes.some(item=>item.id===activity.id));
    assert.match(stale.sourceStatuses.find(item=>item.sourceId==="folder:a").message,/Previously indexed data remains available/);
    assert.equal(stale.status,"partial");

    const newFileA=graphStore.node("file","filesystem","C:/synthetic/a/new.pdf","new.pdf",{kind:"file",path:"C:/synthetic/a/new.pdf",graphSourceId:"folder:a"});
    const refreshed=await graphStore.replaceIndexedSourceGraph("user-a","work",graphStore.sourceStatus({sourceId:"folder:a",type:"folder",label:"A",status:"complete",processed:2}),[world,folderA,newFileA],[graphStore.edge("contains",folderA.id,newFileA.id,"filesystem")],{rootDirectory:root,sourcePath:"C:/synthetic/a",sourceStatuses:stale.sourceStatuses});
    assert.ok(!refreshed.nodes.some(item=>item.id===fileA.id),"successful source refresh removes stale nodes owned by that source");
    assert.ok(refreshed.nodes.some(item=>item.id===fileB.id)&&refreshed.nodes.some(item=>item.id===thread.id)&&refreshed.nodes.some(item=>item.id===activity.id));
    assert.ok(refreshed.edges.some(item=>item.from===folderB.id&&item.to===fileB.id));

    const freshNodes=[world,folderA,newFileA,folderB,fileB,thread,message];
    const freshEdges=[graphStore.edge("contains",folderA.id,newFileA.id,"filesystem"),graphStore.edge("contains",folderB.id,fileB.id,"filesystem"),graphStore.edge("contains",thread.id,message.id,"gmail")];
    const snapshotRefreshed=await graphStore.replaceIndexedGraph("user-a","work",freshNodes,freshEdges,{stage:"complete",processed:6,total:4,limitReached:false},{rootDirectory:root,sourceStatuses:refreshed.sourceStatuses});
    assert.ok(!snapshotRefreshed.nodes.some(item=>item.id===activity.id),"a successful snapshot refresh replaces old activity records absent from the new snapshot");

    const deselected=await graphStore.replaceIndexedGraph("user-a","work",[world,folderA,newFileA],[graphStore.edge("contains",folderA.id,newFileA.id,"filesystem")],{stage:"complete",processed:3,total:1,limitReached:false},{rootDirectory:root,sourceStatuses:[snapshotRefreshed.sourceStatuses.find(item=>item.sourceId==="folder:a")]});
    assert.ok(!deselected.nodes.some(item=>item.id===fileB.id||item.id===thread.id||item.id===activity.id),"a full refresh removes data belonging to every source no longer selected");
    assert.deepEqual(new Set(deselected.sourceStatuses.map(item=>item.sourceId)),new Set(["folder:a"]));
});

test("Gmail graph nodes retain thread metadata and provider references, never message bodies", () => {
    const nodes=[],edges=[];
    graphStore.addEmailThreads(nodes,edges,"gmail-work","work@example.test",[{id:"provider-thread",subject:"Synthetic subject",updatedAt:"2026-10-03T12:00:00.000Z",messageCount:1,messages:[{id:"provider-message",sender:"Person <person@example.test>",receivedAt:"2026-10-03T11:59:00.000Z",text:"private body must not enter the local graph"}]}]);
    assert.ok(nodes.some(item=>item.type==="email-thread"&&item.sourceRef.threadId==="provider-thread"));
    assert.ok(nodes.some(item=>item.type==="email-message"&&item.sourceRef.messageId==="provider-message"));
    assert.ok(edges.some(item=>item.type==="contains"));
    assert.ok(!JSON.stringify(nodes).includes("private body must not enter the local graph"));
});

test("activity upserts deduplicate by operation id and shared references do not change index state", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-graph-events-"));
    t.after(() => fs.rm(root, {recursive:true, force:true}));
    const folder=graphStore.node("folder","filesystem","configured-root","Work folder",{kind:"folder",path:"C:/synthetic/work"});
    const thread=graphStore.node("email-thread","gmail","gmail-work:thread-0","Synthetic thread",{kind:"gmail-thread",blockId:"gmail-work",threadId:"thread-0"});
    await graphStore.replaceIndexedGraph("user-a", "source", [folder,thread], [], {stage:"complete", processed:0, total:0, limitReached:false}, {rootDirectory:root});

    const activity = {worldId:"source", operationId:"operation-1", kind:"search", summary:"Found a synthetic file", at:"2026-10-03T12:00:00.000Z"};
    await graphStore.upsertActivity("user-a", "source", activity, {rootDirectory:root});
    await graphStore.upsertActivity("user-a", "source", activity, {rootDirectory:root});
    const source = await graphStore.readGraph("user-a", "source", root);
    assert.equal(source.nodes.filter(item => item.sourceRef?.operationId === "operation-1").length, 1);
    assert.ok(source.nodes.some(item=>item.id===folder.id),"recording activity must not erase indexed folders");
    assert.ok(source.nodes.some(item=>item.id===thread.id),"recording activity must not erase indexed Gmail threads");

    const reminder=graphStore.node("reminder","sticky-note","reminder-1","Synthetic reminder",{kind:"reminder",at:"2026-10-04T12:00:00.000Z"});
    await graphStore.replaceSnapshotGraphData("user-a","source",[reminder],[],{rootDirectory:root});
    await graphStore.replaceSnapshotGraphData("user-a","source",[],[],{rootDirectory:root});
    const afterSnapshot=await graphStore.readGraph("user-a","source",root);
    assert.ok(!afterSnapshot.nodes.some(item=>item.id===reminder.id),"removed snapshot items should be pruned");
    assert.ok(afterSnapshot.nodes.some(item=>item.id===folder.id));
    assert.ok(afterSnapshot.nodes.some(item=>item.id===thread.id));

    const destination = await graphStore.addSharedThread("user-a", "destination", {sourceWorldId:"source", blockId:"gmail-work", threadId:"thread-1", subject:"Synthetic subject"}, {rootDirectory:root});
    assert.equal(destination.status, "disabled", "sharing a conversation alone does not enable graph indexing");
    assert.equal(destination.sharedThreads.length, 1);
    assert.equal(destination.nodes[0].sourceRef.sourceWorldId, "source");
    await graphStore.replaceIndexedGraph("user-a","destination",[],[],{stage:"complete",processed:0,total:0,limitReached:false},{rootDirectory:root});
    const reindexedDestination=await graphStore.readGraph("user-a","destination",root);
    assert.ok(reindexedDestination.nodes.some(item=>item.type==="email-thread"&&item.sourceRef.threadId==="thread-1"&&item.details.shared===true),"reindexing preserves explicit shared-thread references");
    const removed = await graphStore.removeSharedThread("user-a", "destination", "gmail-work", "thread-1", {rootDirectory:root});
    assert.equal(removed.sharedThreads.length, 0);
    assert.equal(removed.status, "ready");
    assert.ok(!removed.nodes.some(item=>item.type==="email-thread"&&item.sourceRef.threadId==="thread-1"));
});

test("Gmail replies retain provider thread and RFC reply headers without sending", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-gmail-reply-"));
    t.after(() => fs.rm(root, {recursive:true, force:true}));
    const attachmentPath = path.join(root, "attachment.txt");
    await fs.writeFile(attachmentPath, "synthetic attachment content");

    const {raw} = await gmail.buildReplyRaw({
        to:"person@example.test",
        subject:"Project update",
        text:"A synthetic reply",
        originalMessageId:"<original@example.test>",
        references:"<root@example.test> <original@example.test>",
        attachments:[{path:attachmentPath, name:"attachment.txt", mimeType:"text/plain"}]
    });

    assert.match(raw, /In-Reply-To: <original@example\.test>/);
    assert.match(raw, /References: <root@example\.test> <original@example\.test>/);
    assert.match(raw, /Subject: Re: Project update/);
    assert.match(raw, /Content-Disposition: attachment; filename="attachment\.txt"/);
    assert.ok(raw.includes(Buffer.from("synthetic attachment content").toString("base64")));
    assert.equal(typeof gmail.sendReply, "function");

    const script = String.raw`
    (async () => {
        const assert = require("node:assert/strict");
        const store = require("./services/emailTokenStore");
        const gmail = require("./services/gmailService");
        const userId = "synthetic-reply-user";
        const blockId = "synthetic-gmail";
        store.saveConnection("gmail", userId, {accessToken:"synthetic-token",refreshToken:"synthetic-refresh",expiresAt:Date.now()+3600000,scopes:"https://www.googleapis.com/auth/gmail.compose"}, blockId);
        const requests = [];
        global.fetch = async (url, options = {}) => { requests.push({url:String(url),options}); return {ok:true,status:200,json:async()=>({id:"synthetic-new-message",threadId:"provider-thread-42"})}; };
        await gmail.sendReply({threadId:"provider-thread-42",to:"person@example.test",subject:"Project update",text:"Reply",originalMessageId:"<original@example.test>"},userId,blockId);
        await gmail.createReplyDraft({threadId:"provider-thread-42",to:"person@example.test",subject:"Project update",text:"Draft",originalMessageId:"<original@example.test>"},userId,blockId);
        assert.equal(requests[0].url,"https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
        const sent=JSON.parse(requests[0].options.body);
        assert.equal(sent.threadId,"provider-thread-42");
        assert.match(Buffer.from(sent.raw,"base64url").toString("utf8"),/In-Reply-To: <original@example\.test>/);
        assert.equal(requests[1].url,"https://gmail.googleapis.com/gmail/v1/users/me/drafts");
        const draft=JSON.parse(requests[1].options.body).message;
        assert.equal(draft.threadId,"provider-thread-42");
        assert.match(Buffer.from(draft.raw,"base64url").toString("utf8"),/In-Reply-To: <original@example\.test>/);
    })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const result=spawnSync(process.execPath,["-e",script],{cwd:path.join(__dirname,".."),encoding:"utf8",env:{...process.env,FOLDERROCKET_TOKEN_DIR:path.join(root,"tokens")}});
    assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
});

test("configured Obsidian vault paths are excluded from knowledge candidates and invalidate retained knowledge", async t => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-vault-intake-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const vault=path.join(root,"Vault");
    const selected=path.join(root,"Selected");
    await fs.mkdir(path.join(vault,"FolderRocket","Knowledge"),{recursive:true});
    await fs.mkdir(selected,{recursive:true});
    const vaultMarkdown=path.join(vault,"FolderRocket","Knowledge","Area.md");
    const selectedMarkdown=path.join(selected,"Source.md");
    await fs.writeFile(vaultMarkdown,"generated note");
    await fs.writeFile(selectedMarkdown,"selected source");
    const vaultRoot=canonicalPaths.canonicalPath(vault);
    const vaultNote=canonicalPaths.canonicalPath(vaultMarkdown);
    const selectedFile=canonicalPaths.canonicalPath(selectedMarkdown);
    assert.ok(canonicalPaths.isWithinCanonicalRoot(vaultRoot,vaultNote));
    assert.equal(canonicalPaths.isWithinCanonicalRoot(vaultRoot,selectedFile),false);
    assert.equal(canonicalPaths.isWithinCanonicalRoot(vaultRoot+"-old",vaultRoot),false,"a sibling prefix is not considered inside a root");

    const alias=path.join(root,"Vault Alias");
    try {
        await fs.symlink(vault,alias,"junction");
        assert.equal(canonicalPaths.canonicalPath(path.join(alias,"FolderRocket","Knowledge","Area.md")),vaultNote,"existing junction prefixes resolve to the same canonical vault note");
    } catch(error) {
        if(!["EPERM","EACCES","ENOTSUP"].includes(error?.code))throw error;
    }

    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    assert.match(server,/function knowledgeCandidates\(graph,selection,vaultPaths=\[\]\)[\s\S]*?roots\.some\(root=>isKnowledgeFileInsideVault\(root,item\.sourceRef\.path\)\)/);
    assert.match(server,/if\(isKnowledgeFileInsideVault\(scope\.vaultPath,realPath\)\|\|isKnowledgeFileInsideVault\(scope\.managedMarkdownPath,realPath\)\)/,"sync rechecks a canonical file path before reading its contents");
    assert.match(server,/excludedVaultPath:canonicalVaultPath/);
    assert.match(server,/excludedVaultPath:canonicalPathContainment\.canonicalPath\(vaultPath\)/,"graph readiness uses the same vault-exclusion fingerprint");
});
