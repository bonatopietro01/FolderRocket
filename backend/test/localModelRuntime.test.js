const assert=require("node:assert/strict");
const test=require("node:test");
const runtime=require("../services/localModelRuntime");

function readableBytes(text){
    const bytes=new TextEncoder().encode(text);
    let read=false;
    return {getReader:()=>({read:async()=>{if(read)return {done:true};read=true;return {done:false,value:bytes};},cancel:async()=>{read=true;},releaseLock(){}})};
}

test("optional local model checks only loopback Ollama endpoints and sends bounded non-streaming generation",async()=>{
    assert.equal(runtime.safeLoopbackUrl("http://127.0.0.1:11434")?.origin,"http://127.0.0.1:11434");
    assert.equal(runtime.safeLoopbackUrl("http://localhost:11434")?.origin,"http://localhost:11434");
    assert.equal(runtime.safeLoopbackUrl("http://[::1]:11434")?.origin,"http://[::1]:11434");
    assert.equal(runtime.safeLoopbackUrl("http://192.168.1.10:11434"),null);
    assert.equal(runtime.safeLoopbackUrl("https://127.0.0.1:11434"),null);
    assert.equal(runtime.safeLoopbackUrl("http://user:pass@127.0.0.1:11434"),null);

    const names=["FOLDERROCKET_LOCAL_MODEL_ENABLED","FOLDERROCKET_LOCAL_MODEL_URL","FOLDERROCKET_LOCAL_MODEL_NAME"];
    const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
    const originalFetch=global.fetch;
    const requests=[];
    try {
        process.env.FOLDERROCKET_LOCAL_MODEL_ENABLED="false";
        process.env.FOLDERROCKET_LOCAL_MODEL_URL="http://127.0.0.1:11434";
        process.env.FOLDERROCKET_LOCAL_MODEL_NAME="fixture-local:3b";
        global.fetch=async(url,options={})=>{
            requests.push({url:String(url),options});
            const body=String(url).endsWith("/api/tags")?{models:[{name:"fixture-local:3b"}]}:{response:"A locally generated test summary."};
            return {ok:true,status:200,headers:{get:()=>""},body:readableBytes(JSON.stringify(body))};
        };
        const disabled=await runtime.inspect({refresh:true});
        assert.equal(disabled.enabled,false);
        assert.equal(disabled.available,false);
        assert.equal(await runtime.generate("ignored while disabled"),null);
        assert.equal(requests.length,0);

        process.env.FOLDERROCKET_LOCAL_MODEL_ENABLED="true";
        const detected=await runtime.inspect({refresh:true});
        assert.equal(detected.available,true);
        assert.deepEqual(requests.map(request=>request.url),["http://127.0.0.1:11434/api/tags"]);
        const generated=await runtime.generate("summarize selected source",{maxOutputChars:2400});
        assert.equal(generated,"A locally generated test summary.");
        assert.equal(requests.length,2);
        const request=requests[1];
        assert.equal(request.url,"http://127.0.0.1:11434/api/generate");
        assert.equal(request.options.redirect,"error","local model calls must not follow redirects off-device");
        assert.equal(requests[0].options.redirect,"error","runtime detection must reject redirects too");
        const payload=JSON.parse(request.options.body);
        assert.equal(payload.model,"fixture-local:3b");
        assert.equal(payload.stream,false);
        assert.equal(payload.keep_alive,0);
        assert.ok(payload.options.num_predict<=2_048);
        assert.deepEqual(requests.map(item=>new URL(item.url).pathname),["/api/tags","/api/generate"]);
    } finally {
        global.fetch=originalFetch;
        for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
        await runtime.inspect({refresh:true});
    }
});

test("local model response byte cap stops chunked bodies while they are being read",async()=>{
    const names=["FOLDERROCKET_LOCAL_MODEL_ENABLED","FOLDERROCKET_LOCAL_MODEL_URL","FOLDERROCKET_LOCAL_MODEL_NAME"];
    const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
    const originalFetch=global.fetch;
    let reads=0,cancelled=false;
    try {
        process.env.FOLDERROCKET_LOCAL_MODEL_ENABLED="true";
        process.env.FOLDERROCKET_LOCAL_MODEL_URL="http://127.0.0.1:11434";
        process.env.FOLDERROCKET_LOCAL_MODEL_NAME="fixture-local:3b";
        global.fetch=async()=>({
            ok:true,
            status:200,
            headers:{get:()=>null},
            body:{getReader:()=>({
                read:async()=>{reads+=1;return {done:false,value:new Uint8Array(600_000)};},
                cancel:async()=>{cancelled=true;},
                releaseLock(){}
            })}
        });
        const status=await runtime.inspect({refresh:true});
        assert.equal(status.runtimeAvailable,false,"an oversized streaming response cannot be treated as an available runtime");
        assert.equal(reads,2,"reading stops immediately when cumulative bytes exceed the cap");
        assert.equal(cancelled,true,"the oversized response body is cancelled");
    } finally {
        global.fetch=originalFetch;
        for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
        await runtime.inspect({refresh:true});
    }
});
