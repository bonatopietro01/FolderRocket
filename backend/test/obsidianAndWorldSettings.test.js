const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {legacyEmailAccountCandidates, normalizeEmailAccount, resolveWorldEmailAccount} = require("../services/worldEmailAccountService");
const {syncVault} = require("../services/obsidianVaultService");
const {listTreeRoots, resolveDesktopRoot} = require("../services/treeRocketService");
const {resolveManagedObsidianVault} = require("../../desktop/obsidianVaultProtocol.cjs");

test("per-world email selection migrates only one unique configured source", () => {
    const settings = {worlds:{work:{dashboard:{sourceBlocks:[
        {id:"mail-a",type:"gmail",accountBlockId:"account-a"},
        {id:"mail-a-copy",type:"gmail",accountBlockId:"account-a"},
        {id:"mail-b",type:"outlook",accountBlockId:"account-b"}
    ]}}}};
    assert.deepEqual(legacyEmailAccountCandidates(settings,"work"),[
        {provider:"gmail",blockId:"account-a"},{provider:"outlook",blockId:"account-b"}
    ]);
    assert.equal(resolveWorldEmailAccount(settings.worlds.work,settings,"work").conflict,true);
    const unique = {worlds:{work:{dashboard:{sourceBlocks:[{id:"mail-a",type:"gmail",accountBlockId:"account-a"}]}}}};
    assert.deepEqual(resolveWorldEmailAccount(unique.worlds.work,unique,"work").selection,{provider:"gmail",blockId:"account-a"});
    assert.deepEqual(normalizeEmailAccount({provider:"gmail",blockId:"account-a",email:"ignored@example.test"}),{provider:"gmail",blockId:"account-a"});
    assert.throws(()=>normalizeEmailAccount({provider:"imap",blockId:"account-a"}),/valid email account/i);
});

test("Obsidian sync is idempotent and preserves manually edited generated notes", async t => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-vault-test-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const vaultPath=path.join(root,"vault");
    const input={vaultPath,worldId:"work",ownerId:"user-1",worldName:"Work",records:[{id:"file:1",kind:"file",sourceId:"C:/fixture/report.pdf",title:"report.pdf",content:"Path: C:/fixture/report.pdf"}]};
    const first=await syncVault(input);
    assert.equal(first.written,1);
    const manifest=JSON.parse(await fs.readFile(path.join(vaultPath,".folderrocket","manifest.json"),"utf8"));
    const generatedPath=path.join(vaultPath,manifest.files["file:1"].path);
    const second=await syncVault(input);
    assert.equal(second.unchanged,1);
    assert.equal(second.written,0);
    await fs.writeFile(generatedPath,"# Personal edit\nKeep me.\n");
    const conflict=await syncVault(input);
    assert.equal(conflict.conflicts,1);
    assert.match(await fs.readFile(generatedPath,"utf8"),/Personal edit/);
    assert.equal(conflict.status,"conflict");
});

test("desktop Obsidian opener only resolves marked vaults inside the matching user's workspace",async t=>{
    const dataDirectory=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-obsidian-ipc-"));t.after(()=>fs.rm(dataDirectory,{recursive:true,force:true}));
    const vaultPath=path.join(dataDirectory,"workspaces","user-1","chosen","notes");
    await fs.mkdir(path.join(vaultPath,".folderrocket"),{recursive:true});
    await fs.writeFile(path.join(vaultPath,".folderrocket","vault.json"),JSON.stringify({ownerId:"user-1",worldId:"work"}));
    assert.equal(await resolveManagedObsidianVault({vaultPath,worldId:"work",dataDirectory}),vaultPath);
    await assert.rejects(resolveManagedObsidianVault({vaultPath,worldId:"personal",dataDirectory}),/does not match/i);
    await assert.rejects(resolveManagedObsidianVault({vaultPath:path.join(dataDirectory,"outside"),worldId:"work",dataDirectory}),/workspace|ENOENT/i);
});

test("Tree Rocket Desktop mode resolves redirected Windows Desktop and returns only that root", async () => {
    const desktopRoot=await resolveDesktopRoot({platform:"win32",home:"C:/Users/demo",environment:{OneDrive:"C:/Users/demo/OneDrive"},execFileImpl:(_file,_args,_options,callback)=>callback(null,"D:/Redirected Desktop\r\n","")});
    assert.equal(desktopRoot,path.resolve("D:/Redirected Desktop"));
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-tree-roots-"));
    try {
        const desktop=path.join(root,"Desktop");const workspace=path.join(root,"workspace");
        await fs.mkdir(desktop);await fs.mkdir(workspace);
        const roots=await listTreeRoots({workspacePath:workspace,administrator:false,mode:"desktop",desktopRoot:desktop});
        assert.deepEqual(roots.map(item=>item.path),[desktop]);
        assert.equal(roots[0].kind,"desktop");
    } finally {await fs.rm(root,{recursive:true,force:true});}
});

async function freePort() {
    const net=require("node:net");const probe=net.createServer();
    await new Promise((resolve,reject)=>probe.once("error",reject).listen(0,"127.0.0.1",resolve));
    const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;
}

test("authenticated per-world Obsidian and account settings stay local and world scoped",{timeout:30000},async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-world-settings-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const port=await freePort();const serverPath=path.join(__dirname,"..","server.js");
    const {spawn}=require("node:child_process");
    const child=spawn(process.execPath,[serverPath],{cwd:path.join(__dirname,".."),stdio:["pipe","pipe","pipe"],windowsHide:true,env:{...process.env,FOLDERROCKET_DESKTOP:"1",FOLDERROCKET_PORT:String(port),PORT:"",HOST:"127.0.0.1",APP_ORIGIN:`http://localhost:${port}`,FRONTEND_ORIGIN:`http://localhost:${port}`,FOLDERROCKET_DATA_DIR:path.join(root,"data"),FOLDERROCKET_UPLOADS_DIR:path.join(root,"uploads"),FOLDERROCKET_TOKEN_DIR:path.join(root,"tokens"),FOLDERROCKET_CONFIG_FILE:path.join(root,"config.env")}});
    let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",chunk=>{output+=chunk;});child.stderr.on("data",chunk=>{output+=chunk;});
    t.after(()=>{if(child.exitCode===null){child.stdin.write("\n");child.kill();}});
    const base=`http://127.0.0.1:${port}`;let ready=false;
    for(let index=0;index<200&&!ready;index++) {try{ready=(await fetch(`${base}/auth/bootstrap`)).ok;}catch{} if(!ready)await new Promise(resolve=>setTimeout(resolve,40));}
    assert.equal(ready,true,`server did not start: ${output}`);
    const registration=await fetch(`${base}/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"obsidian@example.test",password:"local-test-password-123"})});
    assert.equal(registration.status,201,await registration.text());const cookie=String(registration.headers.get("set-cookie")||"").split(";")[0];const auth={headers:{Cookie:cookie}};
    const unauth=await fetch(`${base}/worlds/work/obsidian`);assert.equal(unauth.status,401);
    const unknown=await fetch(`${base}/worlds/foreign/obsidian`,auth);assert.equal(unknown.status,404);
    const initial=await fetch(`${base}/settings/worlds/work`,auth);assert.equal(initial.status,200);
    const settings=await initial.json();assert.equal(settings.emailAccountConflict,false);assert.deepEqual(settings.world.emailAccount,null);assert.deepEqual(settings.emailAccounts,{gmail:[],outlook:[]});
    const badAccount=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({emailAccount:{provider:"gmail",blockId:"missing-account"}})});assert.equal(badAccount.status,400);
    const saved=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({emailAccount:null,treeRootMode:"desktop"})});assert.equal(saved.status,200);
    const roots=await fetch(`${base}/filesystem/tree-roots?worldId=work&mode=computer`,auth);assert.equal(roots.status,200);assert.equal((await roots.json()).mode,"computer");
    const invalidTreeSearch=await fetch(`${base}/filesystem/tree-search`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({query:"notes",worldId:"work",mode:"unknown"})});assert.equal(invalidTreeSearch.status,400,"Tree Rocket search must validate and honor its selected root mode");
    const worldTreeSearch=await fetch(`${base}/filesystem/tree-search`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({query:"notes",worldId:"work",mode:"computer"})});assert.equal(worldTreeSearch.status,200);const treeSearchResult=await worldTreeSearch.json();assert.ok(Array.isArray(treeSearchResult.folders));assert.ok(Array.isArray(treeSearchResult.files));
    const config=await fetch(`${base}/worlds/work/obsidian`,auth);assert.equal(config.status,200);const configData=await config.json();assert.equal(configData.config.enabled,false);assert.match(configData.config.vaultPath,/\.folderrocket[\\/]obsidian[\\/]work$/i);
    const enabled=await fetch(`${base}/worlds/work/obsidian`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({enabled:true})});assert.equal(enabled.status,200);
    const sync=await fetch(`${base}/worlds/work/obsidian/sync`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({})});assert.equal(sync.status,200,await sync.text());
    const persisted=await fetch(`${base}/worlds/work/obsidian`,auth);assert.equal((await persisted.json()).config.status,"ready");
    const personal=await fetch(`${base}/worlds/personal/obsidian`,auth);assert.equal((await personal.json()).config.enabled,false,"one planet's vault setting must not leak to another");
});
