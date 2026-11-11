const crypto=require("node:crypto");
const fs=require("node:fs");
const fsp=require("node:fs/promises");
const path=require("node:path");

const MAX_ENTRIES=20_000,MAX_DEPTH=12;
async function directoryMetadataSignature(roots,{fsPromises=fsp,maxEntries=MAX_ENTRIES,maxDepth=MAX_DEPTH}={}){
    const entries=[];let visited=0;
    async function walk(directory,depth){
        if(depth>maxDepth||visited>=maxEntries)return;
        let children;try{children=await fsPromises.readdir(directory,{withFileTypes:true});}catch{return;}
        children.sort((a,b)=>a.name.localeCompare(b.name));
        for(const child of children){
            if(visited++>=maxEntries)break;
            if([".git","node_modules","folderrocket","folderrocket_trash"].includes(child.name.toLowerCase()))continue;
            const target=path.join(directory,child.name);let stats;try{stats=await fsPromises.lstat(target);}catch{continue;}
            if(stats.isSymbolicLink())continue;
            entries.push(`${target}\0${stats.isDirectory()?"d":"f"}\0${stats.size}\0${stats.mtimeMs}\0${stats.ctimeMs}`);
            if(child.isDirectory())await walk(target,depth+1);
        }
    }
    for(const root of roots)await walk(root,0);
    entries.sort();return crypto.createHash("sha256").update(entries.join("\n")).digest("hex");
}

function createSelectedFolderWatcher({roots=[],onChange,watchFactory=(target,options,listener)=>fs.watch(target,options,listener),signature=directoryMetadataSignature,setTimer=setTimeout,clearTimer=clearTimeout,setIntervalFn=setInterval,clearIntervalFn=clearInterval,debounceMs=2_000,pollMs=5*60_000}={}){
    let disposed=false,debounce=null,lastSignature="",polling=false;
    const watchers=[];
    const notify=()=>{
        if(disposed)return;
        if(debounce)clearTimer(debounce);
        debounce=setTimer(()=>{debounce=null;if(!disposed)void Promise.resolve(onChange?.({reason:"filesystem-change"})).catch(()=>{});},debounceMs);
    };
    for(const root of roots){
        if(!root||typeof root.path!=="string")continue;
        try{
            const watcher=watchFactory(root.path,{recursive:true},notify);
            watcher.on?.("error",()=>{});watchers.push(watcher);
        }catch{/* Metadata polling remains available when recursive watch is unsupported. */}
    }
    const poll=setIntervalFn(async()=>{
        if(disposed||polling)return;polling=true;
        try{const next=await signature(roots.map(item=>item.path).filter(Boolean));if(lastSignature&&next!==lastSignature)notify();lastSignature=next;}
        catch{}finally{polling=false;}
    },pollMs);
    void signature(roots.map(item=>item.path).filter(Boolean)).then(value=>{lastSignature=value;}).catch(()=>{});
    return {dispose(){if(disposed)return;disposed=true;if(debounce)clearTimer(debounce);clearIntervalFn(poll);for(const watcher of watchers)try{watcher.close();}catch{}},get disposed(){return disposed;}};
}

module.exports={MAX_ENTRIES,MAX_DEPTH,directoryMetadataSignature,createSelectedFolderWatcher};
