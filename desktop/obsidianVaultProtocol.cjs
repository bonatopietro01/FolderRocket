const fs = require("node:fs/promises");
const path = require("node:path");

function isWithin(base,candidate) {
    const relative=path.relative(base,candidate);
    return relative===""||(relative!==".."&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative));
}

async function resolveManagedObsidianVault({vaultPath,worldId,dataDirectory}) {
    const planet=typeof worldId==="string"?worldId:"";
    const candidate=typeof vaultPath==="string"?path.resolve(vaultPath):"";
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(planet)||["__proto__","prototype","constructor"].includes(planet)||!candidate)throw new Error("The Obsidian vault path is invalid.");
    const workspaces=path.resolve(dataDirectory,"workspaces");
    const relative=path.relative(workspaces,candidate);
    const segments=relative.split(path.sep).filter(Boolean);
    if(path.isAbsolute(relative)||relative===".."||relative.startsWith(`..${path.sep}`)||segments.length<2||!/^[a-zA-Z0-9_-]{1,100}$/.test(segments[0]))throw new Error("Only FolderRocket workspace vaults can be opened from this command.");
    const realWorkspaces=await fs.realpath(workspaces);
    const realWorkspace=await fs.realpath(path.join(workspaces,segments[0]));
    const realVault=await fs.realpath(candidate);
    if(!isWithin(realWorkspaces,realWorkspace)||!isWithin(realWorkspace,realVault))throw new Error("The vault resolves outside this user's FolderRocket workspace.");
    const marker=JSON.parse(await fs.readFile(path.join(realVault,".folderrocket","vault.json"),"utf8"));
    if(marker.ownerId!==segments[0]||marker.worldId!==planet)throw new Error("The FolderRocket vault marker does not match this planet.");
    return realVault;
}

module.exports={resolveManagedObsidianVault};
