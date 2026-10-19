import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
import test from "node:test";

const require=createRequire(import.meta.url);
const ts=require("typescript");
function loadModule(name,extra={}) {
    const source=fs.readFileSync(new URL(`../src/${name}.ts`,import.meta.url),"utf8");
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module={exports:{}};
    vm.runInNewContext(output,{module,exports:module.exports,require:id=>id==="./api"?{API_BASE_URL:"http://localhost:3000"}:require(id),Map,Date,Promise,URL,Request,Response,Headers,Event,CustomEvent,crypto:require("node:crypto").webcrypto,performance,console:{warn(){},error(){}},...extra});
    return module.exports;
}

test("R22 unchanged incomplete sync stays paused past the former retry interval and resumes for changed evidence",()=>{
    let now=1000;
    class TestDate extends Date { static now(){return now;} }
    const sync=loadModule("obsidianSyncRetry",{Date:TestDate});
    sync.recordObsidianIncompleteSync("user-a:work","selection-a","blocked-r1");
    now+=24*60*60*1000;
    for(let check=0;check<100;check++)assert.equal(sync.shouldPauseObsidianAutoSync("user-a:work","selection-a","blocked-r1"),true);
    assert.equal(sync.shouldPauseObsidianAutoSync("user-a:work","selection-a","recovered-r2"),false);
    assert.equal(sync.shouldPauseObsidianAutoSync("user-a:work","selection-b","blocked-r1"),false);
});

test("R22 dismissing an unchanged blocker survives repeated observations but a new blocker can be announced",()=>{
    const sync=loadModule("obsidianSyncRetry");
    sync.recordObsidianIncompleteSync("user-a:work","selection-a","blocked-r1");
    assert.equal(sync.shouldShowObsidianIncompleteSync("user-a:work","selection-a","blocked-r1"),true);
    sync.dismissObsidianIncompleteSync("user-a:work","selection-a","blocked-r1");
    sync.recordObsidianIncompleteSync("user-a:work","selection-a","blocked-r1");
    assert.equal(sync.shouldShowObsidianIncompleteSync("user-a:work","selection-a","blocked-r1"),false);
    sync.recordObsidianIncompleteSync("user-a:work","selection-a","blocked-r2");
    assert.equal(sync.shouldShowObsidianIncompleteSync("user-a:work","selection-a","blocked-r2"),true);
});

test("R22 blocker and success checkpoints stay isolated by user, planet and selection; clearing permits manual recovery",()=>{
    const sync=loadModule("obsidianSyncRetry");
    sync.recordObsidianIncompleteSync("user-a:work","selection-a","blocked-r1");
    sync.recordObsidianIncompleteSync("user-a:personal","selection-a","blocked-r1");
    assert.equal(sync.shouldPauseObsidianAutoSync("user-b:work","selection-a","blocked-r1"),false);
    sync.clearObsidianAutoSyncPause("user-a:work");
    assert.equal(sync.shouldPauseObsidianAutoSync("user-a:work","selection-a","blocked-r1"),false);
    assert.equal(sync.shouldPauseObsidianAutoSync("user-a:personal","selection-a","blocked-r1"),true);
    sync.recordObsidianSyncSuccess("user-a:work","selection-a","ready-r2");
    assert.equal(sync.shouldShowObsidianIncompleteSync("user-a:work","selection-a","ready-r2"),false);
    assert.equal(sync.shouldPauseObsidianAutoSync("user-a:personal","selection-a","blocked-r1"),true);
});

test("only the explicit missing-world-settings GET is omitted from HTTP diagnostics",async()=>{
    let nextResponse;
    const captured=[];
    const window={
        location:{href:"http://localhost:3000/",pathname:"/"},
        fetch:async()=>nextResponse,
        addEventListener(){},setTimeout(){return 0;},
        dispatchEvent:event=>{if(event.type==="folderrocket:diagnostic-captured")captured.push(event.detail);}
    };
    const diagnostics=loadModule("diagnostics",{window,document:{readyState:"loading"},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}});
    await diagnostics.readLocalDiagnostics("synthetic-user");
    diagnostics.installDiagnostics("synthetic-user");
    const call=async(path,method="GET",code="WORLD_SETTINGS_NOT_FOUND",status=404)=>{
        nextResponse=Response.json({code,message:"Synthetic unavailable record"},{status});
        await window.fetch(`http://localhost:3000${path}`,{method});
    };
    await call("/settings/worlds/local-world");
    assert.equal(captured.length,0);
    await call("/settings/worlds/local-world","PUT");
    await call("/worlds/local-world/graph");
    await call("/settings/worlds/local-world","GET","UNKNOWN_NOT_FOUND");
    await call("/settings/worlds/local-world","GET","WORLD_SETTINGS_NOT_FOUND",503);
    assert.equal(captured.length,4,"write failures, other routes, generic 404 and server errors remain visible");
    assert.equal(captured.at(-1).severity,"error");
});

test("R22 actual App scheduling effect keeps dismissed blockers quiet and clears attention after recovery",async()=>{
    const source=fs.readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
    const ast=ts.createSourceFile("App.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let effect;
    function visit(node){
        if(ts.isCallExpression(node)&&node.expression.getText(ast)==="useEffect"&&node.arguments[0]?.getText(ast).includes("const state = obsidianAutoSyncState.current"))effect=node.arguments[0].getText(ast);
        ts.forEachChild(node,visit);
    }
    visit(ast);
    assert.ok(effect,"the test executes the production scheduling effect");
    const output=ts.transpileModule(`module.exports=${effect}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const sync=loadModule("obsidianSyncRetry");
    const state={warning:"",lastMessage:"",fingerprint:"",settings:false,open:false};
    const pending=new Map();let sequence=0;let syncCalls=0;let summaryCalls=0;
    const summary={worldId:"work",status:"blocked",readinessFingerprint:"blocked-1",reasonSummary:{reasonCodes:["content_unavailable"],counts:{content_unavailable:1},blockers:[{sourceId:"folder:selected",label:"Selected synthetic source",action:"Restore access and retry."}]}};
    const events=[];
    const browser={setTimeout(fn){pending.set(++sequence,fn);return sequence;},clearTimeout(id){pending.delete(id);},setInterval(){return 999;},clearInterval(){},addEventListener(){},removeEventListener(){},dispatchEvent:event=>events.push(event)};
    const schedule={current:()=>{}};
    const module={exports:{}};
    const context={module,...sync,window:browser,document:{visibilityState:"visible",hasFocus:()=>true,addEventListener(){},removeEventListener(){}},isCargoShipWindow:false,world:{id:"work",obsidian:{enabled:true,autoSync:true}},user:{id:"synthetic-user"},workspaceScope:"synthetic-user:work",obsidianAutoSyncKey:"synthetic-user:work",obsidianSyncSignature:"selection-1",obsidianAutoSyncState:{current:{timer:0,inFlight:false,pending:false}},scheduleObsidianAutoSync:schedule,getObsidianKnowledgeSummary:async()=>{summaryCalls++;return {...summary};},requestObsidianSync:async()=>{syncCalls++;return {ok:true,result:{status:"ready"}};},describeObsidianIncompleteSync:r=>r.reasonSummary.blockers.map(b=>`${b.label}: ${b.action}`).join(" · "),setObsidianAutoSyncWarning:v=>state.warning=v,setObsidianAutoSyncLastMessage:v=>state.lastMessage=v,setObsidianAutoSyncFingerprint:v=>state.fingerprint=v,setObsidianAutoSyncNeedsSettings:v=>state.settings=v,setObsidianAutoSyncStatusOpen:v=>state.open=v,captureDiagnostic(){},CustomEvent};
    vm.runInNewContext(output,context);
    const cleanup=module.exports();
    async function tick(){const work=[...pending.values()];pending.clear();for(const fn of work)fn();for(let i=0;i<12;i++)await Promise.resolve();}
    await tick();
    assert.match(state.warning,/Selected synthetic source/);assert.equal(syncCalls,0);
    sync.dismissObsidianIncompleteSync("synthetic-user:work","selection-1","blocked-1");state.warning="";
    for(let i=0;i<3;i++){schedule.current();await tick();assert.equal(state.warning,"");}
    assert.match(state.lastMessage,/Restore access/);assert.equal(syncCalls,0);assert.equal(summaryCalls,4);
    summary.status="ready";summary.readinessFingerprint="ready-2";schedule.current();await tick();
    assert.equal(syncCalls,1);assert.equal(state.warning,"");assert.equal(state.fingerprint,"");
    // A client-held note/job can change without changing server graph readiness.
    // The same production schedule is used by those client record events.
    schedule.current();await tick();
    assert.equal(syncCalls,2,"a new scheduled client-record update must reach sync even when server readiness is unchanged");
    assert.equal(state.fingerprint,"","successful repeated polling must not recreate a false needs-attention status");
    assert.equal(state.lastMessage,"");assert.equal(events.length,2);cleanup();
});
