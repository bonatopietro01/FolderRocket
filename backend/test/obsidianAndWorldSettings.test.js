const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {legacyEmailAccountCandidates, normalizeEmailAccount, resolveWorldEmailAccount} = require("../services/worldEmailAccountService");
const graphStore = require("../services/planetGraphService");
const {syncVault, normalizeSourceSelection, fileOnlySourceSelection, filterRecordsBySources, filterGraphBySources, graphRecords, normalizeRecordBatch, MAX_NOTES} = require("../services/obsidianVaultService");
const {listTreeRoots, resolveDesktopRoot} = require("../services/treeRocketService");
const {resolveManagedObsidianVault} = require("../../desktop/obsidianVaultProtocol.cjs");
const {buildProviderAccountCatalog} = require("../services/providerAccountCatalog");
const {safePlanetVaultFolderName,migrateLegacyVault} = require("../services/obsidianVaultPaths");

test("world settings API validates and round-trips all supported planet styles and colors", async () => {
    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    const updateRoute=server.slice(server.indexOf('app.put("/settings/worlds/:worldId"'),server.indexOf('app.get("/settings/worlds/:worldId"'));
    assert.match(updateRoute,/\["planet", "rocky", "ringed", "glowing", "asteroid", "black-hole", "galaxy"\]/);
    assert.match(updateRoute,/\^#\[\\da-fA-F\]\{6\}\$/);
    assert.match(updateRoute,/style:req\.body\.style/);
    assert.doesNotMatch(updateRoute,/req\.body\.style === "rocky" \|\| req\.body\.style === "asteroid"/);
    assert.match(updateRoute,/req\.body\.color\.toLowerCase\(\)/);
    const readRoute=server.slice(server.indexOf('app.get("/settings/worlds/:worldId"'),server.indexOf("function validWorldId"));
    assert.match(readRoute,/\.\.\.currentWorld,style,emailAccount:/,"the read route returns canonical visual preferences when adding the resolved account label");
    assert.doesNotMatch(readRoute,/currentWorld\.style==="rocky"\|\|currentWorld\.style==="asteroid"/,"reading settings must not rewrite saved planet style identifiers");
});

test("planet vault names are Windows-safe and legacy migration copies only the verified managed vault",async t=>{
    assert.equal(safePlanetVaultFolderName("Lavoro / R&D"),"Lavoro - R&D");
    assert.equal(safePlanetVaultFolderName("CON"),"_CON");
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-vault-migration-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const legacy=path.join(root,"old","work"),target=path.join(root,"new","Lavoro");
    await fs.mkdir(path.join(legacy,".folderrocket"),{recursive:true});
    await fs.writeFile(path.join(legacy,".folderrocket","vault.json"),JSON.stringify({ownerId:"user-1",worldId:"work"}));
    await fs.writeFile(path.join(legacy,"manual-note.md"),"Keep this user note.\n");
    const migrated=await migrateLegacyVault({legacyPath:legacy,targetPath:target,ownerId:"user-1",worldId:"work"});
    assert.equal(migrated.migrated,true);
    assert.equal(await fs.readFile(path.join(target,"manual-note.md"),"utf8"),"Keep this user note.\n");
    assert.equal(await fs.readFile(path.join(legacy,"manual-note.md"),"utf8"),"Keep this user note.\n","migration keeps the original as recovery copy");
    const unrelated=path.join(root,"old","unrelated");await fs.mkdir(path.join(unrelated,".folderrocket"),{recursive:true});
    await fs.writeFile(path.join(unrelated,".folderrocket","vault.json"),JSON.stringify({ownerId:"other",worldId:"work"}));
    await assert.rejects(migrateLegacyVault({legacyPath:unrelated,targetPath:path.join(root,"new","Wrong"),ownerId:"user-1",worldId:"work"}),/ownership could not be verified/i);
});

test("provider account picker groups identities without losing selected credential or known planet origins", () => {
    const settings={worlds:{work:{name:"Lavoro",emailAccount:{provider:"gmail",blockId:"credential-b"}},personal:{name:"Personale",emailAccount:{provider:"gmail",blockId:"credential-a"}}}};
    const accounts=buildProviderAccountCatalog([
        {blockId:"credential-a",email:"Pietro@example.test",originWorldId:"personal",originWorldName:"Personale"},
        {blockId:"credential-b",email:"pietro@EXAMPLE.test",originWorldId:"work",originWorldName:"Lavoro"},
        {blockId:"legacy-no-email",email:"",originWorldId:"",originWorldName:""}
    ],settings,{provider:"gmail",worldId:"work",selectedBlockId:"credential-b"});
    assert.equal(accounts.length,2,"same provider identity must appear once");
    assert.deepEqual(accounts[0],{blockId:"legacy-no-email",blockIds:["legacy-no-email"],email:"",originWorldNames:[],originUnknown:true});
    assert.deepEqual(accounts[1],{blockId:"credential-b",blockIds:["credential-a","credential-b"],email:"Pietro@example.test",originWorldNames:["Lavoro","Personale"],originUnknown:false});
    const unselected=buildProviderAccountCatalog([
        {blockId:"credential-a",email:"Pietro@example.test",originWorldId:"personal",originWorldName:"Personale"},
        {blockId:"credential-b",email:"pietro@EXAMPLE.test",originWorldId:"work",originWorldName:"Lavoro"}
    ],settings,{provider:"gmail",worldId:"personal"});
    assert.equal(unselected[0].blockId,"credential-a","without a selected block prefer the credential originating in the current planet");
});

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

test("Gmail inbox account selection stays per planet while Daily Jobs keeps its explicit sender identity",()=>{
    const settings={worlds:{
        work:{emailAccount:{provider:"gmail",blockId:"gmail-work"},activityNotifications:{senderProvider:"outlook",senderBlockId:"outlook-digest"}},
        personal:{emailAccount:{provider:"gmail",blockId:"gmail-personal"}}
    }};
    assert.deepEqual(resolveWorldEmailAccount(settings.worlds.work,settings,"work").selection,{provider:"gmail",blockId:"gmail-work"});
    assert.deepEqual(resolveWorldEmailAccount(settings.worlds.personal,settings,"personal").selection,{provider:"gmail",blockId:"gmail-personal"});
    assert.equal(resolveWorldEmailAccount({name:"New planet"},{...settings,worlds:{...settings.worlds,new:{name:"New planet"}}},"new").selection,null,"a new planet does not inherit another planet's connected inbox account");
    const digest=require("../services/worldActivityEmailService").normalizeWorldActivityNotifications(settings.worlds.work.activityNotifications);
    assert.equal(digest.senderProvider,"outlook");
    assert.equal(digest.senderBlockId,"outlook-digest","the Daily Jobs sender is separate from the planet inbox account");
    const route=require("node:fs").readFileSync(path.join(__dirname,"..","server.js"),"utf8");
    const updateRoute=route.slice(route.indexOf('app.put("/settings/worlds/:worldId"'),route.indexOf('app.get("/settings/worlds/:worldId"'));
    assert.match(updateRoute,/nextWorld\.emailAccount\s*=/);
    assert.match(updateRoute,/nextWorld\.activityNotifications\s*=/);
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
    assert.equal(conflict.lastSyncAt,second.lastSyncAt,"a conflicted sync must not replace the last successful timestamp");
    assert.match(await fs.readFile(generatedPath,"utf8"),/Personal edit/);
    assert.equal(conflict.status,"conflict");
});

test("file-only projection keeps legacy settings readable but excludes every non-file source", () => {
    const legacy=normalizeSourceSelection(undefined);
    assert.equal(legacy.version,2);
    assert.equal(legacy.email,true);
    const selected=fileOnlySourceSelection({...legacy,folders:true,email:true,activity:true,clientNotes:true,attachments:true,threadMode:"selected",threadIds:["thread-1"]});
    assert.equal(selected.email,false);assert.equal(selected.activity,false);assert.equal(selected.clientNotes,false);assert.equal(selected.attachments,false);assert.equal(selected.threadMode,"all");assert.deepEqual(selected.threadIds,[]);
    const graph=filterGraphBySources({nodes:[{id:"f",type:"file",sourceType:"filesystem",sourceRef:{path:"C:/Work/a.txt"}},{id:"e",type:"email-thread",sourceType:"gmail"},{id:"a",type:"activity",sourceType:"folderrocket"}],edges:[{id:"ef",from:"e",to:"f"},{id:"ea",from:"e",to:"a"}]},selected);
    assert.deepEqual(graph.nodes.map(item=>item.id),["f"]);
    assert.deepEqual(graph.edges,[]);
    assert.deepEqual(filterRecordsBySources([{id:"1",kind:"email-conversation",sourceScopeId:"gmail:account"},{id:"2",kind:"post-it",sourceScopeId:"client-category:clientNotes"},{id:"3",kind:"file",sourceScopeId:"filesystem:folder-a"},{id:"4",kind:"overview"}],selected).map(item=>item.id),["3","4"]);
});

test("disabling activity/search sources removes the same nodes from graph and generated vault records", () => {
    const graph={nodes:[
        {id:"folder-1",type:"folder",sourceType:"filesystem",sourceRef:{path:"C:\\Work\\Project",graphSourceId:"folder:folder-1"},label:"Project"},
        {id:"activity-1",type:"activity",sourceType:"folderrocket",label:"Moved a file"},
        {id:"search-1",type:"search",sourceType:"folderrocket",label:"Searched invoices"}
    ],edges:[]};
    const disabled=normalizeSourceSelection({version:2,activity:false});
    const visibleGraph=filterGraphBySources(graph,disabled);
    const vaultRecords=filterRecordsBySources(graphRecords(visibleGraph,"Work"),disabled);
    assert.deepEqual(visibleGraph.nodes.map(item=>item.id),["folder-1"]);
    assert.deepEqual(vaultRecords.filter(item=>item.kind==="folder").map(item=>item.sourceId),["folder-1"]);

    const enabled=normalizeSourceSelection({version:2,activity:true});
    assert.deepEqual(filterGraphBySources(graph,enabled).nodes.map(item=>item.id),["folder-1"]);
    assert.deepEqual(filterRecordsBySources(graphRecords(graph,"Work"),enabled).filter(item=>["folder","activity","search"].includes(item.kind)).map(item=>item.sourceId),["folder-1"]);
});

test("planet graph projection never includes Gmail records",()=>{
    const graph={nodes:[
        {id:"t-work",type:"email-thread",sourceType:"gmail",sourceRef:{blockId:"work-account",threadId:"work-thread"}},
        {id:"m-work",type:"email-message",sourceType:"gmail",sourceRef:{blockId:"work-account",threadId:"work-thread"}},
        {id:"p-work",type:"person",sourceType:"gmail-contact",sourceRef:{kind:"email-address",email:"work@example.test"}},
        {id:"t-old",type:"email-thread",sourceType:"gmail",sourceRef:{blockId:"old-account",threadId:"old-thread"}},
        {id:"m-old",type:"email-message",sourceType:"gmail",sourceRef:{blockId:"old-account",threadId:"old-thread"}},
        {id:"p-old",type:"person",sourceType:"gmail-contact",sourceRef:{kind:"email-address",email:"old@example.test"}}
    ],edges:[
        {id:"work-contact",from:"p-work",to:"m-work",provenance:"gmail-header"},
        {id:"old-contact",from:"p-old",to:"m-old",provenance:"gmail-header"}
    ]};
    const result=filterGraphBySources(graph,normalizeSourceSelection(),{folderRoots:[]});
    assert.deepEqual(result.nodes,[]);
    assert.deepEqual(result.edges,[]);
});

test("Obsidian record limit reports omitted unique source records rather than silently truncating",()=>{
    const records=Array.from({length:MAX_NOTES+3},(_,index)=>({id:`item-${index}`,kind:"file",title:`File ${index}`}));
    records.push(records[0]);
    const batch=normalizeRecordBatch(records);
    assert.equal(batch.records.length,MAX_NOTES);
    assert.equal(batch.omitted,3,"duplicates are ignored and only unique valid records count as omitted");
});

test("desktop Obsidian opener only resolves marked vaults inside the matching user's workspace",async t=>{
    const dataDirectory=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-obsidian-ipc-"));t.after(()=>fs.rm(dataDirectory,{recursive:true,force:true}));
    const vaultPath=path.join(dataDirectory,"workspaces","user-1","chosen","notes");
    await fs.mkdir(path.join(vaultPath,".folderrocket"),{recursive:true});
    await fs.writeFile(path.join(vaultPath,".folderrocket","vault.json"),JSON.stringify({ownerId:"user-1",worldId:"work"}));
    assert.equal((await resolveManagedObsidianVault({vaultPath,worldId:"work",dataDirectory})).toLowerCase(),vaultPath.toLowerCase());
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
        assert.deepEqual(roots.map(item=>item.path.toLowerCase()),[desktop.toLowerCase()]);
        assert.equal(roots[0].kind,"desktop");
    } finally {await fs.rm(root,{recursive:true,force:true});}
});

async function freePort() {
    const net=require("node:net");const probe=net.createServer();
    await new Promise((resolve,reject)=>probe.once("error",reject).listen(0,"127.0.0.1",resolve));
    const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;
}

test("authenticated per-world Obsidian and account settings stay local and world scoped",{timeout:60000},async t=>{
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
    const customWorldSettings=await fetch(`${base}/settings/worlds/custom-planet`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({name:"Custom planet",emailAccount:null})});assert.equal(customWorldSettings.status,200,await customWorldSettings.text());
    const customWorldRead=await fetch(`${base}/settings/worlds/custom-planet`,auth);assert.equal(customWorldRead.status,200);assert.equal((await customWorldRead.json()).world.name,"Custom planet");
    const customWorldObsidian=await fetch(`${base}/worlds/custom-planet/obsidian`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({enabled:false,autoSync:false})});assert.equal(customWorldObsidian.status,200,await customWorldObsidian.text());
    const customWorldAfterObsidian=await fetch(`${base}/settings/worlds/custom-planet`,auth);assert.equal(customWorldAfterObsidian.status,200);assert.equal((await customWorldAfterObsidian.json()).world.name,"Custom planet","saving vault settings after name persistence must preserve the custom planet identity");
    const noNotificationAccount=await fetch(`${base}/worlds/work/email/notifications`,auth);assert.equal(noNotificationAccount.status,200);assert.deepEqual(await noNotificationAccount.json(),{count:0,supported:true,configured:false,accountId:"",threadIds:[]});
    const badAccount=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({emailAccount:{provider:"gmail",blockId:"missing-account"}})});assert.equal(badAccount.status,400);
    const saved=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({emailAccount:null,treeRootMode:"desktop"})});assert.equal(saved.status,200);
    const visualSettings=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({style:"asteroid",color:"#A1b2C3"})});assert.equal(visualSettings.status,200,await visualSettings.text());
    const visualRead=await fetch(`${base}/settings/worlds/work`,auth);assert.equal(visualRead.status,200);assert.deepEqual(((await visualRead.json()).world),{style:"asteroid",color:"#a1b2c3",emailAccount:null,conversations:{accounts:{gmail:{blockId:null},outlook:{blockId:null},teams:{blockId:null}}},treeRootMode:"desktop"});
    const invalidWorldStyle=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({style:"luminous"})});assert.equal(invalidWorldStyle.status,400);
    const invalidWorldColor=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({color:"not-a-color"})});assert.equal(invalidWorldColor.status,400);
    const visualAfterRejectedUpdate=await fetch(`${base}/settings/worlds/work`,auth).then(response=>response.json());assert.equal(visualAfterRejectedUpdate.world.style,"asteroid");assert.equal(visualAfterRejectedUpdate.world.color,"#a1b2c3");
    const named=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({name:"Lavoro"})});assert.equal(named.status,200);
    const roots=await fetch(`${base}/filesystem/tree-roots?worldId=work&mode=computer`,auth);assert.equal(roots.status,200);assert.equal((await roots.json()).mode,"computer");
    const invalidTreeSearch=await fetch(`${base}/filesystem/tree-search`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({query:"notes",worldId:"work",mode:"unknown"})});assert.equal(invalidTreeSearch.status,400,"Tree Rocket search must validate and honor its selected root mode");
    const worldTreeSearch=await fetch(`${base}/filesystem/tree-search`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({query:"notes",worldId:"work",mode:"computer"})});assert.equal(worldTreeSearch.status,200);const treeSearchResult=await worldTreeSearch.json();assert.ok(Array.isArray(treeSearchResult.folders));assert.ok(Array.isArray(treeSearchResult.files));
    const authUser=await fetch(`${base}/auth/me`,auth).then(response=>response.json()).then(value=>value.user);
    const wikiSourceRoot=path.join(authUser.workspacePath,"synthetic-wiki-source");await fs.mkdir(wikiSourceRoot,{recursive:true});await fs.writeFile(path.join(wikiSourceRoot,"note.txt"),"Synthetic local file used to validate the current planet wiki before Obsidian sync.\n");
    const configuredWikiSource=await fetch(`${base}/settings/dashboard?worldId=work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({settings:{folders:[{id:"wiki-settings-root",name:"Synthetic wiki source",path:wikiSourceRoot,storage:"computer"}],sourceBlocks:[]}})});assert.equal(configuredWikiSource.status,200,await configuredWikiSource.text());
    const legacyVault=path.join(authUser.workspacePath,".folderrocket","obsidian","work");await fs.mkdir(path.join(legacyVault,".folderrocket"),{recursive:true});await fs.writeFile(path.join(legacyVault,".folderrocket","vault.json"),JSON.stringify({ownerId:authUser.id,worldId:"work"}));await fs.writeFile(path.join(legacyVault,"manual.md"),"Do not lose me.\n");
    await syncVault({vaultPath:legacyVault,worldId:"work",ownerId:authUser.id,records:[{id:"client:daily-job:historic",kind:"daily-job",sourceScopeId:"client-category:activity",title:"Historic record",notePath:"FolderRocket/Entities/historic-record.md",content:"Previously generated note"}],completeSelection:true,selectedSourceScopeIds:["client-category:activity"]});
    const config=await fetch(`${base}/worlds/work/obsidian`,auth);assert.equal(config.status,200);const configData=await config.json();assert.equal(configData.config.enabled,false);assert.equal(configData.config.autoSync,false);assert.match(configData.config.vaultPath,/\.folderrocket[\\/]obsidian[\\/]work$/i,"opening before sync keeps pointing at the verified legacy vault");
    const invalidAutoSync=await fetch(`${base}/worlds/work/obsidian`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({autoSync:"true"})});assert.equal(invalidAutoSync.status,400);
    const enabled=await fetch(`${base}/worlds/work/obsidian`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({enabled:true,autoSync:true})});assert.equal(enabled.status,200);assert.equal((await enabled.json()).config.autoSync,true);
    const badSelection=await fetch(`${base}/worlds/work/obsidian`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({sourceSelection:{version:1,email:"false"}})});assert.equal(badSelection.status,400);
    const selected=await fetch(`${base}/worlds/work/obsidian`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({sourceSelection:{version:1,folders:true,email:false,threadMode:"selected",threadIds:["thread-1"]}})});assert.equal(selected.status,200);
    const graphEnabled=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({graphEnabled:true})});assert.equal(graphEnabled.status,200);
    const indexing=await fetch(`${base}/worlds/work/graph/index`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({snapshot:{}})});assert.equal(indexing.status,202);
    let graphSummary;for(let attempt=0;attempt<200;attempt++){await new Promise(resolve=>setTimeout(resolve,25));const response=await fetch(`${base}/worlds/work/graph?summary=1`,auth);graphSummary=await response.json();if(graphSummary.graphStatus!=="indexing")break;}
    assert.equal(graphSummary.graphStatus,"ready","the Obsidian integration fixture syncs only after its selected graph sources are complete");
    let wikiIndex;for(let attempt=0;attempt<200;attempt++){await new Promise(resolve=>setTimeout(resolve,25));wikiIndex=await (await fetch(`${base}/worlds/work/wiki?limit=1`,auth)).json();if(wikiIndex.status==="ready")break;}
    assert.equal(wikiIndex.status,"ready","Obsidian sync consumes the latest manual wiki generation and does not start one");
    const firstSync=await fetch(`${base}/worlds/work/obsidian/sync`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({})});assert.equal(firstSync.status,409,await firstSync.clone().text());assert.equal((await firstSync.json()).code,"KNOWLEDGE_INCOMPLETE","migrating the verified legacy vault changes the wiki scope and requires a manual rebuild");
    const rebuild=await fetch(`${base}/worlds/work/graph/index`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({})});assert.equal(rebuild.status,202,await rebuild.text());
    let rebuiltWiki;for(let attempt=0;attempt<600;attempt++){await new Promise(resolve=>setTimeout(resolve,25));rebuiltWiki=await (await fetch(`${base}/worlds/work/wiki?limit=1`,auth)).json();if(rebuiltWiki.status==="ready")break;}
    const rebuiltGraphSummary=await fetch(`${base}/worlds/work/graph?summary=1`,auth).then(response=>response.json());
    assert.equal(rebuiltWiki.status,"ready",`the manual rebuild publishes a wiki for the migrated vault scope; wiki=${JSON.stringify({status:rebuiltWiki.status,total:rebuiltWiki.total})}; graph=${JSON.stringify({status:rebuiltGraphSummary.graphStatus,revision:rebuiltGraphSummary.revision,knowledgeRevision:rebuiltGraphSummary.managedMarkdown?.revision,knowledgeStatus:rebuiltGraphSummary.managedMarkdown?.status,progress:rebuiltGraphSummary.progress})}`);
    const sync=await fetch(`${base}/worlds/work/obsidian/sync`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({})});assert.equal(sync.status,200,await sync.clone().text());
    const syncData=await sync.json();assert.deepEqual(syncData.result.warnings,[]);assert.deepEqual(syncData.result.sourceSelection,{version:2,folders:true,email:false,alerts:false,activity:false,snapshots:false,clientNotes:false,attachments:false,threadMode:"all",threadIds:[],folderMode:"all",folderIds:[],fileTypeMode:"all",fileTypes:[],excludedFileIds:[],includeSubfolders:true});assert.equal(await fs.readFile(path.join(syncData.config.vaultPath,"manual.md"),"utf8"),"Do not lose me.\n");assert.match(await fs.readFile(path.join(syncData.config.vaultPath,"FolderRocket","Entities","historic-record.md"),"utf8"),/Previously generated note/,"notes written by older excluded categories remain present");assert.equal((await fs.readFile(path.join(legacyVault,"manual.md"),"utf8")),"Do not lose me.\n");assert.match(syncData.config.vaultPath,/Lavoro$/);
    const persisted=await fetch(`${base}/worlds/work/obsidian`,auth);const persistedData=await persisted.json();assert.equal(persistedData.config.status,"ready");assert.equal(persistedData.config.sourceSelection.folders,true);assert.equal(persistedData.config.sourceSelection.email,false);assert.equal(persistedData.config.sourceSelection.activity,false);assert.equal(persistedData.config.autoSync,true);assert.match(persistedData.config.vaultPath,/Lavoro$/,"a verified legacy migration is persisted as this planet's active vault path");
    const personal=await fetch(`${base}/worlds/personal/obsidian`,auth);assert.equal((await personal.json()).config.enabled,false,"one planet's vault setting must not leak to another");
    const previousTokenDirectory=process.env.FOLDERROCKET_TOKEN_DIR;process.env.FOLDERROCKET_TOKEN_DIR=path.join(root,"tokens");
    try {
        const emailTokenStore=require("../services/emailTokenStore");
        emailTokenStore.saveConnection("gmail",authUser.id,{email:"selected@example.test",accessToken:"synthetic-access-token",refreshToken:"synthetic-refresh-token",expiresAt:Date.now()+3600000},"gmail-settings-fixture");
        emailTokenStore.saveConnection("outlook",authUser.id,{email:"outlook@example.test",accessToken:"synthetic-outlook-access-token",refreshToken:"synthetic-outlook-refresh-token",expiresAt:Date.now()+3600000},"outlook-settings-fixture");
        const selectedAccount=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({emailAccount:{provider:"gmail",blockId:"gmail-settings-fixture"}})});assert.equal(selectedAccount.status,200,await selectedAccount.text());
        const selectedAccountSettings=await fetch(`${base}/settings/worlds/work`,auth);assert.equal(selectedAccountSettings.status,200);assert.equal((await selectedAccountSettings.json()).world.emailAccount.email,"selected@example.test","selected Gmail email should be read from the raw connected-account catalog");
        const conversationsSelection=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({conversations:{accounts:{gmail:{blockId:"gmail-settings-fixture"},outlook:{blockId:"outlook-settings-fixture"},teams:{blockId:"outlook-settings-fixture"}}}})});assert.equal(conversationsSelection.status,200,await conversationsSelection.text());
        const conversationsSettings=await fetch(`${base}/settings/worlds/work`,auth).then(response=>response.json());assert.deepEqual(conversationsSettings.world.conversations.accounts,{gmail:{blockId:"gmail-settings-fixture"},outlook:{blockId:"outlook-settings-fixture"},teams:{blockId:"outlook-settings-fixture"}});assert.equal(conversationsSettings.world.emailAccount.provider,"gmail","Conversation account choices must not replace the Dashboard account");
        const graphRoot=path.join(root,"data","planet-graphs");
        await graphStore.selectConversation(authUser.id,"work",{provider:"gmail",blockId:"gmail-settings-fixture",threadId:"same-sender-target",sender:"same@example.test",subject:"Synthetic subject",accountEmail:"selected@example.test"},{rootDirectory:graphRoot});
        await graphStore.selectConversation(authUser.id,"work",{provider:"gmail",blockId:"gmail-settings-fixture",threadId:"same-sender-sibling",sender:"same@example.test",subject:"Synthetic sibling",accountEmail:"selected@example.test"},{rootDirectory:graphRoot});
        const removeConversation=await fetch(`${base}/worlds/work/email/conversations/same-sender-target/removal`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({action:"remove",blockId:"gmail-settings-fixture",summary:{subject:"Synthetic subject",from:"same@example.test",date:"2026-10-24T10:30:00Z"}})});assert.equal(removeConversation.status,200,await removeConversation.text());
        let removedGraph=await graphStore.readGraph(authUser.id,"work",graphRoot);assert.deepEqual(removedGraph.selectedConversations.map(item=>item.threadId),["same-sender-sibling"]);assert.equal(removedGraph.removedConversations[0].subject,"Synthetic subject");assert.equal((await graphStore.readGraph(authUser.id,"personal",graphRoot)).removedConversations.length,0);
        const restoreConversation=await fetch(`${base}/worlds/work/email/conversations/same-sender-target/removal`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({action:"restore",blockId:"gmail-settings-fixture"})});assert.equal(restoreConversation.status,200,await restoreConversation.text());
        removedGraph=await graphStore.readGraph(authUser.id,"work",graphRoot);assert.ok(removedGraph.selectedConversations.some(item=>item.threadId==="same-sender-target"));assert.ok(removedGraph.selectedConversations.some(item=>item.threadId==="same-sender-sibling"));assert.deepEqual(removedGraph.removedConversations,[]);
        const removeInboxOnly=await fetch(`${base}/worlds/work/email/conversations/inbox-only-thread/removal`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({action:"remove",blockId:"gmail-settings-fixture",summary:{subject:"Inbox only",from:"inbox@example.test",date:"2026-10-24T10:31:00Z"}})});assert.equal(removeInboxOnly.status,200,await removeInboxOnly.text());
        removedGraph=await graphStore.readGraph(authUser.id,"work",graphRoot);assert.equal(removedGraph.removedConversations[0].selectedReference?.threadId,"inbox-only-thread","removing a mailbox thread captures its exact local restore reference");
        const removeChat=await fetch(`${base}/worlds/work/graph/chats`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({blockId:"gmail-settings-fixture",threadId:"not-selected",selected:false})});assert.equal(removeChat.status,200,"chat selection persistence is independent of Obsidian email-source inclusion");
        const unlink=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({emailAccount:null})});assert.equal(unlink.status,200,await unlink.text());
        const restoreInboxOnly=await fetch(`${base}/worlds/work/email/conversations/inbox-only-thread/removal`,{...auth,method:"POST",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({action:"restore",blockId:"gmail-settings-fixture"})});assert.equal(restoreInboxOnly.status,200,await restoreInboxOnly.text());
        removedGraph=await graphStore.readGraph(authUser.id,"work",graphRoot);assert.ok(removedGraph.selectedConversations.some(item=>item.threadId==="inbox-only-thread"),"the exact inbox thread remains restorable after unlinking its planet account");
        const unlinked=await fetch(`${base}/settings/worlds/work`,auth).then(response=>response.json());assert.equal(unlinked.world.emailAccount,null);assert.ok(unlinked.emailAccounts.gmail.some(item=>item.blockId==="gmail-settings-fixture"),"unlinking a planet preserves the globally connected Gmail account");
        const selectedOutlook=await fetch(`${base}/settings/worlds/work`,{...auth,method:"PUT",headers:{...auth.headers,"Content-Type":"application/json"},body:JSON.stringify({emailAccount:{provider:"outlook",blockId:"outlook-settings-fixture"}})});assert.equal(selectedOutlook.status,200,await selectedOutlook.text());
        const outlookBadge=await fetch(`${base}/worlds/work/email/notifications`,auth);assert.equal(outlookBadge.status,501);assert.deepEqual(await outlookBadge.json(),{code:"provider_unsupported",message:"Outlook inbox notifications are not available yet. Gmail notifications are supported for the selected account."});
    } finally {if(previousTokenDirectory===undefined)delete process.env.FOLDERROCKET_TOKEN_DIR;else process.env.FOLDERROCKET_TOKEN_DIR=previousTokenDirectory;}
});
