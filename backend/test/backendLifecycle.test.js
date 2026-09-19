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

async function waitForBootstrap(port, child, output) {
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
        if(child.exitCode!==null)throw new Error(`Backend exited before startup with code ${child.exitCode}`);
        try{const response=await fetch(`http://127.0.0.1:${port}/auth/bootstrap`);if(response.ok)return response.json();}catch{/* starting */}
        await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(`Backend did not become ready within 10 seconds. Output: ${output()}`);
}

test("backend starts with isolated data and shuts down cleanly through stdin", {timeout:20000}, async t => {
    const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"folderrocket-backend-"));
    t.after(()=>fs.promises.rm(root,{recursive:true,force:true}));
    const port=await freePort();
    const child=spawn(process.execPath,[path.join(__dirname,"..","server.js")],{
        cwd:path.join(__dirname,".."),
        stdio:["pipe","pipe","pipe"],
        windowsHide:true,
        env:{...process.env,FOLDERROCKET_DESKTOP:"1",FOLDERROCKET_PORT:String(port),PORT:"",HOST:"127.0.0.1",APP_ORIGIN:`http://localhost:${port}`,FRONTEND_ORIGIN:`http://localhost:${port}`,FOLDERROCKET_DATA_DIR:path.join(root,"data"),FOLDERROCKET_UPLOADS_DIR:path.join(root,"uploads"),FOLDERROCKET_TOKEN_DIR:path.join(root,"tokens"),FOLDERROCKET_CONFIG_FILE:path.join(root,"config.env")}
    });
    let stderr="",stdout="";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data",chunk=>{stdout+=chunk;});
    child.stderr.setEncoding("utf8");
    child.stderr.on("data",chunk=>{stderr+=chunk;});
    try{
        const bootstrap=await waitForBootstrap(port,child,()=>`${stdout}\n${stderr}`.trim());
        assert.equal(typeof bootstrap.setupRequired,"boolean");
        child.stdin.end("shutdown\n");
        const exitCode=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});
        assert.equal(exitCode,0,stderr);
        assert.doesNotMatch(stderr,/Unhandled|EADDRINUSE|ERR_HTTP_HEADERS_SENT/);
    }finally{
        if(child.exitCode===null)child.kill();
    }
});
