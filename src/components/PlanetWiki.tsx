import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ArrowLeft, BookOpen, ChevronLeft, ChevronRight, FileText, Folder, Network, RefreshCw, Search, Sparkles} from "lucide-react";
import {API_BASE_URL} from "../api";
import type {WorkspaceWorld} from "../worlds";

type WikiPageSummary = {id:string;title:string;kind:string;sourceCount:number;updatedAt?:string;summary?:string;provenance?:unknown};
type WikiIndex = {worldId:string;status?:string;total:number;pageSize:number;nextCursor:string|null;pages:WikiPageSummary[]};
type WikiPage = {id:string;title:string;kind:string;updatedAt?:string;markdown:string;sourceRefs:Array<{id:string;path:string;updatedAt?:string}>;links:Array<{id:string;title:string;kind:string}>};
type DetailResponse = {page:WikiPage};
const PAGE_SIZE=50;
const kindLabels:Record<string,string>={home:"Home",area:"Area",folder:"Folder",topic:"Lexical grouping",label:"Label",source:"Source",file:"Source",document:"Source","knowledge-area":"Area","knowledge-topic":"Lexical grouping","knowledge-document":"Source","graph-source":"Source","graph-source-index":"Home","graph-source-page":"Source","knowledge-project":"Label","knowledge-procedure":"Label","knowledge-entity":"Label"};
function kindCategory(kind:string){if(["area","knowledge-area","folder"].includes(kind))return "area";if(["topic","knowledge-topic"].includes(kind))return "topic";if(["label","knowledge-project","knowledge-procedure","knowledge-entity"].includes(kind))return "label";if(["home","graph-source-index"].includes(kind))return "home";if(["source","file","document","knowledge-document","graph-source","graph-source-page"].includes(kind))return "source";return "other";}
const asCount=(n:unknown)=>typeof n==="number"&&Number.isFinite(n)?Math.max(0,n):0;
function renderWikiMarkdown(value:string){
    let lines=String(value||"").replace(/\r/g,"").split("\n");
    if(lines[0]?.trim()==="---"){const end=lines.indexOf("---",1);if(end>=0)lines=lines.slice(end+1);}
    return lines.map((line,index)=>{
        const trimmed=line.trim();if(!trimmed)return null;
        const heading=trimmed.match(/^(#{1,4})\s+(.+)$/);if(heading){const text=heading[2];const level=heading[1].length;return level===1?<h3 key={index}>{text}</h3>:level===2?<h4 key={index}>{text}</h4>:<h5 key={index}>{text}</h5>;}
        const item=trimmed.match(/^[-*]\s+(.+)$/);if(item)return <p className="planetWikiBullet" key={index}>• {item[1]}</p>;
        const quote=trimmed.match(/^>\s*(.*)$/);if(quote)return <blockquote key={index}>{quote[1]}</blockquote>;
        return <p key={index}>{trimmed.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu,(_match,target,label)=>label||target)}</p>;
    });
}

export default function PlanetWiki({world,onClose,onViewGraph}: {world:WorkspaceWorld;onClose:()=>void;onViewGraph:()=>void}) {
    const [pages,setPages]=useState<WikiPageSummary[]>([]);
    const [selected,setSelected]=useState<WikiPage|null>(null);
    const [query,setQuery]=useState("");
    const [kind,setKind]=useState("");
    const [cursor,setCursor]=useState("");
    const [cursorStack,setCursorStack]=useState<string[]>([]);
    const [nextCursor,setNextCursor]=useState<string|null>(null);
    const [total,setTotal]=useState(0);
    const [loading,setLoading]=useState(true);
    const [detailLoading,setDetailLoading]=useState(false);
    const [indexing,setIndexing]=useState(false);
    const [progress,setProgress]=useState<{stage?:string;processed?:number;total?:number}>({});
    const [error,setError]=useState("");
    const [notice,setNotice]=useState("");
    const generation=useRef(0);
    const aborts=useRef<AbortController[]>([]);
    const initialSearchSkipped=useRef(false);
    const worldId=world.id;
    const escapedId=encodeURIComponent(worldId);
    const refreshIndex=useCallback(async(signal:AbortSignal|undefined,queryValue:string,kindValue:string,cursorValue:string)=>{
        const params=new URLSearchParams({limit:String(PAGE_SIZE)});
        if(queryValue.trim())params.set("query",queryValue.trim());
        if(kindValue)params.set("kind",kindValue);
        if(cursorValue)params.set("cursor",cursorValue);
        const response=await fetch(`${API_BASE_URL}/worlds/${escapedId}/wiki?${params}`,{credentials:"include",signal});
        const data=await response.json().catch(()=>({})) as Partial<WikiIndex>&{message?:string};
        if(!response.ok)throw new Error(data.message||"Wiki index could not be loaded.");
        if(data.worldId!==worldId||!Array.isArray(data.pages))throw new Error("The wiki index response did not match this planet.");
        if(signal?.aborted)return;
        setPages(data.pages);setTotal(asCount(data.total));setNextCursor(typeof data.nextCursor==="string"&&data.nextCursor?data.nextCursor:null);
    },[escapedId,worldId]);
    const refreshGraphStatus=useCallback(async(signal?:AbortSignal)=>{
        if(!world.graphEnabled)return;
        const response=await fetch(`${API_BASE_URL}/worlds/${escapedId}/graph?summary=1`,{credentials:"include",signal});
        const data=await response.json().catch(()=>({})) as {worldId?:string;readiness?:string;graphStatus?:string;progress?:{stage?:string;processed?:number;total?:number};message?:string};
        if(!response.ok||data.worldId&&data.worldId!==worldId)throw new Error(data.message||"Planet wiki status could not be verified.");
        if(signal?.aborted)return;
        setProgress(data.progress||{});
        if(data.graphStatus==="indexing"||data.readiness==="indexing"||data.readiness==="preparing")setIndexing(true);
        else if(data.readiness==="stale")setNotice("Showing the last complete wiki. The selected folders have changed; rebuild this planet’s wiki to refresh it.");
        else if(data.readiness==="partial")setNotice("The latest wiki is available with incomplete source coverage. Review its source status before rebuilding.");
    },[escapedId,world.graphEnabled,worldId]);

    useEffect(()=>{
        const controller=new AbortController();let cancelled=false;
        const timer=window.setTimeout(()=>{void Promise.all([refreshIndex(controller.signal,"","",""),refreshGraphStatus(controller.signal)]).catch(reason=>{if(!cancelled&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Wiki could not be loaded.");}).finally(()=>{if(!cancelled)setLoading(false);});},0);
        return()=>{cancelled=true;window.clearTimeout(timer);controller.abort();};
    },[worldId,refreshIndex,refreshGraphStatus]);

    useEffect(()=>{
        if(!initialSearchSkipped.current){initialSearchSkipped.current=true;return;}
        const controller=new AbortController();
        const timer=window.setTimeout(()=>{setLoading(true);setError("");void refreshIndex(controller.signal,query,kind,cursor).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Search failed.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},260);
        return()=>{window.clearTimeout(timer);controller.abort();};
    },[query,kind,cursor,worldId,refreshIndex]);
    useEffect(()=>()=>{aborts.current.forEach(controller=>controller.abort());aborts.current=[];},[]);

    useEffect(()=>{
        if(!indexing)return;
        let stopped=false;
        const poll=async()=>{
            try {
                const response=await fetch(`${API_BASE_URL}/worlds/${escapedId}/graph?summary=1`,{credentials:"include"});
                const status=await response.json().catch(()=>({})) as {readiness?:string;graphStatus?:string;progress?:{stage?:string;processed?:number;total?:number};message?:string};
                if(stopped)return;
                setProgress(status.progress||{});
                if(["ready","partial","empty"].includes(status.readiness||"")&&status.graphStatus!=="indexing"){
                    setIndexing(false);setNotice("Wiki rebuild finished. The latest published wiki is available below.");
                    setCursor("");setCursorStack([]);
                    await refreshIndex(undefined,query,kind,"");
                } else if(status.readiness==="error"||["failed","error"].includes(status.graphStatus||"")) {setIndexing(false);setError(status.message||"Reconstruction stopped. The last complete wiki remains available.");}
            } catch { /* keep polling; the job state endpoint can briefly be unavailable */ }
        };
        void poll();const timer=window.setInterval(()=>void poll(),1800);
        return()=>{stopped=true;window.clearInterval(timer);};
    },[indexing,escapedId,refreshIndex,query,kind]);
    const openPage=async(pageId:string)=>{
        const current=++generation.current;const controller=new AbortController();aborts.current.push(controller);setDetailLoading(true);setError("");
        try {const response=await fetch(`${API_BASE_URL}/worlds/${escapedId}/wiki/pages/${encodeURIComponent(pageId)}`,{credentials:"include",signal:controller.signal});const data=await response.json().catch(()=>({})) as Partial<DetailResponse>&{message?:string};if(!response.ok)throw new Error(data.message||"Wiki page could not be loaded.");if(current===generation.current&&data.page)setSelected(data.page);}
        catch(reason){if(current===generation.current&&!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Wiki page could not be loaded.");}
        finally{if(current===generation.current)setDetailLoading(false);}
    };
    const homePages=useMemo(()=>pages.filter(page=>kindCategory(page.kind)==="home"),[pages]);
    const folderPages=useMemo(()=>pages.filter(page=>kindCategory(page.kind)==="area"),[pages]);
    const topicPages=useMemo(()=>pages.filter(page=>kindCategory(page.kind)==="topic"),[pages]);
    const sourcePages=useMemo(()=>pages.filter(page=>kindCategory(page.kind)==="source"),[pages]);
    const labelPages=useMemo(()=>pages.filter(page=>kindCategory(page.kind)==="label"),[pages]);
    const otherPages=useMemo(()=>pages.filter(page=>kindCategory(page.kind)==="other"),[pages]);
    const showPage=(page:WikiPageSummary)=><button type="button" key={page.id} className="planetWikiPageLink" onClick={()=>void openPage(page.id)}><span className="planetWikiPageIcon">{kindCategory(page.kind)==="topic"?<Sparkles size={15}/>:kindCategory(page.kind)==="area"?<Folder size={15}/>:<FileText size={15}/>}</span><span><strong>{page.title}</strong><small>{kindLabels[page.kind]||page.kind} · {page.sourceCount} fonti{page.updatedAt?` · ${new Date(page.updatedAt).toLocaleDateString()}`:""}</small>{page.summary&&<small className="planetWikiSummary">{page.summary}</small>}</span><ChevronRight size={15}/></button>;
    return <main className="planetWikiPage" aria-label={`${world.name} wiki`}>
        <div className="planetWikiGlow" aria-hidden="true"/>
        <header className="planetWikiHeader"><button type="button" className="planetWikiBack" onClick={onClose}><ArrowLeft size={15}/>Pianeti</button><div className="planetWikiTitle"><BookOpen size={24}/><div><p>FOLDERROCKET WIKI</p><h1>{world.name}</h1></div></div><div className="planetWikiHeaderActions"><button type="button" onClick={onViewGraph}><Network size={15}/>Graph</button><button type="button" onClick={()=>{setSelected(null);setLoading(true);void Promise.all([refreshIndex(undefined,query,kind,cursor),refreshGraphStatus()]).catch(reason=>setError(reason.message)).finally(()=>setLoading(false));}}><RefreshCw size={15}/>Aggiorna</button></div></header>
        <div className="planetWikiLayout planetWikiBrowseLayout">
            <section className="planetWikiMain">
                {error&&<p className="planetWikiError" role="alert">{error}</p>}{notice&&<p className="planetWikiNotice" role="status">{notice}</p>}{indexing&&<p className="planetWikiNotice" role="status">Wiki reconstruction is in progress: {progress.stage||"starting"}{typeof progress.processed==="number"?` · ${progress.processed}${progress.total?` / ${progress.total}`:""}`:""}. The last complete wiki remains available.</p>}
                {selected?<article className="planetWikiDetail"><button type="button" className="planetWikiInlineBack" onClick={()=>setSelected(null)}><ChevronLeft size={15}/>Indice wiki</button>{detailLoading?<p role="status">Caricamento pagina…</p>:<><p className="planetWikiEyebrow">{kindLabels[kindCategory(selected.kind)]||kindLabels[selected.kind]||selected.kind}</p><h2>{selected.title}</h2><p className="planetWikiUpdated">Aggiornata {selected.updatedAt?new Date(selected.updatedAt).toLocaleString():"—"}</p><div className="planetWikiMarkdown">{renderWikiMarkdown(selected.markdown)}</div><section className="planetWikiSources"><h3>Fonti ed evidenze</h3>{selected.sourceRefs.length?selected.sourceRefs.map(source=><article key={source.id}><FileText size={14}/><div><strong>{source.path}</strong><small>{source.updatedAt?new Date(source.updatedAt).toLocaleString():"Data non disponibile"}</small></div></article>):<p>Nessuna fonte collegata.</p>}</section>{selected.links.length>0&&<section className="planetWikiRelated"><h3>Collegamenti nella wiki</h3>{selected.links.map(link=><button key={link.id} type="button" onClick={()=>void openPage(link.id)}>{link.title}<small>{kindLabels[link.kind]||link.kind}</small></button>)}</section>}</>}</article>:<>
                    <section className="planetWikiWelcome"><div><p className="planetWikiEyebrow">CONOSCENZA DEL PIANETA</p><h2>La wiki di {world.name}</h2><p>Una raccolta locale e consultabile di aree, fonti, etichette e argomenti estratti dai file selezionati.</p></div><BookOpen size={38}/></section>
                    <section className="planetWikiIndex"><header><div><h2>Esplora la wiki</h2><p>{total} pagine · caricamento del testo solo quando apri una pagina</p></div></header><label className="planetWikiSearch"><Search size={16}/><input aria-label="Cerca nella wiki" value={query} onChange={event=>{setQuery(event.target.value);setCursor("");setCursorStack([]);}} placeholder="Cerca pagine e fonti"/><select aria-label="Filtra per tipo" value={kind} onChange={event=>{setKind(event.target.value);setCursor("");setCursorStack([]);}}><option value="">Tutti i tipi</option><option value="home">Home</option><option value="area">Aree e cartelle</option><option value="topic">Raggruppamenti lessicali</option><option value="label">Etichette</option><option value="source">Fonti</option></select></label>
                    {loading?<p className="planetWikiEmpty" role="status">Caricamento indice…</p>:pages.length===0?<p className="planetWikiEmpty">La wiki non contiene ancora pagine per questa ricerca.</p>:<>{homePages.length>0&&<section className="planetWikiGroup"><h3><BookOpen size={15}/>Home</h3>{homePages.map(showPage)}</section>}{folderPages.length>0&&<section className="planetWikiGroup"><h3><Folder size={15}/>Aree e cartelle</h3>{folderPages.map(showPage)}</section>}{topicPages.length>0&&<section className="planetWikiGroup"><h3><Sparkles size={15}/>Argomenti <small>Raggruppamenti lessicali, non relazioni semantiche verificate</small></h3>{topicPages.map(showPage)}</section>}{labelPages.length>0&&<section className="planetWikiGroup"><h3>Etichette</h3>{labelPages.map(showPage)}</section>}{sourcePages.length>0&&<section className="planetWikiGroup"><h3><FileText size={15}/>Fonti</h3>{sourcePages.map(showPage)}</section>}{otherPages.length>0&&<section className="planetWikiGroup"><h3>Altre pagine</h3>{otherPages.map(showPage)}</section>}{(cursor||nextCursor)&&<div className="planetWikiPagination"><button type="button" disabled={!cursorStack.length} onClick={()=>{const prior=[...cursorStack];prior.pop();setCursorStack(prior);setCursor(prior.at(-1)||"");}}><ChevronLeft size={15}/>Precedente</button><button type="button" disabled={!nextCursor} onClick={()=>{if(nextCursor){setCursorStack(stack=>[...stack,nextCursor]);setCursor(nextCursor);}}}><span>Altre pagine</span><ChevronRight size={15}/></button></div>}</>}
                    </section>
                </>}
            </section>
        </div>
    </main>;
}






