import {useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent} from "react";
import {ArrowLeft, Check, Copy, LoaderCircle, Mail, Network, RefreshCw, Search, Settings2, ZoomIn, ZoomOut} from "lucide-react";
import {API_BASE_URL} from "../api";
import type {WorkspaceWorld} from "../worlds";
import {readWorldActivitySnapshot} from "../worldActivitySnapshot";

type GraphNode = {id:string;type:string;label:string;sourceRef?:Record<string,unknown>;details?:Record<string,unknown>};
type GraphEdge = {id:string;type:string;from:string;to:string};
type GraphData = {status:string;progress:{stage:string;processed:number;total:number;limitReached?:boolean};warnings:string[];nodes:GraphNode[];edges:GraphEdge[];sharedThreads:Array<{threadId:string;blockId:string;sourceWorldId:string}>};
const EMPTY_GRAPH:GraphData={status:"disabled",progress:{stage:"idle",processed:0,total:0},warnings:[],nodes:[],edges:[],sharedThreads:[]};

function positionNodes(nodes:GraphNode[]) {
    const center={x:900,y:540};
    const groups=new Map<string,GraphNode[]>();
    for(const node of nodes){const group=node.type==="world"?"world":node.type.startsWith("email")||node.type==="person"?"email":node.type;const list=groups.get(group)||[];list.push(node);groups.set(group,list);}
    const layout=new Map<string,{x:number;y:number}>();
    const world=(groups.get("world")||[])[0];if(world)layout.set(world.id,center);
    const rings=[{name:"folder",angle:-Math.PI*.82},{name:"file",angle:-Math.PI*.25},{name:"email",angle:Math.PI*.1},{name:"calendar-event",angle:Math.PI*.48},{name:"reminder",angle:Math.PI*.78},{name:"note",angle:Math.PI*.93},{name:"alert",angle:-Math.PI*.55},{name:"activity",angle:-Math.PI*.98},{name:"search",angle:-Math.PI*.96}];
    for(const ring of rings){const list=(groups.get(ring.name)||[]).sort((a,b)=>a.label.localeCompare(b.label)).slice(0,900);const radius=ring.name==="folder"?340:510;list.forEach((item,index)=>{const spread=(index-(list.length-1)/2)*.14;const angle=ring.angle+spread;const row=Math.floor(index/11)*55;layout.set(item.id,{x:center.x+Math.cos(angle)*(radius+row),y:center.y+Math.sin(angle)*(radius+row)});});}
    for(const [group,list] of groups)if(!["world",...rings.map(item=>item.name)].includes(group)){list.forEach((item,index)=>layout.set(item.id,{x:center.x+(index%12-5.5)*120,y:center.y+Math.floor(index/12)*100}));}
    return layout;
}

export default function PlanetGraph({userId,world,active,focusThreadId,worldNames,onClose,onOpenConversation,onEnable}: {userId:string;world:WorkspaceWorld;active:boolean;focusThreadId?:string;worldNames:Record<string,string>;onClose:()=>void;onOpenConversation:(threadId:string)=>void;onEnable:()=>Promise<void>}) {
    const [graph,setGraph]=useState<GraphData>(EMPTY_GRAPH);const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(false);const [error,setError]=useState("");const [query,setQuery]=useState("");const [selected,setSelected]=useState<GraphNode|null>(null);const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});const [copied,setCopied]=useState(false);
    const graphRef=useRef<SVGSVGElement|null>(null);const drag=useRef<{x:number;y:number;panX:number;panY:number}|null>(null);const generation=useRef(0);const autoIndexStarted=useRef(false);
    const url=`${API_BASE_URL}/worlds/${encodeURIComponent(world.id)}/graph`;
    const refresh=useCallback(async(startIndex=false)=>{
        if(!world.graphEnabled&&!startIndex)return;
        const token=++generation.current;setBusy(true);setError("");
        try {
            if(startIndex){const indexResponse=await fetch(`${url}/index`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({snapshot:readWorldActivitySnapshot(`${userId}-world-${world.id}`)})});if(!indexResponse.ok&&indexResponse.status!==202){const indexError=await indexResponse.json().catch(()=>({}));throw new Error(indexError.message||"Could not start planet graph indexing.");}}
            const response=await fetch(url,{credentials:"include"});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"Could not load planet graph.");
            if(token===generation.current&&data.graph){setGraph(data.graph as GraphData);setLoaded(true);}
        } catch(reason){if(token===generation.current)setError(reason instanceof Error?reason.message:"Could not load planet graph.");}
        finally{if(token===generation.current)setBusy(false);}
    },[url,userId,world.id,world.graphEnabled]);
    useEffect(()=>{let cancelled=false;const timer=window.setTimeout(()=>{if(!cancelled)void refresh(false);},0);return()=>{cancelled=true;window.clearTimeout(timer);generation.current+=1;autoIndexStarted.current=false;};},[world.id,world.graphEnabled,refresh]);
    useEffect(()=>{if(!loaded||!world.graphEnabled||graph.status!=="disabled"||autoIndexStarted.current)return;autoIndexStarted.current=true;let cancelled=false;const timer=window.setTimeout(()=>{if(!cancelled)void refresh(true);},0);return()=>{cancelled=true;window.clearTimeout(timer);};},[loaded,graph.status,world.graphEnabled,refresh]);
    useEffect(()=>{if(graph.status!=="indexing")return;const timer=window.setInterval(()=>void refresh(false),1200);return()=>window.clearInterval(timer);},[graph.status,refresh]);
    useEffect(()=>{if(!focusThreadId)return;let cancelled=false;const timer=window.setTimeout(()=>{if(cancelled)return;const node=graph.nodes.find(item=>item.type==="email-thread"&&item.sourceRef?.threadId===focusThreadId);if(node)setSelected(node);},0);return()=>{cancelled=true;window.clearTimeout(timer);};},[focusThreadId,graph.nodes]);
    const visibleNodes=useMemo(()=>{const normalized=query.trim().toLocaleLowerCase();return graph.nodes.slice(0,1200).filter(node=>!normalized||`${node.label} ${node.type}`.toLocaleLowerCase().includes(normalized));},[graph.nodes,query]);
    const positions=useMemo(()=>positionNodes(visibleNodes),[visibleNodes]);const visibleIds=useMemo(()=>new Set(visibleNodes.map(item=>item.id)),[visibleNodes]);
    const edges=useMemo(()=>graph.edges.filter(edge=>visibleIds.has(edge.from)&&visibleIds.has(edge.to)).slice(0,1800),[graph.edges,visibleIds]);
    function point(event:ReactPointerEvent<SVGSVGElement>){const bounds=event.currentTarget.getBoundingClientRect();return{x:event.clientX-bounds.left,y:event.clientY-bounds.top};}
    const handleDown=(event:ReactPointerEvent<SVGSVGElement>)=>{if((event.target as Element).closest(".planetGraphNode"))return;event.currentTarget.setPointerCapture(event.pointerId);const p=point(event);drag.current={x:p.x,y:p.y,panX:pan.x,panY:pan.y};};
    const handleMove=(event:ReactPointerEvent<SVGSVGElement>)=>{if(!drag.current)return;const p=point(event);setPan({x:drag.current.panX+(p.x-drag.current.x),y:drag.current.panY+(p.y-drag.current.y)});};
    const handleUp=()=>{drag.current=null;};
    function nodePath(node:GraphNode){return typeof node.sourceRef?.path==="string"?node.sourceRef.path:"";}
    async function copyPath(){if(!selected)return;const value=nodePath(selected);if(!value)return;try{await navigator.clipboard.writeText(value);setCopied(true);window.setTimeout(()=>setCopied(false),1200);}catch{setError("Clipboard access is unavailable.");}}
    return <main className="planetGraphPage" aria-label={`${world.name} planet graph`}>
        <div className="planetGraphStars" aria-hidden="true"/><header className="planetGraphHeader"><button type="button" onClick={onClose} className="planetGraphBack"><ArrowLeft size={16}/>Back to FolderRocket</button><div className="planetGraphTitle"><Network size={24}/><div><h1>{world.name} Graph</h1><p>{graph.nodes.length.toLocaleString()} items · {graph.edges.length.toLocaleString()} connections</p></div></div><div className="planetGraphHeaderActions"><label className="planetGraphSearch"><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search folders, files or conversations"/></label>{world.graphEnabled&&<button type="button" onClick={()=>void refresh(true)} disabled={busy}><RefreshCw size={15} className={busy?"planetGraphSpin":""}/>Refresh</button>}</div></header>
        {!world.graphEnabled?<section className="planetGraphEmpty"><Network size={42}/><h2>Graph is not enabled for this planet</h2><p>Enable Create planet graph in Customize planet to build a private map from its configured sources.</p><button type="button" onClick={()=>void onEnable()}><Settings2 size={15}/>Enable graph</button></section>:<>
            {error&&<p className="planetGraphError" role="alert">{error}</p>}{graph.status==="indexing"&&<p className="planetGraphProgress" role="status"><LoaderCircle className="planetGraphSpin" size={16}/>{graph.progress.stage||"Indexing"} · {graph.progress.processed} / {graph.progress.total}</p>}
            <div className="planetGraphWorkspace"><svg ref={graphRef} className="planetGraphCanvas" viewBox="0 0 1800 1080" role="application" aria-label="Interactive planet graph" onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={handleUp} onWheel={event=>{event.preventDefault();setZoom(current=>Math.max(.35,Math.min(2.25,current+(event.deltaY<0?.08:-.08))));}}>
                <g transform={`translate(${pan.x} ${pan.y}) translate(900 540) scale(${zoom}) translate(-900 -540)`}>
                    {edges.map(edge=>{const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)return null;return <line key={edge.id} className="planetGraphEdge" x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;})}
                    {visibleNodes.map(node=>{const p=positions.get(node.id)!;const chosen=selected?.id===node.id;const type=node.type.startsWith("email")||node.type==="person"?"email":node.type;return <g key={node.id} className={`planetGraphNode ${type}${chosen?" selected":""}`} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`${node.type}: ${node.label}`} onClick={()=>setSelected(node)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelected(node);}}}><circle r={node.type==="world"?22:node.type==="folder"?13:8}/><text y={node.type==="world"?42:node.type==="folder"?31:24}>{node.label.length>31?`${node.label.slice(0,28)}…`:node.label}</text></g>;})}
                </g>
            </svg><div className="planetGraphZoom"><button type="button" onClick={()=>setZoom(value=>Math.min(2.25,value+.12))} aria-label="Zoom in"><ZoomIn size={16}/></button><span>{Math.round(zoom*100)}%</span><button type="button" onClick={()=>setZoom(value=>Math.max(.35,value-.12))} aria-label="Zoom out"><ZoomOut size={16}/></button><button type="button" onClick={()=>{setPan({x:0,y:0});setZoom(1);}} aria-label="Reset graph view">Reset</button></div>
                {selected&&<aside className="planetGraphDetails"><button className="planetGraphCloseDetails" type="button" onClick={()=>setSelected(null)} aria-label="Close details">×</button><small>{selected.type.replaceAll("-"," ")}</small><h2>{selected.label}</h2>{selected.type==="email-thread"&&<><p>{String(selected.details?.accountEmail||"Gmail conversation")}{selected.details?.shared===true&&` · Shared from ${worldNames[String(selected.sourceRef?.sourceWorldId)]||String(selected.sourceRef?.sourceWorldId||"")}`}</p><button type="button" disabled={!active} title={!active?"Enter this planet before opening its conversations":""} onClick={()=>{const threadId=String(selected.sourceRef?.threadId||"");if(threadId)onOpenConversation(threadId);}}><Mail size={14}/>Open conversation</button></>}{nodePath(selected)&&<><p className="planetGraphPath">{nodePath(selected)}</p><button type="button" onClick={()=>void copyPath()}>{copied?<Check size={14}/>:<Copy size={14}/>}{copied?"Copied":"Copy path"}</button></>}{selected.type==="file"&&<small>{String(selected.details?.extension||"")} · {Number(selected.details?.size||0).toLocaleString()} bytes</small>}</aside>}
            </div>
            {graph.status==="error"&&<p className="planetGraphError">Indexing stopped. Use Refresh to retry.</p>}{graph.progress.limitReached&&<p className="planetGraphWarning">Some sources exceed the local indexing limits. The graph is partial; refresh after reducing the source size.</p>}{graph.warnings?.length>0&&<details className="planetGraphWarnings"><summary>Some sources could not be indexed ({graph.warnings.length})</summary><ul>{graph.warnings.slice(0,10).map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
        </>}
    </main>;
}
