const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const fs=require("node:fs/promises");
const net=require("node:net");
const os=require("node:os");
const path=require("node:path");
const test=require("node:test");
const planetGraph=require("../services/planetGraphService");

async function freePort(){
    const server=net.createServer();
    await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
    const port=server.address().port;
    await new Promise(resolve=>server.close(resolve));
    return port;
}

async function waitForBootstrap(port,child,output){
    const deadline=Date.now()+20_000;
    while(Date.now()<deadline){
        if(child.exitCode!==null)throw new Error(`Backend exited before startup (${child.exitCode}): ${output()}`);
        try{const response=await fetch(`http://127.0.0.1:${port}/auth/bootstrap`);if(response.ok)return response.json();}catch{/* Backend starting. */}
        await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(`Backend did not become ready: ${output()}`);
}

async function directoryDigest(root){
    const result={};
    async function visit(directory){
        for(const entry of await fs.readdir(directory,{withFileTypes:true})){
            const target=path.join(directory,entry.name);
            if(entry.isDirectory())await visit(target);
            else result[path.relative(root,target)]=require("node:crypto").createHash("sha256").update(await fs.readFile(target)).digest("hex");
        }
    }
    await visit(root);
    return result;
}

function syntheticEnvironment(root,port){
    const env={...process.env};
    for(const key of ["OPENAI_API_KEY","GMAIL_CLIENT_ID","GMAIL_CLIENT_SECRET","GOOGLE_CALENDAR_API_KEY","OUTLOOK_CLIENT_ID","OUTLOOK_CLIENT_SECRET","FOLDERROCKET_TOKEN_ENCRYPTION_KEY"])delete env[key];
    return {...env,FOLDERROCKET_DESKTOP:"1",FOLDERROCKET_PORT:String(port),PORT:"",HOST:"127.0.0.1",APP_ORIGIN:`http://localhost:${port}`,FRONTEND_ORIGIN:`http://localhost:${port}`,FOLDERROCKET_DATA_DIR:path.join(root,"data"),FOLDERROCKET_UPLOADS_DIR:path.join(root,"uploads"),FOLDERROCKET_TOKEN_DIR:path.join(root,"tokens"),FOLDERROCKET_CONFIG_FILE:path.join(root,"config.env")};
}

test("Obsidian sync ignores an incomplete unselected source, reports selected blockers, and recovers",{timeout:60_000},async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-r22-selected-source-"));
    const backendCwd=path.join(root,"backend-cwd");
    await fs.mkdir(backendCwd,{recursive:true});
    const port=await freePort();
    const child=spawn(process.execPath,[path.join(__dirname,"..","server.js")],{cwd:backendCwd,stdio:["pipe","pipe","pipe"],windowsHide:true,env:syntheticEnvironment(root,port)});
    let stdout="",stderr="";
    child.stdout.setEncoding("utf8");child.stdout.on("data",chunk=>{stdout+=chunk;});
    child.stderr.setEncoding("utf8");child.stderr.on("data",chunk=>{stderr+=chunk;});
    t.after(async()=>{
        if(child.exitCode===null){
            child.stdin.end("shutdown\n");
            await Promise.race([new Promise(resolve=>child.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,1_000))]);
        }
        if(child.exitCode===null){child.kill("SIGKILL");await Promise.race([new Promise(resolve=>child.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,1_000))]);}
        await fs.rm(root,{recursive:true,force:true});
    });
    const url=`http://127.0.0.1:${port}`;
    await waitForBootstrap(port,child,()=>`${stdout}\n${stderr}`.trim());
    const register=await fetch(`${url}/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"r22-synthetic@example.test",password:"synthetic-test-password-123"})});
    assert.equal(register.status,201,await register.text());
    const cookie=String(register.headers.get("set-cookie")||"").split(";")[0];
    const request=(route,method="GET",body)=>fetch(`${url}${route}`,{method,headers:{Cookie:cookie,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const user=(await (await request("/auth/me")).json()).user;
    const selectedRoot=path.join(user.workspacePath,"R22 selected source");
    const vaultPath=path.join(user.workspacePath,"R22 synthetic vault");
    await fs.mkdir(selectedRoot,{recursive:true});
    await fs.writeFile(path.join(selectedRoot,"selected-note.txt"),"Synthetic local knowledge source. This fixture provides enough readable words to produce a local knowledge note and verify complete Obsidian synchronization without any personal files or account data.\n");
    const saveFolders=await request("/settings/dashboard?worldId=work","PUT",{settings:{folders:[{id:"selected-root",name:"Selected synthetic source",path:selectedRoot,storage:"computer"},{id:"unselected-root",name:"Unselected synthetic source",path:path.join(user.workspacePath,"missing unselected source"),storage:"computer"}],sourceBlocks:[]}});
    assert.equal(saveFolders.status,200,await saveFolders.text());
    const graphSettings=await request("/settings/worlds/work","PUT",{graphEnabled:true});
    assert.equal(graphSettings.status,200,await graphSettings.text());
    const sourceSelection={version:2,folders:true,email:false,alerts:false,activity:false,snapshots:false,clientNotes:false,attachments:false,threadMode:"selected",threadIds:[],folderMode:"selected",folderIds:["selected-root"],fileTypeMode:"all",fileTypes:[],excludedFileIds:[],includeSubfolders:true};
    const obsidianSettings=await request("/worlds/work/obsidian","PUT",{enabled:true,autoSync:false,vaultPath,sourceSelection});
    assert.equal(obsidianSettings.status,200,await obsidianSettings.text());
    const indexed=await request("/worlds/work/graph/index","POST",{snapshot:{}});
    assert.equal(indexed.status,202,await indexed.text());
    const graphRoot=path.join(root,"data","planet-graphs");
    const deadline=Date.now()+15_000;
    let graph;
    while(Date.now()<deadline){
        graph=await planetGraph.readGraph(user.id,"work",graphRoot);
        if(graph.status==="ready"||graph.status==="partial")break;
        await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(graph.status,"ready",JSON.stringify({status:graph.status,sourceStatuses:graph.sourceStatuses}));
    assert.equal(graph.sourceStatuses.find(item=>item.sourceId==="folder:selected-root")?.status,"complete");
    const firstSync=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(firstSync.status,200,await firstSync.text());
    let baselineVault=await directoryDigest(vaultPath);
    assert.ok(Object.keys(baselineVault).some(name=>name.toLowerCase().endsWith(".md")));
    const beforeUnselectedChange=await (await request("/worlds/work/knowledge?summary=1")).json();

    graph=await planetGraph.readGraph(user.id,"work",graphRoot);
    graph.sourceStatuses=planetGraph.normalizeSourceStatuses([...graph.sourceStatuses,planetGraph.sourceStatus({sourceId:"folder:unselected-root",type:"folder",label:"Unselected synthetic source",status:"failed",reasonCode:"source_read_failed",message:"Synthetic unselected source failure.",retryable:true})]);
    graph.status="partial";
    graph.progress={...graph.progress,limitReached:false};
    await planetGraph.writeGraph(graph,graphRoot);
    const afterUnselectedChange=await (await request("/worlds/work/knowledge?summary=1")).json();
    assert.equal(afterUnselectedChange.sourceSelectionFingerprint,beforeUnselectedChange.sourceSelectionFingerprint,"unselected graph status does not stale selected knowledge");
    assert.equal(afterUnselectedChange.readinessFingerprint,beforeUnselectedChange.readinessFingerprint,"unselected graph status does not change selected readiness");
    const unselectedFailureSync=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(unselectedFailureSync.status,200,await unselectedFailureSync.text());
    const successfulVault=await directoryDigest(vaultPath);
    assert.ok(Object.keys(successfulVault).some(name=>name.toLowerCase().endsWith(".md")),"selected records remain synchronized when only an unselected source failed");
    baselineVault=successfulVault;

    graph=await planetGraph.readGraph(user.id,"work",graphRoot);
    graph.sourceStatuses=planetGraph.normalizeSourceStatuses(graph.sourceStatuses.map(item=>item.sourceId==="folder:selected-root"?planetGraph.sourceStatus({...item,status:"failed",reasonCode:"source_read_failed",message:"Synthetic selected source failure.",retryable:true}):item));
    graph.status="partial";
    await planetGraph.writeGraph(graph,graphRoot);
    const blocked=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(blocked.status,409,await blocked.clone().text());
    const blockedData=await blocked.json();
    assert.equal(blockedData.code,"KNOWLEDGE_INCOMPLETE");
    assert.ok(blockedData.readinessFingerprint);
    assert.ok(blockedData.reasonSummary.blockers.some(item=>item.sourceId==="folder:selected-root"&&item.label==="Selected synthetic source"&&item.status==="failed"&&item.action&&item.retryable===true));
    assert.doesNotMatch(JSON.stringify(blockedData.reasonSummary),/R22 selected source|selected-note\.txt|sourcePath|[A-Za-z]:\\/i);
    assert.deepEqual(await directoryDigest(vaultPath),baselineVault,"a selected source failure preserves the last complete custom vault byte-for-byte");
    const repeated=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(repeated.status,409);
    const repeatedData=await repeated.json();
    assert.equal(repeatedData.readinessFingerprint,blockedData.readinessFingerprint,"unchanged selected blockers keep a stable fingerprint across retries");
    const summary=await request("/worlds/work/knowledge?summary=1");
    assert.equal(summary.status,200);
    const summaryData=await summary.json();
    assert.deepEqual(Object.keys(summaryData).sort(),["reasonSummary","readinessFingerprint","revision","sourceSelectionFingerprint","status","worldId"].sort());
    assert.equal(summaryData.readinessFingerprint,blockedData.readinessFingerprint);
    assert.equal(summaryData.status,"blocked");

    graph=await planetGraph.readGraph(user.id,"work",graphRoot);
    graph.sourceStatuses=planetGraph.normalizeSourceStatuses(graph.sourceStatuses.map(item=>item.sourceId==="folder:selected-root"?planetGraph.sourceStatus({...item,status:"complete",reasonCode:"",message:"",retryable:false}):item));
    graph.status="ready";
    await planetGraph.writeGraph(graph,graphRoot);
    const recovered=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(recovered.status,200,await recovered.clone().text());
    const recoveredData=await recovered.json();
    assert.notEqual(recoveredData.readinessFingerprint,blockedData.readinessFingerprint,"selected-source recovery changes the readiness fingerprint");
    assert.equal(recoveredData.result.status,"ready");
    const readySummary=await request("/worlds/work/knowledge?summary=1");
    assert.equal((await readySummary.json()).status,"ready");

    const limitedVault=await directoryDigest(vaultPath);
    const overLimit=await request("/worlds/work/obsidian/sync","POST",{records:Array.from({length:501},(_,index)=>({id:`synthetic-${index}`,kind:"post-it",content:"Synthetic record"}))});
    assert.equal(overLimit.status,409,await overLimit.clone().text());
    const overLimitData=await overLimit.json();
    assert.equal(overLimitData.code,"KNOWLEDGE_INCOMPLETE");
    assert.ok(overLimitData.reasonSummary.blockers.some(item=>item.sourceId==="client-record-limit"&&item.reasonCode==="selected_source_limit"&&item.action));
    assert.ok(overLimitData.readinessFingerprint);
    assert.deepEqual(await directoryDigest(vaultPath),limitedVault,"late request-limit rejection preserves the last complete vault");

    graph=await planetGraph.readGraph(user.id,"work",graphRoot);
    const fileNode=graph.nodes.find(item=>item.type==="file"&&item.sourceRef?.graphSourceId==="folder:selected-root");
    assert.ok(fileNode,"synthetic graph contains the selected file fixture");
    const originalPath=fileNode.sourceRef.path;
    fileNode.sourceRef={...fileNode.sourceRef,path:path.join(selectedRoot,"R22 unavailable synthetic evidence.txt")};
    await planetGraph.writeGraph(graph,graphRoot);
    const unavailable=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(unavailable.status,409,await unavailable.clone().text());
    const unavailableData=await unavailable.json();
    const contentBlocker=unavailableData.reasonSummary.blockers.find(item=>item.sourceId==="folder:selected-root"&&item.reasonCode==="content_unavailable");
    assert.ok(contentBlocker&&contentBlocker.label==="Selected synthetic source"&&contentBlocker.action,"content extraction failures identify the selected source and next action");
    assert.doesNotMatch(JSON.stringify(unavailableData.reasonSummary),/R22 unavailable synthetic evidence|[A-Za-z]:\\/i);
    assert.deepEqual(await directoryDigest(vaultPath),limitedVault,"an unavailable selected file preserves the last complete vault byte-for-byte");
    const unavailableFingerprint=unavailableData.readinessFingerprint;
    const contentSummary=await (await request("/worlds/work/knowledge?summary=1")).json();
    assert.equal(contentSummary.status,"blocked");
    assert.ok(contentSummary.reasonSummary.blockers.some(item=>item.sourceId==="folder:selected-root"&&item.reasonCode==="content_unavailable"));
    assert.equal(contentSummary.readinessFingerprint,unavailableFingerprint);
    const unavailableRetry=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(unavailableRetry.status,409);
    assert.equal((await unavailableRetry.json()).readinessFingerprint,unavailableFingerprint,"unchanged content failures keep a stable fingerprint");

    graph=await planetGraph.readGraph(user.id,"work",graphRoot);
    const repairedNode=graph.nodes.find(item=>item.id===fileNode.id);
    repairedNode.sourceRef={...repairedNode.sourceRef,path:originalPath};
    await planetGraph.writeGraph(graph,graphRoot);
    const contentRecovered=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(contentRecovered.status,200,await contentRecovered.clone().text());
    assert.notEqual((await contentRecovered.json()).readinessFingerprint,unavailableFingerprint,"restored selected content changes readiness and permits sync");

    graph=await planetGraph.readGraph(user.id,"work",graphRoot);
    graph.sourceStatuses=planetGraph.normalizeSourceStatuses(graph.sourceStatuses.map(item=>item.sourceId==="folder:selected-root"?planetGraph.sourceStatus({...item,label:selectedRoot,status:"failed",reasonCode:"source_read_failed",message:"Synthetic selected source failure.",retryable:true}):item));
    graph.status="partial";
    await planetGraph.writeGraph(graph,graphRoot);
    const pathLabelFailure=await request("/worlds/work/obsidian/sync","POST",{});
    assert.equal(pathLabelFailure.status,409);
    const pathLabelData=await pathLabelFailure.json();
    assert.ok(pathLabelData.reasonSummary.blockers.some(item=>item.label==="Selected folder source"));
    assert.doesNotMatch(JSON.stringify(pathLabelData.reasonSummary),/R22 selected source|[A-Za-z]:\\/i,"source labels must never expose filesystem paths");
});
