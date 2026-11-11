const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const {spawn} = require("node:child_process");
const test = require("node:test");
const planetGraph = require("../services/planet-knowledge/planetGraphService");

async function freePort() {
    const probe = net.createServer();
    await new Promise((resolve, reject) => probe.once("error", reject).listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    return port;
}

async function waitForServer(base, child) {
    const deadline = Date.now() + 20_000;
    let lastStatus = "unreachable";
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Backend exited during startup (${child.exitCode}).`);
        try { const response=await requestJson(`${base}/auth/bootstrap`);lastStatus=String(response.status);if(response.ok)return; } catch (error) { lastStatus=error instanceof Error?error.message:"unreachable"; }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Backend did not become ready in 20 seconds (last status ${lastStatus}).`);
}

function requestJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const request = http.request(target, {method:options.method || "GET",headers:options.headers || {}}, response => {
            const chunks = [];
            response.on("data", chunk => chunks.push(chunk));
            response.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                const result = {
                    status:response.statusCode,
                    ok:response.statusCode >= 200 && response.statusCode < 300,
                    headers:{get(name){return response.headers[String(name).toLowerCase()] || null;}},
                    text:async()=>text,
                    json:async()=>text ? JSON.parse(text) : null
                };
                result.clone = () => ({text:result.text,json:result.json});
                resolve(result);
            });
        });
        request.once("error", reject);
        if (options.body) request.write(options.body);
        request.end();
    });
}

test("Gmail Conversations detail and removal use its selected account independently of Dashboard", {timeout:30_000}, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-conversations-provider-"));
    t.after(() => fs.rm(root, {recursive:true, force:true}));
    const gmailMockPath = path.join(root, "mock-gmail-fetch.cjs");
    await fs.writeFile(gmailMockPath, `
const {appendFileSync} = require("node:fs");
const realFetch = global.fetch.bind(global);
global.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (!url.startsWith("https://gmail.googleapis.com/")) return realFetch(input, init);
  appendFileSync(process.env.FOLDERROCKET_GMAIL_MOCK_LOG, String(init.method || "GET") + " " + new URL(url).pathname + " " + (init.headers?.Authorization || "") + "\\n");
  const token = init.headers?.Authorization || "";
  const subject = token === "Bearer conversations-b-token" ? "Conversations B synthetic thread" : "Dashboard A synthetic thread";
  const parsed = new URL(url);
  const headers = [
    {name:"From",value:"Synthetic Sender <sender@example.test>"},
    {name:"To",value:"user@example.test"},
    {name:"Subject",value:subject},
    {name:"Date",value:"2026-10-24T10:30:00Z"},
    {name:"Message-ID",value:"<conversations-b-message@example.test>"}
  ];
  if (parsed.pathname.endsWith("/messages") && (init.method || "GET") === "GET") {
    return Response.json({messages:[{id:"conversations-b-message"}]});
  }
  if (parsed.pathname.endsWith("/drafts") && init.method === "POST") {
    return Response.json({id:"synthetic-draft-b",message:{id:"draft-message-b",threadId:"conversations-b-thread"}});
  }
  const threadMatch = parsed.pathname.match(/\\/threads\\/([^/]+)$/u);
  if (threadMatch) {
    const threadId = decodeURIComponent(threadMatch[1]);
    const messageId = threadId === "conversations-b-thread" ? "conversations-b-message" : "shared-a-message";
    return Response.json({id:threadId,messages:[{id:messageId,threadId,internalDate:"1790000000000",payload:{headers}}]});
  }
  const messageMatch = parsed.pathname.match(/\\/messages\\/([^/]+)$/u);
  if (messageMatch) {
    const messageId = decodeURIComponent(messageMatch[1]);
    const threadId = messageId === "conversations-b-message" ? "conversations-b-thread" : "shared-a-thread";
    return Response.json({id:messageId,threadId,internalDate:"1790000000000",payload:{mimeType:"text/plain",headers,body:{data:Buffer.from("Synthetic Gmail message body").toString("base64url")}}});
  }
  return Response.json({error:{message:"Unexpected synthetic Gmail request"}},{status:404});
};
`);

    const port = await freePort();
    const backendRoot = path.join(__dirname, "..");
    const tokenDirectory = path.join(root, "tokens");
    const preloadPath = gmailMockPath.replaceAll("\\", "/");
    const child = spawn(process.execPath, [path.join(backendRoot, "server.js")], {
        cwd:backendRoot,
        stdio:["pipe","pipe","pipe"],
        windowsHide:true,
        env:{
            ...process.env,
            NODE_OPTIONS:[process.env.NODE_OPTIONS, `--require="${preloadPath}"`].filter(Boolean).join(" "),
            FOLDERROCKET_DESKTOP:"1",
            FOLDERROCKET_PORT:String(port),
            PORT:"",
            HOST:"127.0.0.1",
            APP_ORIGIN:`http://localhost:${port}`,
            FRONTEND_ORIGIN:`http://localhost:${port}`,
            FOLDERROCKET_DATA_DIR:path.join(root,"data"),
            FOLDERROCKET_UPLOADS_DIR:path.join(root,"uploads"),
            FOLDERROCKET_TOKEN_DIR:tokenDirectory,
            FOLDERROCKET_GMAIL_MOCK_LOG:path.join(root,"gmail-mock-requests.log"),
            FOLDERROCKET_CONFIG_FILE:path.join(root,"config.env")
        }
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    t.after(() => { if (child.exitCode === null) { child.stdin.write("\n"); child.kill(); } });

    const base = `http://127.0.0.1:${port}`;
    await waitForServer(base, child).catch(error => { throw new Error(`${error.message} ${output}`); });
    const registration = await requestJson(`${base}/auth/register`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:"conversation-provider@example.test",password:"local-test-password-123"})
    });
    assert.equal(registration.status, 201, await registration.text());
    const cookie = String(registration.headers.get("set-cookie") || "").split(";")[0];
    const auth = {headers:{Cookie:cookie}};
    const user = await requestJson(`${base}/auth/me`, auth).then(response => response.json()).then(value => value.user);

    const previousTokenDirectory = process.env.FOLDERROCKET_TOKEN_DIR;
    process.env.FOLDERROCKET_TOKEN_DIR = tokenDirectory;
    try {
        const tokenStore = require("../services/shared/emailTokenStore");
        tokenStore.saveConnection("gmail", user.id, {email:"dashboard-a@example.test",accessToken:"dashboard-a-token",refreshToken:"synthetic-a-refresh",expiresAt:Date.now()+3_600_000}, "gmail-dashboard-a");
        tokenStore.saveConnection("gmail", user.id, {email:"conversations-b@example.test",accessToken:"conversations-b-token",refreshToken:"synthetic-b-refresh",expiresAt:Date.now()+3_600_000}, "gmail-conversations-b");
        const json = {"Content-Type":"application/json"};
        const saveDashboard = await requestJson(`${base}/settings/worlds/work`, {method:"PUT",headers:{...auth.headers,...json},body:JSON.stringify({emailAccount:{provider:"gmail",blockId:"gmail-dashboard-a"}})});
        assert.equal(saveDashboard.status, 200, await saveDashboard.text());
        const saveConversations = await requestJson(`${base}/settings/worlds/work`, {method:"PUT",headers:{...auth.headers,...json},body:JSON.stringify({conversations:{accounts:{gmail:{blockId:"gmail-conversations-b"}}}})});
        assert.equal(saveConversations.status, 200, await saveConversations.text());

        const graphRoot = path.join(root,"data","planet-graphs");
        await planetGraph.addSharedThread(user.id,"work",{sourceWorldId:"source-planet",blockId:"gmail-dashboard-a",threadId:"shared-a-thread",accountEmail:"dashboard-a@example.test",subject:"Shared A synthetic thread"},{rootDirectory:graphRoot});

        const wrongChatList=await requestJson(`${base}/worlds/work/graph/chats?provider=gmail&blockId=gmail-dashboard-a`,auth);
        assert.equal(wrongChatList.status,403,"an explicit Dashboard Gmail A choice cannot replace Conversations Gmail B in the Add chats selector");
        const chatList=await requestJson(`${base}/worlds/work/graph/chats?blockId=gmail-conversations-b`,auth);
        assert.equal(chatList.status,200,await chatList.clone().text());
        const chatOptions=await chatList.json();
        assert.equal(chatOptions.provider,"gmail");
        assert.ok(chatOptions.threads.some(item=>item.threadId==="conversations-b-thread"&&!item.selected));
        const wrongChatSelect=await requestJson(`${base}/worlds/work/graph/chats`,{method:"POST",headers:{...auth.headers,...json},body:JSON.stringify({provider:"gmail",blockId:"gmail-dashboard-a",threadId:"conversations-b-thread",selected:true})});
        assert.equal(wrongChatSelect.status,403,"an explicit Gmail A selector request is rejected");
        const selectedB=await requestJson(`${base}/worlds/work/graph/chats`,{method:"POST",headers:{...auth.headers,...json},body:JSON.stringify({blockId:"gmail-conversations-b",threadId:"conversations-b-thread",selected:true})});
        assert.equal(selectedB.status,200,await selectedB.text());
        assert.equal((await planetGraph.readGraph(user.id,"work",graphRoot)).selectedConversations.find(item=>item.threadId==="conversations-b-thread")?.blockId,"gmail-conversations-b","legacy UI request without provider still selects the saved Conversations account");

        const wrongAccount = await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread?provider=gmail&blockId=gmail-dashboard-a`, auth);
        assert.equal(wrongAccount.status, 403, "Dashboard Gmail A cannot be used as the Conversations account");
        const detail = await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread?provider=gmail&blockId=gmail-conversations-b`, auth);
        assert.equal(detail.status, 200, await detail.clone().text());
        const opened = await detail.json();
        assert.equal(opened.blockId, "gmail-conversations-b");
        assert.equal(opened.accountEmail, "conversations-b@example.test");
        assert.equal(opened.messages[0].subject, "Conversations B synthetic thread", "the detail must use Conversations account B, not Dashboard account A");
        const sharedDetail=await requestJson(`${base}/worlds/work/email/conversations/shared-a-thread?provider=gmail&blockId=gmail-dashboard-a`,auth);
        assert.equal(sharedDetail.status,200,await sharedDetail.clone().text());
        const openedShared=await sharedDetail.json();
        assert.equal(openedShared.shared,true,"a shared Gmail thread remains accessible through its exact saved reference even when the local Conversations account differs");
        assert.equal(openedShared.blockId,"gmail-dashboard-a");

        const wrongReply=await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread/reply`,{method:"POST",headers:{...auth.headers,...json},body:JSON.stringify({provider:"gmail",blockId:"gmail-dashboard-a",to:"recipient@example.test",subject:"Synthetic",text:"Do not use account A",originalMessageId:"<conversations-b-message@example.test>",mode:"draft"})});
        assert.equal(wrongReply.status,403,"an explicit Gmail A reply request is rejected");
        const draft=await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread/reply`,{method:"POST",headers:{...auth.headers,...json},body:JSON.stringify({blockId:"gmail-conversations-b",to:"recipient@example.test",subject:"Synthetic B reply",text:"Synthetic draft content",originalMessageId:"<conversations-b-message@example.test>",mode:"draft"})});
        assert.equal(draft.status,200,await draft.clone().text());
        assert.equal((await draft.json()).draftId,"synthetic-draft-b","the reply draft is created through Conversations Gmail B");

        const wrongShare=await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread/share`,{method:"POST",headers:{...auth.headers,...json},body:JSON.stringify({provider:"gmail",blockId:"gmail-dashboard-a",targetWorldIds:["personal"]})});
        assert.equal(wrongShare.status,403,"an explicit Gmail A share request is rejected");
        const share=await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread/share`,{method:"POST",headers:{...auth.headers,...json},body:JSON.stringify({provider:"gmail",blockId:"gmail-conversations-b",targetWorldIds:["personal"]})});
        assert.equal(share.status,200,await share.clone().text());
        assert.deepEqual((await share.json()).worldIds,["personal"]);
        assert.ok((await planetGraph.readGraph(user.id,"personal",graphRoot)).sharedThreads.some(item=>item.threadId==="conversations-b-thread"&&item.blockId==="gmail-conversations-b"),"sharing persists a reference to the selected B account thread");

        const wrongRemoval = await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread/removal`, {
            method:"POST",
            headers:{...auth.headers,...json},
            body:JSON.stringify({action:"remove",provider:"gmail",blockId:"gmail-dashboard-a"})
        });
        assert.equal(wrongRemoval.status, 403, "an explicit Gmail A removal cannot bypass the Conversations Gmail B selection");

        const removal = await requestJson(`${base}/worlds/work/email/conversations/conversations-b-thread/removal`, {
            method:"POST",
            headers:{...auth.headers,...json},
            body:JSON.stringify({action:"remove",provider:"gmail",blockId:"gmail-conversations-b",summary:{subject:"Conversations B synthetic thread",from:"sender@example.test",date:"2026-10-24T10:30:00Z"}})
        });
        assert.equal(removal.status, 200, await removal.text());
        const graph = await planetGraph.readGraph(user.id,"work",graphRoot);
        assert.ok(graph.removedConversations.some(item => item.blockId === "gmail-conversations-b" && item.threadId === "conversations-b-thread"), "the local tombstone belongs to Conversations Gmail B");
        assert.ok(!graph.selectedConversations.some(item => item.blockId === "gmail-conversations-b" && item.threadId === "conversations-b-thread"), "removal clears only the local planet selection");
        const providerRequests = await fs.readFile(path.join(root,"gmail-mock-requests.log"),"utf8");
        const loggedRequests=providerRequests.split(/\r?\n/u).filter(Boolean);
        assert.ok(loggedRequests.some(line=>line.startsWith("POST /gmail/v1/users/me/drafts Bearer conversations-b-token")),"the synthetic draft write uses only Conversations Gmail B");
        assert.ok(loggedRequests.every(line=>!line.includes("/messages/send")),"the test creates a draft only and never sends a message");
        const settings = await requestJson(`${base}/settings/worlds/work`,auth).then(response => response.json());
        assert.equal(settings.world.emailAccount.blockId, "gmail-dashboard-a", "removal does not alter the Dashboard account assignment");
    } finally {
        if (previousTokenDirectory === undefined) delete process.env.FOLDERROCKET_TOKEN_DIR;
        else process.env.FOLDERROCKET_TOKEN_DIR = previousTokenDirectory;
    }
});
