// Synthetic visual fixture for the latest FolderRocket request. No real files, accounts, or vaults are used.
import {useState, type CSSProperties} from "react";
import {createRoot} from "react-dom/client";
import {BriefcaseBusiness, FolderCog, LayoutDashboard, Shapes, Sparkles, WandSparkles} from "lucide-react";
import ChangeWorld from "../../src/components/ChangeWorld";
import {createDefaultWorlds, type WorkspaceWorld} from "../../src/worlds";
import folderRocketWordmark from "../../src/assets/folderrocket-wordmark.png";
import TreeRocket from "../../src/components/TreeRocket";
import "../../src/App.css";
import "../../src/worlds.css";

const fixtureWorlds: WorkspaceWorld[] = createDefaultWorlds().map((world, index) => ({
    ...world,
    id: index === 0 ? "alpha" : "beta",
    name: index === 0 ? "Fixture Alpha" : "Fixture Beta",
    style: index === 0 ? "planet" : "glowing",
    color: index === 0 ? "#55b9ef" : "#9b7bf0",
    graphEnabled: true,
    emailAccount: {provider: "gmail", blockId: `account-${index === 0 ? "alpha" : "beta"}`, email: `${index === 0 ? "alpha" : "beta"}@example.test`}
}));

const treeRoot = "C:\\Fixture";
const folders = Array.from({length: 20}, (_, index) => ({
    name: (index + 1) % 5 === 0 ? `Project ${index + 1} — client documents, archive and deadlines 2026` : `Project ${index + 1}`,
    path: `${treeRoot}\\Project-${index + 1}`
}));
let treeMode: "computer" | "desktop" = "desktop";
let accountCatalogMode: "multiple" | "single" | "empty" | "loading" | "error" = "multiple";
const fixtureAccounts = [
    {blockId:"account-alpha",email:"alpha@example.test",label:"Fixture Alpha",canSend:true},
    {blockId:"account-beta",email:"beta@example.test",label:"Fixture Beta",canSend:true},
    {blockId:"account-spare",email:"spare@example.test",label:"Spare fixture",canSend:false}
];
function accountsForMode(worldId:string) {
    if (accountCatalogMode === "empty") return [];
    if (accountCatalogMode === "single") return fixtureAccounts.filter(account=>account.blockId===`account-${worldId}`);
    return fixtureAccounts;
}

window.fetch = async(input, init) => {
    const url = new URL(String(input), window.location.href);
    if (url.pathname.endsWith("/email/gmail/accounts")) {
        if (accountCatalogMode === "loading") await new Promise(resolve=>setTimeout(resolve,1500));
        return Response.json({accounts:accountsForMode("alpha")});
    }
    if (url.pathname.endsWith("/email/outlook/accounts")) return Response.json({accounts:[]});
    if (url.pathname.endsWith("/activity-notifications")) return Response.json({});
    if (url.pathname.includes("/settings/worlds/")) {
        const worldId = url.pathname.split("/").at(-1) || "alpha";
        if (accountCatalogMode === "loading") await new Promise(resolve=>setTimeout(resolve,1500));
        if (accountCatalogMode === "error") return Response.json({message:"Synthetic Gmail catalog error"},{status:503});
        const world = fixtureWorlds.find(item => item.id === worldId) || fixtureWorlds[0];
        const gmail = accountsForMode(worldId).map(account=>({...account,blockIds:[account.blockId],originWorldNames:account.blockId==="account-alpha"?["Fixture Alpha"]:account.blockId==="account-beta"?["Fixture Beta"]:[]}));
        return Response.json({world:{emailAccount:world.emailAccount,obsidian:world.obsidian},emailAccountConflict:false,emailAccounts:{gmail,outlook:[]}});
    }
    if (url.pathname.endsWith("/obsidian/folders")) return Response.json({folders:[],fileTypes:[]});
    if (url.pathname.endsWith("/obsidian")) return Response.json({});
    if (url.pathname === "/applications/catalog") return Response.json({applications:[]});
    if (url.pathname === "/filesystem/tree-roots") return Response.json({roots:[{name:"Fixture Desktop",path:treeRoot,kind:"desktop",directFileCount:3}]});
    if (url.pathname === "/filesystem/tree-children") {
        const body = JSON.parse(String(init?.body || "{}"));
        if (body.includeFiles && body.path === `${treeRoot}\\Project-20`) await new Promise(resolve=>setTimeout(resolve,900));
        const isRoot = body.path === treeRoot;
        const files = Array.from({length:isRoot ? 3 : 205}, (_, index) => ({name:`Fixture file ${String(index + 1).padStart(3,"0")}.pdf`,path:`${body.path}\\Fixture file ${index + 1}.pdf`}));
        const offset = Number(body.fileOffset || 0);
        const page = body.includeFiles ? files.slice(offset,offset + 200) : [];
        return Response.json({path:body.path,folders:isRoot ? folders.map((item,index)=>({...item,directFileCount:205,id:`folder-${index+1}`})) : [],folderTotal:isRoot ? folders.length : 0,files:page,fileTotal:files.length,fileOffset:offset,nextFileOffset:offset + page.length < files.length ? offset + page.length : null,truncatedFiles:offset + page.length < files.length});
    }
    throw new Error(`Blocked unexpected fixture request: ${url.pathname}`);
};

export function DashboardHeader({onNavigate}:{onNavigate:(page:string)=>void}) {
    const [active,setActive] = useState("Dashboard");
    const pages = [
        ["Dashboard",<LayoutDashboard size={14}/>],
        ["Folder management",<FolderCog size={14}/>],
        ["File Studio",<WandSparkles size={14}/>],
        ["Applications",<Shapes size={14}/>],
        ["Daily Job",<BriefcaseBusiness size={14}/>]
    ] as const;
    return <div className="app" style={{"--nav-column-width":"calc((min(100vw - 56px, 1420px) - 24px) / 3)",height:190,minHeight:190,padding:0,background:"linear-gradient(135deg,#edf7ff,#dbeafe)"} as CSSProperties}>
        <header className="appHeader" style={{height:190}}>
            <img className="appLogo" src={folderRocketWordmark} alt="FolderRocket"/>
            <div className="appWorldIdentity"><span className="worldPlanet glowing" style={{"--planet-color":"#9b7bf0"} as CSSProperties}><i/><b/></span><span>Fixture Alpha</span></div>
            <span className="appAiStatus active"><span className="appAiStatusDot"/>AI ON</span>
            <div className="appHeaderTools"><button type="button">Accounts</button><button type="button">Add source</button></div>
            <nav className="appNavigation"><button className="notesAiQuickAdd" type="button" aria-label="Create an AI post-it"><span>AI</span></button><button className="notesQuickAdd withAi" type="button" aria-label="Add note"><Sparkles size={16}/></button><button className="notesReminderQuickAdd" type="button" aria-label="Create a reminder post-it"><span>!</span></button>
                <div className="pageMenu" role="group" aria-label="Pages"><div className="pageMenuItems">
                    {pages.map(([name,icon])=><button key={name} type="button" className={active===name?"active":""} aria-current={active===name?"page":undefined} onClick={()=>{setActive(name);onNavigate(name);}}>{icon}<span className="pageNavigationLabel">{name}</span></button>)}
                </div></div>
            </nav>
        </header>
    </div>;
}

export function Fixture() {
    const [view,setView] = useState<"dashboard"|"planets"|"tree">("dashboard");
    const [worlds,setWorlds] = useState(fixtureWorlds);
    const [activeWorldId,setActiveWorldId] = useState("alpha");
    const [treeError,setTreeError] = useState("");
    const [accountMode,setAccountMode] = useState(accountCatalogMode);
    return <>
        <nav aria-label="Fixture controls" style={{position:"fixed",zIndex:100000,top:0,left:0,right:0,display:"flex",alignItems:"center",gap:8,padding:8,background:"#eff6ff",boxShadow:"0 2px 7px #102b491a"}}>
            <strong>Prompt checks · synthetic data only</strong>
            <button type="button" onClick={()=>setView("dashboard")}>Dashboard</button>
            <button type="button" onClick={()=>setView("planets")}>Fly to Another Planet</button>
            <button type="button" onClick={()=>setView("tree")}>Tree Rocket</button>
            <label>Account state <select aria-label="Synthetic Gmail account catalog state" value={accountMode} onChange={event=>{accountCatalogMode=event.target.value as typeof accountMode;setAccountMode(accountCatalogMode);}}><option value="multiple">Multiple</option><option value="single">One account</option><option value="empty">No accounts</option><option value="loading">Loading</option><option value="error">Error</option></select></label>
            {treeError&&<span role="status">{treeError}</span>}
        </nav>
        <div style={{paddingTop:42}}>
            {view==="dashboard"&&<DashboardHeader onNavigate={()=>{}}/>}
            {view==="planets"&&<ChangeWorld
                worlds={worlds}
                activeWorldId={activeWorldId}
                userId="fixture-user"
                storageScope="fixture-user-world-alpha"
                onSyncObsidian={async()=>({ok:true,status:200})}
                onSelect={async id=>{setActiveWorldId(id);}}
                onViewGraph={()=>{}}
                onInvokeAssistant={async()=>""}
                switchError=""
                onBack={()=>setView("dashboard")}
                onAdd={()=>({...worlds[0],id:"fixture-added",name:"Extra fixture"})}
                onUpdate={async updated=>setWorlds(current=>current.map(world=>world.id===updated.id?updated:world))}
                onDelete={async id=>setWorlds(current=>current.filter(world=>world.id!==id))}
            />}
            {view==="tree"&&<TreeRocket
                folders={[]}
                worldId="fixture-world"
                treeRootMode={treeMode}
                onTreeRootModeChange={async mode=>{treeMode=mode;}}
                onAddFolder={async(_path,name)=>{setTreeError(`${name} added to the fixture only`);return true;}}
                onClose={()=>setView("dashboard")}
            />}
        </div>
    </>;
}

const fixtureRoot = createRoot(document.getElementById("root")!);
fixtureRoot.render(<Fixture/>);
import.meta.hot?.dispose(()=>fixtureRoot.unmount());
