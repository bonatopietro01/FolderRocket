const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {executeCopyBatch,executeMoveBatch} = require("../services/fileBatchService");

async function fixture() {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "folderrocket-file-batch-"));
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    await Promise.all([fs.promises.mkdir(source), fs.promises.mkdir(destination)]);
    return {root,source,destination};
}

test("moves a complete batch and reports original paths", async t => {
    const current = await fixture();
    t.after(() => fs.promises.rm(current.root, {recursive:true,force:true}));
    const first = path.join(current.source, "first.txt");
    const second = path.join(current.source, "second.txt");
    await Promise.all([fs.promises.writeFile(first,"one"),fs.promises.writeFile(second,"two")]);
    const moved = await executeMoveBatch([
        {sourcePath:first,targetPath:path.join(current.destination,"renamed-first.txt"),samePath:false},
        {sourcePath:second,targetPath:path.join(current.destination,"second.txt"),samePath:false}
    ]);
    assert.deepEqual(moved.map(item=>item.name),["renamed-first.txt","second.txt"]);
    assert.equal(fs.existsSync(first),false);
    assert.equal(fs.existsSync(path.join(current.destination,"renamed-first.txt")),true);
});

test("rolls back files already moved when a later operation fails", async t => {
    const current = await fixture();
    t.after(() => fs.promises.rm(current.root, {recursive:true,force:true}));
    const first = path.join(current.source, "first.txt");
    await fs.promises.writeFile(first,"one");
    await assert.rejects(executeMoveBatch([
        {sourcePath:first,targetPath:path.join(current.destination,"first.txt"),samePath:false},
        {sourcePath:path.join(current.source,"missing.txt"),targetPath:path.join(current.destination,"missing.txt"),samePath:false}
    ]));
    assert.equal(fs.existsSync(first),true);
    assert.equal(fs.existsSync(path.join(current.destination,"first.txt")),false);
});

test("rolls back copies when a later copy fails", async t => {
    const current = await fixture();
    t.after(() => fs.promises.rm(current.root, {recursive:true,force:true}));
    const first = path.join(current.source, "first.txt");
    await fs.promises.writeFile(first,"one");
    await assert.rejects(executeCopyBatch([
        {sourcePath:first,targetPath:path.join(current.destination,"first.txt"),samePath:false},
        {sourcePath:path.join(current.source,"missing.txt"),targetPath:path.join(current.destination,"missing.txt"),samePath:false}
    ]));
    assert.equal(fs.existsSync(first),true);
    assert.equal(fs.existsSync(path.join(current.destination,"first.txt")),false);
});

test("can reverse a completed move batch", async t => {
    const current = await fixture();
    t.after(() => fs.promises.rm(current.root, {recursive:true,force:true}));
    const sourcePath = path.join(current.source,"report.txt");
    const targetPath = path.join(current.destination,"renamed-report.txt");
    await fs.promises.writeFile(sourcePath,"report");
    const moved = await executeMoveBatch([{sourcePath,targetPath,samePath:false}]);
    await executeMoveBatch(moved.map(item=>({sourcePath:item.path,targetPath:item.sourcePath,samePath:false})));
    assert.equal(fs.existsSync(sourcePath),true);
    assert.equal(fs.existsSync(targetPath),false);
});
