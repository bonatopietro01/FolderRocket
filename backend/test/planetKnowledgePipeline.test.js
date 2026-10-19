const test=require("node:test");
const assert=require("node:assert/strict");
const {createSerialWorkQueue,createLatestGenerationSlot}=require("../services/planetKnowledgePipeline");

test("generation pipeline publishes the active generation then only the newest changed scope",async()=>{
    const queue=createSerialWorkQueue(),slot=createLatestGenerationSlot(),published=[];
    let releaseFirst;
    const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
    const generation=(revision,gate)=>queue.run(async()=>{if(gate)await gate;published.push(revision);});
    const first=generation("scope-1",firstGate);
    slot.replace({revision:"scope-2"});
    slot.replace({revision:"scope-3"});
    assert.equal(slot.hasPending,true);
    releaseFirst();
    await first;
    const latest=slot.take();
    assert.deepEqual(latest,{revision:"scope-3"});
    await generation(latest.revision);
    assert.deepEqual(published,["scope-1","scope-3"]);
    assert.equal(slot.hasPending,false);
});

test("requesting the active scope again cancels a superseded pending generation",()=>{
    const slot=createLatestGenerationSlot();
    slot.replace({revision:"scope-2"});
    slot.clear();
    assert.equal(slot.hasPending,false);
    assert.equal(slot.take(),null);
});

test("heavy knowledge operations from different scopes never overlap",async()=>{
    const queue=createSerialWorkQueue();let active=0,maxActive=0;const order=[];
    const run=(name,delay)=>queue.run(async()=>{active++;maxActive=Math.max(maxActive,active);order.push(`${name}:start`);await new Promise(resolve=>setTimeout(resolve,delay));order.push(`${name}:end`);active--;});
    await Promise.all([run("user-a/planet-a",8),run("user-b/planet-b",1),run("user-a/planet-c",1)]);
    assert.equal(maxActive,1);
    assert.deepEqual(order,["user-a/planet-a:start","user-a/planet-a:end","user-b/planet-b:start","user-b/planet-b:end","user-a/planet-c:start","user-a/planet-c:end"]);
});
