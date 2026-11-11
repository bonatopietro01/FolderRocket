import {useCallback, useEffect, useState} from "react";
import {BookOpen, LoaderCircle, RefreshCw} from "lucide-react";
import {API_BASE_URL} from "../../api.ts";
import type {WorkspaceWorld, WorldObsidianSourceSelection} from "../../planets/worlds.ts";

type WikiPreview = {
    worldId?:string;
    readiness?:"ready"|"requires-narrowing"|"unavailable";
    candidateCount?:number;
    supportedCount?:number;
    unsupportedCount?:number;
    oversizedCount?:number;
    totalBytes?:number;
    limits?:{maxFiles:number;maxFileBytes:number;maxExtractedTextBytes:number};
    blockers?:Array<{code:string;message:string}>;
};
type GraphStatus = {worldId:string;readiness?:string;graphStatus?:string;stale?:boolean;queryable?:boolean;knowledgeNoteCount?:number;progress?:{stage?:string;processed?:number;total?:number};message?:string};

function scopeSignature(selection?:Partial<WorldObsidianSourceSelection>) {
    return JSON.stringify({
        folders:selection?.folders!==false,
        folderMode:selection?.folderMode||"all",
        folderIds:selection?.folderIds||[],
        fileTypeMode:selection?.fileTypeMode||"all",
        fileTypes:selection?.fileTypes||[],
        includeSubfolders:selection?.includeSubfolders!==false,
        excludedFileIds:selection?.excludedFileIds||[]
    });
}

function formatBytes(bytes:number) {
    return bytes<1024*1024?`${Math.ceil(bytes/1024)} KiB`:`${(bytes/1024/1024).toFixed(1)} MiB`;
}

export default function PlanetWikiRebuildControls({world,savedWorld,onEnableGraph}: {
    world:WorkspaceWorld;
    savedWorld?:WorkspaceWorld;
    onEnableGraph:()=>Promise<void>;
}) {
    const [preview,setPreview]=useState<WikiPreview|null>(null);
    const [previewBusy,setPreviewBusy]=useState(true);
    const [graphStatus,setGraphStatus]=useState<GraphStatus|null>(null);
    const [graphStatusBusy,setGraphStatusBusy]=useState(world.graphEnabled);
    const [rebuildBusy,setRebuildBusy]=useState(false);
    const [running,setRunning]=useState(false);
    const [progress,setProgress]=useState<{stage?:string;processed?:number;total?:number}>({});
    const [error,setError]=useState("");
    const [notice,setNotice]=useState("");
    const worldId=world.id;
    const savedScope=Boolean(savedWorld)
        && scopeSignature(world.obsidian?.sourceSelection)===scopeSignature(savedWorld?.obsidian?.sourceSelection)
        && (world.graphEnabled===true)===(savedWorld?.graphEnabled===true)
        && (world.obsidian?.enabled===true)===(savedWorld?.obsidian?.enabled===true)
        && (world.obsidian?.vaultPath||"")===(savedWorld?.obsidian?.vaultPath||"");

    const loadPreview=useCallback(async(signal?:AbortSignal)=>{
        const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/wiki/preview`,{credentials:"include",signal});
        const data=await response.json().catch(()=>({})) as WikiPreview&{message?:string};
        if(!response.ok||data.worldId!==worldId)throw new Error(data.message||"Wiki scope preview could not be loaded for this planet.");
        return data;
    },[worldId]);

    const loadGraphStatus=useCallback(async(signal?:AbortSignal)=>{
        if(!world.graphEnabled)return {worldId,readiness:"disabled"};
        const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/graph?summary=1`,{credentials:"include",signal});
        const data=await response.json().catch(()=>({})) as Partial<GraphStatus>;
        if(!response.ok||data.worldId&&data.worldId!==worldId)throw new Error(data.message||"Wiki status could not be checked for this planet.");
        return {...data,worldId} as GraphStatus;
    },[world.graphEnabled,worldId]);

    useEffect(()=>{
        if(!savedScope)return;
        const controller=new AbortController();
        void loadPreview(controller.signal).then(data=>{if(!controller.signal.aborted)setPreview(data);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Wiki scope preview could not be loaded.");}).finally(()=>{if(!controller.signal.aborted)setPreviewBusy(false);});
        if(world.graphEnabled)void loadGraphStatus(controller.signal).then(status=>{if(!controller.signal.aborted){setGraphStatus(status);setError("");setRunning(status.graphStatus==="indexing"||status.readiness==="indexing"||status.readiness==="preparing");}}).catch(reason=>{if(!controller.signal.aborted){setGraphStatus(null);setError(reason instanceof Error?reason.message:"Wiki status could not be checked.");}}).finally(()=>{if(!controller.signal.aborted)setGraphStatusBusy(false);});
        return()=>controller.abort();
    },[loadPreview,loadGraphStatus,savedScope,world.graphEnabled,worldId]);

    useEffect(()=>{
        if(!running)return;
        let stopped=false;
        const poll=async()=>{
            try {
                const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/graph?summary=1`,{credentials:"include"});
                const status=await response.json().catch(()=>({})) as {readiness?:string;graphStatus?:string;progress?:{stage?:string;processed?:number;total?:number};message?:string;worldId?:string};
                if(stopped)return;
                if(!response.ok||status.worldId&&status.worldId!==worldId)throw new Error(status.message||"Wiki rebuild status could not be checked.");
                setGraphStatus(status.worldId?status as GraphStatus:{...status,worldId});
                setProgress(status.progress||{});
                if(["ready","partial","empty"].includes(status.readiness||"")&&status.graphStatus!=="indexing"){
                    setRunning(false);setNotice("Wiki rebuild finished. The published wiki remains available while you browse it.");
                    const refreshedPreview=await loadPreview();
                    if(!stopped)setPreview(refreshedPreview);
                } else if(status.readiness==="error"||["failed","error"].includes(status.graphStatus||"")){
                    setRunning(false);setError(status.message||"Wiki rebuild stopped. The last complete wiki remains available.");
                }
            } catch(reason){if(!stopped)setError(reason instanceof Error?reason.message:"Wiki rebuild status could not be checked.");}
        };
        void poll();const timer=window.setInterval(()=>void poll(),1800);
        return()=>{stopped=true;window.clearInterval(timer);};
    },[running,worldId,loadPreview]);

    const rebuild=async()=>{
        if(!savedScope||!preview||preview.readiness!=="ready"||rebuildBusy)return;
        setRebuildBusy(true);setError("");setNotice("");
        try {
            const current=await loadPreview();
            setPreview(current);
            if(current.readiness!=="ready")throw new Error(current.readiness==="requires-narrowing"?"The selected scope exceeds an ingestion limit. Narrow folders or file types, save, and preview again.":"The selected file scope is unavailable.");
            if(!world.graphEnabled)await onEnableGraph();
            const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/graph/index`,{method:"POST",credentials:"include"});
            const data=await response.json().catch(()=>({})) as {message?:string;preview?:WikiPreview};
            if(!response.ok){if(data.preview?.worldId===worldId)setPreview(data.preview);throw new Error(data.message||"Wiki rebuild could not be started.");}
            setRunning(true);setNotice("Wiki rebuild is running. The last complete wiki remains available.");
        } catch(reason){setError(reason instanceof Error?reason.message:"Wiki rebuild failed.");}
        finally{setRebuildBusy(false);}
    };

    const totalBytes=typeof preview?.totalBytes==="number"?Math.max(0,preview.totalBytes):0;
    const graphStatusMatches=graphStatus?.worldId===worldId;
    const graphJobActive=graphStatus?.graphStatus==="indexing"||graphStatus?.readiness==="indexing"||graphStatus?.readiness==="preparing";
    const validWiki=world.graphEnabled&&graphStatusMatches&&graphStatus?.readiness==="ready"&&graphStatus.stale!==true&&graphStatus.queryable===true&&(graphStatus.knowledgeNoteCount||0)>0;
    const canRebuild=savedScope&&preview?.readiness==="ready"&&!previewBusy&&!graphStatusBusy&&!rebuildBusy&&!running&&(!world.graphEnabled||(graphStatusMatches&&!graphJobActive));
    return <section className="worldWikiRebuildControls" aria-labelledby="worldWikiRebuildTitle">
        <div className="worldWikiRebuildHeading"><div><h4 id="worldWikiRebuildTitle">Planet wiki</h4><p>Builds knowledge from this planet’s saved file and folder scope.</p></div><BookOpen size={19} aria-hidden="true"/></div>
        {!savedScope&&<p className="worldWikiRebuildState" role="status">Save the planet settings first. Reopen these vault settings after saving to preview and rebuild the wiki.</p>}
        {(previewBusy||graphStatusBusy)&&<p className="worldWikiRebuildState" role="status"><LoaderCircle className="worldWikiRebuildSpinner" size={14}/>Checking selected files and wiki status…</p>}
        {preview&&savedScope&&<>
            <div className="worldWikiRebuildCounts"><span><strong>{preview.candidateCount||0}</strong>candidates</span><span><strong>{preview.supportedCount||0}</strong>supported</span><span><strong>{(preview.unsupportedCount||0)+(preview.oversizedCount||0)}</strong>excluded or over limit</span></div>
            {preview.limits&&<small className="worldWikiRebuildLimits">Limits: {preview.limits.maxFiles} files · {formatBytes(preview.limits.maxFileBytes)} per file · {formatBytes(preview.limits.maxExtractedTextBytes)} extracted text · current scope about {formatBytes(totalBytes)}</small>}
            {preview.readiness==="requires-narrowing"&&<div className="worldWikiRebuildBlockers" role="status"><strong>Narrow the scope before rebuilding</strong>{preview.blockers?.map((blocker,index)=><p key={`${blocker.code}-${index}`}>{blocker.message}</p>)}</div>}
            {preview.readiness==="unavailable"&&<p className="worldWikiRebuildBlockers" role="status">The selected file scope is unavailable. Check this planet’s folders and file types.</p>}
        </>}
        {error&&savedScope&&<p className="worldWikiRebuildError" role="alert">{error}</p>}{notice&&<p className="worldWikiRebuildState" role="status">{notice}</p>}
        {running&&<p className="worldWikiRebuildState" role="status">Rebuilding: {progress.stage||"starting"}{typeof progress.processed==="number"?` · ${progress.processed}${progress.total?` / ${progress.total}`:""}`:""}. The last complete wiki remains available.</p>}
        {world.graphEnabled&&!graphStatusMatches&&!graphStatusBusy&&savedScope&&<p className="worldWikiRebuildError" role="status">Wiki status is unavailable. Refresh the preview before starting a rebuild.</p>}
        <div className="worldWikiRebuildActions"><button type="button" onClick={()=>{setPreviewBusy(true);setGraphStatusBusy(world.graphEnabled);setError("");void Promise.all([loadPreview(),loadGraphStatus()]).then(([nextPreview,nextStatus])=>{setPreview(nextPreview);setGraphStatus(nextStatus);setRunning(nextStatus.graphStatus==="indexing"||nextStatus.readiness==="indexing"||nextStatus.readiness==="preparing");}).catch(reason=>setError(reason instanceof Error?reason.message:"Wiki scope preview could not be loaded.")).finally(()=>{setPreviewBusy(false);setGraphStatusBusy(false);});}} disabled={!savedScope||previewBusy||graphStatusBusy||rebuildBusy||running}><RefreshCw size={14}/>Aggiorna anteprima</button><button type="button" className="worldWikiRebuildPrimary" onClick={()=>void rebuild()} disabled={!canRebuild}><RefreshCw className={rebuildBusy||running?"worldWikiRebuildSpinner":""} size={14}/>{running?"Ricostruzione…":rebuildBusy?"Avvio…":validWiki?"Ricostruisci wiki":"Crea wiki"}</button></div>
    </section>;
}
