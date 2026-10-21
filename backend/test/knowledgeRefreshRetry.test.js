const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const fs=require("node:fs/promises");
const net=require("node:net");
const os=require("node:os");
const path=require("node:path");
const test=require("node:test");
const planetGraph=require("../services/planetGraphService");

async function freePort(){
    const probe=net.createServer();
    await new Promise((resolve,reject)=>probe.once("error",reject).listen(0,"127.0.0.1",resolve));
    const port=probe.address().port;
    await new Promise(resolve=>probe.close(resolve));
    return port;
}

test("a transient startup refresh persistence error can be retried for the same user and planet",{timeout:45_000},async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-refresh-retry-"));
    const backendCwd=path.join(root,"backend-cwd");
    await fs.mkdir(backendCwd,{recursive:true});
    const marker=path.join(root,"fail-next-graph-write");
    const preload=path.join(root,"synthetic-preload.cjs");
    await fs.writeFile(preload,`const fs=require("node:fs/promises");const syncFs=require("node:fs");const original=fs.rename.bind(fs);fs.rename=async(from,to)=>{const marker=process.env.FOLDERROCKET_TEST_FAIL_NEXT_GRAPH_WRITE;if(marker&&String(to).includes("planet-graphs")&&syncFs.existsSync(marker)){syncFs.unlinkSync(marker);throw Object.assign(new Error("Synthetic one-time graph persistence failure."),{code:"EIO"});}return original(from,to);};\n`);
    const port=await freePort();
    const env={...process.env};
    for(const key of ["OPENAI_API_KEY","GMAIL_CLIENT_ID","GMAIL_CLIENT_SECRET","GOOGLE_CALENDAR_API_KEY","OUTLOOK_CLIENT_ID","OUTLOOK_CLIENT_SECRET","FOLDERROCKET_TOKEN_ENCRYPTION_KEY"])delete env[key];
    Object.assign(env,{FOLDERROCKET_DESKTOP:"1",FOLDERROCKET_PORT:String(port),PORT:"",HOST:"127.0.0.1",APP_ORIGIN:`http://localhost:${port}`,FRONTEND_ORIGIN:`http://localhost:${port}`,FOLDERROCKET_DATA_DIR:path.join(root,"data"),FOLDERROCKET_UPLOADS_DIR:path.join(root,"uploads"),FOLDERROCKET_TOKEN_DIR:path.join(root,"tokens"),FOLDERROCKET_CONFIG_FILE:path.join(root,"config.env"),FOLDERROCKET_TEST_FAIL_NEXT_GRAPH_WRITE:marker});
    const child=spawn(process.execPath,["--require",preload,path.join(__dirname,"..","server.js")],{cwd:backendCwd,stdio:["pipe","pipe","pipe"],windowsHide:true,env});
    let output="";
    child.stdout.setEncoding("utf8");child.stdout.on("data",chunk=>{output+=chunk;});
    child.stderr.setEncoding("utf8");child.stderr.on("data",chunk=>{output+=chunk;});
    t.after(async()=>{
        if(child.exitCode===null){child.stdin.end("shutdown\n");await Promise.race([new Promise(resolve=>child.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,1000))]);}
        if(child.exitCode===null){child.kill("SIGKILL");await Promise.race([new Promise(resolve=>child.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,1000))]);}
        await fs.rm(root,{recursive:true,force:true});
    });

    const base=`http://127.0.0.1:${port}`;
    const deadline=Date.now()+10_000;
    let ready=false;
    while(Date.now()<deadline){
        if(child.exitCode!==null)throw new Error(`Backend exited before startup (${child.exitCode}): ${output}`);
        try{ready=(await fetch(`${base}/auth/bootstrap`)).ok;}catch{/* Backend starting. */}
        if(ready)break;
        await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(ready,true,`Backend did not become ready: ${output}`);

    const register=await fetch(`${base}/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"refresh-retry@example.test",password:"synthetic-refresh-retry-123"})});
    assert.equal(register.status,201,await register.text());
    const cookie=String(register.headers.getSetCookie?.()[0]||register.headers.get("set-cookie")||"").split(";")[0];
    assert.ok(cookie.includes("="),"synthetic registration returns a session cookie");
    const auth={headers:{Cookie:cookie}};
    const request=(route,method="GET",body)=>fetch(`${base}${route}`,{method,headers:{...auth.headers,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const initialMe=await request("/auth/me");
    assert.equal(initialMe.status,200,await initialMe.clone().text());
    const user=(await initialMe.json()).user;
    const sourceRoot=path.join(user.workspacePath,"synthetic-refresh-source");
    await fs.mkdir(sourceRoot,{recursive:true});
    await fs.writeFile(path.join(sourceRoot,"note.txt"),"Synthetic selected source used to verify retry after one temporary persistence failure.\n");
    const savedFolders=await request("/settings/dashboard?worldId=work","PUT",{settings:{folders:[{id:"retry-root",name:"Synthetic retry source",path:sourceRoot,storage:"computer"}],sourceBlocks:[]}});
    assert.equal(savedFolders.status,200,await savedFolders.text());
    const graphSettings=await request("/settings/worlds/work","PUT",{graphEnabled:true});
    assert.equal(graphSettings.status,200,await graphSettings.text());

    await fs.writeFile(marker,"fail exactly one selected refresh graph write");
    const firstCheck=await request("/auth/me");
    assert.equal(firstCheck.status,200,await firstCheck.text());
    const retryDeadline=Date.now()+15_000;
    let graph;
    let retryCheck;
    const graphRoot=path.join(root,"data","planet-graphs");
    while(Date.now()<retryDeadline){
        if(!await fs.stat(marker).then(()=>true,()=>false)){
            retryCheck=await request("/auth/me");
        }
        graph=await planetGraph.readGraph(user.id,"work",graphRoot);
        if(graph.status==="ready")break;
        await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(await fs.stat(marker).then(()=>false,()=>true),true,"the injected one-time persistence failure was consumed");
    assert.equal(retryCheck?.status,200,"a later /auth/me is accepted while the retry is scheduled");
    assert.equal(graph.status,"ready",`same user/world refresh retries and completes; statuses=${JSON.stringify(graph.sourceStatuses)}; output=${output}`);
    assert.equal(graph.sourceStatuses.find(item=>item.sourceId==="folder:retry-root")?.status,"complete");
});
