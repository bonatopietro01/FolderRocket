import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ChevronDown,Hash,LoaderCircle,MessageCircle,RefreshCw,Search,Users} from "lucide-react";
import {API_BASE_URL} from "../api";

interface Props {worldId:string;blockId?:string;onOpenWorldSettings:()=>void;}
interface Chat {id:string;topic:string;members:string[];type:string;}
interface Team {id:string;name:string;}
interface Channel {id:string;name:string;description?:string;}
interface Message {id:string;createdAt:string;sender:string;senderEmail?:string;text:string;mentions:string[];parentMessageId?:string;}

export default function TeamsConversationsView({worldId,blockId,onOpenWorldSettings}:Props){
    const [mode,setMode]=useState<"chats"|"channels">("chats");
    const [chats,setChats]=useState<Chat[]>([]);const [chatCursor,setChatCursor]=useState("");
    const [teams,setTeams]=useState<Team[]>([]);const [teamCursor,setTeamCursor]=useState("");
    const [channels,setChannels]=useState<Channel[]>([]);const [channelCursor,setChannelCursor]=useState("");
    const [teamId,setTeamId]=useState("");const [sourceId,setSourceId]=useState("");
    const [messages,setMessages]=useState<Message[]>([]);const [messageCursor,setMessageCursor]=useState("");
    const [fromDate,setFromDate]=useState(()=>{const date=new Date();date.setDate(date.getDate()-7);return date.toLocaleDateString("sv-SE");});
    const [toDate,setToDate]=useState(()=>new Date().toLocaleDateString("sv-SE"));
    const [sender,setSender]=useState("");const [query,setQuery]=useState("");
    const [busy,setBusy]=useState(false);const [error,setError]=useState("");const requestId=useRef(0);
    const [teamsConsentRequired,setTeamsConsentRequired]=useState(false);const [teamsConsentBusy,setTeamsConsentBusy]=useState(false);const [teamsConsentError,setTeamsConsentError]=useState("");
    const identity=useMemo(()=>new URLSearchParams({worldId,conversation:"1",...(blockId?{blockId}:{})}),[worldId,blockId]);
    const selectedChat=chats.find(chat=>chat.id===sourceId);
    const people=[...new Set([...(selectedChat?.members||[]),...messages.flatMap(message=>[message.senderEmail||message.sender,...message.mentions])].filter(Boolean))];
    const visibleMessages=messages.filter(message=>{
        const needle=query.trim().toLocaleLowerCase();
        return (!sender||message.senderEmail===sender||message.sender===sender)&&(!needle||`${message.sender} ${message.senderEmail||""} ${message.text} ${message.mentions.join(" ")}`.toLocaleLowerCase().includes(needle));
    });
    const bounds=useCallback(()=>({from:new Date(`${fromDate}T00:00:00`).toISOString(),to:new Date(`${toDate}T23:59:59.999`).toISOString()}),[fromDate,toDate]);

    const loadChats=useCallback(async(cursor="")=>{
        if(!blockId)return;const token=++requestId.current;setBusy(true);setError("");
        try{const params=new URLSearchParams(identity);if(cursor)params.set("cursor",cursor);const response=await fetch(`${API_BASE_URL}/teams/chats?${params}`,{credentials:"include"});const data=await response.json().catch(()=>({})) as {chats?:Chat[];nextLink?:string;message?:string;needsConsent?:boolean};if(!response.ok){if(data.needsConsent||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message||"Could not load Teams chats.");}if(token!==requestId.current)return;setChats(current=>cursor?[...current,...(data.chats||[]).filter(item=>!current.some(existing=>existing.id===item.id))]:data.chats||[]);setChatCursor(data.nextLink||"");}
        catch(reason){if(token===requestId.current)setError(reason instanceof Error?reason.message:"Could not load Teams chats.");}finally{if(token===requestId.current)setBusy(false);}
    },[blockId,identity]);
    const loadTeams=useCallback(async(cursor="")=>{
        if(!blockId)return;const token=++requestId.current;setBusy(true);setError("");
        try{const params=new URLSearchParams(identity);if(cursor)params.set("cursor",cursor);const response=await fetch(`${API_BASE_URL}/teams/groups?${params}`,{credentials:"include"});const data=await response.json().catch(()=>({})) as {teams?:Team[];nextLink?:string;message?:string;needsConsent?:boolean};if(!response.ok){if(data.needsConsent||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message||"Could not load Teams.");}if(token!==requestId.current)return;setTeams(current=>cursor?[...current,...(data.teams||[]).filter(item=>!current.some(existing=>existing.id===item.id))]:data.teams||[]);setTeamCursor(data.nextLink||"");}
        catch(reason){if(token===requestId.current)setError(reason instanceof Error?reason.message:"Could not load Teams.");}finally{if(token===requestId.current)setBusy(false);}
    },[blockId,identity]);
    const loadChannels=useCallback(async(cursor="",selectedTeamId=teamId)=>{
        if(!blockId||!selectedTeamId)return;const token=++requestId.current;setBusy(true);setError("");
        try{const params=new URLSearchParams({...Object.fromEntries(identity),teamId:selectedTeamId});if(cursor)params.set("cursor",cursor);const response=await fetch(`${API_BASE_URL}/teams/groups/${encodeURIComponent(selectedTeamId)}/channels?${params}`,{credentials:"include"});const data=await response.json().catch(()=>({})) as {channels?:Channel[];nextLink?:string;message?:string;needsConsent?:boolean};if(!response.ok){if(data.needsConsent||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message||"Could not load Teams channels.");}if(token!==requestId.current)return;setChannels(current=>cursor?[...current,...(data.channels||[]).filter(item=>!current.some(existing=>existing.id===item.id))]:data.channels||[]);setChannelCursor(data.nextLink||"");}
        catch(reason){if(token===requestId.current)setError(reason instanceof Error?reason.message:"Could not load Teams channels.");}finally{if(token===requestId.current)setBusy(false);}
    },[blockId,identity,teamId]);
    const loadMessages=useCallback(async(id=sourceId,cursor="")=>{
        if(!blockId||!id)return;const token=++requestId.current;setBusy(true);setError("");if(!cursor){setMessages([]);setMessageCursor("");}
        try{const params=new URLSearchParams({...Object.fromEntries(identity),kind:mode==="chats"?"chat":"channel",id,...bounds()});if(mode==="channels")params.set("teamId",teamId);if(sender)params.set("sender",sender);if(cursor)params.set("cursor",cursor);const response=await fetch(`${API_BASE_URL}/teams/messages?${params}`,{credentials:"include"});const data=await response.json().catch(()=>({})) as {messages?:Message[];nextLink?:string;message?:string;needsConsent?:boolean};if(!response.ok){if(data.needsConsent||response.status===401||response.status===403)setTeamsConsentRequired(true);throw new Error(data.message||"Could not load Teams messages.");}if(token!==requestId.current)return;setMessages(current=>cursor?[...current,...(data.messages||[]).filter(message=>!current.some(item=>item.id===message.id))]:data.messages||[]);setMessageCursor(data.nextLink||"");}
        catch(reason){if(token===requestId.current)setError(reason instanceof Error?reason.message:"Could not load Teams messages.");}finally{if(token===requestId.current)setBusy(false);}
    },[blockId,identity,mode,bounds,teamId,sender,sourceId]);
    async function reconnectTeamsAccess(){
        if(!blockId||teamsConsentBusy)return;
        setTeamsConsentBusy(true);setTeamsConsentError("");
        try{
            const params=new URLSearchParams({blockId,teams:"1",format:"json"});
            const response=await fetch(`${API_BASE_URL}/auth/outlook/start?${params}`,{credentials:"include",headers:{Accept:"application/json"}});
            const data=await response.json().catch(()=>({})) as {authorizationUrl?:string;message?:string};
            if(!response.ok||!data.authorizationUrl)throw new Error(data.message||"Could not start Microsoft Teams authorization.");
            const openedByDesktop=window.folderRocketDesktop?await window.folderRocketDesktop.openExternal(data.authorizationUrl):false;
            if(!openedByDesktop){const popup=window.open(data.authorizationUrl,"_blank","noopener,noreferrer");if(!popup)window.location.assign(data.authorizationUrl);}
        }catch(reason){setTeamsConsentError(reason instanceof Error?reason.message:"Could not start Microsoft Teams authorization.");}
        finally{setTeamsConsentBusy(false);}
    }
    const refreshTeamsAccess=useCallback(async()=>{
        if(!blockId)return;
        if(mode==="chats")await loadChats();
        else if(teamId)await loadChannels("",teamId);
        else await loadTeams();
        if(sourceId)await loadMessages(sourceId);
    },[blockId,mode,teamId,sourceId,loadChats,loadChannels,loadTeams,loadMessages]);
    useEffect(()=>{
        if(!blockId)return;
        let active=true;let timer=0;
        const refresh=()=>{if(!active)return;window.clearTimeout(timer);timer=window.setTimeout(()=>{if(active)void refreshTeamsAccess();},250);};
        const unsubscribe=window.folderRocketDesktop?.onOAuthComplete(provider=>{if(provider==="outlook"){setTeamsConsentRequired(false);refresh();}});
        window.addEventListener("focus",refresh);
        return()=>{active=false;window.clearTimeout(timer);window.removeEventListener("focus",refresh);unsubscribe?.();};
    },[blockId,refreshTeamsAccess]);
    if(!blockId)return <section className="teamsConversationView teamsAccountMissing"><p>Assign a Microsoft account to this planet to view its Teams chats and channels.</p><button type="button" onClick={onOpenWorldSettings}>Open planet account settings</button></section>;
    return <section className="teamsConversationView" aria-label="Teams conversations">
        <header><div><Users size={17}/><strong>Teams conversations</strong><small>Read-only chats and channels for this planet’s selected Microsoft account.</small></div><button type="button" onClick={()=>void(mode==="chats"?loadChats():teamId?loadChannels():loadTeams())} disabled={busy} aria-label="Refresh Teams list"><RefreshCw size={14}/></button></header>
        <div className="teamsConversationControls"><label>Source type<select value={mode} onChange={event=>{const next=event.target.value as "chats"|"channels";setMode(next);setSourceId("");setMessages([]);setTeamId("");if(next==="chats")void loadChats();else void loadTeams();}}><option value="chats">Chats</option><option value="channels">Channels</option></select></label>
            {mode==="chats"?<label>Chat<select value={sourceId} onChange={event=>{setSourceId(event.target.value);setMessages([]);if(event.target.value)void loadMessages(event.target.value);}}><option value="">Choose a chat</option>{chats.map(chat=><option key={chat.id} value={chat.id}>{chat.topic||chat.members.join(", ")||chat.type}</option>)}</select></label>:<><label>Team<select value={teamId} onChange={event=>{const nextTeamId=event.target.value;setTeamId(nextTeamId);setSourceId("");setChannels([]);setMessages([]);if(nextTeamId)void loadChannels("",nextTeamId);}}><option value="">Choose a team</option>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Channel<select value={sourceId} disabled={!channels.length} onChange={event=>{setSourceId(event.target.value);setMessages([]);if(event.target.value)void loadMessages(event.target.value);}}><option value="">Choose a channel</option>{channels.map(channel=><option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label></>}
            <label>From<input type="date" value={fromDate} max={toDate} onChange={event=>setFromDate(event.target.value)}/></label><label>To<input type="date" value={toDate} min={fromDate} onChange={event=>setToDate(event.target.value)}/></label><label>Person<select value={sender} onChange={event=>setSender(event.target.value)}><option value="">All people</option>{people.map(person=><option key={person} value={person}>{person}</option>)}</select></label><label className="teamsConversationSearch"><Search size={14}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search messages"/></label>{sourceId&&<button type="button" onClick={()=>void loadMessages(sourceId)} disabled={busy}>Apply filters</button>}
            {mode==="chats"&&!chats.length&&<button type="button" onClick={()=>void loadChats()} disabled={busy}><MessageCircle size={14}/>Load chats</button>}{mode==="chats"&&chatCursor&&<button type="button" onClick={()=>void loadChats(chatCursor)} disabled={busy}><ChevronDown size={14}/>More chats</button>}{mode==="channels"&&!teams.length&&<button type="button" onClick={()=>void loadTeams()} disabled={busy}><Hash size={14}/>Load teams</button>}{mode==="channels"&&teamCursor&&<button type="button" onClick={()=>void loadTeams(teamCursor)} disabled={busy}>More teams</button>}{mode==="channels"&&teamId&&channelCursor&&<button type="button" onClick={()=>void loadChannels(channelCursor)} disabled={busy}>More channels</button>}
        </div>
        {error&&<p className="teamsConversationError" role="alert">{error}<button type="button" onClick={()=>void loadMessages()} disabled={busy}>Retry</button></p>}
        {teamsConsentRequired&&<div className="teamsConsentPrompt" role="status"><div><strong>Teams needs additional Microsoft permissions</strong><p>Reconnect the Outlook account selected for this planet and approve Teams access. Shared-file import requires Files.ReadWrite; channel messages may also require administrator consent.</p>{teamsConsentError&&<small role="alert">{teamsConsentError}</small>}</div><button type="button" onClick={()=>void reconnectTeamsAccess()} disabled={teamsConsentBusy}>{teamsConsentBusy?<LoaderCircle className="spin" size={14}/>:<RefreshCw size={14}/>}Reconnect Teams access</button></div>}
        <div className="teamsConversationPeople"><strong><Users size={13}/>People</strong>{people.length?people.map(person=><button type="button" key={person} className={sender===person?"active":""} onClick={()=>setSender(current=>current===person?"":person)}>{person}</button>):<small>Choose a chat or channel to see participants.</small>}</div>
        <div className="teamsConversationMessages">{busy&&!messages.length?<p role="status"><LoaderCircle className="spin" size={14}/>Loading messages…</p>:visibleMessages.map(message=><article key={message.id}><header><strong>{message.sender||message.senderEmail||"Unknown sender"}</strong><time>{message.createdAt?new Date(message.createdAt).toLocaleString():""}</time></header><p>{message.text||"No message text."}</p>{message.mentions.length>0&&<small>Mentions: {message.mentions.join(", ")}</small>}</article>)}{sourceId&&!busy&&!visibleMessages.length&&<p>No messages match this chat, date range and sender.</p>}{sourceId&&messageCursor&&<button type="button" onClick={()=>void loadMessages(sourceId,messageCursor)} disabled={busy}>{busy?<LoaderCircle className="spin" size={14}/>:<ChevronDown size={14}/>}Load older messages</button>}</div>
    </section>;
}
