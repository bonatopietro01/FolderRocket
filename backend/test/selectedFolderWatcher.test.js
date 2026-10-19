const test=require("node:test");
const assert=require("node:assert/strict");
const {EventEmitter}=require("node:events");
const {createSelectedFolderWatcher,directoryMetadataSignature}=require("../services/selectedFolderWatcher");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");

test("selected folder watcher batches notifications and disposes its resources",async()=>{
    const callbacks=[];let scheduled=null,closed=false,intervalCleared=false;
    const watcher=new EventEmitter();watcher.close=()=>{closed=true;};
    const handle=createSelectedFolderWatcher({roots:[{id:"selected",path:"C:/synthetic/selected"}],onChange:async value=>callbacks.push(value),watchFactory:(_target,_options,listener)=>{watcher.on("change",listener);return watcher;},signature:async()=>"same",setTimer:fn=>{scheduled=fn;return 1;},clearTimer:()=>{},setIntervalFn:()=>7,clearIntervalFn:()=>{intervalCleared=true;}});
    watcher.emit("change","change","note.md");watcher.emit("change","change","note.md");
    assert.equal(callbacks.length,0);
    scheduled();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(callbacks.length,1);
    handle.dispose();
    assert.equal(closed,true);assert.equal(intervalCleared,true);assert.equal(handle.disposed,true);
});

test("five-minute metadata polling schedules the same debounced refresh for selected-root changes",async()=>{
    let pollCallback=null,debounceCallback=null,pollMs=null,current="before";const changes=[];
    const watcher=createSelectedFolderWatcher({roots:[{id:"selected",path:"C:/synthetic/selected"}],onChange:async value=>changes.push(value),watchFactory:()=>{throw new Error("native watcher unavailable");},signature:async roots=>{assert.deepEqual(roots,["C:/synthetic/selected"]);return current;},setTimer:fn=>{debounceCallback=fn;return 2;},clearTimer:()=>{},setIntervalFn:(fn,ms)=>{pollCallback=fn;pollMs=ms;return 3;},clearIntervalFn:()=>{}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(pollMs,300_000);
    current="after";await pollCallback();
    assert.equal(changes.length,0,"metadata changes use the two-second batch before refreshing");
    debounceCallback();await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(changes,[{reason:"filesystem-change"}]);
    watcher.dispose();
});

test("metadata fallback detects nested selected-folder changes without following symlinks",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-watch-signature-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const selected=path.join(root,"selected"),other=path.join(root,"other");await fs.mkdir(selected);await fs.mkdir(other);
    await fs.writeFile(path.join(selected,"note.md"),"first");
    const first=await directoryMetadataSignature([selected]);
    await fs.writeFile(path.join(other,"ignored.md"),"unselected");
    assert.equal(await directoryMetadataSignature([selected]),first,"unselected roots do not affect a selected-root signature");
    await fs.writeFile(path.join(selected,"note.md"),"changed content");
    assert.notEqual(await directoryMetadataSignature([selected]),first);
});

test("metadata fallback ignores the generated FolderRocket directory case-insensitively",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-generated-ignore-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const selected=path.join(root,"selected"),generated=path.join(selected,"FolderRocket");await fs.mkdir(generated,{recursive:true});
    const generatedFile=path.join(generated,"knowledge.md");await fs.writeFile(generatedFile,"revision one");
    const first=await directoryMetadataSignature([selected]);
    await fs.writeFile(generatedFile,"a different generated revision");
    assert.equal(await directoryMetadataSignature([selected]),first,"generated Markdown must not trigger source invalidation");
});
