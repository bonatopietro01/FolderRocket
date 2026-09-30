import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {AtSign, File, Hash, LoaderCircle, MessageCircle, RefreshCw, Search, Users} from "lucide-react";
import {API_BASE_URL} from "../api";

interface Props { blockId: string; accountBlockId?: string | null; onAccountBlockIdChange: (id?: string | null) => void; }
interface Account {blockId: string; email: string; label: string;}
interface Chat {id: string; type: string; topic: string; members: string[]; updatedAt: string;}
interface Team {id: string; name: string;}
interface Channel {id: string; name: string; description: string; membershipType: string;}
interface TeamsMessage {id: string; createdAt: string; sender: string; text: string; mentions: string[]; attachments: {name: string; url: string}[]; parentMessageId?: string; repliesNextLink?: string;}
type ContentFilter = "all" | "messages" | "mentions" | "files";

export default function TeamsSourcePanel({blockId, accountBlockId, onAccountBlockIdChange}: Props) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [accountChooserOpen, setAccountChooserOpen] = useState(false);
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
    const [messages, setMessages] = useState<TeamsMessage[]>([]);
    const [messageCursor, setMessageCursor] = useState("");
    const [days, setDays] = useState(7);
    const [filter, setFilter] = useState<ContentFilter>("all");
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);
    const [busyBlockId, setBusyBlockId] = useState("");
    const [busyReplyId, setBusyReplyId] = useState("");
    const [busyReplyBlockId, setBusyReplyBlockId] = useState("");
    const [error, setError] = useState("");
    const [directoryBlockId, setDirectoryBlockId] = useState("");
    const [messagesBlockId, setMessagesBlockId] = useState("");
    const requestSequence = useRef(0);
    const [snapshotAt, setSnapshotAt] = useState(() => Date.now());
    const selectedBlockId = accountBlockId === null ? "" : accountBlockId || blockId;
    const activeBusy = busy && busyBlockId === selectedBlockId;
    const activeBusyReplyId = busyReplyBlockId === selectedBlockId ? busyReplyId : "";
    const visibleChats = directoryBlockId === selectedBlockId ? chats : [];
    const visibleChatsCursor = directoryBlockId === selectedBlockId ? chatsCursor : "";
    const visibleTeams = directoryBlockId === selectedBlockId ? teams : [];
    const visibleTeamsCursor = directoryBlockId === selectedBlockId ? teamsCursor : "";
    const visibleChannels = directoryBlockId === selectedBlockId ? channels : [];
    const visibleChannelsCursor = directoryBlockId === selectedBlockId ? channelsCursor : "";
    const visibleSelectedTeam = selectedTeamBlockId === selectedBlockId ? selectedTeam : "";
    const visibleSelectedItem = directoryBlockId === selectedBlockId && selectedItemBlockId === selectedBlockId ? selectedItem : "";
    const visibleMessageCursor = messagesBlockId === selectedBlockId ? messageCursor : "";
    const selectedAccount = accounts.find(account => account.blockId === selectedBlockId);
    const endpoint = useCallback((path: string, block = selectedBlockId) => `${API_BASE_URL}${path}${path.includes("?") ? "&" : "?"}blockId=${encodeURIComponent(block)}`, [selectedBlockId]);

    const loadDirectories = useCallback(async (kind = mode, cursor = "") => {
        if (!selectedBlockId) { setError("Scegli un account Microsoft per questo pianeta prima di aprire Teams."); return; }
        const requestId = ++requestSequence.current;
        setBusyBlockId(selectedBlockId); setBusy(true); setError("");
        if (!cursor) { setMessages([]); setMessageCursor(""); setSelectedItem(""); }
        try {
            const params = new URLSearchParams();
            if (cursor) params.set("cursor", cursor);
            const path = kind === "chats" ? "/teams/chats" : "/teams/groups";
            const queryString = params.toString();
            const response = await fetch(endpoint(`${path}${queryString ? `?${queryString}` : ""}`), {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {chats?: Chat[]; teams?: Team[]; nextLink?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Impossibile leggere Teams.");
            if (requestId !== requestSequence.current) return;
            if (kind === "chats") {
                setDirectoryBlockId(selectedBlockId);
                setChats(current => cursor ? [...current, ...(data.chats || []).filter(chat => !current.some(item => item.id === chat.id))] : data.chats || []);
                setChatsCursor(data.nextLink || "");
            } else {
                setDirectoryBlockId(selectedBlockId);
                setTeams(current => cursor ? [...current, ...(data.teams || []).filter(team => !current.some(item => item.id === team.id))] : data.teams || []);
                setTeamsCursor(data.nextLink || "");
                if (!cursor) { setChannels([]); setChannelsCursor(""); setSelectedTeam(""); }
            }
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "Impossibile leggere Teams."); }
        finally { if (requestId === requestSequence.current) setBusy(false); }
    }, [endpoint, mode, selectedBlockId]);

    useEffect(() => {
        let active = true;
        const refreshAccounts = () => void fetch(`${API_BASE_URL}/email/outlook/accounts`, {credentials: "include"})
            .then(async response => { const data = await response.json().catch(() => ({})) as {accounts?: Account[]}; if (active && response.ok) setAccounts(Array.isArray(data.accounts) ? data.accounts : []); })
            .catch(() => { if (active) setAccounts([]); });
        refreshAccounts();
        window.addEventListener("focus", refreshAccounts);
        return () => { active = false; window.removeEventListener("focus", refreshAccounts); };
    }, []);
    useEffect(() => {
        requestSequence.current += 1;
        return () => { requestSequence.current += 1; };
    }, [selectedBlockId]);
    useEffect(() => {
        if (!visibleSelectedTeam) return;
        const controller = new AbortController();
        void fetch(endpoint(`/teams/groups/${encodeURIComponent(visibleSelectedTeam)}/channels`), {credentials: "include", signal: controller.signal})
            .then(async response => { const data = await response.json().catch(() => ({})) as {channels?: Channel[]; nextLink?: string; message?: string}; if (!response.ok) throw new Error(data.message || "Impossibile leggere i canali."); if (!controller.signal.aborted) { setDirectoryBlockId(selectedBlockId); setChannels(data.channels || []); setChannelsCursor(data.nextLink || ""); } })
            .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Impossibile leggere i canali."); });
        return () => controller.abort();
    }, [endpoint, selectedBlockId, visibleSelectedTeam]);

    async function loadMoreChannels() {
        if (!visibleChannelsCursor || !visibleSelectedTeam || activeBusy) return;
        const requestId = ++requestSequence.current;
        setBusyBlockId(selectedBlockId); setBusy(true); setError("");
        try {
            const response = await fetch(endpoint(`/teams/groups/${encodeURIComponent(visibleSelectedTeam)}/channels?cursor=${encodeURIComponent(visibleChannelsCursor)}`), {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {channels?: Channel[]; nextLink?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Impossibile leggere altri canali.");
            if (requestId === requestSequence.current) {
                setChannels(current => [...current, ...(data.channels || []).filter(channel => !current.some(item => item.id === channel.id))]);
                setChannelsCursor(data.nextLink || "");
            }
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "Impossibile leggere altri canali."); }
        finally { if (requestId === requestSequence.current) setBusy(false); }
    }

    async function connectMicrosoft() {
        setError("");
        const targetId = selectedBlockId || blockId;
        if (!selectedBlockId) onAccountBlockIdChange(targetId);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/outlook/start?blockId=${encodeURIComponent(targetId)}&teams=1&format=json`, {headers: {Accept: "application/json"}, credentials: "include"});
            const data = await response.json().catch(() => ({})) as {authorizationUrl?: string; message?: string};
            if (!response.ok || !data.authorizationUrl) throw new Error(data.message || "Microsoft authorization could not start.");
            const openedByDesktop = window.folderRocketDesktop ? await window.folderRocketDesktop.openExternal(data.authorizationUrl) : false;
            if (!openedByDesktop) { const popup = window.open(data.authorizationUrl, "_blank", "noopener,noreferrer"); if (!popup) window.location.assign(data.authorizationUrl); }
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Microsoft authorization could not start."); }
    }

    async function loadMessages(id: string, kind = mode, teamId = visibleSelectedTeam) {
        const requestId = ++requestSequence.current;
        setSelectedItem(id); setSelectedItemBlockId(selectedBlockId); setMessagesBlockId(selectedBlockId); setBusyBlockId(selectedBlockId); setBusy(true); setError(""); setMessages([]); setMessageCursor(""); setSnapshotAt(Date.now());
        try {
            const params = new URLSearchParams({kind: kind === "chats" ? "chat" : "channel", id, days: String(days)});
            if (kind === "channels") params.set("teamId", teamId);
            const response = await fetch(endpoint(`/teams/messages?${params}`), {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {messages?: TeamsMessage[]; nextLink?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Impossibile caricare i messaggi Teams.");
            if (requestId === requestSequence.current) { setMessages(Array.isArray(data.messages) ? data.messages : []); setMessageCursor(data.nextLink || ""); }
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "Impossibile caricare i messaggi Teams."); }
        finally { if (requestId === requestSequence.current) setBusy(false); }
    }

    async function loadOlderMessages() {
        if (!visibleMessageCursor || activeBusy) return;
        const requestId = ++requestSequence.current;
        setBusyBlockId(selectedBlockId); setBusy(true); setError("");
        try {
            const params = new URLSearchParams({cursor: visibleMessageCursor});
            const response = await fetch(endpoint(`/teams/messages?${params}`), {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {messages?: TeamsMessage[]; nextLink?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to load older Teams messages.");
            if (requestId === requestSequence.current) {
                setMessages(current => { const seen = new Set(current.map(message => message.id)); return [...current, ...(data.messages || []).filter(message => !seen.has(message.id))]; });
                setMessageCursor(data.nextLink || "");
            }
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "Unable to load older Teams messages."); }
        finally { if (requestId === requestSequence.current) setBusy(false); }
    }

    async function loadMoreReplies(message: TeamsMessage) {
        if (!message.repliesNextLink || activeBusyReplyId) return;
        const requestId = requestSequence.current;
        setBusyReplyId(message.id); setBusyReplyBlockId(selectedBlockId); setError("");
        try {
            const params = new URLSearchParams({cursor: message.repliesNextLink, parentId: message.id});
            const response = await fetch(endpoint(`/teams/messages?${params}`), {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {messages?: TeamsMessage[]; nextLink?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to load more thread replies.");
            if (requestId === requestSequence.current) {
                const additions = data.messages || [];
                setMessages(current => {
                    const seen = new Set(current.map(item => item.id));
                    return [...current, ...additions.filter(item => !seen.has(item.id))].map(item => item.id === message.id ? {...item, repliesNextLink: data.nextLink || ""} : item);
                });
            }
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "Unable to load more thread replies."); }
        finally { if (requestId === requestSequence.current) setBusyReplyId(""); }
    }

    const selectedMessages = useMemo(() => {
        const cutoff = snapshotAt - days * 86_400_000;
        const needle = query.trim().toLocaleLowerCase();
        return (messagesBlockId === selectedBlockId ? messages : []).filter(message => {
            if (message.createdAt && new Date(message.createdAt).getTime() < cutoff) return false;
            if (filter === "mentions" && !message.mentions.length) return false;
            if (filter === "files" && !message.attachments.length) return false;
            if (filter === "messages" && (!message.text || message.mentions.length || message.attachments.length)) return false;
            return !needle || `${message.sender} ${message.text} ${message.attachments.map(file => file.name).join(" ")} ${message.mentions.join(" ")}`.toLocaleLowerCase().includes(needle);
        });
    }, [days, filter, messages, messagesBlockId, query, selectedBlockId, snapshotAt]);

    return <section className="sourceCard teamsSourceCard">
        <div className="sourceHeader"><Users size={27} className="teamsPanelIcon"/><span className="sourceTitle">Teams</span><button type="button" className="teamsRefresh" title="Refresh Teams lists" onClick={() => void loadDirectories()} disabled={activeBusy || !selectedBlockId}><RefreshCw className={activeBusy ? "spin" : ""} size={14}/></button>
            <button type="button" className="teamsAccountButton" aria-expanded={accountChooserOpen} onClick={() => setAccountChooserOpen(value => !value)}>{selectedAccount?.email || (selectedBlockId ? "Microsoft account" : "Choose account")}</button>
        </div>
        {accountChooserOpen && <div className="teamsAccountChooser"><strong>Microsoft account for this planet</strong>{accounts.map(account => <button type="button" key={account.blockId} className={account.blockId === selectedBlockId ? "active" : ""} onClick={() => { onAccountBlockIdChange(account.blockId === blockId ? undefined : account.blockId); setAccountChooserOpen(false); }}>{account.email || account.label}</button>)}<button type="button" onClick={() => { setAccountChooserOpen(false); void connectMicrosoft(); }}>Connect / grant Teams access</button></div>}
        {!accountChooserOpen && <div className="teamsControlPanel">
            <label>Content<select value={mode} onChange={event => { const next = event.target.value as "chats" | "channels"; setMode(next); setSelectedTeam(""); setSelectedItem(""); setChannels([]); setChannelsCursor(""); setMessages([]); setMessageCursor(""); void loadDirectories(next); }} disabled={!selectedBlockId}><option value="chats">Chats · 1:1 and groups</option><option value="channels">Teams channels</option></select></label>
            {mode === "channels" && <label>Team<select value={visibleSelectedTeam} onChange={event => { setSelectedTeam(event.target.value); setSelectedTeamBlockId(selectedBlockId); setChannels([]); setChannelsCursor(""); setSelectedItem(""); setSelectedItemBlockId(selectedBlockId); setMessages([]); setMessageCursor(""); }} disabled={!visibleTeams.length}><option value="">Choose a team</option>{visibleTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
            {mode === "chats" && <label>Chat<select value={visibleSelectedItem} onChange={event => { if (event.target.value) void loadMessages(event.target.value, "chats"); }} disabled={!visibleChats.length || activeBusy}><option value="">Choose a chat</option>{visibleChats.map(chat => <option key={chat.id} value={chat.id}>{chat.topic || chat.members.join(", ") || chat.type}</option>)}</select></label>}
            {mode === "channels" && <label>Channel<select value={visibleSelectedItem} onChange={event => { if (event.target.value) void loadMessages(event.target.value, "channels"); }} disabled={!visibleChannels.length || activeBusy}><option value="">Choose a channel</option>{visibleChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>}
            <label>Time range<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></label>
            <label>Filter<select value={filter} onChange={event => setFilter(event.target.value as ContentFilter)}><option value="all">Everything</option><option value="messages">Messages</option><option value="mentions">Mentions</option><option value="files">Shared files</option></select></label>
            <label className="teamsSearch"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search messages or files"/></label>
            {mode === "chats" && !visibleChats.length && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("chats")} disabled={activeBusy || !selectedBlockId}>{activeBusy ? <LoaderCircle className="spin" size={14}/> : <MessageCircle size={14}/>}Load chats</button>}
            {mode === "chats" && Boolean(visibleChatsCursor) && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("chats", visibleChatsCursor)} disabled={activeBusy}>Load more chats</button>}
            {mode === "channels" && !visibleTeams.length && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("channels")} disabled={activeBusy || !selectedBlockId}>{activeBusy ? <LoaderCircle className="spin" size={14}/> : <Hash size={14}/>}Load teams and channels</button>}
            {mode === "channels" && Boolean(visibleTeamsCursor) && <button type="button" className="teamsLoadButton" onClick={() => void loadDirectories("channels", visibleTeamsCursor)} disabled={activeBusy}>Load more teams</button>}
            {mode === "channels" && Boolean(visibleChannelsCursor) && <button type="button" className="teamsLoadButton" onClick={() => void loadMoreChannels()} disabled={activeBusy}>Load more channels</button>}
            {error && <p className="teamsError" role="alert">{error}</p>}
            {visibleSelectedItem && <div className="teamsMessageList">{selectedMessages.map(message => <article className={`teamsMessage${message.parentMessageId ? " teamsReply" : ""}`} key={message.id}><header><strong>{message.sender}</strong><time>{message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}</time></header>{message.text && <p>{message.text}</p>}{message.mentions.length > 0 && <div className="teamsMessageMeta"><AtSign size={13}/>{message.mentions.join(", ")}</div>}{message.attachments.map((file, index) => <div className="teamsMessageMeta" key={`${message.id}-${index}`}><File size={13}/>{file.url ? <a href={file.url} target="_blank" rel="noreferrer">{file.name}</a> : <span>{file.name}</span>}</div>)}{Boolean(message.repliesNextLink) && <button type="button" className="teamsLoadButton" onClick={() => void loadMoreReplies(message)} disabled={Boolean(activeBusyReplyId)}>{activeBusyReplyId === message.id ? <LoaderCircle className="spin" size={14}/> : <MessageCircle size={14}/>}Load more replies</button>}</article>)}{activeBusy && <p><LoaderCircle className="spin" size={14}/> Loading messages…</p>}{!activeBusy && !selectedMessages.length && <p>No messages match the selected filters.</p>}{Boolean(visibleMessageCursor) && <button type="button" className="teamsLoadButton" onClick={() => void loadOlderMessages()} disabled={activeBusy}>{activeBusy ? <LoaderCircle className="spin" size={14}/> : <MessageCircle size={14}/>}Load older messages</button>}</div>}
        </div>}
        <small className="teamsPermissionHint">Read-only · Uses the Microsoft account selected for this planet. Teams permissions may require reconnection and admin consent.</small>
    </section>;
}
