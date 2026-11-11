const fs=require("node:fs/promises");
const path=require("node:path");
const crypto=require("node:crypto");

function safePlanetVaultFolderName(value,fallback="Workspace") {
    let name=String(value||fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").replace(/[. ]+$/g,"").trim().slice(0,80);
    if(!name||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name=`_${name||fallback}`;
    return name;
}

async function readMarker(vaultPath) {
    try{return JSON.parse(await fs.readFile(path.join(vaultPath,".folderrocket","vault.json"),"utf8"));}
    catch(error){if(error?.code==="ENOENT"||error instanceof SyntaxError)return null;throw error;}
}

async function migrateLegacyVault({legacyPath,targetPath,ownerId,worldId}) {
    const legacy=path.resolve(legacyPath),target=path.resolve(targetPath);
    if(legacy.toLocaleLowerCase()===target.toLocaleLowerCase())return {path:target,migrated:false};
    try{await fs.access(legacy);}catch(error){if(error?.code==="ENOENT")return {path:target,migrated:false};throw error;}
    const legacyMarker=await readMarker(legacy);
    if(!legacyMarker||legacyMarker.ownerId!==String(ownerId)||legacyMarker.worldId!==worldId)throw new Error("An existing legacy Obsidian folder was left untouched because its FolderRocket ownership could not be verified. Select that vault explicitly or resolve the folder before syncing.");
    let targetMarker=await readMarker(target);
    try{await fs.access(target);}catch(error){if(error?.code!=="ENOENT")throw error;}
    if(targetMarker){
        if(targetMarker.ownerId!==String(ownerId)||targetMarker.worldId!==worldId)throw new Error("The planet-named Obsidian folder belongs to a different user or planet; it was not overwritten.");
        return {path:target,migrated:false};
    }
    try{await fs.access(target);throw new Error("The planet-named Obsidian folder already exists and has no verified FolderRocket marker; it was not overwritten.");}
    catch(error){if(error?.code!=="ENOENT")throw error;}
    await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
    const staging=`${target}.migration-${crypto.randomBytes(6).toString("hex")}`;
    try{
        await fs.cp(legacy,staging,{recursive:true,errorOnExist:true,force:false});
        const stagedMarker=await readMarker(staging);
        if(!stagedMarker||stagedMarker.ownerId!==String(ownerId)||stagedMarker.worldId!==worldId)throw new Error("The copied Obsidian vault marker could not be verified.");
        await fs.rename(staging,target);
        targetMarker=await readMarker(target);
        if(!targetMarker||targetMarker.ownerId!==String(ownerId)||targetMarker.worldId!==worldId)throw new Error("The copied Obsidian vault does not match this planet.");
        return {path:target,migrated:true};
    }catch(error){await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});throw error;}
}

module.exports={safePlanetVaultFolderName,migrateLegacyVault};
