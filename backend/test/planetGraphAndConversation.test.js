const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const graphStore = require("../services/planetGraphService");
const gmail = require("../services/gmailService");

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
