import {useState} from "react";
import {createRoot} from "react-dom/client";
import FolderManagement, {type ManagedFolder} from "../../src/components/FolderManagement";
import EmailConversations from "../../src/components/EmailConversations";
import PlanetGraph from "../../src/components/PlanetGraph";
import ProcessingWorkspace from "../../src/components/ProcessingWorkspace";
import {Planet} from "../../src/components/ChangeWorld";
import {createDefaultWorlds, type WorkspaceWorld, type WorldPlanetStyle} from "../../src/worlds";
import "../../src/App.css";
import "../../src/worlds.css";

const worlds:WorkspaceWorld[]=["alpha","beta"].map(id=>({...createDefaultWorlds()[0],id,name:`Fixture ${id}`,graphEnabled:true,emailAccount:{provider:"gmail",blockId:`account-${id}`,email:`${id}@example.test`}}));
const requests:string[]=[];
let renameOutcome="success";
const syntheticFormats=["csv","docx","gif","heic","jpg","json","md","mp3","mp4","pdf","png","pptx","rtf","svg","txt","webp","xls","xlsx","zip"];
const syntheticFolderFiles=(folderPath:string)=>Array.from({length:96},(_,index)=>{
    const extension=syntheticFormats[index%syntheticFormats.length];
    const stem=index===0?"Quarterly Archive with a deliberately long synthetic file name":"synthetic-file-"+String(index+1).padStart(3,"0");
    const name=`${stem}.${extension}`;
    return {name,path:`${folderPath}\\${name}`,createdAt:`2026-10-${String(index%13+1).padStart(2,"0")}T08:00:00Z`,size:1024+index*17};
});
const syntheticKnowledgeNodes=(worldId:string)=>Array.from({length:1200},(_,index)=>({id:`${worldId}-knowledge-${index+1}`,type:index%5===0?"knowledge-document":"knowledge-topic",label:index===0?`Synthetic ${worldId} topic with a deliberately long title for graph label checks`:`Synthetic ${worldId} topic ${String(index+1).padStart(4,"0")}`,summary:"Synthetic knowledge node for pan, zoom and dense graph layout checks.",source:{kind:"folder",id:`source-${worldId}`,scopeId:`scope-${worldId}`,locator:`synthetic/${worldId}/${index+1}`}}));
const syntheticKnowledgeEdges=(worldId:string)=>Array.from({length:900},(_,index)=>({id:`${worldId}-edge-${index+1}`,type:"related-to",from:`${worldId}-knowledge-${index+1}`,to:`${worldId}-knowledge-${index+2}`}));
window.fetch=async(input,init)=>{
    const url=new URL(String(input),window.location.href);
    requests.push(`${init?.method||"GET"} ${url.pathname}`);
    const id=url.pathname.includes("/beta/")?"beta":"alpha";
    const blockId=`account-${id}`;
    await new Promise(resolve=>setTimeout(resolve,url.pathname.endsWith("/conversations")?40:60));
    if(init?.signal?.aborted)throw new DOMException("Aborted","AbortError");
    if(url.pathname.endsWith("/email/conversations"))return Response.json({selectedBlockId:blockId,threads:[{id:"same-thread",threadId:"same-thread",blockId,subject:`Message for ${id}`,snippet:`Synthetic ${id} contact`,updatedAt:"2026-10-09T08:00:00Z",messageCount:1,accountEmail:`${id}@example.test`,shared:false,messages:[{sender:`Alex Fixture <alex-${id}@example.test>`}]}]});
    if(url.pathname.includes("/email/conversations/same-thread"))return Response.json({id:"same-thread",blockId,accountEmail:`${id}@example.test`,shared:false,hasMore:false,messages:[{id:`message-${id}`,threadId:"same-thread",messageId:`message-${id}`,inReplyTo:"",references:"",from:`Alex Fixture <alex-${id}@example.test>`,to:`${id}@example.test`,subject:`Message for ${id}`,receivedAt:"2026-10-09T08:00:00Z",text:`Readable body belonging only to ${id}.\nSecond paragraph.`,attachments:[],inlineImages:[{id:"",partId:"0.2",downloadable:true,name:"embedded-logo.png",mimeType:"image/png",size:123,contentId:"logo-fixture"}]}]});
    if(url.pathname.endsWith("/email/notifications/acknowledge"))return Response.json({ok:true});
    if(url.pathname.endsWith("/file-types/inventory")){
        const body=JSON.parse(String(init?.body||"{}")) as {folders?:string[]};
        const files=(body.folders||[]).flatMap(syntheticFolderFiles);
        return Response.json({types:syntheticFormats.map(type=>({type,count:files.filter(file=>file.name.toLowerCase().endsWith(`.${type}`)).length}))});
    }
    if(url.pathname.endsWith("/list-folder-files")){
        const body=JSON.parse(String(init?.body||"{}")) as {folder?:string};
        const folderPath=body.folder||"C:\\Synthetic\\Project01";
        return Response.json({files:syntheticFolderFiles(folderPath),folders:Array.from({length:5},(_,index)=>({name:`Synthetic subfolder ${index+1}`,path:`${folderPath}\\Subfolder ${index+1}`}))});
    }
    if(url.pathname.endsWith("/search-files")){
        const body=JSON.parse(String(init?.body||"{}")) as {folders?:string[];query?:string};
        const query=(body.query||"").toLowerCase();
        const results=(body.folders||[]).flatMap(syntheticFolderFiles).filter(file=>!query||file.name.toLowerCase().includes(query)).slice(0,32);
        return Response.json({results});
    }
    if(url.pathname.endsWith("/search-files/open"))return Response.json({ok:true});
    if(url.pathname.endsWith("/files/preview"))return Response.json({kind:"text",text:"Synthetic preview content. No real file was read."});
    if(url.pathname.endsWith("/convert-files"))return Response.json({converted:[]});
    if(url.pathname.endsWith("/files/change-format"))return Response.json({converted:[],motherAnalysis:{}});
    if(url.pathname.endsWith("/files/copy")||url.pathname.endsWith("/files/move")){
        const body=JSON.parse(String(init?.body||"{}")) as {paths?:string[];destination?:string};
        const files=(body.paths||[]).map(path=>({name:path.split(/[\\/]/).pop()||"synthetic-file.txt",path:`${body.destination||"C:\\Synthetic\\Destination"}\\${path.split(/[\\/]/).pop()||"synthetic-file.txt"}`}));
        return Response.json(url.pathname.endsWith("/files/move")?{moved:files}:{copied:files});
    }
    if(url.pathname.endsWith("/files/rename")){
        const body=JSON.parse(String(init?.body||"{}")) as {path?:string;name?:string};
        if(renameOutcome==="network")throw new Error("Synthetic rename connection failure.");
        if(renameOutcome==="collision")return Response.json({message:"A synthetic file with that name already exists."},{status:409});
        const name=(body.name||"").trim();
        if(!name||/[<>:"/\\|?*]/.test(name))return Response.json({message:"Enter a valid synthetic file name."},{status:400});
        const original=body.path||"C:\\Synthetic\\file.txt";
        const extension=original.split(/[\\/]/).pop()?.match(/\.[^.]+$/)?.[0]||"";
        const renamed=name.toLowerCase().endsWith(extension.toLowerCase())?name:`${name}${extension}`;
        return Response.json({path:original.replace(/[^\\/]+$/,renamed),name:renamed});
    }
    if(url.pathname.endsWith("/knowledge")&&init?.method!=="POST")return Response.json({jobId:"fixture-knowledge",status:"complete",readiness:"partial",queryable:true,revision:`${id}-fixture-r2`,sourceRevision:`${id}-fixture-s4`,progress:{stage:"complete",processed:3,total:4},managedMarkdown:{path:`managed/Fixture-${id}`,revision:`${id}-fixture-r2`,status:"partial",updatedAt:"2026-10-13T08:00:00Z",complete:false},gaps:["Synthetic folder: one nested folder is unavailable."],knowledge:{nodes:syntheticKnowledgeNodes(id),edges:syntheticKnowledgeEdges(id)}});
    if(url.pathname.endsWith("/knowledge/sync"))return Response.json({jobId:"fixture-knowledge",status:"complete",readiness:"partial",queryable:true,revision:`${id}-fixture-r2`,progress:{stage:"complete",processed:3,total:4},gaps:["Synthetic folder: one nested folder is unavailable."],knowledge:{nodes:[],edges:[]}});
    if(url.pathname.endsWith("/graph/index"))return Response.json({ok:true},{status:202});
    if(url.pathname.endsWith("/graph"))return Response.json({graph:{status:"partial",progress:{stage:"complete",processed:5,total:0,limitReached:true},warnings:[],sourceStatuses:[{sourceId:"folder:fixture",type:"folder",label:"Synthetic folder",status:"partial",processed:5,total:0,retryable:true,issues:[{scope:"global",reasonCode:"file_limit",message:"The configured roots reached the combined 5000-file scan limit.",retryable:false},{scope:"source",reasonCode:"permission_denied",message:"A synthetic nested folder is unavailable.",retryable:true}]}],nodes:[{id:"world",type:"world",label:`Fixture ${id}`},{id:"folder",type:"folder",label:"Synthetic folder"}],edges:[{id:"edge",type:"contains",from:"world",to:"folder"}],sharedThreads:[]}});
    throw new Error(`Blocked unexpected fixture request: ${url.pathname}`);
};

export default function Fixture(){
    const [view,setView]=useState<"art"|"folders"|"email"|"graph"|"studio">("art");
    const [worldIndex,setWorldIndex]=useState(0);
    const [folders,setFolders]=useState<ManagedFolder[]>(()=>Array.from({length:24},(_,index)=>({id:`folder-${index+1}`,name:index===0?"Long client documents and project archive 2026 with quarterly supporting material":index===1?"Personal documents with a deliberately long description":"Synthetic project folder "+String(index+1).padStart(2,"0"),description:index===0?"Synthetic work · long names and content":`Synthetic collection ${index+1}`,path:`C:\\Synthetic\\Project${String(index+1).padStart(2,"0")}`})));
    const [requestLog,setRequestLog]=useState("");
    const [renameMode,setRenameMode]=useState(renameOutcome);
    const world=worlds[worldIndex];
    const styles:WorldPlanetStyle[]=["planet","rocky","ringed","glowing","asteroid","black-hole","galaxy"];
    return <>
        <nav aria-label="Fixture controls" style={{position:"relative",zIndex:5000,display:"flex",flexWrap:"wrap",gap:8,padding:10,background:"#edf6fd"}}><strong>Synthetic fixture · no real files/accounts</strong>{(["art","folders","email","graph","studio"] as const).map(name=><button key={name} onClick={()=>setView(name)}>{name==="studio"?"File Studio":name}</button>)}<button onClick={()=>setWorldIndex(index=>1-index)}>Switch planet</button><button onClick={()=>setRequestLog(requests.join("\n"))}>Show requests</button><span>{world.name}</span></nav>
        <label style={{display:"block",padding:6,background:"#edf6fd"}}>Synthetic rename response <select aria-label="Synthetic rename response" value={renameMode} onChange={event=>{renameOutcome=event.target.value;setRenameMode(renameOutcome);}}><option value="success">Success</option><option value="collision">Name collision</option><option value="network">Network failure</option></select></label>
        {requestLog&&<pre role="status">{requestLog}</pre>}
        {view==="art"&&<main className="changeWorldPage" style={{position:"relative",minHeight:"calc(100vh - 50px)"}}><section className="worldGrid">{styles.map(style=><article className="worldCard" key={style}><Planet world={{...world,style,aiEnabled:true}} large/><h2>{style}</h2><Planet world={{...world,style}}/></article>)}</section></main>}
        {view==="folders"&&<FolderManagement folders={folders} onAdd={()=>false} onUpdate={(id,change)=>setFolders(items=>items.map(item=>item.id===id?{...item,...change}:item))} onDelete={id=>setFolders(items=>items.filter(item=>item.id!==id))} onReorder={(sourceId,targetId,placement)=>setFolders(items=>{const source=items.find(item=>item.id===sourceId);if(!source)return items;const next=items.filter(item=>item.id!==sourceId);const at=next.findIndex(item=>item.id===targetId);next.splice(at+(placement==="after"?1:0),0,source);return next;})} aiEnabled={false} worldId={world.id} treeRootMode="computer" onTreeRootModeChange={async()=>{}}/>}
        {view==="email"&&<EmailConversations world={world} worlds={worlds} onBack={()=>setView("art")} onViewGraph={()=>setView("graph")} onGoToDashboard={()=>setView("folders")}/>}
        {view==="graph"&&<PlanetGraph userId="fixture-user" world={world} active={true} worldNames={{alpha:"Fixture alpha",beta:"Fixture beta"}} onClose={()=>setView("art")} onOpenConversation={()=>setView("email")} onEnable={async()=>{}}/>}
        {view==="studio"&&<ProcessingWorkspace folders={folders} onUpdate={(id,change)=>setFolders(items=>items.map(item=>item.id===id?{...item,...change}:item))} storageScope={`fixture-${world.id}`}/>}
    </>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
