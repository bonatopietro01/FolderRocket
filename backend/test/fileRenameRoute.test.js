const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

async function freePort() {
    const probe = net.createServer();
    await new Promise((resolve,reject)=>probe.once("error",reject).listen(0,"127.0.0.1",resolve));
    const address=probe.address();
    const port=typeof address==="object"&&address?address.port:0;
    await new Promise(resolve=>probe.close(resolve));
    return port;
}

async function waitForBootstrap(port,child,output) {
    const deadline=Date.now()+20000;
    let lastRequestFailure="";
    while(Date.now()<deadline){
        if(child.exitCode!==null)throw new Error(`Backend exited before startup with code ${child.exitCode}. ${output()}`);
        try{
            const response=await fetch(`http://127.0.0.1:${port}/auth/bootstrap`);
            if(response.ok)return response.json();
            lastRequestFailure=`HTTP ${response.status}: ${await response.text()}`;
        }catch(error){lastRequestFailure=error instanceof Error?error.message:String(error);}
        await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(`Backend did not become ready within 20 seconds. Last request: ${lastRequestFailure}. ${output()}`);
}

test("file rename route changes only the selected output and rejects invalid names and collisions", {timeout:40000}, async t => {
    const isolatedRoot=await fs.promises.mkdtemp(path.join(os.tmpdir(),"folderrocket-rename-route-"));
    const port=await freePort();
    const child=spawn(process.execPath,[path.join(__dirname,"..","server.js")],{
        cwd:path.join(__dirname,".."),
        stdio:["pipe","pipe","pipe"],
        windowsHide:true,
        env:{...process.env,FOLDERROCKET_DESKTOP:"1",FOLDERROCKET_PORT:String(port),PORT:"",HOST:"127.0.0.1",APP_ORIGIN:`http://localhost:${port}`,FRONTEND_ORIGIN:`http://localhost:${port}`,FOLDERROCKET_DATA_DIR:path.join(isolatedRoot,"data"),FOLDERROCKET_UPLOADS_DIR:path.join(isolatedRoot,"uploads"),FOLDERROCKET_TOKEN_DIR:path.join(isolatedRoot,"tokens"),FOLDERROCKET_CONFIG_FILE:path.join(isolatedRoot,"config.env")}
    });
    let stdout="",stderr="";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data",chunk=>{stdout+=chunk;});
    child.stderr.on("data",chunk=>{stderr+=chunk;});
    const output=()=>`${stdout}\n${stderr}`.trim();
    t.after(async()=>{
        if(child.exitCode===null){
            child.stdin.write("shutdown\n");
            await Promise.race([
                new Promise(resolve=>child.once("exit",resolve)),
                new Promise(resolve=>setTimeout(resolve,5000))
            ]);
            if(child.exitCode===null)child.kill();
        }
        await fs.promises.rm(isolatedRoot,{recursive:true,force:true});
    });

    await waitForBootstrap(port,child,output);
    const origin=`http://127.0.0.1:${port}`;
    const registration=await fetch(`${origin}/auth/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"rename-fixture@example.test",password:"local-test-password-123"})});
    assert.equal(registration.status,201);
    const cookie=String(registration.headers.get("set-cookie")||"").split(";")[0];
    const request=(pathname,body)=>fetch(`${origin}${pathname}`,{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const me=await fetch(`${origin}/auth/me`,{headers:{Cookie:cookie}});
    const user=(await me.json()).user;
    const fixtureDirectory=path.join(user.workspacePath,"synthetic-rename-fixture");
    await fs.promises.mkdir(fixtureDirectory,{recursive:true});

    const originalPath=path.join(fixtureDirectory,"original-source.mov");
    const convertedPath=path.join(fixtureDirectory,"converted-output.mp4");
    await fs.promises.writeFile(originalPath,"synthetic original");
    await fs.promises.writeFile(convertedPath,"synthetic converted output");
    const renamedResponse=await request("/files/rename",{path:convertedPath,name:"my converted file.txt"});
    assert.equal(renamedResponse.status,200);
    const renamed=await renamedResponse.json();
    assert.equal(renamed.name,"my converted file.mp4");
    assert.equal(renamed.path,path.join(fixtureDirectory,renamed.name));
    assert.equal(await fs.promises.readFile(renamed.path,"utf8"),"synthetic converted output");
    await assert.rejects(fs.promises.access(convertedPath));
    assert.equal(await fs.promises.readFile(originalPath,"utf8"),"synthetic original");

    const pendingPath=path.join(fixtureDirectory,"pending.mp4");
    const collisionPath=path.join(fixtureDirectory,"taken-name.mp4");
    await fs.promises.writeFile(pendingPath,"pending output");
    await fs.promises.writeFile(collisionPath,"existing output");
    const collisionResponse=await request("/files/rename",{path:pendingPath,name:"taken-name"});
    assert.equal(collisionResponse.status,400);
    assert.match((await collisionResponse.json()).message,/already exists/i);
    assert.equal(await fs.promises.readFile(pendingPath,"utf8"),"pending output");
    assert.equal(await fs.promises.readFile(collisionPath,"utf8"),"existing output");

    const invalidResponse=await request("/files/rename",{path:pendingPath,name:"   "});
    assert.equal(invalidResponse.status,400);
    assert.equal(await fs.promises.readFile(pendingPath,"utf8"),"pending output");

});
