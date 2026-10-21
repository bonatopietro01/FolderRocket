const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {graphRecords, syncVault} = require("../services/obsidianVaultService");

function sampleGraph() {
    return {
        nodes:[
            {id:"folder-a",type:"folder",sourceType:"filesystem",label:"Research",sourceRef:{graphSourceId:"folder:root-a",path:"C:/Fixture/Research"}},
            {id:"file-a",type:"file",sourceType:"filesystem",label:"study.pdf",sourceRef:{graphSourceId:"folder:root-a",path:"C:/Fixture/Research/study.pdf"},details:{extension:".pdf",size:42}},
            {id:"folder-b",type:"folder",sourceType:"filesystem",label:"Archive",sourceRef:{graphSourceId:"folder:root-b",path:"C:/Fixture/Archive"}},
            {id:"thread-a",type:"email-thread",sourceType:"gmail",label:"Fixture thread",sourceRef:{blockId:"account-a",threadId:"thread-a"},details:{accountEmail:"alpha@example.test"}},
            {id:"message-a",type:"email-message",sourceType:"gmail",label:"Message",sourceRef:{blockId:"account-a",threadId:"thread-a"},details:{accountEmail:"alpha@example.test"}},
            {id:"person-a",type:"person",sourceType:"gmail-contact",label:"Alex Fixture",sourceRef:{kind:"email-address",email:"alex@example.test"}},
            {id:"event-a",type:"calendar-event",sourceType:"calendar",label:"Planning meeting",sourceRef:{kind:"calendar",start:"2026-10-09T10:00:00Z"},details:{start:"2026-10-09T10:00:00Z"}},
            {id:"unsupported",type:"file-studio-operation",sourceType:"folderrocket",label:"Unscoped data",sourceRef:{}}
        ],
        edges:[
            {id:"contains-a",type:"contains",from:"folder-a",to:"file-a",provenance:"filesystem"},
            {id:"thread-message",type:"includes",from:"thread-a",to:"message-a",provenance:"gmail"},
            {id:"contact-message",type:"sent",from:"person-a",to:"message-a",provenance:"gmail-header"},
            {id:"unknown-edge",type:"unmapped",from:"unsupported",to:"file-a",provenance:"test"}
        ]
    };
}

function linkTargets(content) {
    return [...String(content).matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map(match=>match[1]);
}

function markdownFiles(vaultPath) {
    const visit = async directory => {
        const entries = await fs.readdir(directory,{withFileTypes:true}).catch(error=>error.code==="ENOENT"?[]:Promise.reject(error));
        const nested = await Promise.all(entries.map(entry=>entry.isDirectory()&&!entry.isSymbolicLink()?visit(path.join(directory,entry.name)):entry.isFile()&&entry.name.endsWith(".md")?[path.join(directory,entry.name)]:[]));
        return nested.flat();
    };
    return visit(vaultPath);
}

test("Obsidian graph notes are source grouped, meaningfully linked, and contain no relation-note noise", async t => {
    const records = graphRecords(sampleGraph(),"Fixture Alpha");
    assert.ok(records.some(item=>item.kind==="graph-source"&&item.sourceScopeId==="filesystem:folder:root-a"));
    assert.ok(records.some(item=>item.kind==="graph-source"&&item.sourceScopeId==="filesystem:folder:root-b"));
    assert.ok(records.some(item=>item.kind==="graph-source"&&item.sourceScopeId==="gmail:account-a"));
    assert.ok(records.some(item=>item.kind==="graph-source"&&item.sourceScopeId==="snapshot:calendar"));
    assert.ok(records.some(item=>item.id==="graph:person-a"&&item.sourceScopeId==="gmail:account-a"),"Gmail contacts inherit the selected account scope only through a message edge");
    assert.ok(!records.some(item=>item.sourceId==="unsupported"));
    assert.ok(!records.some(item=>item.kind==="relation"));
    const targets = new Set(records.map(item=>item.notePath.replace(/\.md$/i,"")));
    for (const record of records) {
        for (const target of linkTargets(record.content)) assert.ok(targets.has(target),`${record.id} links to missing note ${target}`);
    }
    const file = records.find(item=>item.id==="graph:file-a");
    assert.match(file.content,/Source: \[\[FolderRocket\/Sources\//);
    assert.match(file.content,/contains \(filesystem\): \[\[FolderRocket\/Entities\//);
    const hub = records.find(item=>item.kind==="graph-source"&&item.sourceScopeId==="filesystem:folder:root-a");
    assert.match(hub.content,/\[\[FolderRocket\/Entities\//);
    assert.doesNotMatch(records.map(item=>item.content).join("\n"),/\[\[folder-a\]\]|\[\[file-a\]\]/);

    const root = await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-obsidian-graph-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const vaultPath=path.join(root,"vault");
    const scopes=records.filter(item=>item.kind==="graph-source").map(item=>item.sourceScopeId);
    const overview={id:"overview:alpha",kind:"overview",sourceId:"alpha",title:"Fixture Alpha · FolderRocket",content:"Selected planet export."};
    const exportRecords=[overview,...records];
    const first=await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",worldName:"Fixture Alpha",records:exportRecords,completeSelection:true,selectedSourceScopeIds:scopes});
    const second=await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",worldName:"Fixture Alpha",records:exportRecords,completeSelection:true,selectedSourceScopeIds:scopes});
    assert.equal(first.written,exportRecords.length);
    assert.equal(second.written,0);
    assert.equal(second.unchanged,exportRecords.length);
    const manifest=JSON.parse(await fs.readFile(path.join(vaultPath,".folderrocket","manifest.json"),"utf8"));
    assert.equal(Object.keys(manifest.files).length,exportRecords.length,"repeat sync keeps one managed note per stable record ID");
    const overviewPath=path.join(vaultPath,manifest.files["overview:alpha"].path);
    const overviewMarkdown=await fs.readFile(overviewPath,"utf8");
    const exportedHubPaths=records.filter(item=>item.kind==="graph-source").map(item=>item.notePath.replace(/\.md$/i,""));
    const overviewTargets=linkTargets(overviewMarkdown);
    assert.deepEqual(overviewTargets.sort(),exportedHubPaths.sort(),"the README links to exactly the source hubs emitted in this export");
    assert.ok(overviewTargets.every(target=>targets.has(target)),"every README source link resolves to an emitted markdown note");
    assert.ok(overviewTargets.every(target=>!/[ #?]/.test(target)),"README wikilink targets use Obsidian-safe encoded paths");
    for (const filePath of await markdownFiles(vaultPath)) {
        const relative=path.relative(vaultPath,filePath).replace(/\\/g,"/").replace(/\.md$/i,"");
        const contents=await fs.readFile(filePath,"utf8");
        for (const target of linkTargets(contents)) assert.ok(targets.has(target),`${relative} contains unresolved internal link ${target}`);
    }
});

test("Obsidian sync skips pruning for incomplete selections and removes only unchanged deselected source notes", async t => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-obsidian-prune-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const vaultPath=path.join(root,"alpha");
    const oldRecords=[
        {id:"graph:old-file",kind:"file",title:"Old source file",sourceScopeId:"filesystem:folder:old-root",notePath:"FolderRocket/Entities/old-file.md",content:"old file"},
        {id:"graph-source:old-root",kind:"graph-source",title:"Old source",sourceScopeId:"filesystem:folder:old-root",notePath:"FolderRocket/Sources/old-root.md",content:"[[FolderRocket/Entities/old-file]]"},
        {id:"email:old-thread",kind:"email-conversation",title:"Old account conversation",sourceScopeId:"gmail:old-account",notePath:"FolderRocket/Entities/old-thread.md",content:"old mail"},
        {id:"graph:manual",kind:"file",title:"Manual edit",sourceScopeId:"filesystem:folder:old-root",notePath:"FolderRocket/Entities/manual.md",content:"generated"},
        {id:"email:conflict",kind:"email-conversation",title:"Conflict",sourceScopeId:"gmail:old-account",notePath:"FolderRocket/Entities/conflict.md",content:"generated version"},
        {id:"client:post-it:1",kind:"post-it",title:"Client note",sourceScopeId:"client-category:clientNotes",notePath:"FolderRocket/Entities/client-note.md",content:"private client note"},
        {id:"attachment:one",kind:"downloaded-attachment",title:"Downloaded file",notePath:"FolderRocket/Entities/attachment.md",content:"Local file: [[FolderRocket/attachments/file.pdf]]"},
        {id:"graph:legacy",kind:"file",title:"Legacy unknown scope",notePath:"FolderRocket/Entities/legacy.md",content:"legacy"}
    ];
    await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",records:oldRecords,selectedSourceScopeIds:["filesystem:folder:old-root","gmail:old-account","client-category:clientNotes"]});
    const manifestPath=path.join(vaultPath,".folderrocket","manifest.json");
    let manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
    const manualPath=path.join(vaultPath,manifest.files["graph:manual"].path);
    const conflictPath=path.join(vaultPath,manifest.files["email:conflict"].path);
    await fs.writeFile(manualPath,"# User-authored note\nKeep this text.\n");
    await fs.writeFile(conflictPath,"# User-authored conflict\nKeep this too.\n");
    await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",records:oldRecords.filter(item=>item.id!=="graph:manual").map(item=>item.id==="email:conflict"?{...item,content:"new generated version"}:item),completeSelection:false,selectedSourceScopeIds:["filesystem:folder:old-root","gmail:old-account","client-category:clientNotes"]});
    manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
    const conflictCopy=path.join(vaultPath,manifest.files["email:conflict"].conflicts[0]);

    const currentRecords=[
        {id:"graph:new-file",kind:"file",title:"Current source file",sourceScopeId:"filesystem:folder:new-root",notePath:"FolderRocket/Entities/new-file.md",content:"current file"},
        {id:"graph-source:new-root",kind:"graph-source",title:"Current source",sourceScopeId:"filesystem:folder:new-root",notePath:"FolderRocket/Sources/new-root.md",content:"current hub"}
    ];
    const incomplete=await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",records:currentRecords,completeSelection:false,selectedSourceScopeIds:["filesystem:folder:new-root"]});
    assert.equal(incomplete.pruned,0,"a partial result cannot delete notes that were not present in that result");
    manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
    assert.ok(manifest.files["graph:old-file"]);

    const complete=await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",records:currentRecords,completeSelection:true,selectedSourceScopeIds:["filesystem:folder:new-root","client-category:clientNotes"]});
    assert.equal(complete.prunedFromDeselected,3,"exactly the unchanged old filesystem hub/entity and Gmail thread are pruned");
    manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
    assert.ok(!manifest.files["graph:old-file"]);
    assert.ok(!manifest.files["graph-source:old-root"]);
    assert.ok(!manifest.files["email:old-thread"]);
    assert.equal(manifest.files["graph:manual"].retainedAsManual,true);
    assert.equal(manifest.files["graph:manual"].sourceScopeId,"");
    assert.match(await fs.readFile(manualPath,"utf8"),/User-authored note/);
    assert.ok(manifest.files["email:conflict"].conflicts.length>0);
    assert.match(await fs.readFile(conflictPath,"utf8"),/User-authored conflict/);
    assert.match(await fs.readFile(conflictCopy,"utf8"),/new generated version/);
    assert.ok(manifest.files["client:post-it:1"],"an omitted note in a still-selected client category is not assumed to be deselected");
    assert.ok(manifest.files["attachment:one"],"downloaded-attachment notes are never pruned by graph source deselection");
    assert.ok(manifest.files["graph:legacy"],"legacy entries without scope metadata remain untouched");
    assert.match(await fs.readFile(path.join(vaultPath,manifest.files["graph:legacy"].path),"utf8"),/legacy/);

    const otherWorldPath=path.join(root,"beta");
    await syncVault({vaultPath:otherWorldPath,worldId:"beta",ownerId:"user-1",records:[{id:"graph:beta",kind:"file",title:"Beta only",sourceScopeId:"filesystem:beta",content:"beta"}]});
    const otherManifest=JSON.parse(await fs.readFile(path.join(otherWorldPath,".folderrocket","manifest.json"),"utf8"));
    assert.deepEqual(Object.keys(otherManifest.files),["graph:beta"],"each planet vault stores only its own generated records");
});

test("Obsidian pruning follows client source category selection and protects manifest traversal paths", async t => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-obsidian-scope-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const vaultPath=path.join(root,"vault");
    const records=[{id:"client:post-it:1",kind:"post-it",title:"Note",sourceScopeId:"client-category:clientNotes",notePath:"FolderRocket/Entities/client-note.md",content:"note"}];
    await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",records,completeSelection:true,selectedSourceScopeIds:["client-category:clientNotes"]});
    const manifestPath=path.join(vaultPath,".folderrocket","manifest.json");
    let manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
    const escapePath=path.join(root,"outside.md");
    await fs.writeFile(escapePath,"outside vault");
    manifest.files["graph:tampered"]={kind:"file",path:"FolderRocket/Entities/../../outside.md",sourceScopeId:"filesystem:old",generatedHash:"pretend-generated"};
    await fs.writeFile(manifestPath,JSON.stringify(manifest));

    const keep=await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",records:[],completeSelection:true,selectedSourceScopeIds:["client-category:clientNotes"]});
    assert.equal(keep.pruned,0);
    manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
    assert.ok(manifest.files["client:post-it:1"]);
    assert.equal(await fs.readFile(escapePath,"utf8"),"outside vault");
    const deselect=await syncVault({vaultPath,worldId:"alpha",ownerId:"user-1",records:[],completeSelection:true,selectedSourceScopeIds:[]});
    assert.equal(deselect.pruned,1);
    manifest=JSON.parse(await fs.readFile(manifestPath,"utf8"));
    assert.ok(manifest.files["graph:tampered"],"an unsafe manifest path is retained and is never followed outside the generated tree");
    assert.equal(await fs.readFile(escapePath,"utf8"),"outside vault");
});

test("Obsidian route derives source scopes from current graph configuration and honors disabled email", async () => {
    const server=await fs.readFile(path.join(__dirname,"..","server.js"),"utf8");
    const route=server.slice(server.indexOf('app.post("/worlds/:worldId/obsidian/sync"'),server.indexOf('app.get("/worlds/:worldId/graph"'));
    assert.match(route,/selectedSourceScopeIds\.add\(`filesystem:folder:\$\{root\.id\}`\)/,"filesystem scope IDs must match graphSourceId values prefixed with folder:");
    assert.match(route,/selectedSourceScopeIds\.add\(`gmail:\$\{emailSelection\.blockId\}`\)/);
    assert.match(route,/queueKnowledgeSyncJob\(req\.user,worldId,currentScope\);await job\.done/);
    assert.match(route,/if\(!currentKnowledgeMatches\|\|currentKnowledge\.status!=="ready"\)/);
    assert.match(route,/selectedKnowledgeBlockers\(latestGraph,currentScope\)/);
    assert.match(route,/else if\(selection\?\.provider==="outlook"&&sourceSelection\.email\)/,"unsupported Outlook should block pruning only while email is selected");
    assert.match(route,/filterGraphBySources\(graph,sourceSelection,\{emailBlockIds:selectedEmailBlocks,folderRoots:syncFolderRoots\}\)/);
    assert.doesNotMatch(route,/completeSelection\s*=\s*req\.body\?\.completeSelection/,"the client cannot claim that a sync is complete");
});

test("Obsidian sync rejects a junction in the managed notes path", async t => {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-obsidian-junction-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const vaultPath=path.join(root,"vault");
    const externalPath=path.join(root,"external");
    await fs.mkdir(path.join(vaultPath,"FolderRocket","Knowledge"),{recursive:true});
    await fs.mkdir(externalPath,{recursive:true});
    const areasPath=path.join(vaultPath,"FolderRocket","Knowledge","Areas");
    try { await fs.symlink(externalPath,areasPath,"junction"); }
    catch(error) {
        if(["EPERM","EACCES","ENOTSUP","EINVAL"].includes(error?.code)) return t.skip(`Junctions are unavailable in this sandbox: ${error.code}`);
        throw error;
    }
    await assert.rejects(syncVault({
        vaultPath,
        worldId:"alpha",
        ownerId:"user-1",
        records:[{id:"knowledge-area:alpha:research",kind:"knowledge-area",sourceScopeId:"knowledge:alpha",title:"Research",notePath:"FolderRocket/Knowledge/Areas/research.md",content:"Selected-source summary."}]
    }),/symlink|directory|Obsidian/i);
    await assert.rejects(fs.access(path.join(externalPath,"research.md")),{code:"ENOENT"});
});
