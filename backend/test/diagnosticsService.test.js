const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("diagnostics are bounded, sanitized, user-isolated and clearable", async t => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "folderrocket-diagnostics-"));
    t.after(() => fs.promises.rm(root, {recursive: true, force: true}));
    process.env.FOLDERROCKET_DATA_DIR = root;
    const service = require("../services/diagnosticsService");

    assert.equal(service.safeText("Failed at C:\\Synthetic User\\Workspace With Spaces\\private.pdf (EACCES)"), "Failed at [local path] (EACCES)");
    await service.recordDiagnostic("alice", {id: "req-1", type: "http", message: "Bad request\nalice@example.test Bearer super-secret C:\\Users\\bonat\\private.pdf", route: "/files", worldId: "work", status: 400});
    await service.recordDiagnostic("bob", {id: "req-2", type: "backend", message: "Different user"});
    assert.equal((await service.listDiagnostics("alice")).length, 1);
    assert.equal((await service.listDiagnostics("bob"))[0].id, "req-2");
    assert.equal((await service.listDiagnostics("alice"))[0].message, "Bad request [email] Bearer [redacted] [local path]");
    await service.recordDiagnostic("alice", {id:"expired", type:"runtime", at:new Date(Date.now()-31*24*60*60*1000).toISOString()});
    assert.ok((await service.listDiagnostics("alice")).every(item=>item.id!=="expired"));
    process.env.FOLDERROCKET_DIAGNOSTICS_MAX_EVENTS = "50";
    await Promise.all(Array.from({length: 55}, (_, index) => service.recordDiagnostic("alice", {id: `bounded-${index}`, type: "runtime"})));
    assert.equal((await service.listDiagnostics("alice", 900)).length, 50);
    delete process.env.FOLDERROCKET_DIAGNOSTICS_MAX_EVENTS;
    assert.equal(await service.clearDiagnostics("alice"), true);
    assert.deepEqual(await service.listDiagnostics("alice"), []);
});

test("a diagnostics storage failure is contained and does not reject the caller", async t => {
    const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"folderrocket-diagnostics-failure-"));
    t.after(()=>fs.promises.rm(root,{recursive:true,force:true}));
    const blocker=path.join(root,"not-a-directory");
    await fs.promises.writeFile(blocker,"block");
    process.env.FOLDERROCKET_DATA_DIR=path.join(blocker,"data");
    const service=require("../services/diagnosticsService");
    const pending=service.recordDiagnostic("alice",{type:"backend",message:"safe failure"});
    assert.equal(typeof pending.then,"function");
    assert.equal(await pending,null);
    assert.deepEqual(await service.listDiagnostics("alice"),[]);
    assert.equal(service.hasStorageWarning(),true);
    process.env.FOLDERROCKET_DATA_DIR=path.join(root,"recovered-data");
    await service.recordDiagnostic("alice",{type:"backend",message:"recovered"});
    assert.equal(service.hasStorageWarning(),false);
});
