const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const graph=require("../services/planetGraphService");
const readiness=require("../services/knowledgeReadiness");
const sentReplyGraphUpdate=require("../services/sentReplyGraphUpdate");

async function withTempDirectory(run){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-diagnostic-test-"));
    try{return await run(root);}finally{await fs.rm(root,{recursive:true,force:true});}
}

function codedError(code){return Object.assign(new Error(code),{code});}

test("a knowledge generation without operational blockers is ready",()=>{
    const summary=readiness.summarizeKnowledgeBlockers();
    assert.equal(readiness.knowledgeStatusForBlockers(summary),"ready");
    assert.deepEqual(summary,{reasonCodes:[],counts:{},summary:"Review the selected source status and resolve the listed limits or unavailable content before syncing again."});
});

test("knowledge readiness summary contains only bounded allow-listed categories",()=>{
    const summary=readiness.summarizeKnowledgeBlockers({incompleteSourceCount:500,selectedSourceLimit:true,contentIncomplete:true,knowledgeLimit:true,sourceSelectionChanged:true});
    assert.deepEqual(summary.reasonCodes,[...readiness.REASON_CODES]);
    assert.deepEqual(summary.counts,{source_index_incomplete:200,selected_source_limit:1,content_unavailable:1,knowledge_limit:1,source_selection_changed:1});
    assert.ok(summary.summary.length<=240);
    assert.doesNotMatch(JSON.stringify(summary),/C:\\|\/Users\/|sourceId|path/i);
});

test("graph writes retry transient rename failures and then publish the complete file",async()=>withTempDirectory(async root=>{
    const attempts=[],delays=[];
    const result=await graph.writeGraph(graph.emptyGraph("user-a","work"),root,{
        rename:async(source,target)=>{attempts.push([source,target]);if(attempts.length<3)throw codedError("EPERM");return fs.rename(source,target);},
        sleep:async(milliseconds)=>{delays.push(milliseconds);}
    });
    assert.equal(result.worldId,"work");
    assert.equal(attempts.length,3);
    assert.deepEqual(delays,[50,100]);
    const stored=await graph.readGraph("user-a","work",root);
    assert.equal(stored.worldId,"work");
}));

test("permanent rename denial preserves the previous graph and cleans only the temp file",async()=>withTempDirectory(async root=>{
    const original=graph.emptyGraph("user-a","work");original.status="ready";
    await graph.writeGraph(original,root);
    const next={...original,status:"indexing"};let attempts=0;
    await assert.rejects(graph.writeGraph(next,root,{rename:async()=>{attempts++;throw codedError("EPERM");},sleep:async()=>{}}),error=>error.code==="GRAPH_STORAGE_UNAVAILABLE"&&error.causeCode==="EPERM");
    assert.equal(attempts,5);
    assert.equal((await graph.readGraph("user-a","work",root)).status,"ready");
    const graphDirectory=path.dirname(path.join(root,require("node:crypto").createHash("sha256").update("user-a").digest("hex"),"work.json"));
    const files=await fs.readdir(graphDirectory);
    assert.deepEqual(files,["work.json"]);
}));

test("non-transient rename errors are not retried",async()=>withTempDirectory(async root=>{
    let attempts=0;
    await assert.rejects(graph.writeGraph(graph.emptyGraph("user-a","work"),root,{rename:async()=>{attempts++;throw codedError("EIO");},sleep:async()=>{}}),error=>error.code==="EIO");
    assert.equal(attempts,1);
}));

test("graph writes remain serialized per target while a rename is pending",async()=>withTempDirectory(async root=>{
    let releaseFirst;
    const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
    const calls=[];
    const rename=async(source,target)=>{calls.push(source);if(calls.length===1)await firstGate;return fs.rename(source,target);};
    const first=graph.writeGraph({...graph.emptyGraph("user-a","work"),status:"ready"},root,{rename});
    await new Promise(resolve=>setTimeout(resolve,10));
    const second=graph.writeGraph({...graph.emptyGraph("user-a","work"),status:"partial"},root,{rename});
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(calls.length,1);
    releaseFirst();
    await Promise.all([first,second]);
    assert.equal(calls.length,2);
    assert.equal((await graph.readGraph("user-a","work",root)).status,"partial");
}));

test("diagnostic routes retain scope gates and classify only expected storage and settings failures",async()=>{
    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    const settingsStart=server.indexOf('app.get("/settings/worlds/:worldId"');
    const settingsEnd=server.indexOf("function validWorldId",settingsStart);
    const settingsRoute=server.slice(settingsStart,settingsEnd);
    assert.match(settingsRoute,/req\.folderRocketExpectedNotFound=true;return res\.status\(404\)\.json\(\{code:"WORLD_SETTINGS_NOT_FOUND"/);
    assert.match(server,/currentKnowledgeMatches\|\|currentKnowledge\.status!=="ready"/);
    assert.match(server,/status:knowledgeStatusForBlockers\(reasonSummary\)/);
    assert.doesNotMatch(server,/status:exclusions\.length\|\|limited\|\|extractionIncomplete/);
    assert.match(server,/code:"KNOWLEDGE_INCOMPLETE"/);
    assert.match(server,/reasonSummary:\{reasonCodes:reasonSummary\.reasonCodes,counts:reasonSummary\.counts,blockers:/);
    assert.match(server,/readinessFingerprint/);
    assert.match(server,/function respondGraphStorageUnavailable\(res,error\)[\s\S]*?res\.status\(503\)\.json\(\{code:"GRAPH_STORAGE_UNAVAILABLE",retryable:true/);
    const snapshotStart=server.indexOf('app.post("/worlds/:worldId/graph/snapshot"');
    const snapshotEnd=server.indexOf("app.get(",snapshotStart);
    assert.match(server.slice(snapshotStart,snapshotEnd),/respondGraphStorageUnavailable\(res,error\)/);
    for(const route of [
        'app.get("/worlds/:worldId/graph/chats"',
        'app.post("/worlds/:worldId/graph/chats"',
        'app.post("/worlds/:worldId/graph/activity"',
        'app.post("/worlds/:worldId/email/conversations/:threadId/share"',
        'app.delete("/worlds/:worldId/email/conversations/:threadId/share"'
    ]) {
        const start=server.indexOf(route),end=server.indexOf("\napp.",start);
        assert.notEqual(start,-1,`missing route ${route}`);
        assert.match(server.slice(start,end<0?undefined:end),/respondGraphStorageUnavailable\(res,error\)/,`missing graph storage handling for ${route}`);
    }
    const replyStart=server.indexOf('app.post("/worlds/:worldId/email/conversations/:threadId/reply"');
    const replyEnd=server.indexOf("\napp.",replyStart);
    const replyRoute=server.slice(replyStart,replyEnd);
    assert.match(replyRoute,/recordSentReplyGraphUpdate\(\{sent,threadId,updateGraph:/);
    assert.match(replyRoute,/res\.json\(replyResult\)/);
});

test("a sent Gmail reply stays successful when local graph persistence fails, without a resend",async()=>{
    let sends=0,graphWrites=0;
    const response=await sentReplyGraphUpdate.recordSentReplyGraphUpdate({
        sent:await (async()=>{sends++;return {id:"synthetic-message",threadId:"synthetic-thread"};})(),
        threadId:"synthetic-thread",
        updateGraph:async()=>{graphWrites++;throw codedError("GRAPH_STORAGE_UNAVAILABLE");}
    });
    assert.equal(sends,1);
    assert.equal(graphWrites,1);
    assert.deepEqual(response,{message:"Reply was sent in the Gmail conversation, but the Planet Graph was not updated.",sent:true,messageId:"synthetic-message",threadId:"synthetic-thread",graphUpdate:{status:"unavailable",code:"GRAPH_STORAGE_UNAVAILABLE"}});
});
