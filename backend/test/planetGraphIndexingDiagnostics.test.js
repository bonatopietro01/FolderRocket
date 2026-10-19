const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const test=require("node:test");
const graph=require("../services/planetGraphService");

test("folder graph reports global limits separately and keeps every source issue",async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"folderrocket-graph-diagnostics-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const first=path.join(root,"first"),second=path.join(root,"second");
    await fs.mkdir(path.join(first,"nested"),{recursive:true});
    await fs.mkdir(second,{recursive:true});
    await fs.writeFile(path.join(first,"z.txt"),"synthetic");
    await fs.writeFile(path.join(first,"nested","b.txt"),"synthetic");
    await fs.writeFile(path.join(second,"c.txt"),"synthetic");

    const result=await graph.walkConfiguredFolders([
        {id:"root-one",name:"First",path:first},
        {id:"root-two",name:"Second",path:second}
    ],{maxDirectories:20,maxFiles:0,maxDepth:0});
    assert.equal(result.processedFiles,0);
    const firstStatus=result.sourceStatuses.find(item=>item.sourceId==="folder:root-one");
    const secondStatus=result.sourceStatuses.find(item=>item.sourceId==="folder:root-two");
    assert.equal(firstStatus.reasonCode,"depth_limit","legacy primary reason remains compatible");
    assert.ok(firstStatus.issues.some(item=>item.scope==="source"&&item.reasonCode==="depth_limit"));
    assert.ok(firstStatus.issues.some(item=>item.scope==="global"&&item.reasonCode==="file_limit"));
    assert.ok(secondStatus.issues.some(item=>item.scope==="global"&&item.reasonCode==="file_limit"));
    assert.match(secondStatus.message,/global file limit across configured sources/);
    assert.equal(graph.normalizeSourceStatuses([firstStatus])[0].issues.length,2,"diagnostics survive persistence normalization");
});

test("an internal graph failure turns in-progress sources into retryable failures",()=>{
    const failed=graph.failIndexingSources([
        graph.sourceStatus({sourceId:"folder:retry",type:"folder",label:"Retry me",status:"indexing",retryable:true}),
        graph.sourceStatus({sourceId:"snapshot",type:"snapshot",label:"Planet activity",status:"complete"})
    ]);
    assert.equal(failed[0].status,"failed");
    assert.equal(failed[0].reasonCode,"source_read_failed");
    assert.equal(failed[0].retryable,true);
    assert.match(failed[0].message,/Retry this source/);
    assert.equal(failed[1].status,"complete","a source that already completed keeps its result");
});

test("folder graph keeps last-good source data when a retry is partial",async t=>{
    const root=await fs.mkdtemp(path.join(__dirname,".planet-graph-retry-"));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const sourcePath=path.join(root,"source");await fs.mkdir(sourcePath);
    await fs.writeFile(path.join(sourcePath,"valid.txt"),"synthetic");
    const first=await graph.walkConfiguredFolders([{id:"retry-root",name:"Source",path:sourcePath}]);
    await graph.replaceIndexedGraph("retry-user","retry-world",first.nodes,first.edges,{stage:"complete",processed:1,total:1,limitReached:false},{rootDirectory:root,sourceStatuses:first.sourceStatuses});
    const partial=await graph.walkConfiguredFolders([{id:"retry-root",name:"Source",path:sourcePath}],{maxFiles:0});
    const retryStatus=partial.sourceStatuses[0];
    const replaced=await graph.replaceIndexedSourceGraph("retry-user","retry-world",retryStatus,[...partial.nodes],partial.edges,{rootDirectory:root,sourcePath,sourceStatuses:(await graph.readGraph("retry-user","retry-world",root)).sourceStatuses});
    assert.ok(replaced.nodes.some(item=>item.label==="valid.txt"),"previously indexed file remains available after partial retry");
    assert.ok(replaced.sourceStatuses.find(item=>item.sourceId==="folder:retry-root").issues.some(item=>item.reasonCode==="file_limit"));
});
