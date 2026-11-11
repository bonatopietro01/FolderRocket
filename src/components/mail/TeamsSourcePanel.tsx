import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {BellRing, Download, File as FileIcon, Hash, LoaderCircle, RefreshCw, Search, Users} from "lucide-react";
import {API_BASE_URL} from "../../api.ts";
import EmailAlertBuilder, {type EmailAlertRule} from "./EmailAlertBuilder.tsx";

interface Props { worldId: string; storageScope:string; blockId?: string; aiEnabled:boolean; onOpenWorldSettings: () => void; }
interface Chat {id: string; type: string; topic: string; members: string[]; updatedAt: string;}
interface Team {id: string; name: string;}
interface Channel {id: string; name: string; description: string; membershipType: string;}
interface TeamsFile {id:string;messageId:string;name:string;contentType:string;size:number;source:"teams-share";verified:boolean;downloadAvailable:boolean;reason?:string;createdAt:string;sender:string;senderEmail:string;kind:"chat"|"channel";sourceId:string;teamId?:string;context?:string;}
type TeamsAlertRule=EmailAlertRule&{accountBlockId:string;source:{kind:"chat"|"channel";id:string;teamId?:string}};
type TeamsAlertResult={ruleId:string;total:number;newCount:number;messageIds:string[];messages:Array<{id:string;sender:string;subject:string;receivedAt:string;webLink?:string}>;error?:string};

export default function TeamsSourcePanel({worldId, storageScope, blockId, aiEnabled, onOpenWorldSettings}: Props) {
    const [mode, setMode] = useState<"chats" | "channels">("chats");
    const [chats, setChats] = useState<Chat[]>([]);
    const [chatsCursor, setChatsCursor] = useState("");
    const [teams, setTeams] = useState<Team[]>([]);
    const [teamsCursor, setTeamsCursor] = useState("");
    const [channels, setChannels] = useState<Channel[]>([]);
    const [channelsCursor, setChannelsCursor] = useState("");
    const [selectedTeam, setSelectedTeam] = useState("");
    const [selectedTeamBlockId, setSelectedTeamBlockId] = useState("");
    const [selectedItem, setSelectedItem] = useState("");
    const [selectedItemBlockId, setSelectedItemBlockId] = useState("");
    const [files,setFiles]=useState<TeamsFile[]>([]);
    const [filesCursor,setFilesCursor]=useState("");
    const [filesBusy,setFilesBusy]=useState(false);
    const [filesError,setFilesError]=useState("");
    const [teamsConsentRequired,setTeamsConsentRequired]=useState(false);
    const [teamsConsentBusy,setTeamsConsentBusy]=useState(false);
    const [teamsConsentError,setTeamsConsentError]=useState("");
    const [senderFilter,setSenderFilter]=useState("");
    const [showAlerts,setShowAlerts]=useState(false);
    const [alertRules,setAlertRules]=useState<TeamsAlertRule[]>([]);
    const [alertFavorites,setAlertFavorites]=useState<EmailAlertRule[]>([]);
    const [alertProviderSettings,setAlertProviderSettings]=useState<Record<string,unknown>>({});
    const [alertRuntime,setAlertRuntime]=useState<Record<string,{lastCheckedAt?:string;result?:TeamsAlertResult;error?:string}>>({});
    const [alertsBusy,setAlertsBusy]=useState(false);
    const [alertsSaving,setAlertsSaving]=useState(false);
    const [alertsError,setAlertsError]=useState("");
    const [alertsNotice,setAlertsNotice]=useState("");
    const [fromDate, setFromDate] = useState(() => {const date=new Date();date.setDate(date.getDate()-7);return date.toLocaleDateString("sv-SE");});
    const [toDate, setToDate] = useState(() => new Date().toLocaleDateString("sv-SE"));
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);
    const [busyBlockId, setBusyBlockId] = useState("");
    const [error, setError] = useState("");
    const [directoryBlockId, setDirectoryBlockId] = useState("");
    const [downloadingFileId,setDownloadingFileId]=useState("");
    const requestSequence = useRef(0);
    const filesRequestSequence=useRef(0);
    const selectedBlockId = blockId || "";
    const activeBusy = busy && busyBlockId === selectedBlockId;
    const visibleChats = useMemo(()=>directoryBlockId === selectedBlockId ? chats : [],[directoryBlockId,selectedBlockId,chats]);
    const visibleChatsCursor = directoryBlockId === selectedBlockId ? chatsCursor : "";
    const visibleTeams = directoryBlockId === selectedBlockId ? teams : [];
    const visibleTeamsCursor = directoryBlockId === selectedBlockId ? teamsCursor : "";
    const visibleChannels = directoryBlockId === selectedBlockId ? channels : [];
    const visibleChannelsCursor = directoryBlockId === selectedBlockId ? channelsCursor : "";
    const visibleSelectedTeam = selectedTeamBlockId === selectedBlockId ? selectedTeam : "";
    const visibleSelectedItem = directoryBlockId === selectedBlockId && selectedItemBlockId === selectedBlockId ? selectedItem : "";
    const endpoint = useCallback((path: string, block = selectedBlockId) => {const params=new URLSearchParams({worldId});if(block)params.set("blockId",block);return `${API_BASE_URL}${path}${path.includes("?")?"&":"?"}${params}`;}, [selectedBlockId,worldId]);
    const selectedAlertSource=visibleSelectedItem?{kind:mode==="chats"?"chat" as const:"channel" as const,id:visibleSelectedItem,...(mode==="channels"&&visibleSelectedTeam?{teamId:visibleSelectedTeam}:{})}:null;
    const sourceKey=(source?:{kind:string;id:string;teamId?:string})=>source?`${source.kind}:${source.id}:${source.teamId||""}`:"";
    const selectedAlertSourceKey=sourceKey(selectedAlertSource||undefined);
    const visibleAlertRules=alertRules.filter(rule=>sourceKey(rule.source)===selectedAlertSourceKey);

    useEffect(()=>{
        if(!selectedBlockId)return;
        const controller=new AbortController();let active=true;
        const params=new URLSearchParams({worldId,blockId:selectedBlockId});
        void fetch(`${API_BASE_URL}/email/alerts/settings/teams?${params}`,{credentials:"include",signal:controller.signal}).then(async response=>{const data=await response.json().catch(()=>({})) as {providerSettings?:{rules?:TeamsAlertRule[];runtime?:{rules?:Record<string,{lastCheckedAt?:string;result?:TeamsAlertResult;error?:string}>};[key:string]:unknown};favorites?:EmailAlertRule[];message?:string};if(!response.ok)throw new Error(data.message||"Teams alert settings could not be loaded.");if(!active)return;const settings=data.providerSettings||{};setAlertProviderSettings(settings);setAlertRules(Array.isArray(settings.rules)?settings.rules:[]);setAlertFavorites(Array.isArray(data.favorites)?data.favorites:[]);setAlertRuntime(settings.runtime?.rules||{});}).catch(reason=>{if(active&&!controller.signal.aborted)setAlertsError(reason instanceof Error?reason.message:"Teams alert settings could not be loaded.");});
        return()=>{active=false;controller.abort();};
    },[selectedBlockId,worldId]);

    async function persistTeamsAlerts(nextVisible:EmailAlertRule[],nextFavorites:EmailAlertRule[]){
        if(!selectedBlockId||!selectedAlertSource){setAlertsError("Select a Teams chat or channel before saving alerts.");return;}
        const scoped=alertRules.filter(rule=>sourceKey(rule.source)!==selectedAlertSourceKey);
        const bound=nextVisible.map(rule=>({...rule,accountBlockId:selectedBlockId,source:selectedAlertSource})) as TeamsAlertRule[];
        setAlertsSaving(true);setAlertsError("");setAlertsNotice("");
        try{const providerSettings={...alertProviderSettings,accountBlockId:selectedBlockId,rules:[...scoped,...bound]};const response=await fetch(`${API_BASE_URL}/email/alerts/settings/teams?${new URLSearchParams({worldId,blockId:selectedBlockId})}`,{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({providerSettings,favorites:nextFavorites})});const data=await response.json().catch(()=>({})) as {providerSettings?:typeof providerSettings;favorites?:EmailAlertRule[];message?:string};if(!response.ok)throw new Error(data.message||"Teams alerts could not be saved.");setAlertProviderSettings(data.providerSettings||providerSettings);setAlertRules(Array.isArray(data.providerSettings?.rules)?data.providerSettings.rules as TeamsAlertRule[]:[...scoped,...bound]);setAlertFavorites(Array.isArray(data.favorites)?data.favorites:nextFavorites);setAlertsNotice("Teams alert settings saved. Scheduled checks run only at the configured time.");}catch(reason){setAlertsError(reason instanceof Error?reason.message:"Teams alerts could not be saved.");}finally{setAlertsSaving(false);}
    }

    async function checkTeamsAlerts(rules:EmailAlertRule[]){
        if(!selectedBlockId||alertsBusy||alertsSaving)return;
        const savedIds=new Set(visibleAlertRules.map(rule=>rule.id));const active=rules.filter(rule=>rule.enabled&&savedIds.has(rule.id));if(!active.length)return;
        setAlertsBusy(true);setAlertsError("");setAlertsNotice("");
        try{const params=new URLSearchParams({worldId,blockId:selectedBlockId});const response=await fetch(`${API_BASE_URL}/email/teams/warnings/check?${params}`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({ruleIds:active.map(rule=>rule.id)})});const data=await response.json().catch(()=>({})) as {results?:TeamsAlertResult[];checkedAt?:string;providerSettings?:{runtime?:{rules?:typeof alertRuntime};[key:string]:unknown};message?:string};if(!response.ok)throw new Error(data.message||"Teams alerts could not be checked.");if(data.providerSettings){setAlertProviderSettings(data.providerSettings);if(data.providerSettings.runtime?.rules)setAlertRuntime(data.providerSettings.runtime.rules);}else{const next={...alertRuntime};for(const result of data.results||[])next[result.ruleId]={lastCheckedAt:data.checkedAt,result};setAlertRuntime(next);}setAlertsNotice("Saved Teams alerts checked. Results are stored locally.");}catch(reason){setAlertsError(reason instanceof Error?reason.message:"Teams alerts could not be checked.");}finally{setAlertsBusy(false);}
    }

    const loadDirectories = useCallback(async (kind = mode, cursor = "", preserveSelection = false) => {
        if (!selectedBlockId) { setError("Scegli un account Microsoft per questo pianeta prima di aprire Teams."); return; }
        const requestId = ++requestSequence.current;
        setBusyBlockId(selectedBlockId); setBusy(true); setError("");
        if (!cursor && !preserveSelection) { setFiles([]);setFilesCursor("");setSelectedItem("");setSelectedItemBlockId(selectedBlockId); }
        try {
            const params = new URLSearchParams();
            if (cursor) params.set("cursor", cursor);
            const path = kind === "chats" ? "/teams/chats" : "/teams/groups";
            const queryString = params.toString();
            const response = await fetch(endpoint(`${path}${queryString ? `?${queryString}` : ""}`), {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {chats?: Chat[]; teams?: Team[]; nextLink?: string; message?: string; needsConsent?: boolean};
            if (!response.ok) { if(data.needsConsent===true||response.status===401||response.status===403)setTeamsConsentRequired(true); throw new Error(data.message || "Impossibile leggere Teams."); }
            if (requestId !== requestSequence.current) return;
            if (kind === "chats") {
                setDirectoryBlockId(selectedBlockId);
                setChats(current => cursor ? [...current, ...(data.chats || []).filter(chat => !current.some(item => item.id === chat.id))] : data.chats || []);
                setChatsCursor(data.nextLink || "");
            } else {
                setDirectoryBlockId(selectedBlockId);
                setTeams(current => cursor ? [...current, ...(data.teams || []).filter(team => !current.some(item => item.id === team.id))] : data.teams || []);
                setTeamsCursor(data.nextLink || "");
                if (!cursor && !preserveSelection) { setChannels([]); setChannelsCursor(""); setSelectedTeam(""); }
            }
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "Impossibile leggere Teams."); }
        finally { if (requestId === requestSequence.current) setBusy(false); }
    }, [endpoint, mode, selectedBlockId]);

    useEffect(() => {
        requestSequence.current += 1;
        return () => { requestSequence.current += 1; };
    }, [selectedBlockId]);
    useEffect(() => {
        if (!visibleSelectedTeam) return;
        const controller = new AbortController();
        void fetch(endpoint(`/teams/groups/${encodeURIComponent(visibleSelectedTeam)}/channels?${new URLSearchParams({teamId:visibleSelectedTeam})}`), {credentials: "include", signal: controller.signal})
            .then(async response => { const data = await response.json().catch(() => ({})) as {channels?: Channel[]; nextLink?: string; message?: string; needsConsent?:boolean}; if (!response.ok) {if(data.needsConsent===true||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message || "Impossibile leggere i canali.");} if (!controller.signal.aborted) { setDirectoryBlockId(selectedBlockId); setChannels(data.channels || []); setChannelsCursor(data.nextLink || ""); } })
            .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Impossibile leggere i canali."); });
        return () => controller.abort();
    }, [endpoint, selectedBlockId, visibleSelectedTeam]);

    async function loadMoreChannels() {
        if (!visibleChannelsCursor || !visibleSelectedTeam || activeBusy) return;
        const requestId = ++requestSequence.current;
        setBusyBlockId(selectedBlockId); setBusy(true); setError("");
        try {
            const params=new URLSearchParams({teamId:visibleSelectedTeam,cursor:visibleChannelsCursor});
            const response = await fetch(endpoint(`/teams/groups/${encodeURIComponent(visibleSelectedTeam)}/channels?${params}`), {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {channels?: Channel[]; nextLink?: string; message?: string; needsConsent?:boolean};
            if (!response.ok) {if(data.needsConsent===true||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message || "Impossibile leggere altri canali.");}
            if (requestId === requestSequence.current) {
                setChannels(current => [...current, ...(data.channels || []).filter(channel => !current.some(item => item.id === channel.id))]);
                setChannelsCursor(data.nextLink || "");
            }
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "Impossibile leggere altri canali."); }
        finally { if (requestId === requestSequence.current) setBusy(false); }
    }

    const loadTeamsFiles=useCallback(async(kind:"chats"|"channels",id:string,teamId:string,cursor="")=>{
        if(!selectedBlockId||!id)return;
        const requestId=++filesRequestSequence.current;setFilesBusy(true);setFilesError("");
        try{const params=new URLSearchParams({kind:kind==="chats"?"chat":"channel",id,from:new Date(`${fromDate}T00:00:00`).toISOString(),to:new Date(`${toDate}T23:59:59.999`).toISOString()});if(kind==="channels")params.set("teamId",teamId);if(senderFilter)params.set("sender",senderFilter);if(cursor)params.set("cursor",cursor);const response=await fetch(`${API_BASE_URL}/teams/files?${new URLSearchParams({worldId,blockId:selectedBlockId,...Object.fromEntries(params)})}`,{credentials:"include"});const data=await response.json().catch(()=>({})) as {files?:TeamsFile[];nextLink?:string;message?:string;needsConsent?:boolean};if(!response.ok){if(data.needsConsent===true||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message||"Could not load shared Teams files.");}if(requestId!==filesRequestSequence.current)return;const incoming=Array.isArray(data.files)?data.files:[];const missingFilesConsent=incoming.some(file=>file.reason==="files-readwrite-consent-required");setTeamsConsentRequired(current=>missingFilesConsent||Boolean(cursor&&current));setFiles(current=>cursor?[...current,...incoming.filter(file=>!current.some(item=>item.id===file.id&&item.messageId===file.messageId))]:incoming);setFilesCursor(data.nextLink||"");}
        catch(reason){if(requestId===filesRequestSequence.current)setFilesError(reason instanceof Error?reason.message:"Could not load shared Teams files.");}
        finally{if(requestId===filesRequestSequence.current)setFilesBusy(false);}
    },[selectedBlockId,fromDate,toDate,senderFilter,worldId]);

    function selectTeamsSource(kind:"chats"|"channels",id:string,teamId=visibleSelectedTeam){
        setSelectedItem(id);setSelectedItemBlockId(selectedBlockId);setFiles([]);setFilesCursor("");setSenderFilter("");setFilesError("");
        void loadTeamsFiles(kind,id,teamId);
    }

    async function downloadFile(file:TeamsFile){
        if(!file.downloadAvailable){setFilesError(`${file.name} is not available to import.`);return;}
        const requestId=`${file.messageId}:${file.id}`;setDownloadingFileId(requestId);setFilesError("");
        try{const params=new URLSearchParams({worldId,blockId:selectedBlockId,kind:file.kind,id:file.sourceId,messageId:file.messageId,fileId:file.id});if(file.teamId)params.set("teamId",file.teamId);const response=await fetch(`${API_BASE_URL}/teams/files/download?${params}`,{credentials:"include"});if(!response.ok){const data=await response.json().catch(()=>({})) as {message?:string;needsConsent?:boolean};if(data.needsConsent===true||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message||`Could not import ${file.name}.`);}const blob=await response.blob();const localFile=new globalThis.File([blob],file.name,{type:file.contentType||"application/octet-stream"});window.dispatchEvent(new CustomEvent("folderrocket:add-to-cargo",{detail:{storageScope,files:[localFile]}}));}catch(reason){setFilesError(reason instanceof Error?reason.message:`Could not import ${file.name}.`);}finally{setDownloadingFileId("");}
    }

    async function reconnectTeamsAccess(){
        if(!selectedBlockId||teamsConsentBusy)return;
        setTeamsConsentBusy(true);setTeamsConsentError("");
        try{
            const params=new URLSearchParams({blockId:selectedBlockId,teams:"1",format:"json"});
            const response=await fetch(`${API_BASE_URL}/auth/outlook/start?${params}`,{credentials:"include",headers:{Accept:"application/json"}});
            const data=await response.json().catch(()=>({})) as {authorizationUrl?:string;message?:string};
            if(!response.ok||!data.authorizationUrl)throw new Error(data.message||"Could not start Microsoft Teams authorization.");
            const openedByDesktop=window.folderRocketDesktop?await window.folderRocketDesktop.openExternal(data.authorizationUrl):false;
            if(!openedByDesktop){const popup=window.open(data.authorizationUrl,"_blank","noopener,noreferrer");if(!popup)window.location.assign(data.authorizationUrl);}
        }catch(reason){setTeamsConsentError(reason instanceof Error?reason.message:"Could not start Microsoft Teams authorization.");}
        finally{setTeamsConsentBusy(false);}
    }

    const refreshTeamsAccess=useCallback(async()=>{
        if(!selectedBlockId)return;
        const sourceId=visibleSelectedItem;const sourceTeam=visibleSelectedTeam;
        await loadDirectories(mode,"",true);
        if(sourceId)await loadTeamsFiles(mode,sourceId,sourceTeam);
    },[loadDirectories,loadTeamsFiles,mode,selectedBlockId,visibleSelectedItem,visibleSelectedTeam]);

    useEffect(()=>{
        if(!selectedBlockId)return;
        let active=true;let timer=0;
        const refresh=()=>{if(!active)return;window.clearTimeout(timer);timer=window.setTimeout(()=>{if(active)void refreshTeamsAccess();},250);};
        const unsubscribe=window.folderRocketDesktop?.onOAuthComplete(provider=>{if(provider==="outlook")refresh();});
        window.addEventListener("focus",refresh);
        return()=>{active=false;window.clearTimeout(timer);window.removeEventListener("focus",refresh);unsubscribe?.();};
    },[refreshTeamsAccess,selectedBlockId]);

    const people=useMemo(()=>[...new Set([...(mode==="chats"?(visibleChats.find(chat=>chat.id===visibleSelectedItem)?.members||[]):[]),...files.map(file=>file.senderEmail||file.sender)].filter(Boolean))],[files,mode,visibleChats,visibleSelectedItem]);
    const visibleFiles=useMemo(()=>files.filter(file=>!query.trim()||`${file.name} ${file.sender} ${file.senderEmail} ${file.context||""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[files,query]);

    return <section className="sourceCard teamsSourceCard">
        <div className="sourceHeader"><Users size={27} className="teamsPanelIcon"/><span className="sourceTitle">Teams</span><button type="button" className="teamsRefresh" title="Refresh Teams lists" onClick={() => void loadDirectories()} disabled={activeBusy || !selectedBlockId}><RefreshCw className={activeBusy ? "spin" : ""} size={14}/></button>
            <button type="button" className="teamsAccountButton" onClick={onOpenWorldSettings}>{selectedBlockId ? "Planet account" : "Connect account"}</button>
        </div>
        {!selectedBlockId ? <div className="teamsControlPanel teamsAccountMissing"><p>Assign a Microsoft account to this planet to browse its Teams chats, channels and shared files.</p><button type="button" className="teamsLoadButton" onClick={onOpenWorldSettings}>Open planet account settings</button></div> : <div className="teamsControlPanel">
            <label>Source<select value={mode} onChange={event => { const next = event.target.value as "chats" | "channels"; setMode(next); setSelectedTeam(""); setSelectedItem(""); setChannels([]); setChannelsCursor("");setFiles([]);setFilesCursor(""); void loadDirectories(next); }} disabled={!selectedBlockId}><option value="chats">Chats · 1:1 and groups</option><option value="channels">Teams channels</option></select></label>
            {mode === "channels" && <label>Team<select value={visibleSelectedTeam} onChange={event => { setSelectedTeam(event.target.value); setSelectedTeamBlockId(selectedBlockId); setChannels([]); setChannelsCursor(""); setSelectedItem(""); setSelectedItemBlockId(selectedBlockId);setFiles([]);setFilesCursor(""); }} disabled={!visibleTeams.length}><option value="">Choose a team</option>{visibleTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
            {mode === "chats" && <label>Chat<select value={visibleSelectedItem} onChange={event => { if (event.target.value) selectTeamsSource("chats",event.target.value);else {setSelectedItem("");setFiles([]);setFilesCursor("");} }} disabled={!visibleChats.length || activeBusy}><option value="">Choose a chat</option>{visibleChats.map(chat => <option key={chat.id} value={chat.id}>{chat.topic || chat.members.join(", ") || chat.type}</option>)}</select></label>}
            {mode === "channels" && <label>Channel<select value={visibleSelectedItem} onChange={event => { if (event.target.value) selectTeamsSource("channels",event.target.value,visibleSelectedTeam);else {setSelectedItem("");setFiles([]);setFilesCursor("");} }} disabled={!visibleChannels.length || activeBusy}><option value="">Choose a channel</option>{visibleChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>}
            <label>From<input type="date" value={fromDate} max={toDate||undefined} onChange={event=>setFromDate(event.target.value)}/></label><label>To<input type="date" value={toDate} min={fromDate||undefined} onChange={event=>setToDate(event.target.value)}/></label>
            <label>Person<select value={senderFilter} onChange={event=>setSenderFilter(event.target.value)}><option value="">All people</option>{people.map(person=><option key={person} value={person}>{person}</option>)}</select></label><label className="teamsSearch"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search shared files"/></label>
            {mode === "chats" && !visibleChats.length && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("chats")} disabled={activeBusy || !selectedBlockId}>{activeBusy ? <LoaderCircle className="spin" size={14}/> : <Users size={14}/>}Load chats</button>}
            {mode === "chats" && Boolean(visibleChatsCursor) && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("chats", visibleChatsCursor)} disabled={activeBusy}>Load more chats</button>}
            {mode === "channels" && !visibleTeams.length && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("channels")} disabled={activeBusy || !selectedBlockId}>{activeBusy ? <LoaderCircle className="spin" size={14}/> : <Hash size={14}/>}Load teams and channels</button>}
            {mode === "channels" && Boolean(visibleTeamsCursor) && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("channels", visibleTeamsCursor)} disabled={activeBusy}>Load more teams</button>}
            {mode === "channels" && Boolean(visibleChannelsCursor) && <button type="button" className="teamsLoadButton" onClick={() => void loadMoreChannels()} disabled={activeBusy}>Load more channels</button>}
            {error && <p className="teamsError" role="alert">{error}</p>}
            {visibleSelectedItem && <><div className="teamsPeopleList" aria-label="People observed in these Teams files"><strong><Users size={13}/>People</strong>{people.length?people.map(person=><button type="button" className={senderFilter===person?"active":""} key={person} onClick={()=>setSenderFilter(current=>current===person?"":person)}>{person}</button>):<small>People appear when shared files are loaded.</small>}</div><div className="teamsFilesHeading"><strong><FileIcon size={14}/>Shared files</strong><button type="button" className="teamsLoadButton" onClick={()=>void loadTeamsFiles(mode,visibleSelectedItem,visibleSelectedTeam)} disabled={filesBusy}>{filesBusy?<LoaderCircle className="spin" size={14}/>:<RefreshCw size={14}/>}Apply filters</button></div>{filesError&&<p className="teamsError" role="alert">{filesError}</p>}<div className="teamsFilesList">{visibleFiles.map(file=>{const key=`${file.messageId}:${file.id}`;const unavailableReason=file.reason==="files-readwrite-consent-required"?"Microsoft Files.ReadWrite consent is required to import this attachment.":"This Teams file is unavailable for import.";return <article className="teamsFileRow" key={key}><FileIcon size={14}/><span><strong>{file.name}</strong><small>{file.sender||"Unknown sender"} · {file.createdAt?new Date(file.createdAt).toLocaleString():"Date unavailable"}{file.size?` · ${(file.size/1024).toFixed(0)} KB`:""}</small><small>{file.context||file.contentType||"Teams shared file"}{!file.downloadAvailable?` · ${unavailableReason}`:""}</small></span><button type="button" onClick={()=>void downloadFile(file)} disabled={!file.downloadAvailable||downloadingFileId===key} title={file.downloadAvailable?"Add to CargoRocket":unavailableReason}>{downloadingFileId===key?<LoaderCircle className="spin" size={14}/>:<Download size={14}/>}<span>{file.downloadAvailable?"Add to CargoRocket":"Unavailable"}</span></button></article>;})}{filesBusy&&<p role="status"><LoaderCircle className="spin" size={14}/>Loading files…</p>}{!filesBusy&&!visibleFiles.length&&!filesError&&<p>No shared files match the selected source, dates and person.</p>}{Boolean(filesCursor)&&<button type="button" className="teamsLoadButton" onClick={()=>void loadTeamsFiles(mode,visibleSelectedItem,visibleSelectedTeam,filesCursor)} disabled={filesBusy}>Load next Teams page</button>}</div><button type="button" className="teamsAlertToggle" aria-expanded={showAlerts} onClick={()=>setShowAlerts(value=>!value)}><span><BellRing size={13}/>AI alerts for this selection</span><span>{showAlerts?"−":"+"}</span></button>{showAlerts&&<section className="teamsAlertPanel"><p>Alerts read message text and sender details for this selected chat or channel. They do not download files or send notifications. Scheduled checks run only at the configured time.</p>{alertsError&&<p className="teamsError" role="alert">{alertsError}</p>}{alertsNotice&&<p className="teamsStatus" role="status">{alertsNotice}</p>}{alertsSaving&&<p role="status">Saving alert settings…</p>}<EmailAlertBuilder providerLabel="Teams" rules={visibleAlertRules} favorites={alertFavorites} onChange={({rules,favorites})=>{const scoped=alertRules.filter(rule=>sourceKey(rule.source)!==selectedAlertSourceKey);const bound=rules.map(rule=>({...rule,accountBlockId:selectedBlockId,source:selectedAlertSource!})) as TeamsAlertRule[];setAlertRules([...scoped,...bound]);void persistTeamsAlerts(rules,favorites);}} onCheckNow={rules=>void checkTeamsAlerts(rules)} allowAi={aiEnabled}/>{visibleAlertRules.map(rule=>{const runtime=alertRuntime[rule.id];return runtime?.result?<article className="teamsAlertResult" key={`result:${rule.id}`}><strong>{rule.label}: {runtime.result.newCount} new match(es) · {runtime.lastCheckedAt?new Date(runtime.lastCheckedAt).toLocaleString():""}</strong>{runtime.result.error&&<small>{runtime.result.error}</small>}{runtime.result.messages.map(item=><div key={item.id}><span>{item.sender} · {item.receivedAt?new Date(item.receivedAt).toLocaleString():""}</span>{item.webLink&&<a href={item.webLink} target="_blank" rel="noreferrer">Open in Teams</a>}</div>)}</article>:null;})}</section>}</>}
        </div>}
        {teamsConsentRequired&&selectedBlockId&&<div className="teamsConsentPrompt" role="status"><div><strong>Teams needs additional Microsoft permissions</strong><p>Reconnect the Outlook account selected for this planet and approve Teams access. Shared-file import requires Files.ReadWrite; channel messages may also require administrator consent.</p>{teamsConsentError&&<small role="alert">{teamsConsentError}</small>}</div><button type="button" onClick={()=>void reconnectTeamsAccess()} disabled={teamsConsentBusy}>{teamsConsentBusy?<LoaderCircle className="spin" size={14}/>:<RefreshCw size={14}/>}Reconnect Teams access</button></div>}
        <small className="teamsPermissionHint">Read-only · Uses the Microsoft account selected for this planet. Teams permissions may require reconnection and admin consent.</small>
    </section>;
}
