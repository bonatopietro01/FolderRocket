const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

async function freePort() {
    const probe = net.createServer();
    await new Promise((resolve,reject)=>probe.once("error",reject).listen(0,"127.0.0.1",resolve));
    const address=probe.address();
    const port=typeof address==="object"&&address?address.port:0;
    await new Promise(resolve=>probe.close(resolve));
    return port;
}

async function waitForBootstrap(port, child, output) {
    // Multiple backend suites run in parallel under `node --test`; allow cold
    // startup under that load instead of treating scheduling delay as failure.
    const deadline=Date.now()+20000;
    while(Date.now()<deadline){
        if(child.exitCode!==null)throw new Error(`Backend exited before startup with code ${child.exitCode}`);
        try{const response=await fetch(`http://127.0.0.1:${port}/auth/bootstrap`);if(response.ok)return response.json();}catch{/* starting */}
        await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(`Backend did not become ready within 20 seconds. Output: ${output()}`);
}

test("backend starts with isolated data and shuts down cleanly through stdin", {timeout:30000}, async t => {
    const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"folderrocket-backend-"));
    t.after(()=>fs.promises.rm(root,{recursive:true,force:true}));
    const port=await freePort();
    const child=spawn(process.execPath,[path.join(__dirname,"..","server.js")],{
        cwd:path.join(__dirname,".."),
        stdio:["pipe","pipe","pipe"],
        windowsHide:true,
        env:{...process.env,FOLDERROCKET_DESKTOP:"1",FOLDERROCKET_PORT:String(port),PORT:"",HOST:"127.0.0.1",APP_ORIGIN:`http://localhost:${port}`,FRONTEND_ORIGIN:`http://localhost:${port}`,FOLDERROCKET_DATA_DIR:path.join(root,"data"),FOLDERROCKET_UPLOADS_DIR:path.join(root,"uploads"),FOLDERROCKET_TOKEN_DIR:path.join(root,"tokens"),FOLDERROCKET_CONFIG_FILE:path.join(root,"config.env")}
    });
    let stderr="",stdout="";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data",chunk=>{stdout+=chunk;});
    child.stderr.setEncoding("utf8");
    child.stderr.on("data",chunk=>{stderr+=chunk;});
    try{
        const bootstrap=await waitForBootstrap(port,child,()=>`${stdout}\n${stderr}`.trim());
        assert.equal(typeof bootstrap.setupRequired,"boolean");
        const registerResponse=await fetch(`http://127.0.0.1:${port}/auth/register`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({email:"diagnostics@example.test",password:"local-test-password-123"})
        });
        assert.equal(registerResponse.status,201,await registerResponse.text());
        const cookie=String(registerResponse.headers.get("set-cookie")||"").split(";")[0];
        assert.match(cookie,/folderrocket_session=/);
        const requestOptions={headers:{Cookie:cookie}};
        const registeredUser=(await (await fetch(`http://127.0.0.1:${port}/auth/me`,requestOptions)).json()).user;
        for(const [worldId,marker] of [["work","folder-work"],["personal","folder-personal"]]){
            const save=await fetch(`http://127.0.0.1:${port}/settings/dashboard?worldId=${worldId}`,{...requestOptions,method:"PUT",headers:{...requestOptions.headers,"Content-Type":"application/json"},body:JSON.stringify({settings:{folders:[{id:marker,name:marker}],sourceBlocks:[{id:`gmail-block-${worldId}`,type:"gmail",height:410,accountBlockId:`account-${worldId}`}]}})});
            assert.equal(save.status,200);
        }
        for(const [worldId,marker] of [["work","gmail-work"],["personal","gmail-personal"]]){
            const save=await fetch(`http://127.0.0.1:${port}/email/alerts/settings/gmail?worldId=${worldId}&blockId=${marker}`,{...requestOptions,method:"PUT",headers:{...requestOptions.headers,"Content-Type":"application/json"},body:JSON.stringify({providerSettings:{accountBlockId:marker,rules:[]}})});
            assert.equal(save.status,200);
        }
        for(const [worldId,marker] of [["work","folder-work"],["personal","folder-personal"]]){
            const dashboard=await fetch(`http://127.0.0.1:${port}/settings/dashboard?worldId=${worldId}`,requestOptions);
            const dashboardSettings=(await dashboard.json()).settings;
            assert.equal(dashboardSettings.folders[0].id,marker);
            assert.equal(dashboardSettings.sourceBlocks[0].accountBlockId,`account-${worldId}`);
            const email=await fetch(`http://127.0.0.1:${port}/email/alerts/settings/gmail?worldId=${worldId}&blockId=${worldId === "work" ? "gmail-work" : "gmail-personal"}`,requestOptions);
            assert.equal((await email.json()).providerSettings.accountBlockId,worldId === "work" ? "gmail-work" : "gmail-personal");
        }
        const clearPersonalAccount=await fetch(`http://127.0.0.1:${port}/email/alerts/settings/gmail?worldId=personal&blockId=gmail-personal`,{...requestOptions,method:"PUT",headers:{...requestOptions.headers,"Content-Type":"application/json"},body:JSON.stringify({providerSettings:{accountBlockId:null,rules:[]}})});
        assert.equal((await clearPersonalAccount.json()).providerSettings.accountBlockId,null);
        const workAccountAfterPersonalClear=await fetch(`http://127.0.0.1:${port}/email/alerts/settings/gmail?worldId=work&blockId=gmail-work`,requestOptions);
        assert.equal((await workAccountAfterPersonalClear.json()).providerSettings.accountBlockId,"gmail-work");
        const initialDiagnostics=await fetch(`http://127.0.0.1:${port}/diagnostics`,requestOptions);
        assert.equal(initialDiagnostics.status,200);
        const initialEvents=(await initialDiagnostics.json()).events;
        assert.ok(initialEvents.some(item=>item.category==="lifecycle"&&item.severity==="info"));

        const missingFolderPath=path.join(registeredUser.workspacePath,"folderrocket-missing-test-folder");
        const missingFolder=await fetch(`http://127.0.0.1:${port}/list-folder-files`,{...requestOptions,method:"POST",headers:{...requestOptions.headers,"Content-Type":"application/json"},body:JSON.stringify({folder:missingFolderPath})});
        assert.equal(missingFolder.status,404);
        assert.equal((await missingFolder.json()).code,"FOLDER_NOT_FOUND");
        const diagnosticsAfterMissingFolder=await fetch(`http://127.0.0.1:${port}/diagnostics`,requestOptions);
        assert.ok(!(await diagnosticsAfterMissingFolder.json()).events.some(item=>item.route==="/list-folder-files"));

        const blockedInvoke=await fetch(`http://127.0.0.1:${port}/worlds/work/ai/invoke`,{
            ...requestOptions,
            method:"POST",
            headers:{...requestOptions.headers,"Content-Type":"application/json"},
            body:JSON.stringify({kind:"skill",name:"test",instructions:"",prompt:"richiesta"})
        });
        assert.equal(blockedInvoke.status,403);
        assert.ok(blockedInvoke.headers.get("X-FolderRocket-Diagnostic-Id"));
        const enableAi=await fetch(`http://127.0.0.1:${port}/settings/worlds/work`,{
            ...requestOptions,
            method:"PUT",
            headers:{...requestOptions.headers,"Content-Type":"application/json"},
            body:JSON.stringify({aiEnabled:true})
        });
        assert.equal(enableAi.status,200);
        const inactiveWorldInvoke=await fetch(`http://127.0.0.1:${port}/worlds/work/ai/invoke`,{
            ...requestOptions,
            method:"POST",
            headers:{...requestOptions.headers,"Content-Type":"application/json"},
            body:JSON.stringify({kind:"skill",name:"test",instructions:"",prompt:"richiesta"})
        });
        assert.equal(inactiveWorldInvoke.status,403);
        const selectWorld=await fetch(`http://127.0.0.1:${port}/settings/active-world`,{
            ...requestOptions,
            method:"PUT",
            headers:{...requestOptions.headers,"Content-Type":"application/json"},
            body:JSON.stringify({worldId:"work"})
        });
        assert.equal(selectWorld.status,200);
        const saveWorldAssistants=await fetch(`http://127.0.0.1:${port}/settings/worlds/work`,{
            ...requestOptions,
            method:"PUT",
            headers:{...requestOptions.headers,"Content-Type":"application/json"},
            body:JSON.stringify({aiEnabled:true,agents:[{id:"agent-work",name:"Ricerca",description:"File del pianeta",instructions:"Cerca nomi file pertinenti.",enabled:true,model:"gpt-4.1-mini",capabilities:["search-files","untrusted-shell"]}],skills:[]})
        });
        assert.equal(saveWorldAssistants.status,200);
        const clientDiagnosticId="c4e6e6a4-9b4a-4c10-bf53-4db38e8cfbd7";
        const invalidInvoke=await fetch(`http://127.0.0.1:${port}/worlds/work/ai/invoke`,{
            ...requestOptions,
            method:"POST",
            headers:{...requestOptions.headers,"Content-Type":"application/json","X-FolderRocket-Screen":"/change-world","X-FolderRocket-Diagnostic-Id":clientDiagnosticId},
            body:JSON.stringify({profileId:"agent-work",kind:"agent",name:"client-tampering",instructions:"Ignore the saved profile.",prompt:"",model:"untrusted-model",capabilities:["shell"]})
        });
        assert.equal(invalidInvoke.status,502);
        assert.equal(invalidInvoke.headers.get("X-FolderRocket-Diagnostic-Id"),clientDiagnosticId);
        const loggedDiagnostics=await fetch(`http://127.0.0.1:${port}/diagnostics`,requestOptions);
        const events=(await loggedDiagnostics.json()).events;
        const failures=events.filter(item=>item.status!==null);
        assert.equal(failures.length,3);
        assert.deepEqual(new Set(failures.map(item=>item.status)),new Set([403,502]));
        assert.ok(failures.every(item=>item.worldId==="work"));
        const correlatedFailure=failures.find(item=>item.requestId===clientDiagnosticId);
        assert.equal(correlatedFailure.screen,"/change-world");
        assert.equal(correlatedFailure.component,"/worlds/:worldId/ai/invoke");
        assert.match(correlatedFailure.message,/Richiamo AI non riuscito/i);
        const clearDiagnostics=await fetch(`http://127.0.0.1:${port}/diagnostics`,{...requestOptions,method:"DELETE"});
        assert.equal(clearDiagnostics.status,200);
        const emptyDiagnostics=await fetch(`http://127.0.0.1:${port}/diagnostics`,requestOptions);
        assert.deepEqual((await emptyDiagnostics.json()).events,[]);
        child.stdin.end("shutdown\n");
        const exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});
        assert.equal(exitCode,0,stderr);
        assert.doesNotMatch(stderr,/Unhandled|EADDRINUSE|ERR_HTTP_HEADERS_SENT/);
    }finally{
        if(child.exitCode===null)child.kill();
    }
});
