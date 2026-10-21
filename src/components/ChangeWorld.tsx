import {memo, useCallback, useEffect, useRef, useState, type CSSProperties} from "react";
import {ArrowLeft, BellRing, CalendarDays, Check, CirclePlus, Clock3, LoaderCircle, Mail, Pencil, Plus, Send, Sparkles, Trash2, X, Network, BookOpen, FolderOpen, RefreshCw} from "lucide-react";
import type {WorldActivityNotifications, WorldAgentProfile, WorldAssistantCapability, WorldAssistantModel, WorkspaceWorld, WorldPlanetStyle, WorldSkillProfile, WorldDigestSource, WorldObsidianSettings, WorldObsidianSourceSelection} from "../worlds";
import {activeWorldStorageScope, DEFAULT_OBSIDIAN_SOURCE_SELECTION, normalizeActivityNotifications} from "../worlds";
import {API_BASE_URL} from "../api";
import {readWorldActivitySnapshot, selectWorldActivitySnapshot} from "../worldActivitySnapshot";
import {isKnowledgeCandidateSelected, updateKnowledgeExcludedFileIds} from "./knowledgeCandidateSelection";
import folderRocketMark from "../assets/folderrocket-mark.png";
import "../worlds.css";

interface Props {
    worlds: WorkspaceWorld[];
    activeWorldId: string;
    userId: string;
    storageScope: string;
    onSyncObsidian: (worldId: string, signature?:string) => Promise<{ok:boolean;status:number;result?:{status?:string;lastSyncAt?:string;written?:number;unchanged?:number;conflicts?:number;warnings?:string[]};config?:WorldObsidianSettings;message?:string;code?:string;reasonSummary?:{reasonCodes?:string[];counts?:Record<string,number>;blockers?:Array<{sourceId:string;label:string;status:string;reasonCode:string;action:string;retryable:boolean}>};readinessFingerprint?:string}>;
    onSelect: (worldId: string) => Promise<void>;
    onViewGraph: (world: WorkspaceWorld) => void;
    onInvokeAssistant: (worldId: string, profileId: string, kind: "agent" | "skill", name: string, instructions: string, prompt: string, model: WorldAssistantModel, capabilities: WorldAssistantCapability[]) => Promise<string>;
    switchError: string;
    onBack: () => void;
    onAdd: () => WorkspaceWorld;
    onUpdate: (world: WorkspaceWorld) => Promise<void>;
    onDelete: (worldId: string) => Promise<void>;
    initialEditWorldId?: string;
}

const PLANET_COLORS = ["#5dbdff", "#c28cff", "#ff967d", "#f4c95d", "#79d7a3", "#f17db2", "#8c9dff", "#72d6d1"];
interface DigestAccount {blockId:string; email:string; label:string; canSend:boolean;}
type WorldEmailCatalog = {gmail:Array<{blockId:string;blockIds?:string[];email?:string;originWorldNames?:string[];originUnknown?:boolean}>;outlook:Array<{blockId:string;blockIds?:string[];email?:string;originWorldNames?:string[];originUnknown?:boolean}>};
interface DigestHistoryEntry {at:string;kind:"scheduled"|"test";status:string;error?:string;}
interface DigestRuntime {lastSentAt?:string;lastStatus?:string;lastError?:string;nextDigestAt?:string|null;history?:DigestHistoryEntry[];}
interface ObsidianThread {threadId:string;blockId:string;subject?:string;updatedAt?:string;accountEmail?:string;}
interface ObsidianFolderOption {id:string;name:string;path:string;}
interface KnowledgeCandidate {id:string;title:string;sourceScopeId:string;extension?:string;selected?:boolean;}
const OBSIDIAN_FILE_TYPES = [{id:".pdf",label:"PDF"},{id:".docx",label:"Word"},{id:".doc",label:"Word (DOC)"},{id:".rtf",label:"RTF"},{id:".txt",label:"Text"},{id:".md",label:"Markdown"},{id:".xlsx",label:"Excel"},{id:".xls",label:"Excel (XLS)"},{id:".csv",label:"CSV"},{id:".pptx",label:"PowerPoint"},{id:".ppt",label:"PowerPoint (PPT)"},{id:".png",label:"PNG"},{id:".jpg",label:"JPG"},{id:".jpeg",label:"JPEG"},{id:".gif",label:"GIF"},{id:".webp",label:"WebP"},{id:".mp3",label:"MP3"},{id:".mp4",label:"MP4"},{id:".mov",label:"MOV"},{id:".avi",label:"AVI"},{id:".mkv",label:"MKV"}];
type ObsidianSourceKey = "folders"|"email"|"alerts"|"activity"|"snapshots"|"clientNotes"|"attachments";
const DIGEST_SOURCE_OPTIONS: Array<{id:WorldDigestSource; label:string; detail:string}> = [
    {id:"dailyActivities",label:"Daily Job activity",detail:"Recent file and workspace actions (summary only)"},
    {id:"reminders",label:"Post-it reminders",detail:"Reminder title and due time, not note body"},
    {id:"calendar",label:"Google Calendar",detail:"Event title, date and time"},
    {id:"gmailAlerts",label:"Gmail alerts",detail:"Counts from existing saved alert checks"},
    {id:"outlookAlerts",label:"Outlook alerts",detail:"Counts from existing saved alert checks"},
    {id:"teams",label:"Teams activity",detail:"Counts from chats/channels you open in FolderRocket; no message text"}
];
const OBSIDIAN_SOURCE_GROUPS: Array<{title:string; sources:Array<{id:ObsidianSourceKey;label:string;detail:string}>}> = [
    {title:"Planet data",sources:[{id:"folders",label:"Folders and files",detail:"Folder names, file names, paths and metadata."}]},
    {title:"Email",sources:[{id:"email",label:"Gmail conversations",detail:"Conversation metadata and synced messages for the selected Gmail account. Outlook threads are not currently supported."},{id:"alerts",label:"Email alerts",detail:"Configured email alert metadata; no email message bodies."}]},
    {title:"Workspace activity",sources:[{id:"activity",label:"Daily Job and File Studio activity",detail:"Local activity summaries and processing history."},{id:"snapshots",label:"Calendar and reminder snapshots",detail:"Calendar event and reminder metadata."},{id:"clientNotes",label:"Workspace notes and jobs",detail:"Post-its, Daily Job records and other client-held notes."}]},
    {title:"Local files",sources:[{id:"attachments",label:"Downloaded attachments",detail:"Attachments already downloaded locally; sync does not download them from email."}]}
];

export function Planet({world, large = false}: {world: WorkspaceWorld; large?: boolean}) {
    return <span className={`worldPlanet ${world.style}${large ? " large" : ""}${world.aiEnabled ? " aiEnabled" : ""}`} style={{"--planet-color": world.color} as CSSProperties} aria-hidden="true">
        <span className="worldPlanetCore"/>
        {world.style === "ringed" && <span className="worldPlanetRing"/>}
        {world.style === "black-hole" && <span className="worldBlackHoleDisk"/>}
        {world.style === "galaxy" && <span className="worldGalaxyArms"/>}
        {world.aiEnabled && <span className="worldAiSatelliteOrbit"><i/></span>}
    </span>;
}

interface WorldGridProps {
    worlds: WorkspaceWorld[];
    activeWorldId: string;
    switchingWorldId: string | null;
    onEditWorld: (world: WorkspaceWorld) => void;
    onSelectWorld: (worldId: string) => void;
    onViewGraph: (world: WorkspaceWorld) => void;
}

type GraphReadiness = {worldId:string;enabled:boolean;readiness:"disabled"|"indexing"|"preparing"|"stale"|"empty"|"partial"|"ready"|"error";queryable:boolean;stale:boolean;knowledgeStatus:string;knowledgeNodeCount:number;knowledgeNoteCount:number;progress?:{stage?:string;processed?:number;total?:number};revision?:string;sourceRevision?:string;graphRevision?:string;managedMarkdown?:{path?:string;revision?:string;status?:string;updatedAt?:string;complete?:boolean};message?:string};

const WorldGrid = memo(function WorldGrid({worlds, activeWorldId, switchingWorldId, onEditWorld, onSelectWorld, onViewGraph}: WorldGridProps) {
    const [graphReadiness,setGraphReadiness]=useState<Record<string,GraphReadiness>>({});
    const [graphCheckVersion,setGraphCheckVersion]=useState(0);
    useEffect(()=>{
        let cancelled=false;
        setGraphReadiness(Object.fromEntries(worlds.map(world=>[world.id,world.graphEnabled===true?{worldId:world.id,enabled:true,readiness:"preparing",queryable:false,stale:false,knowledgeStatus:"",knowledgeNodeCount:0,knowledgeNoteCount:0}:{worldId:world.id,enabled:false,readiness:"disabled",queryable:false,stale:false,knowledgeStatus:"",knowledgeNodeCount:0,knowledgeNoteCount:0}])));
        void Promise.all(worlds.filter(world=>world.graphEnabled===true).map(async world=>{
            try {
                const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(world.id)}/graph?summary=1`,{credentials:"include"});
                const data=await response.json().catch(()=>({})) as Partial<GraphReadiness>;
                if(!response.ok)throw new Error(typeof data.message==="string"?data.message:"Graph status could not be loaded.");
                if(!cancelled)setGraphReadiness(current=>({...current,[world.id]:{worldId:world.id,enabled:data.enabled===true,readiness:data.readiness||"error",queryable:data.queryable===true,stale:data.stale===true,knowledgeStatus:typeof data.knowledgeStatus==="string"?data.knowledgeStatus:"",knowledgeNodeCount:Number(data.knowledgeNodeCount)||0,knowledgeNoteCount:Number(data.knowledgeNoteCount)||0,...(data.progress?{progress:data.progress}:{}),...(typeof data.revision==="string"?{revision:data.revision}:{}),...(typeof data.sourceRevision==="string"?{sourceRevision:data.sourceRevision}:{}),...(typeof data.graphRevision==="string"?{graphRevision:data.graphRevision}:{}),...(data.managedMarkdown?{managedMarkdown:data.managedMarkdown}:{}),...(typeof data.message==="string"?{message:data.message}:{})}}));
            } catch(error) {
                if(!cancelled)setGraphReadiness(current=>({...current,[world.id]:{worldId:world.id,enabled:true,readiness:"error",queryable:false,stale:false,knowledgeStatus:"",knowledgeNodeCount:0,knowledgeNoteCount:0,message:error instanceof Error?error.message:"Graph status could not be loaded."}}));
            }
        }));
        return()=>{cancelled=true;};
    },[worlds,graphCheckVersion]);
    return <section className="worldGrid" aria-label="Pianeti disponibili">
        {worlds.map(world => {
            const active = world.id === activeWorldId;
            const graph = graphReadiness[world.id];
            const graphIsQueryable = world.graphEnabled && graph?.queryable === true && graph.stale !== true;
            const graphStatus = !world.graphEnabled ? "Graph disabled" : graph?.readiness === "indexing" ? `Indexing sources${graph.progress?.processed !== undefined ? ` · ${graph.progress.processed}${graph.progress.total ? ` / ${graph.progress.total}` : " processed"}` : "…"}` : graph?.readiness === "preparing" ? "Preparing knowledge…" : graph?.readiness === "partial" ? "" : graph?.readiness === "ready" ? "Knowledge graph ready" : graph?.readiness === "stale" || graph?.stale ? "Graph needs an update" : graph?.readiness === "empty" ? "No graph data yet" : graph?.readiness === "error" ? "Graph status unavailable" : "Checking graph…";
            return <article key={world.id} className={`worldCard${active ? " selected" : ""}`} style={{"--planet-color": world.color} as CSSProperties}>
                <div className="worldCardTop"><span>{active ? "AMBIENTE ATTIVO" : "AMBIENTE"}</span><button type="button" onClick={() => onEditWorld(world)} title={`Modifica ${world.name}`} aria-label={`Modifica ${world.name}`}><Pencil size={14}/></button></div>
                <Planet world={world} large/>
                <h2>{world.name}</h2>
                <div className="worldCardMeta"><span><Sparkles size={12}/>{world.aiEnabled ? "AI disponibile" : "AI disattivata"}</span><span>{world.agents.filter(agent => agent.enabled).length + world.skills.filter(skill => skill.enabled).length} agenti/skill</span>{world.emailAccount&&<span className="worldCardEmailAccount"><Mail size={12}/>{world.emailAccount.provider === "gmail" ? "Gmail" : "Outlook"} · {world.emailAccount.email || "account linked"}</span>}</div>
                <div className="worldCardActions"><button type="button" className="worldSelectButton" onClick={() => onSelectWorld(world.id)} disabled={Boolean(switchingWorldId)}>{switchingWorldId === world.id ? <><LoaderCircle className="worldInlineSpinner" size={15}/>Preparazione…</> : active ? <><Check size={15}/>Sei qui</> : <>Enter planet <span>→</span></>}</button>{graphIsQueryable ? <><button type="button" className="worldGraphButton" onClick={() => onViewGraph(world)} title={`View ${world.name} graph`}><Network size={15}/>View graph</button>{graphStatus && <small className={`worldGraphReadiness ${graph?.readiness||"ready"}`} role="status">{graphStatus}</small>}</> : graph?.readiness === "error" ? <span className="worldGraphUnavailable"><small className="worldGraphReadiness error" role="status" title={graph.message}>Graph status unavailable</small><button type="button" onClick={() => setGraphCheckVersion(version=>version+1)}>Retry</button></span> : graphStatus && <small className={`worldGraphReadiness ${graph?.readiness||"preparing"}`} role="status">{graphStatus}</small>}</div>
            </article>;
        })}
    </section>;
});

export default function ChangeWorld({worlds, activeWorldId, userId, storageScope, onSyncObsidian, onSelect, onViewGraph, onInvokeAssistant, switchError, onBack, onAdd, onUpdate, onDelete, initialEditWorldId}: Props) {
    const [editingWorld, setEditingWorld] = useState<WorkspaceWorld | null>(null);
    const initialEditStarted=useRef(false);
    const [digestAccounts, setDigestAccounts] = useState<{gmail:DigestAccount[];outlook:DigestAccount[]}>({gmail:[],outlook:[]});
    const [digestAccountsBusy, setDigestAccountsBusy] = useState(false);
    const [emailAccountConflict, setEmailAccountConflict] = useState(false);
    const [worldEmailAccounts, setWorldEmailAccounts] = useState<WorldEmailCatalog>({gmail:[],outlook:[]});
    const [worldEmailCatalogError, setWorldEmailCatalogError] = useState("");
    const [emailProviderChoice, setEmailProviderChoice] = useState<"gmail"|"outlook"|"">("");
    const [obsidianSyncBusy, setObsidianSyncBusy] = useState(false);
    const [obsidianStatus, setObsidianStatus] = useState("");
    const [obsidianThreads, setObsidianThreads] = useState<ObsidianThread[]>([]);
    const [obsidianThreadNextPageToken, setObsidianThreadNextPageToken] = useState("");
    const [obsidianThreadsBusy, setObsidianThreadsBusy] = useState(false);
    const [obsidianThreadsMessage, setObsidianThreadsMessage] = useState("");
    const [obsidianFolders, setObsidianFolders] = useState<ObsidianFolderOption[]>([]);
    const [obsidianFileTypes, setObsidianFileTypes] = useState<string[]>([]);
    const [obsidianFoldersBusy, setObsidianFoldersBusy] = useState(false);
    const [obsidianFoldersMessage, setObsidianFoldersMessage] = useState("");
    const [knowledgeCandidates,setKnowledgeCandidates]=useState<KnowledgeCandidate[]>([]);
    const [candidateCount,setCandidateCount]=useState(0);
    const [selectedCandidateCount,setSelectedCandidateCount]=useState(0);
    const [maxFiles,setMaxFiles]=useState<number|null>(null);
    const [maxCandidates,setMaxCandidates]=useState(200);
    const [knowledgeCandidateSearch,setKnowledgeCandidateSearch]=useState("");
    const [knowledgeCandidatesMessage,setKnowledgeCandidatesMessage]=useState("");
    const [digestRuntime, setDigestRuntime] = useState<DigestRuntime>({});
    const [digestPreview, setDigestPreview] = useState("");
    const [digestPreviewBusy, setDigestPreviewBusy] = useState(false);
    const [digestTestBusy, setDigestTestBusy] = useState(false);
    const [agentName, setAgentName] = useState("");
    const [skillName, setSkillName] = useState("");
    const [deletingWorld, setDeletingWorld] = useState(false);
    const [switchingWorldId, setSwitchingWorldId] = useState<string | null>(null);
    const [invoking, setInvoking] = useState<{worldId: string; profileId: string; kind: "agent" | "skill"; name: string; instructions: string; model: WorldAssistantModel; capabilities: WorldAssistantCapability[]} | null>(null);
    const [invokePrompt, setInvokePrompt] = useState("");
    const [invokeResult, setInvokeResult] = useState("");
    const [invokeError, setInvokeError] = useState("");
    const [invokeBusy, setInvokeBusy] = useState(false);
    const [postItSaved, setPostItSaved] = useState(false);
    const [saveError, setSaveError] = useState("");

    const beginEditWorld = useCallback((world: WorkspaceWorld) => {setDigestAccountsBusy(true);setObsidianFoldersBusy(true);setWorldEmailCatalogError("");setWorldEmailAccounts({gmail:[],outlook:[]});setEmailAccountConflict(false);setEmailProviderChoice(world.emailAccount?.provider||"");setDigestRuntime({});setDigestPreview("");setObsidianStatus("");setEditingWorld({...world, activityNotifications:normalizeActivityNotifications(world.activityNotifications)});}, []);
    useEffect(()=>{if(!initialEditWorldId||initialEditStarted.current)return;const target=worlds.find(item=>item.id===initialEditWorldId);if(!target)return;initialEditStarted.current=true;const timer=window.setTimeout(()=>beginEditWorld(target),0);return()=>window.clearTimeout(timer);},[initialEditWorldId,worlds,beginEditWorld]);
    const digestEditingWorldId = editingWorld?.id;
    useEffect(()=>{if(!digestEditingWorldId)return;let cancelled=false;const timer=window.setTimeout(()=>{if(cancelled)return;setKnowledgeCandidatesMessage("Loading candidate metadata…");setKnowledgeCandidates([]);setCandidateCount(0);setSelectedCandidateCount(0);setMaxFiles(null);setMaxCandidates(200);void fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(digestEditingWorldId)}/knowledge`,{credentials:"include"}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||"Candidate file list unavailable.");if(!cancelled){const candidates=Array.isArray(data.candidates)?data.candidates.filter((item:unknown):item is KnowledgeCandidate=>Boolean(item&&typeof item==="object"&&typeof (item as KnowledgeCandidate).id==="string"&&typeof (item as KnowledgeCandidate).title==="string")).slice(0,500):[];const limits=data.limits&&typeof data.limits==="object"?data.limits as Record<string,unknown>:{};const safeCount=(value:unknown,fallback:number)=>typeof value==="number"&&Number.isFinite(value)?Math.max(0,Math.floor(value)):fallback;setKnowledgeCandidates(candidates);setCandidateCount(safeCount(data.candidateCount,candidates.length));setSelectedCandidateCount(safeCount(data.selectedCandidateCount,candidates.filter((item:KnowledgeCandidate)=>item.selected!==false).length));setMaxFiles(typeof limits.maxFiles==="number"&&Number.isFinite(limits.maxFiles)?Math.max(0,Math.floor(limits.maxFiles)):null);setMaxCandidates(Math.min(500,safeCount(limits.maxCandidates,200)));setKnowledgeCandidatesMessage("");}}).catch(reason=>{if(!cancelled){setKnowledgeCandidates([]);setCandidateCount(0);setSelectedCandidateCount(0);setMaxFiles(null);setMaxCandidates(200);setKnowledgeCandidatesMessage(reason instanceof Error?reason.message:"Candidate file list unavailable.");}});},0);return()=>{cancelled=true;window.clearTimeout(timer);};},[digestEditingWorldId]);

    useEffect(() => {
        const worldId = digestEditingWorldId;
        if (!worldId) return;
        const controller = new AbortController();
        void Promise.all([
            fetch(`${API_BASE_URL}/email/gmail/accounts`, {credentials:"include", signal:controller.signal}).then(async response => {if(!response.ok)throw new Error("Gmail connection status unavailable");return (await response.json() as {accounts?:DigestAccount[]}).accounts || []; }),
            fetch(`${API_BASE_URL}/email/outlook/accounts`, {credentials:"include", signal:controller.signal}).then(async response => response.ok ? (await response.json() as {accounts?:DigestAccount[]}).accounts || [] : []),
            fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(worldId)}/activity-notifications`, {credentials:"include", signal:controller.signal}).then(async response => response.ok ? await response.json() as {runtime?:DigestRuntime;config?:WorldActivityNotifications;nextDigestAt?:string|null} : {}),
            fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(worldId)}`, {credentials:"include", signal:controller.signal}).then(async response => {if(!response.ok)throw new Error("Gmail account catalog unavailable");return await response.json() as {world?:Partial<WorkspaceWorld>;emailAccountConflict?:boolean;emailAccounts?:WorldEmailCatalog};}),
            fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/obsidian`, {credentials:"include", signal:controller.signal}).then(async response => response.ok ? await response.json() as {config?:WorldObsidianSettings;openSupported?:boolean;uri?:string;status?:string} : {}),
            fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/obsidian/folders`, {credentials:"include", signal:controller.signal}).then(async response => response.ok ? await response.json() as {folders?:ObsidianFolderOption[];fileTypes?:string[]} : {})
        ]).then(([gmail,outlook,status,worldData,obsidianData,folderData]) => {
            if (controller.signal.aborted) return;
            setDigestAccounts({gmail:Array.isArray(gmail)?gmail:[],outlook:Array.isArray(outlook)?outlook:[]});
            setDigestRuntime({...status.runtime,nextDigestAt:status.nextDigestAt});
            if (status.config) setEditingWorld(current => current?.id === worldId ? {...current, activityNotifications:normalizeActivityNotifications(status.config)} : current);
            if(worldData.world){
                setEmailAccountConflict(worldData.emailAccountConflict===true);
                setWorldEmailAccounts({gmail:Array.isArray(worldData.emailAccounts?.gmail)?worldData.emailAccounts.gmail:[],outlook:Array.isArray(worldData.emailAccounts?.outlook)?worldData.emailAccounts.outlook:[]});
                setWorldEmailCatalogError("");
                if(worldData.world.emailAccount!==undefined)setEmailProviderChoice(worldData.world.emailAccount?.provider||"");
                setEditingWorld(current=>current?.id===worldId?{...current,...(worldData.world?.emailAccount!==undefined?{emailAccount:worldData.world.emailAccount}:{}),...(worldData.world?.treeRootMode?{treeRootMode:worldData.world.treeRootMode}:{}),...(worldData.world?.obsidian?{obsidian:worldData.world.obsidian}:{})}:current);
            }
            if(obsidianData.config){setObsidianStatus(obsidianData.status||obsidianData.config.status||"");setEditingWorld(current=>current?.id===worldId?{...current,obsidian:obsidianData.config}:current);}
            setObsidianFolders(Array.isArray(folderData.folders)?folderData.folders:[]);
            setObsidianFileTypes(Array.isArray(folderData.fileTypes)?folderData.fileTypes:[]);
            setObsidianFoldersMessage(Array.isArray(folderData.folders)&&folderData.folders.length?"":"No physical folders are configured for this planet's dashboard.");
            setDigestAccountsBusy(false);
        }).catch(() => { if (!controller.signal.aborted) {setDigestAccounts({gmail:[],outlook:[]});setWorldEmailAccounts({gmail:[],outlook:[]});setWorldEmailCatalogError("Could not load the local Gmail account list. Open Dashboard → Gmail to review account setup, then return to this planet’s settings and retry.");setObsidianFoldersMessage("Could not load configured folders for this planet.");} }).finally(() => { if (!controller.signal.aborted) {setDigestAccountsBusy(false);setObsidianFoldersBusy(false);} });
        return () => controller.abort();
    }, [digestEditingWorldId]);

    const listedGmailAccounts = [...worldEmailAccounts.gmail];
    for (const account of digestAccounts.gmail) {
        if (!listedGmailAccounts.some(item => item.blockIds?.includes(account.blockId) || item.blockId === account.blockId)) {
            listedGmailAccounts.push({blockId:account.blockId,blockIds:[account.blockId],email:account.email,originWorldNames:[]});
        }
    }

    useEffect(() => {
        const worldId=editingWorld?.id;
        if(!worldId)return;
        const onSyncStatus=(event:Event)=>{
            const detail=(event as CustomEvent<{worldId?:string;config?:WorldObsidianSettings;result?:{status?:string;lastSyncAt?:string;written?:number;unchanged?:number;conflicts?:number;warnings?:string[]}}>).detail;
            if(detail?.worldId!==worldId)return;
            if(detail.config)setEditingWorld(current=>current?.id===worldId?{...current,obsidian:detail.config}:current);
            const result=detail.result;
            if(result)setObsidianStatus(`${result.status||"Vault synchronized"}: ${result.written||0} written, ${result.unchanged||0} unchanged, ${result.conflicts||0} conflicts${result.warnings?.length?`. ${result.warnings.join(" ")}`:"."}`);
        };
        window.addEventListener("folderrocket:obsidian-sync-status",onSyncStatus);
        return()=>window.removeEventListener("folderrocket:obsidian-sync-status",onSyncStatus);
    },[editingWorld?.id]);

    const obsidianWorldId = editingWorld?.id || "";
    const obsidianEmailProvider = editingWorld?.emailAccount?.provider || "";
    const obsidianEmailBlockId = editingWorld?.emailAccount?.blockId || "";
    const obsidianEmailEnabled = editingWorld?.obsidian?.sourceSelection?.email !== false;
    const savedEmailAccount = worlds.find(world=>world.id===obsidianWorldId)?.emailAccount;
    const obsidianAccountSelectionSaved = savedEmailAccount?.provider===obsidianEmailProvider&&savedEmailAccount?.blockId===obsidianEmailBlockId;
    useEffect(() => {
        if (!obsidianWorldId || !obsidianEmailBlockId || obsidianEmailProvider !== "gmail" || !obsidianEmailEnabled) {
            // Resetting derived picker state when its external account/source inputs change.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setObsidianThreads([]);
            setObsidianThreadNextPageToken("");
            setObsidianThreadsBusy(false);
            setObsidianThreadsMessage(obsidianEmailProvider === "outlook" && obsidianEmailEnabled
                ? "Outlook conversation selection is not supported in this build."
                : "Choose this planet’s Gmail account to select conversations.");
            return;
        }
        if (!obsidianAccountSelectionSaved) {
            setObsidianThreads([]);
            setObsidianThreadNextPageToken("");
            setObsidianThreadsBusy(false);
            setObsidianThreadsMessage("Save the selected Gmail account, then reopen settings to choose its conversations.");
            return;
        }
        const controller = new AbortController();
        setObsidianThreadsBusy(true);
        setObsidianThreadsMessage("Loading Gmail conversation list…");
        const params = new URLSearchParams({blockId:obsidianEmailBlockId});
        void fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(obsidianWorldId)}/email/conversations?${params}`, {credentials:"include",signal:controller.signal})
            .then(async response => {
                const data = await response.json().catch(() => ({})) as {threads?:ObsidianThread[];nextPageToken?:string;message?:string};
                if (!response.ok) throw new Error(data.message || "Gmail conversations could not be listed.");
                if (controller.signal.aborted) return;
                setObsidianThreads(Array.isArray(data.threads) ? data.threads.filter(item => item.blockId === obsidianEmailBlockId) : []);
                setObsidianThreadNextPageToken(data.nextPageToken || "");
                setObsidianThreadsMessage("");
            })
            .catch(reason => {if (!controller.signal.aborted) {setObsidianThreads([]);setObsidianThreadsMessage(reason instanceof Error ? reason.message : "Gmail conversations could not be listed.");}})
            .finally(() => {if (!controller.signal.aborted) setObsidianThreadsBusy(false);});
        return () => controller.abort();
    }, [obsidianWorldId,obsidianEmailProvider,obsidianEmailBlockId,obsidianEmailEnabled,obsidianAccountSelectionSaved]);

    async function loadMoreObsidianThreads() {
        if (!editingWorld || !obsidianThreadNextPageToken || obsidianThreadsBusy) return;
        const controller = new AbortController();
        setObsidianThreadsBusy(true); setObsidianThreadsMessage("");
        try {
            const params = new URLSearchParams({blockId:editingWorld.emailAccount?.blockId||"",pageToken:obsidianThreadNextPageToken});
            const response = await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(editingWorld.id)}/email/conversations?${params}`,{credentials:"include",signal:controller.signal});
            const data = await response.json().catch(() => ({})) as {threads?:ObsidianThread[];nextPageToken?:string;message?:string};
            if (!response.ok) throw new Error(data.message || "More Gmail conversations could not be loaded.");
            const blockId = editingWorld.emailAccount?.blockId;
            setObsidianThreads(current=>[...current,...(Array.isArray(data.threads)?data.threads.filter(item=>item.blockId===blockId):[])]);
            setObsidianThreadNextPageToken(data.nextPageToken||"");
        } catch(reason) {setObsidianThreadsMessage(reason instanceof Error?reason.message:"More Gmail conversations could not be loaded.");}
        finally {setObsidianThreadsBusy(false);}
    }

    async function saveWorld() {
        if (!editingWorld) return;
        const name = editingWorld.name.trim();
        if (!name) return;
        if (worlds.some(world => world.id !== editingWorld.id && world.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
            window.alert("Esiste già un pianeta con questo nome.");
            return;
        }
        setSaveError("");
        try {
            const previousWorld=worlds.find(world=>world.id===editingWorld.id);
            const obsidian = {enabled: editingWorld.obsidian?.enabled === true, autoSync:editingWorld.obsidian?.autoSync===true, vaultPath: editingWorld.obsidian?.vaultPath || "", sourceSelection: {...DEFAULT_OBSIDIAN_SOURCE_SELECTION, ...editingWorld.obsidian?.sourceSelection, version: 2 as const}};
            const obsidianResponse = await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(editingWorld.id)}/obsidian`, {method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(obsidian)});
            const obsidianData = await obsidianResponse.json().catch(() => ({})) as {config?:WorldObsidianSettings;message?:string};
            if (!obsidianResponse.ok) throw new Error(obsidianData.message || "Obsidian settings could not be saved.");
            if (obsidianData.config) setEditingWorld(current => current?.id === editingWorld.id ? {...current,obsidian:obsidianData.config} : current);
            await onUpdate({...editingWorld, name});
            await reindexGraphForSourceChange({...editingWorld,name,obsidian},previousWorld);
            setEditingWorld(null);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Non è stato possibile salvare il pianeta.");
        }
    }

    function updateDigest(changes: Partial<WorldActivityNotifications>) {
        setEditingWorld(current => current ? {...current, activityNotifications:{...normalizeActivityNotifications(current.activityNotifications), ...changes}} : current);
    }

    function chooseWorldEmailAccount(provider: "gmail" | "outlook", blockId: string) {
        if (!editingWorld) return;
        if (!blockId) {setEditingWorld({...editingWorld,emailAccount:null,obsidian:{enabled:false,vaultPath:"",...editingWorld.obsidian,sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,...editingWorld.obsidian?.sourceSelection,threadMode:"all",threadIds:[]}}});setEmailAccountConflict(false);return;}
        const account = worldEmailAccounts[provider].find(item=>item.blockId===blockId||item.blockIds?.includes(blockId));
        if (!account) return;
        const emailAccount={provider,blockId,email:account.email};
        const changed=editingWorld.emailAccount?.provider!==provider||editingWorld.emailAccount?.blockId!==blockId;
        setEditingWorld({...editingWorld,emailAccount, ...(changed?{obsidian:{enabled:false,vaultPath:"",...editingWorld.obsidian,sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,...editingWorld.obsidian?.sourceSelection,threadMode:"all",threadIds:[]}}}:{})});
        setEmailAccountConflict(false);
    }

    function chooseWorldEmailProvider(provider: "gmail"|"outlook"|"") {
        if (!editingWorld) return;
        setEmailProviderChoice(provider);
        if (!provider || editingWorld.emailAccount?.provider!==provider) {
            setEditingWorld({...editingWorld,emailAccount:null,obsidian:{enabled:false,vaultPath:"",...editingWorld.obsidian,sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,...editingWorld.obsidian?.sourceSelection,threadMode:"all",threadIds:[]}}});
        }
    }

    function updateObsidian(changes: Partial<WorldObsidianSettings>) {
        setEditingWorld(current => current ? {...current,obsidian:{enabled:false,vaultPath:"",...current.obsidian,...changes}} : current);
    }

    function updateObsidianSource(key: ObsidianSourceKey, enabled: boolean) {
        const selection = {...DEFAULT_OBSIDIAN_SOURCE_SELECTION, ...editingWorld?.obsidian?.sourceSelection, version:2 as const, [key]:enabled};
        updateObsidian({sourceSelection:selection});
    }

    function updateObsidianThreads(changes: Partial<Pick<WorldObsidianSourceSelection,"threadMode"|"threadIds">>) {
        updateObsidian({sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,...editingWorld?.obsidian?.sourceSelection,...changes,version:2}});
    }

    function updateObsidianFolders(changes:Partial<Pick<WorldObsidianSourceSelection,"folderMode"|"folderIds"|"fileTypeMode"|"fileTypes"|"includeSubfolders">>) {
        updateObsidian({sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,...editingWorld?.obsidian?.sourceSelection,...changes,version:2}});
    }

    async function reindexGraphForSourceChange(nextWorld:WorkspaceWorld,previousWorld?:WorkspaceWorld) {
        if(!nextWorld.graphEnabled)return;
        const before=JSON.stringify(previousWorld?.obsidian?.sourceSelection||DEFAULT_OBSIDIAN_SOURCE_SELECTION);
        const after=JSON.stringify(nextWorld.obsidian?.sourceSelection||DEFAULT_OBSIDIAN_SOURCE_SELECTION);
        if(before===after)return;
        try {
            const scope=activeWorldStorageScope(userId,nextWorld.id);
            const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(nextWorld.id)}/graph/index`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({snapshot:readWorldActivitySnapshot(scope)})});
            const data=await response.json().catch(()=>({})) as {message?:string};
            if(!response.ok&&response.status!==202)throw new Error(data.message||"Graph reindexing could not be started.");
            setObsidianStatus("Planet graph source selection saved; reindexing started.");
        } catch(error) {setObsidianStatus(error instanceof Error?`Sources were saved, but graph reindexing could not start: ${error.message}`:"Sources were saved, but graph reindexing could not start.");}
    }

    async function syncObsidianVault() {
        if (!editingWorld || obsidianSyncBusy) return;
        setObsidianSyncBusy(true);setObsidianStatus("Syncing vault…");setSaveError("");
        try {
            const previousWorld=worlds.find(world=>world.id===editingWorld.id);
            const saveResponse=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(editingWorld.id)}/obsidian`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({...editingWorld.obsidian,autoSync:editingWorld.obsidian?.autoSync===true,sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,...editingWorld.obsidian?.sourceSelection,version:2}})});
            const saveData=await saveResponse.json().catch(()=>({})) as {message?:string};
            if(!saveResponse.ok)throw new Error(saveData.message||"Obsidian settings could not be saved.");
            await reindexGraphForSourceChange(editingWorld,previousWorld);
            const signature=JSON.stringify({sourceSelection:JSON.stringify(editingWorld.obsidian?.sourceSelection||{}),emailProvider:editingWorld.emailAccount?.provider||"",emailBlockId:editingWorld.emailAccount?.blockId||""});
            const data=await onSyncObsidian(editingWorld.id,signature);
            if(!data.ok) {
                if(data.code==="KNOWLEDGE_INCOMPLETE") {
                    const blockers=data.reasonSummary?.blockers?.filter(item=>item&&item.label&&item.action).slice(0,8)||[];
                    const specific=blockers.map(item=>`${item.label}: ${item.action}`).join(" · ");
                    const status=specific||data.message||"Selected Obsidian sources are not ready. The last complete vault revision is preserved.";
                    setObsidianStatus(status);
                    window.dispatchEvent(new CustomEvent("folderrocket:obsidian-sync-status",{detail:{worldId:editingWorld.id,blocked:true,readinessFingerprint:data.readinessFingerprint,reasonSummary:data.reasonSummary,message:status}}));
                    return;
                }
                throw new Error(data.message||"The vault could not be synchronized.");
            }
            if(data.config){setEditingWorld(current=>current?.id===editingWorld.id?{...current,obsidian:data.config}:current);}
            const result=data.result;
            setObsidianStatus(result?.warnings?.length ? `${result.status||"Synced"}: ${result.written||0} written, ${result.unchanged||0} unchanged, ${result.conflicts||0} conflicts. ${result.warnings.join(" ")}` : `${result?.status||"Vault synchronized"}: ${result?.written||0} written, ${result?.unchanged||0} unchanged, ${result?.conflicts||0} conflicts.`);
            window.dispatchEvent(new CustomEvent("folderrocket:obsidian-sync-status",{detail:{worldId:editingWorld.id,config:data.config,result:data.result,manual:true}}));
        } catch(error) {const message=error instanceof Error?error.message:"The vault could not be synchronized.";setObsidianStatus(message);setSaveError(message);}
        finally {setObsidianSyncBusy(false);}
    }

    async function openObsidianVault() {
        if (!editingWorld?.obsidian?.vaultPath.trim()) return;
        if(window.folderRocketDesktop?.openObsidianVault){
            const opened=await window.folderRocketDesktop.openObsidianVault({worldId:editingWorld.id,vaultPath:editingWorld.obsidian.vaultPath.trim()});
            setObsidianStatus(opened.opened?"Open request sent to Obsidian.":opened.message||"Obsidian could not be opened. Check that it is installed and the vault path is valid.");
            return;
        }
        const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(editingWorld.id)}/obsidian`,{credentials:"include"});
        const data=await response.json().catch(()=>({})) as {uri?:string;openSupported?:boolean;message?:string};
        if(!response.ok||!data.uri){setObsidianStatus(data.message||"Opening this vault is not supported here. Use the Obsidian desktop app to open its folder.");return;}
        if(window.folderRocketDesktop){const opened=await window.folderRocketDesktop.openExternal(data.uri);setObsidianStatus(opened?"Open request sent to Obsidian.":"Obsidian did not accept the vault link.");}
        else window.location.href=data.uri;
    }

    async function previewActivityDigest() {
        if (!editingWorld) return;
        const config = normalizeActivityNotifications(editingWorld.activityNotifications);
        setDigestPreviewBusy(true); setDigestPreview(""); setSaveError("");
        try {
            const response = await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(editingWorld.id)}/activity-notifications/preview`, {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({worldName:editingWorld.name,config,snapshot:selectWorldActivitySnapshot(readWorldActivitySnapshot(storageScope),config.sources)})});
            const data = await response.json().catch(() => ({})) as {preview?:{subject?:string;text?:string};message?:string};
            if (!response.ok) throw new Error(data.message || "Could not build preview.");
            setDigestPreview(`${data.preview?.subject || "FolderRocket update"}\n\n${data.preview?.text || "No preview content."}`);
        } catch (error) { setSaveError(error instanceof Error ? error.message : "Could not build preview."); }
        finally { setDigestPreviewBusy(false); }
    }

    async function sendDigestTest() {
        if (!editingWorld || digestTestBusy) return;
        const config = normalizeActivityNotifications(editingWorld.activityNotifications);
        if (!window.confirm(`Send one real test email to ${config.recipient || "the configured recipient"}?`)) return;
        setDigestTestBusy(true); setSaveError("");
        try {
            const response = await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(editingWorld.id)}/activity-notifications/test`, {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({worldName:editingWorld.name,config,snapshot:selectWorldActivitySnapshot(readWorldActivitySnapshot(storageScope),config.sources)})});
            const data = await response.json().catch(() => ({})) as {message?:string};
            if (!response.ok) throw new Error(data.message || "Test email could not be sent.");
            const sentAt = new Date().toISOString();
            setDigestRuntime(current => ({...current,lastStatus:"test-sent",lastSentAt:sentAt,history:[...(current.history || []),{at:sentAt,kind:"test" as const,status:"sent"}].slice(-25)}));
        } catch (error) { setSaveError(error instanceof Error ? error.message : "Test email could not be sent."); }
        finally { setDigestTestBusy(false); }
    }

    async function authorizeOutlookSending() {
        if (!editingWorld) return;
        const config = normalizeActivityNotifications(editingWorld.activityNotifications);
        const blockId = config.senderProvider === "outlook" ? config.senderBlockId : "";
        if (!blockId) { setSaveError("Select an Outlook account first."); return; }
        try {
            const response = await fetch(`${API_BASE_URL}/auth/outlook/start?blockId=${encodeURIComponent(blockId)}&send=1&format=json`, {credentials:"include",headers:{Accept:"application/json"}});
            const data = await response.json().catch(() => ({})) as {authorizationUrl?:string;message?:string};
            if (!response.ok || !data.authorizationUrl) throw new Error(data.message || "Microsoft consent could not start.");
            const opened = window.folderRocketDesktop ? await window.folderRocketDesktop.openExternal(data.authorizationUrl) : false;
            if (!opened) { const popup = window.open(data.authorizationUrl,"_blank","noopener,noreferrer"); if (!popup) window.location.assign(data.authorizationUrl); }
        } catch (error) { setSaveError(error instanceof Error ? error.message : "Microsoft consent could not start."); }
    }

    function addAgent() {
        if (!editingWorld || !agentName.trim()) return;
        const agent: WorldAgentProfile = {id: crypto.randomUUID(), name: agentName.trim(), description: "", instructions: "", enabled: true, model: "gpt-4.1-mini", capabilities: ["search-files"]};
        setEditingWorld({...editingWorld, agents: [...editingWorld.agents, agent]});
        setAgentName("");
    }

    function addSkill() {
        if (!editingWorld || !skillName.trim()) return;
        const skill: WorldSkillProfile = {id: crypto.randomUUID(), name: skillName.trim(), description: "", instructions: "", enabled: true, model: "gpt-4.1-mini", capabilities: []};
        setEditingWorld({...editingWorld, skills: [...editingWorld.skills, skill]});
        setSkillName("");
    }

    function updateAgent(agentId: string, changes: Partial<WorldAgentProfile>) {
        if (!editingWorld) return;
        setEditingWorld({...editingWorld, agents: editingWorld.agents.map(agent => agent.id === agentId ? {...agent, ...changes} : agent)});
    }

    function updateSkill(skillId: string, changes: Partial<WorldSkillProfile>) {
        if (!editingWorld) return;
        setEditingWorld({...editingWorld, skills: editingWorld.skills.map(skill => skill.id === skillId ? {...skill, ...changes} : skill)});
    }

    const selectPlanet = useCallback(async (worldId: string) => {
        if (switchingWorldId) return;
        setSwitchingWorldId(worldId);
        try { await onSelect(worldId); }
        finally { setSwitchingWorldId(null); }
    }, [onSelect, switchingWorldId]);

    async function runAssistant() {
        if (!invoking || !invokePrompt.trim() || invokeBusy) return;
        setInvokeBusy(true);
        setInvokeError("");
        setInvokeResult("");
        setPostItSaved(false);
        try {
            setInvokeResult(await onInvokeAssistant(invoking.worldId, invoking.profileId, invoking.kind, invoking.name, invoking.instructions, invokePrompt.trim(), invoking.model, invoking.capabilities));
        } catch (error) {
            setInvokeError(error instanceof Error ? error.message : "Impossibile richiamare l’assistente AI.");
        } finally { setInvokeBusy(false); }
    }

    function canInvoke(worldId: string, enabled: boolean) {
        return enabled && worlds.find(world => world.id === worldId)?.aiEnabled === true && activeWorldId === worldId;
    }

    async function removeWorld(world: WorkspaceWorld) {
        if (worlds.length < 2) return;
        if (!window.confirm(`Eliminare “${world.name}” e le sue impostazioni di lavoro? I file nelle cartelle non verranno eliminati.`)) return;
        setDeletingWorld(true);
        try { await onDelete(world.id); setEditingWorld(null); }
        catch (error) { window.alert(error instanceof Error ? error.message : "Impossibile eliminare il pianeta."); }
        finally { setDeletingWorld(false); }
    }

    const digestConfig = editingWorld ? normalizeActivityNotifications(editingWorld.activityNotifications) : null;
    const digestSenderAccounts = digestConfig?.senderProvider ? digestAccounts[digestConfig.senderProvider] : [];

    return <main className={editingWorld ? "changeWorldPage worldEditorOpen" : "changeWorldPage"}>
        <div className="changeWorldBackdrop" aria-hidden="true"/>
        <header className="changeWorldHeader">
            <button type="button" className="worldBackButton" onClick={onBack} disabled={Boolean(switchingWorldId)}><ArrowLeft size={16}/>Torna a FolderRocket</button>
            <div className="changeWorldTitle"><img src={folderRocketMark} alt="FolderRocket"/><div><h1>Fly to Another Planet</h1><p>Scegli l’ambiente in cui vuoi lavorare</p></div></div>
            <button type="button" className="worldAddButton" onClick={() => {setEditingWorld(onAdd());setAgentName("");setSkillName("");}} disabled={Boolean(switchingWorldId)}><CirclePlus size={16}/>Aggiungi pianeta</button>
        </header>

        {switchError && <p className="worldSwitchError" role="alert">{switchError} Puoi riprovare selezionando di nuovo il pianeta.</p>}
        <WorldGrid worlds={worlds} activeWorldId={activeWorldId} switchingWorldId={switchingWorldId} onEditWorld={beginEditWorld} onSelectWorld={selectPlanet} onViewGraph={onViewGraph}/>

        {editingWorld && <div className="worldEditorScrim" onMouseDown={event => {if (event.target === event.currentTarget) setEditingWorld(null);}}>
            <section className="worldEditor" role="dialog" aria-modal="true" aria-labelledby="worldEditorTitle">
                <header><div><Planet world={editingWorld}/><div><h2 id="worldEditorTitle">Personalizza il pianeta</h2><p>Le modifiche valgono solo in questo ambiente.</p></div></div><button type="button" className="worldEditorClose" onClick={() => setEditingWorld(null)} aria-label="Chiudi"><X size={17}/></button></header>
                <div className="worldEditorBody">
                    {saveError && <p className="worldInvokeError" role="alert">{saveError}</p>}
                    <details className="worldSettingsDisclosure" open><summary>Aspetto e grafo</summary><div className="worldSettingsDisclosureBody">
                    <label className="worldNameField">Nome del pianeta<input autoFocus maxLength={40} value={editingWorld.name} onChange={event => setEditingWorld({...editingWorld, name: event.target.value})}/></label>
                    <fieldset className="worldColorChoices"><legend>Colore</legend><div>{PLANET_COLORS.map(color => <button type="button" key={color} className={editingWorld.color === color ? "active" : ""} style={{"--swatch": color} as CSSProperties} onClick={() => setEditingWorld({...editingWorld, color})} aria-label={`Colore ${color}`} aria-pressed={editingWorld.color === color}/>)}</div><label>Personalizzato<input type="color" value={editingWorld.color} onChange={event => setEditingWorld({...editingWorld, color: event.target.value})}/></label></fieldset>
                    <fieldset className="worldStyleChoices"><legend>Planet style</legend><div>{(["planet", "ringed", "glowing", "asteroid", "black-hole", "galaxy"] as WorldPlanetStyle[]).map(style => <button type="button" key={style} className={editingWorld.style === style ? "active" : ""} aria-pressed={editingWorld.style === style} onClick={() => setEditingWorld({...editingWorld, style})}><Planet world={{...editingWorld, style}}/><span>{style === "planet" ? "Planet" : style === "ringed" ? "Ringed" : style === "glowing" ? "Star" : style === "asteroid" ? "Asteroid" : style === "black-hole" ? "Black hole" : "Galaxy"}</span></button>)}</div></fieldset>
                    {editingWorld.style === "rocky" && <p className="worldStyleLegacyNote" role="status">This saved planet still uses the Rocky style. Its appearance is retained until you choose another style.</p>}
                    <p className="worldAiAccountNote"><Sparkles size={15}/>Per attivare o disattivare l’AI per questo pianeta, entra nell’ambiente e usa AI On/Off nel menu Account.</p>
                    <label className="worldGraphEnable"><input type="checkbox" checked={editingWorld.graphEnabled === true} onChange={event => setEditingWorld({...editingWorld, graphEnabled:event.target.checked})}/><span><strong>Create planet graph</strong><small>Build a local, searchable map from this planet’s configured folders, selected email source, calendar, reminders and workspace activity. Message and document bodies are not indexed.</small></span></label>
                    </div></details>
                    <details className="worldSettingsDisclosure"><summary>Email account for this planet</summary><div className="worldSettingsDisclosureBody">
                    <section className="worldEmailAccountEditor">
                        <div><h3><Mail size={15}/>Email account for this planet</h3><p>Choose one connected account. Dashboard and Conversation will use it automatically.</p></div>
                        {emailAccountConflict&&<p className="worldEmailConflict" role="alert">This planet has multiple legacy email selections. Choose the account you want to keep; no account was selected automatically.</p>}
                        <div className="worldEmailAccountFields"><label>Provider<select value={emailProviderChoice} onChange={event=>chooseWorldEmailProvider(event.target.value as "gmail"|"outlook"|"")}><option value="">No account selected</option><option value="gmail">Gmail</option><option value="outlook">Outlook</option></select></label><label>Connected account<select value={editingWorld.emailAccount?.provider===emailProviderChoice?editingWorld.emailAccount?.blockId||"":""} disabled={!emailProviderChoice||digestAccountsBusy} onChange={event=>emailProviderChoice&&chooseWorldEmailAccount(emailProviderChoice,event.target.value)}><option value="">{digestAccountsBusy?"Loading accounts…":"Choose an account"}</option>{(emailProviderChoice?worldEmailAccounts[emailProviderChoice]:[]).map(account=>{const currentBlock=editingWorld.emailAccount?.provider===emailProviderChoice&&account.blockIds?.includes(editingWorld.emailAccount.blockId)?editingWorld.emailAccount.blockId:account.blockId;const origin=account.originWorldNames?.length?account.originWorldNames.join(", "):account.originUnknown?"origin not specified":"";return <option key={`${emailProviderChoice}:${account.email||account.blockId}`} value={currentBlock}>{account.email||currentBlock}{origin?` · ${origin}`:""}</option>;})}</select></label></div>
                        <div className="worldEmailAccountCatalog" aria-live="polite"><strong>Gmail account status</strong><p>Connection status reflects FolderRocket’s local account list; it does not verify a live Google token.</p>{worldEmailCatalogError?<p role="alert">{worldEmailCatalogError}</p>:digestAccountsBusy?<p role="status">Loading connected and planet account lists…</p>:listedGmailAccounts.length?<ul>{listedGmailAccounts.map(account=>{const selected=editingWorld.emailAccount?.provider==="gmail"&&account.blockIds?.includes(editingWorld.emailAccount.blockId);const connected=digestAccounts.gmail.some(item=>account.blockIds?.includes(item.blockId)||item.blockId===account.blockId);const otherWorlds=(account.originWorldNames||[]).filter(name=>name!==editingWorld.name);return <li key={`gmail:${account.email||account.blockId}`}><span>{account.email||account.blockId}</span><div><small className={connected?"accountConnected":"accountDisconnected"}>{connected?"Listed as connected in FolderRocket":"Not listed as connected in FolderRocket"}</small><small>{selected?"Selected for this planet":"Not selected for this planet"}</small><small>{otherWorlds.length?`Also used by: ${otherWorlds.join(", ")}`:account.originUnknown?"Other planet assignments unknown":"Not assigned to another planet"}</small></div></li>;})}</ul>:<p>No Gmail account is reported as connected. To connect one, close these settings, open Dashboard → Gmail, and use its account setup. Then return to Planet settings to select the account.</p>}{!worldEmailCatalogError&&!digestAccountsBusy&&editingWorld.emailAccount?.provider==="gmail"&&!digestAccounts.gmail.some(account=>account.blockId===editingWorld.emailAccount?.blockId)&&<p role="status">The Gmail account selected for this planet is unavailable in FolderRocket’s account list. Open Dashboard → Gmail to review or reconnect an account, then return here and choose a listed account.</p>}{!worldEmailCatalogError&&!digestAccountsBusy&&editingWorld.emailAccount?.provider!=="gmail"&&<p role="status">No Gmail account is selected for this planet. Choose a connected Gmail account above to use it here.</p>}</div>
                        {editingWorld.emailAccount&&<small className="worldEmailAccountActive">Account assigned to this planet: {editingWorld.emailAccount.email||editingWorld.emailAccount.blockId} · {editingWorld.emailAccount.provider}. The selection changes only after you choose another account above.</small>}
                    </section>
                    </div></details>
                    <details className="worldSettingsDisclosure"><summary>Obsidian vault</summary><div className="worldSettingsDisclosureBody">
                    <section className="worldObsidianEditor">
                        <div className="worldObsidianHeading"><span><BookOpen size={16}/></span><div><h3>Obsidian vault</h3><p>Synchronize selected local records into this planet’s Markdown vault.</p></div><label className="worldDigestEnable"><input type="checkbox" checked={editingWorld.obsidian?.enabled===true} onChange={event=>updateObsidian({enabled:event.target.checked})}/>Enable</label></div>
                        <label className="worldObsidianAutoSync"><input type="checkbox" checked={editingWorld.obsidian?.autoSync===true} disabled={!editingWorld.obsidian?.enabled} onChange={event=>updateObsidian({autoSync:event.target.checked})}/><span><strong>Sync automatically while working</strong><small>Debounced after local changes, when entering this planet, and every five minutes while FolderRocket is active.</small></span></label>
                        <label className="worldObsidianPath">Vault folder path<input value={editingWorld.obsidian?.vaultPath||""} maxLength={1024} onChange={event=>updateObsidian({vaultPath:event.target.value})} placeholder="Leave blank for the automatic vault location"/><small>Use a folder inside FolderRocket’s protected local workspace. Leave blank to let FolderRocket create the planet vault automatically.</small></label>
                        <details className="worldObsidianSources">
                            <summary>Sources for this planet <small>{Object.values(editingWorld.obsidian?.sourceSelection||DEFAULT_OBSIDIAN_SOURCE_SELECTION).filter(value=>value===true).length} categories selected</small></summary>
                            <div className="worldObsidianSourceActions"><button type="button" onClick={()=>updateObsidian({sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION}})}>Select all</button><button type="button" onClick={()=>updateObsidian({sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,folders:false,email:false,alerts:false,activity:false,snapshots:false,clientNotes:false,attachments:false,threadMode:"all",threadIds:[],folderMode:"selected",folderIds:[],fileTypeMode:"selected",fileTypes:[]}})}>Select none</button></div>
                            <div className="worldObsidianSourceGroups">{OBSIDIAN_SOURCE_GROUPS.map(group=><fieldset key={group.title}><legend>{group.title}</legend>{group.sources.map(source=><label key={source.id}><input type="checkbox" checked={editingWorld.obsidian?.sourceSelection?.[source.id]!==false} onChange={event=>updateObsidianSource(source.id,event.target.checked)}/><span><strong>{source.label}</strong><small>{source.detail}</small></span></label>)}{group.title==="Email"&&editingWorld.obsidian?.sourceSelection?.email!==false&&<div className="worldObsidianThreads"><strong>Gmail conversations</strong><p>{editingWorld.emailAccount?.provider==="gmail"?`Account: ${editingWorld.emailAccount.email||"selected Gmail account"}`:editingWorld.emailAccount?.provider==="outlook"?"Outlook conversation threads are not supported in this build.":"Choose a Gmail account above to select conversations."}</p>{editingWorld.emailAccount?.provider==="gmail"&&<><div className="worldObsidianThreadMode"><label><input type="radio" name={`obsidian-thread-mode-${editingWorld.id}`} checked={(editingWorld.obsidian?.sourceSelection?.threadMode||"all")==="all"} onChange={()=>updateObsidianThreads({threadMode:"all"})}/>All graph conversations</label><label><input type="radio" name={`obsidian-thread-mode-${editingWorld.id}`} checked={editingWorld.obsidian?.sourceSelection?.threadMode==="selected"} onChange={()=>updateObsidianThreads({threadMode:"selected"})}/>Select conversations</label></div>{editingWorld.obsidian?.sourceSelection?.threadMode==="selected"&&<><div className="worldObsidianThreadActions"><span>{editingWorld.obsidian.sourceSelection.threadIds.length} selected</span><button type="button" onClick={()=>updateObsidianThreads({threadIds:obsidianThreads.map(item=>item.threadId)})} disabled={!obsidianThreads.length||obsidianThreadsBusy}>Select all shown</button><button type="button" onClick={()=>updateObsidianThreads({threadIds:[]})}>Select none</button></div>{obsidianThreadsMessage&&<small className="worldObsidianThreadStatus" role="status">{obsidianThreadsBusy&&<LoaderCircle className="worldInlineSpinner" size={12}/>} {obsidianThreadsMessage}</small>}<div className="worldObsidianThreadList">{obsidianThreads.map(thread=><label key={`${thread.blockId}:${thread.threadId}`}><input type="checkbox" checked={editingWorld.obsidian?.sourceSelection?.threadIds.includes(thread.threadId)||false} onChange={event=>updateObsidianThreads({threadIds:event.target.checked?[...new Set([...(editingWorld.obsidian?.sourceSelection?.threadIds||[]),thread.threadId])]: (editingWorld.obsidian?.sourceSelection?.threadIds||[]).filter(id=>id!==thread.threadId)})}/><span><strong>{thread.subject||"(no subject)"}</strong><small>{thread.accountEmail||"Gmail"}{thread.updatedAt?` · ${new Date(thread.updatedAt).toLocaleDateString()}`:""}</small></span></label>)}</div>{obsidianThreadNextPageToken&&<button type="button" className="worldObsidianLoadMore" onClick={()=>void loadMoreObsidianThreads()} disabled={obsidianThreadsBusy}>{obsidianThreadsBusy?"Loading…":"Load more conversations"}</button>}</>}</>}</div>}</fieldset>)}</div>
                            <section className="worldObsidianGranularSelection" aria-label="Select planet folders and file types">
                                <header><div><strong>Folders and file types</strong><small>Only selected folder roots are indexed for this planet. Applications are excluded.</small></div><label><input type="checkbox" checked={editingWorld.obsidian?.sourceSelection?.includeSubfolders!==false} disabled={editingWorld.obsidian?.sourceSelection?.folders===false} onChange={event=>updateObsidianFolders({includeSubfolders:event.target.checked})}/> Include subfolders</label></header>
                                <fieldset disabled={editingWorld.obsidian?.sourceSelection?.folders===false}><legend>Dashboard folders</legend><div className="worldObsidianFolderMode"><label><input type="radio" name={`folder-mode-${editingWorld.id}`} checked={(editingWorld.obsidian?.sourceSelection?.folderMode||"all")==="all"} onChange={()=>updateObsidianFolders({folderMode:"all"})}/>All configured folders</label><label><input type="radio" name={`folder-mode-${editingWorld.id}`} checked={editingWorld.obsidian?.sourceSelection?.folderMode==="selected"} onChange={()=>updateObsidianFolders({folderMode:"selected"})}/>Choose folders</label></div>{obsidianFoldersBusy?<small role="status">Loading this planet’s configured folders…</small>:obsidianFoldersMessage?<small role="status">{obsidianFoldersMessage}</small>:<div className="worldObsidianFolderList">{obsidianFolders.map(folder=><label key={folder.id} title={folder.path}><input type="checkbox" checked={(editingWorld.obsidian?.sourceSelection?.folderMode||"all")==="all"||(editingWorld.obsidian?.sourceSelection?.folderIds||[]).includes(folder.id)} disabled={(editingWorld.obsidian?.sourceSelection?.folderMode||"all")==="all"} onChange={event=>updateObsidianFolders({folderMode:"selected",folderIds:event.target.checked?[...new Set([...(editingWorld.obsidian?.sourceSelection?.folderIds||[]),folder.id])]: (editingWorld.obsidian?.sourceSelection?.folderIds||[]).filter(id=>id!==folder.id)})}/><span>{folder.name}</span></label>)}</div>}{editingWorld.obsidian?.sourceSelection?.folderMode==="selected"&&!editingWorld.obsidian.sourceSelection.folderIds.length&&<small>Nothing selected: no configured folders or files will enter this planet graph/vault.</small>}</fieldset>
                                <fieldset disabled={editingWorld.obsidian?.sourceSelection?.folders===false}><legend>File types</legend><div className="worldObsidianFolderMode"><label><input type="radio" name={`file-types-${editingWorld.id}`} checked={(editingWorld.obsidian?.sourceSelection?.fileTypeMode||"all")==="all"} onChange={()=>updateObsidianFolders({fileTypeMode:"all"})}/>All supported types</label><label><input type="radio" name={`file-types-${editingWorld.id}`} checked={editingWorld.obsidian?.sourceSelection?.fileTypeMode==="selected"} onChange={()=>updateObsidianFolders({fileTypeMode:"selected"})}/>Choose types</label></div>{editingWorld.obsidian?.sourceSelection?.fileTypeMode==="selected"&&<div className="worldObsidianFileTypes">{OBSIDIAN_FILE_TYPES.filter(type=>!obsidianFileTypes.length||obsidianFileTypes.includes(type.id)).map(type=><label key={type.id}><input type="checkbox" checked={(editingWorld.obsidian?.sourceSelection?.fileTypes||[]).includes(type.id)} onChange={event=>updateObsidianFolders({fileTypes:event.target.checked?[...new Set([...(editingWorld.obsidian?.sourceSelection?.fileTypes||[]),type.id])]: (editingWorld.obsidian?.sourceSelection?.fileTypes||[]).filter(item=>item!==type.id)})}/>{type.label}</label>)}</div>}{editingWorld.obsidian?.sourceSelection?.fileTypeMode==="selected"&&!(editingWorld.obsidian?.sourceSelection?.fileTypes||[]).length&&<small>No file types selected: folder nodes remain, but file nodes are omitted.</small>}</fieldset>
                            </section>
                            <fieldset className="worldKnowledgeCandidatePicker"><legend>Exclude individual files from knowledge</legend><p>File names and type metadata only are shown here; file contents stay local. Excluded IDs are saved with this planet’s source selection.</p><p className="worldKnowledgeCandidateCounts" role="status">{selectedCandidateCount} selezionati / {candidateCount} candidati · Massimo per sincronizzazione: {maxFiles===null?"non disponibile":maxFiles}</p>{maxFiles!==null&&selectedCandidateCount>maxFiles&&<p className="worldKnowledgeCandidateLimit" role="status">{selectedCandidateCount-maxFiles} file selezionati oltre il limite per sincronizzazione.</p>}{candidateCount>maxCandidates&&<p className="worldKnowledgeCandidateLimit" role="status">{candidateCount-maxCandidates} candidati oltre i {maxCandidates} mostrati. Restringi cartelle o tipi di file, oppure cerca un nome per escludere i candidati visibili.</p>}<label className="worldKnowledgeCandidateSearch">Search candidate files<input value={knowledgeCandidateSearch} onChange={event=>setKnowledgeCandidateSearch(event.target.value)} placeholder="Search by file name or type"/></label>{knowledgeCandidatesMessage?<small role="status">{knowledgeCandidatesMessage}</small>:knowledgeCandidates.length===0?<small>No file candidates are currently available for this planet.</small>:<div className="worldObsidianThreadList">{knowledgeCandidates.filter(item=>`${item.title} ${item.extension||""} ${item.sourceScopeId}`.toLocaleLowerCase().includes(knowledgeCandidateSearch.trim().toLocaleLowerCase())).slice(0,maxCandidates).map(item=>{const excluded=editingWorld.obsidian?.sourceSelection?.excludedFileIds||[];return <label key={item.id}><input type="checkbox" checked={isKnowledgeCandidateSelected(item.id,excluded)} onChange={event=>{setSelectedCandidateCount(current=>Math.max(0,current+(event.target.checked?1:-1)));const next=updateKnowledgeExcludedFileIds(excluded,item.id,event.target.checked);updateObsidian({sourceSelection:{...DEFAULT_OBSIDIAN_SOURCE_SELECTION,...editingWorld.obsidian?.sourceSelection,excludedFileIds:next}});}}/><span><strong>{item.title}</strong><small>{item.extension||"Unknown type"} · {excluded.includes(item.id)?"Excluded from knowledge":item.sourceScopeId}</small></span></label>;})}</div>}</fieldset>
                        </details>
                        <div className="worldObsidianActions"><button type="button" onClick={()=>void syncObsidianVault()} disabled={!editingWorld.obsidian?.enabled||obsidianSyncBusy}><RefreshCw className={obsidianSyncBusy?"worldInlineSpinner":""} size={14}/>{obsidianSyncBusy?"Syncing…":"Sync now"}</button><button type="button" onClick={()=>void openObsidianVault()} disabled={!editingWorld.obsidian?.vaultPath.trim()}><FolderOpen size={14}/>Open in Obsidian</button></div>
                        <div className="worldObsidianSyncSummary" role="status"><strong>{obsidianStatus||editingWorld.obsidian?.status||"Not synchronized yet"}</strong><span>{editingWorld.obsidian?.lastSyncAt?`Last successful sync: ${new Date(editingWorld.obsidian.lastSyncAt).toLocaleString()}`:"No successful sync yet"}</span>{editingWorld.obsidian?.lastResult&&<span>Last result: {editingWorld.obsidian.lastResult.written||0} written · {editingWorld.obsidian.lastResult.unchanged||0} unchanged · {editingWorld.obsidian.lastResult.conflicts||0} conflicts{editingWorld.obsidian.lastResult.warnings?.length?` · ${editingWorld.obsidian.lastResult.warnings.join(" ")}`:""}</span>}</div>
                    </section>
                    </div></details>
                    <details className="worldSettingsDisclosure"><summary>Agenti del pianeta ({editingWorld.agents.length})</summary><div className="worldSettingsDisclosureBody">
                    <section className="worldAgentsEditor"><div className="worldAgentsHeading"><div><h3>Agenti del pianeta</h3><p>Profili richiamabili tramite la connessione AI condivisa.</p></div><span>{editingWorld.agents.length}</span></div>
                        <div className="worldAgentCreate"><input value={agentName} maxLength={60} onChange={event => setAgentName(event.target.value)} onKeyDown={event => {if(event.key === "Enter"){event.preventDefault();addAgent();}}} placeholder="Nome del nuovo agente"/><button type="button" onClick={addAgent} disabled={!agentName.trim()}><Plus size={14}/>Aggiungi</button></div>
                        <div className="worldAgentList">{editingWorld.agents.map(agent => <article key={agent.id}><div className="worldAgentTitle"><label><input type="checkbox" checked={agent.enabled} onChange={event => updateAgent(agent.id, {enabled: event.target.checked})}/><input aria-label="Nome agente" value={agent.name} onChange={event => updateAgent(agent.id, {name: event.target.value})}/></label><button type="button" title={`Rimuovi ${agent.name}`} aria-label={`Rimuovi ${agent.name}`} onClick={() => setEditingWorld({...editingWorld, agents: editingWorld.agents.filter(item => item.id !== agent.id)})}><Trash2 size={14}/></button></div><input className="worldProfileDescription" aria-label={`Descrizione agente ${agent.name}`} value={agent.description} maxLength={240} onChange={event => updateAgent(agent.id, {description: event.target.value})} placeholder="Descrizione breve"/><textarea value={agent.instructions} maxLength={2000} onChange={event => updateAgent(agent.id, {instructions: event.target.value})} placeholder="Descrivi ruolo, obiettivi e istruzioni dell’agente…"/><div className="worldAssistantOptions"><label>Modello condiviso<select value={agent.model||"gpt-4.1-mini"} onChange={event=>updateAgent(agent.id,{model:event.target.value as WorldAssistantModel})}><option value="gpt-4.1-mini">GPT-4.1 mini · rapido</option><option value="gpt-4.1">GPT-4.1 · avanzato</option></select></label><label><input type="checkbox" checked={(agent.capabilities||[]).includes("search-files")} onChange={event=>updateAgent(agent.id,{capabilities:event.target.checked?[...new Set([...(agent.capabilities||[]),"search-files" as const])]:agent.capabilities.filter(item=>item!=="search-files")})}/>Cerca nomi file nelle cartelle di questo pianeta</label><label><input type="checkbox" checked={(agent.capabilities||[]).includes("draft-post-it")} onChange={event=>updateAgent(agent.id,{capabilities:event.target.checked?[...new Set([...(agent.capabilities||[]),"draft-post-it" as const])]:agent.capabilities.filter(item=>item!=="draft-post-it")})}/>Consenti di salvare la risposta come post-it (con conferma)</label></div><button type="button" className="worldInvokeButton" disabled={!canInvoke(editingWorld.id, agent.enabled) || !editingWorld.aiEnabled} title={activeWorldId !== editingWorld.id ? "Entra in questo pianeta prima di richiamare l’agente" : undefined} onClick={() => {setInvoking({worldId:editingWorld.id,profileId:agent.id,kind:"agent",name:agent.name,instructions:agent.instructions,model:agent.model||"gpt-4.1-mini",capabilities:agent.capabilities||[]});setInvokePrompt("");setInvokeResult("");setInvokeError("");}}>Richiama con AI</button></article>)}{!editingWorld.agents.length && <p className="worldAgentsEmpty">Non hai ancora aggiunto agenti a questo pianeta.</p>}</div>
                    </section>
                    </div></details>
                    <details className="worldSettingsDisclosure"><summary>Skill del pianeta ({editingWorld.skills.length})</summary><div className="worldSettingsDisclosureBody">
                    <section className="worldAgentsEditor"><div className="worldAgentsHeading"><div><h3>Skill del pianeta</h3><p>Competenze e istruzioni riutilizzabili solo qui.</p></div><span>{editingWorld.skills.length}</span></div>
                        <div className="worldAgentCreate"><input value={skillName} maxLength={60} onChange={event => setSkillName(event.target.value)} onKeyDown={event => {if(event.key === "Enter"){event.preventDefault();addSkill();}}} placeholder="Nome della skill"/><button type="button" onClick={addSkill} disabled={!skillName.trim()}><Plus size={14}/>Aggiungi</button></div>
                        <div className="worldAgentList">{editingWorld.skills.map(skill => <article key={skill.id}><div className="worldAgentTitle"><label><input type="checkbox" checked={skill.enabled} onChange={event => updateSkill(skill.id, {enabled: event.target.checked})}/><input aria-label="Nome skill" value={skill.name} onChange={event => updateSkill(skill.id, {name: event.target.value})}/></label><button type="button" title={`Rimuovi ${skill.name}`} aria-label={`Rimuovi ${skill.name}`} onClick={() => setEditingWorld({...editingWorld, skills: editingWorld.skills.filter(item => item.id !== skill.id)})}><Trash2 size={14}/></button></div><input className="worldProfileDescription" aria-label={`Descrizione skill ${skill.name}`} value={skill.description} maxLength={240} onChange={event => updateSkill(skill.id, {description: event.target.value})} placeholder="Descrizione breve"/><textarea value={skill.instructions} maxLength={2000} onChange={event => updateSkill(skill.id, {instructions: event.target.value})} placeholder="Istruzioni della skill…"/><div className="worldAssistantOptions"><label>Modello condiviso<select value={skill.model||"gpt-4.1-mini"} onChange={event=>updateSkill(skill.id,{model:event.target.value as WorldAssistantModel})}><option value="gpt-4.1-mini">GPT-4.1 mini · rapido</option><option value="gpt-4.1">GPT-4.1 · avanzato</option></select></label><label><input type="checkbox" checked={(skill.capabilities||[]).includes("search-files")} onChange={event=>updateSkill(skill.id,{capabilities:event.target.checked?[...new Set([...(skill.capabilities||[]),"search-files" as const])]:skill.capabilities.filter(item=>item!=="search-files")})}/>Cerca nomi file nelle cartelle di questo pianeta</label><label><input type="checkbox" checked={(skill.capabilities||[]).includes("draft-post-it")} onChange={event=>updateSkill(skill.id,{capabilities:event.target.checked?[...new Set([...(skill.capabilities||[]),"draft-post-it" as const])]:skill.capabilities.filter(item=>item!=="draft-post-it")})}/>Consenti di salvare la risposta come post-it (con conferma)</label></div><button type="button" className="worldInvokeButton" disabled={!canInvoke(editingWorld.id, skill.enabled) || !editingWorld.aiEnabled} title={activeWorldId !== editingWorld.id ? "Entra in questo pianeta prima di richiamare la skill" : undefined} onClick={() => {setInvoking({worldId:editingWorld.id,profileId:skill.id,kind:"skill",name:skill.name,instructions:skill.instructions,model:skill.model||"gpt-4.1-mini",capabilities:skill.capabilities||[]});setInvokePrompt("");setInvokeResult("");setInvokeError("");}}>Richiama con AI</button></article>)}{!editingWorld.skills.length && <p className="worldAgentsEmpty">Non hai ancora aggiunto skill a questo pianeta.</p>}</div>
                    </section>
                    </div></details>
                    <details className="worldSettingsDisclosure"><summary>Alert and email summaries</summary><div className="worldSettingsDisclosureBody">
                    <section className="worldActivityEmailEditor">
                        <div className="worldAgentsHeading"><div><h3><BellRing size={16}/>Alert and email summaries</h3><p>Independent settings for this planet. Nothing is sent until you explicitly enable and save it.</p></div><label className="worldDigestEnable"><input type="checkbox" checked={digestConfig?.enabled === true} onChange={event => updateDigest({enabled:event.target.checked})}/>Enable scheduled emails</label></div>
                        <div className="worldDigestGrid">
                            <label>Sender provider<select value={digestConfig?.senderProvider || ""} onChange={event => updateDigest({senderProvider:event.target.value as WorldActivityNotifications["senderProvider"],senderBlockId:""})}><option value="">Choose provider</option><option value="gmail">Gmail</option><option value="outlook">Outlook</option></select></label>
                            <label>Sender account<select value={digestConfig?.senderBlockId || ""} disabled={!digestConfig?.senderProvider || digestAccountsBusy} onChange={event => updateDigest({senderBlockId:event.target.value})}><option value="">{digestAccountsBusy ? "Loading accounts…" : "Choose a connected account"}</option>{digestSenderAccounts.map(account => <option key={account.blockId} value={account.blockId}>{account.email || account.label}{account.canSend ? " · can send" : " · sending not authorized"}</option>)}</select></label>
                            <label>Recipient email<input type="email" maxLength={254} value={digestConfig?.recipient || ""} onChange={event => updateDigest({recipient:event.target.value})} placeholder="you@example.com"/></label>
                            <label>Repeat every N days<input type="number" min={1} max={30} value={digestConfig?.everyDays ?? 1} onChange={event => updateDigest({everyDays:Math.max(1,Math.min(30,Number(event.target.value)||1))})}/></label>
                            <label><Clock3 size={13}/>Local send time<input type="time" value={digestConfig?.time || "08:00"} onChange={event => updateDigest({time:event.target.value})}/></label>
                            <label><CalendarDays size={13}/>Calendar range<select value={digestConfig?.calendarWindow || "today"} onChange={event => updateDigest({calendarWindow:event.target.value as "today"|"tomorrow"|"week"})}><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">This week</option></select></label>
                        </div>
                        <fieldset className="worldDigestSources"><legend>Included sources</legend>{DIGEST_SOURCE_OPTIONS.map(source => <label key={source.id}><input type="checkbox" checked={digestConfig?.sources.includes(source.id) || false} onChange={event => updateDigest({sources:event.target.checked ? [...new Set([...(digestConfig?.sources || []),source.id])] : (digestConfig?.sources || []).filter(item => item !== source.id)})}/><span><strong>{source.label}</strong><small>{source.detail}</small></span></label>)}</fieldset>
                        {digestConfig?.senderProvider === "outlook" && digestConfig.senderBlockId && !digestSenderAccounts.find(account => account.blockId === digestConfig.senderBlockId)?.canSend && <div className="worldDigestConsent"><span>Outlook is currently connected without Mail.Send. Continue to Microsoft only if you want to grant this separate send permission.</span><button type="button" onClick={() => void authorizeOutlookSending()}><Mail size={13}/>Authorize Outlook sending</button></div>}
                        {digestConfig?.senderProvider === "gmail" && digestConfig.senderBlockId && digestSenderAccounts.find(account => account.blockId === digestConfig.senderBlockId)?.canSend === false && <p className="worldDigestHint">Reconnect this Gmail account before enabling sending; FolderRocket does not request new Google permissions automatically.</p>}
                        <div className="worldDigestActions"><button type="button" onClick={() => void previewActivityDigest()} disabled={digestPreviewBusy}>{digestPreviewBusy ? "Building preview…" : "Preview email"}</button><button type="button" onClick={() => void sendDigestTest()} disabled={digestTestBusy || !digestConfig?.senderBlockId || !digestConfig.recipient}>{digestTestBusy ? "Sending test…" : "Send test email now"}</button><span>{digestConfig?.enabled && digestRuntime.nextDigestAt ? `Next scheduled run: ${new Date(digestRuntime.nextDigestAt).toLocaleString()}` : digestRuntime.lastSentAt ? `Last send: ${new Date(digestRuntime.lastSentAt).toLocaleString()}` : digestRuntime.lastStatus ? `Status: ${digestRuntime.lastStatus}` : "No scheduled send yet"}{digestRuntime.lastError ? ` · ${digestRuntime.lastError}` : ""}</span></div>
                        {!!digestRuntime.history?.length && <ul className="worldDigestHistory" aria-label="Recent email delivery history">{digestRuntime.history.slice(-5).reverse().map((entry,index) => <li key={`${entry.at}-${index}`}><time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time><span>{entry.kind === "test" ? "Test" : "Scheduled"} · {entry.status}</span>{entry.error && <small>{entry.error}</small>}</li>)}</ul>}
                        {digestRuntime.lastError && <p className="worldDigestHint" role="status">Last send issue: {digestRuntime.lastError}</p>}
                        {digestPreview && <pre className="worldDigestPreview" aria-label="Email preview">{digestPreview}</pre>}
                        <small className="worldDigestFootnote">Scheduled delivery runs only while FolderRocket’s local backend is active. Daily Job, reminders, calendar cache and Teams browsing metadata are uploaded to this local backend only while the feature is enabled. Email and document bodies are never included. The test button sends one real email only after you confirm.</small>
                    </section>
                    </div></details>
                    <details className="worldSettingsDisclosure"><summary>Permessi futuri</summary><div className="worldSettingsDisclosureBody">
                    <section className="worldPermissionFoundation"><strong>Permessi del pianeta</strong><span>Predisposizione futura. Ruoli e regole di accesso verranno definiti in una fase successiva; al momento non viene applicata alcuna restrizione.</span></section>
                    </div></details>
                </div>
                <footer><button type="button" className="worldDeleteButton" onClick={() => void removeWorld(editingWorld)} disabled={worlds.length < 2 || deletingWorld}><Trash2 size={14}/>{deletingWorld ? "Eliminazione…" : "Elimina pianeta"}</button><span/><button type="button" className="worldCancelButton" onClick={() => setEditingWorld(null)} disabled={deletingWorld}>Annulla</button><button type="button" className="worldSaveButton" onClick={() => void saveWorld()} disabled={deletingWorld}><Check size={15}/>Salva</button></footer>
            </section>
        </div>}

        {invoking && <div className="worldInvokeScrim" onMouseDown={event => {if (event.target === event.currentTarget && !invokeBusy) setInvoking(null);}}>
            <section className="worldInvokeDialog" role="dialog" aria-modal="true" aria-labelledby="worldInvokeTitle">
                <header><div><strong id="worldInvokeTitle">Richiama {invoking.kind === "agent" ? "agente" : "skill"}: {invoking.name}</strong><small>La richiesta userà solo le istruzioni selezionate e il testo che inserisci qui.</small></div><button type="button" onClick={() => setInvoking(null)} disabled={invokeBusy} aria-label="Chiudi"><X size={16}/></button></header>
                <label>Richiesta<textarea autoFocus maxLength={4000} value={invokePrompt} onChange={event => setInvokePrompt(event.target.value)} placeholder="Descrivi cosa vuoi chiedere a questo agente o skill…"/></label>
                {invokeError && <p className="worldInvokeError" role="alert">{invokeError}</p>}
                {invokeResult && <div className="worldInvokeResult" aria-live="polite">{invokeResult}</div>}
                <footer>{invokeResult && invoking.capabilities.includes("draft-post-it") && !postItSaved && <button type="button" className="worldCancelButton" onClick={() => {const detail={storageScope,text:invokeResult,color:"yellow"};window.dispatchEvent(new CustomEvent("folderrocket:create-sticky-note",{detail}));if("BroadcastChannel" in window){const channel=new BroadcastChannel("folderrocket-sticky-notes");channel.postMessage(detail);channel.close();}setPostItSaved(true);}} disabled={invokeBusy}>Crea post-it</button>}{postItSaved && <small>Post-it creato in questo pianeta.</small>}<button type="button" className="worldCancelButton" onClick={() => setInvoking(null)} disabled={invokeBusy}>Chiudi</button><button type="button" className="worldSaveButton" onClick={() => void runAssistant()} disabled={invokeBusy || !invokePrompt.trim()}>{invokeBusy ? <><LoaderCircle className="worldInlineSpinner" size={14}/>Sto chiedendo…</> : <><Send size={14}/>Richiama</>}</button></footer>
            </section>
        </div>}
    </main>;
}
