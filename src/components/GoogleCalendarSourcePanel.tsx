import {additionalFileIcon} from './AdditionalFileIcons';
import {CalendarDays, ChevronLeft, ChevronRight, ExternalLink, File, FileSpreadsheet, FileText, Image, Paperclip, Plus, RefreshCw, X} from "lucide-react";
import {useCallback, useEffect, useState} from "react";
import {API_BASE_URL} from "../api";
import {CALENDAR_ATTACHMENT_TYPE} from "../dragTypes";

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    location: string;
    link: string;
    meetingLink?: string;
    attachments?: CalendarAttachment[];
}

interface CalendarAttachment {
    fileId: string;
    name: string;
    mimeType: string;
    url: string;
}


interface GoogleCalendarSourcePanelProps {
    alertBlockId: string;
    weekStart?: string;
    onWeekStartChange: (value: string) => void;
}

function startOfWeek(value: Date) {
    const start = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    return start;
}

function dateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function readWeekStart(value?: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
    if (!match) return startOfWeek(new Date());
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(parsed.getTime()) ? startOfWeek(new Date()) : startOfWeek(parsed);
}

function formatWeekRange(start: Date) {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const options: Intl.DateTimeFormatOptions = {day: "numeric", month: "short"};
    return `${start.toLocaleDateString("en-GB", options)} – ${end.toLocaleDateString("en-GB", options)}`;
}

function formatEventTime(value: string) {
    if (!value) return "Date unavailable";
    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(allDay ? `${value}T00:00:00` : value);
    if (Number.isNaN(date.getTime())) return value;
    return allDay
        ? date.toLocaleDateString("en-GB", {weekday: "short", day: "numeric", month: "short"})
        : date.toLocaleString("en-GB", {weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"});
}

function formatDuration(start: string, end: string) {
    const from = new Date(start).getTime();
    const to = new Date(end).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return "";
    const minutes = Math.round((to - from) / 60000);
    return minutes < 60 ? `- ${minutes} min` : `- ${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

function eventDayKey(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : dateKey(date);
}

function formatGridDay(value: Date) {
    return {
        weekday: value.toLocaleDateString("en-GB", {weekday: "short"}),
        day: value.toLocaleDateString("en-GB", {day: "numeric"})
    };
}

function formatSelectedDay(value: Date) {
    return value.toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "long"});
}

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, 12);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={12}/></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={12}/></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={12}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={12}/></span>;
    return <span className="fileKindIcon generic"><File size={12}/></span>;
}

export default function GoogleCalendarSourcePanel({alertBlockId, weekStart, onWeekStartChange}: GoogleCalendarSourcePanelProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [connected, setConnected] = useState(false);
    const [configured, setConfigured] = useState(true);
    const [authorizationPending, setAuthorizationPending] = useState(false);
    const [showDisconnect, setShowDisconnect] = useState(false);
    const [disconnectArmed, setDisconnectArmed] = useState(false);
    const [creating,setCreating]=useState(false),[eventTitle,setEventTitle]=useState(""),[eventStart,setEventStart]=useState(""),[eventHours,setEventHours]=useState(1),[eventGuests,setEventGuests]=useState("");

    const activeWeekStart = readWeekStart(weekStart);
    const activeWeekKey = dateKey(activeWeekStart);
    const [selectedDayKey, setSelectedDayKey] = useState(activeWeekKey);
    const calendarUrl = useCallback((endpoint: string) => `${API_BASE_URL}/calendar/google${endpoint}${endpoint.includes("?") ? "&" : "?"}blockId=${encodeURIComponent(alertBlockId)}`, [alertBlockId]);
    const calendarAuthUrl = (endpoint: string) => `${API_BASE_URL}/auth/calendar${endpoint}?blockId=${encodeURIComponent(alertBlockId)}`;
    const weekDays = Array.from({length: 7}, (_, index) => {
        const date = new Date(activeWeekStart);
        date.setDate(date.getDate() + index);
        return {date, key: dateKey(date)};
    });
    const selectedDay = weekDays.find(day => day.key === selectedDayKey) ?? weekDays[0];
    const selectedDayEvents = events.filter(event => eventDayKey(event.start) === selectedDay.key);

    useEffect(() => {
        let active = true;
        const refreshStatus = () => void fetch(calendarUrl("/status"), {credentials: "include"})
            .then(async response => {
                const data = await response.json().catch(() => ({})) as {connected?: boolean; configured?: boolean; message?: string};
                if (!response.ok) throw new Error(data.message || "Unable to check Google Calendar connection.");
                if (!active) return;
                setConnected(Boolean(data.connected));
                setConfigured(data.configured !== false);
                if (data.connected) setAuthorizationPending(false);
            })
            .catch(reason => { if (active) { setConnected(false); setError(reason instanceof Error ? reason.message : "Unable to check Google Calendar connection."); } });
        refreshStatus();
        window.addEventListener("focus", refreshStatus);
        const interval = window.setInterval(refreshStatus, authorizationPending ? 1_500 : 15_000);
        return () => { active = false; window.removeEventListener("focus", refreshStatus); window.clearInterval(interval); };
    }, [authorizationPending, calendarUrl]);

    useEffect(() => {
        const unsubscribe = window.folderRocketDesktop?.onOAuthComplete(provider => {
            if (provider === "calendar") window.dispatchEvent(new Event("focus"));
        });
        return () => unsubscribe?.();
    }, []);

    const refresh = useCallback(async (selectedWeekStart?: Date) => {
        if (!connected) return;
        const targetWeekStart = selectedWeekStart ?? readWeekStart(weekStart);
        setLoading(true); setError("");
        try {
            const response = await fetch(`${calendarUrl("/events")}&days=7&view=week&weekStart=${encodeURIComponent(dateKey(targetWeekStart))}`, {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {events?: CalendarEvent[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to read Google Calendar.");
            setEvents(Array.isArray(data.events) ? data.events : []);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Unable to read Google Calendar.");
        } finally { setLoading(false); }
    }, [connected, weekStart, calendarUrl]);

    useEffect(() => {
        if (!connected) return;
        const timer = window.setTimeout(() => void refresh(), 0);
        return () => window.clearTimeout(timer);
    }, [connected, refresh]);

    useEffect(() => {
        const detail = {
            blockId: alertBlockId,
            events: events.slice(0, 20).map(event => ({title: event.title, start: event.start, end: event.end, location: event.location, attachments: (event.attachments ?? []).map(attachment => attachment.name)}))
        };
        localStorage.setItem("folderrocket-calendar-context", JSON.stringify(detail));
        window.dispatchEvent(new CustomEvent("folderrocket-calendar-context", {detail}));
    }, [alertBlockId, events]);

    useEffect(() => {
        const closeConnectionOptions = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest(".calendarConnectionControls")) {
                setShowDisconnect(false);
                setDisconnectArmed(false);
            }
        };
        document.addEventListener("pointerdown", closeConnectionOptions);
        return () => document.removeEventListener("pointerdown", closeConnectionOptions);
    }, []);

    function moveWeek(direction: -1 | 1) {
        const next = new Date(activeWeekStart);
        next.setDate(next.getDate() + direction * 7);
        onWeekStartChange(dateKey(next));
    }

    function startAttachmentDrag(event: React.DragEvent<HTMLElement>, attachment: CalendarAttachment) {
        const data = JSON.stringify([{...attachment, sourceBlockId: alertBlockId}]);
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(CALENDAR_ATTACHMENT_TYPE, data);
        event.dataTransfer.setData("text/plain", `folderrocket-calendar:${data}`);
    }

    async function connectCalendar() {
        setError("");
        try {
            const response = await fetch(`${calendarAuthUrl("/start")}&format=json`, {headers: {Accept: "application/json"}, credentials: "include"});
            const data = await response.json() as {authorizationUrl?: string; message?: string};
            if (!response.ok || !data.authorizationUrl) throw new Error(data.message || "Google Calendar could not start the authorization.");
            setAuthorizationPending(true);
            const openedByDesktop = window.folderRocketDesktop ? await window.folderRocketDesktop.openExternal(data.authorizationUrl) : false;
            if (!openedByDesktop) window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
        } catch (reason) { setAuthorizationPending(false); setError(reason instanceof Error ? reason.message : "Google Calendar could not start the authorization."); }
    }

    async function disconnectCalendar() {
        try {
            const response = await fetch(`${calendarAuthUrl("/disconnect")}`, {method: "POST", credentials: "include"});
            const data = await response.json().catch(() => ({})) as {message?: string};
            if (!response.ok) throw new Error(data.message || "Google Calendar could not be disconnected.");
            setConnected(false);
            setEvents([]);
            setAuthorizationPending(false);
            setShowDisconnect(false);
            setDisconnectArmed(false);
            setError("");
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Google Calendar could not be disconnected."); }
    }

    async function createCalendarEvent(){
        const start=new Date(eventStart),end=new Date(start.getTime()+Math.max(.25,eventHours)*3600000);
        if(!eventTitle.trim()||Number.isNaN(start.getTime())){setError("Enter the meeting title, date and time.");return;}
        setLoading(true);setError("");
        try{const response=await fetch(calendarUrl("/events"),{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:eventTitle.trim(),start:start.toISOString(),end:end.toISOString(),attendees:eventGuests.split(/[,;\s]+/).filter(Boolean)})});const data=await response.json().catch(()=>({})) as {event?:CalendarEvent;message?:string};if(!response.ok||!data.event)throw new Error(data.message||"Unable to create the event.");setEvents(current=>[...current,data.event!].sort((a,b)=>a.start.localeCompare(b.start)));setCreating(false);setEventTitle("");setEventGuests("");}
        catch(reason){setError(reason instanceof Error?reason.message:"Unable to create the event.");}finally{setLoading(false);}
    }

    return <section className="sourceCard calendarSourceCard">
        <div className="sourceHeader calendarSourceHeader"><CalendarDays className="calendarPanelIcon" size={27}/>{connected ? <span className="emailConnectionControls calendarConnectionControls"><button type="button" className="sourceTitle emailConnectionTitle" onClick={() => { setShowDisconnect(current => !current); setDisconnectArmed(false); }} title="Google Calendar connection options">Google Calendar</button>{showDisconnect && <button type="button" className={disconnectArmed ? "emailDisconnectButton armed" : "emailDisconnectButton"} onClick={() => { if (disconnectArmed) void disconnectCalendar(); else setDisconnectArmed(true); }} title={disconnectArmed ? "Press again to disconnect Google Calendar" : "Disconnect Google Calendar"}>{disconnectArmed ? "Confirm" : "Disconnect"}</button>}</span> : <span className="sourceTitle">Google Calendar</span>}{connected&&<button type="button" className="calendarCreateToggle" title="Create meeting" onClick={()=>{setCreating(value=>!value);if(!eventStart)setEventStart(`${selectedDay.key}T09:00`);}}>{creating?<X size={14}/>:<Plus size={14}/>}</button>}{connected && <button type="button" className="calendarHeaderRefresh" onClick={() => void refresh()} disabled={loading} title="Refresh calendar" aria-label="Refresh calendar"><RefreshCw className={loading ? "spin" : ""} size={14}/></button>}{connected && <div className="calendarHeaderNavigation"><button type="button" onClick={() => moveWeek(-1)} disabled={loading} title="Previous week" aria-label="Previous week"><ChevronLeft size={14}/></button><strong title={formatWeekRange(activeWeekStart)}>{formatWeekRange(activeWeekStart)}</strong><button type="button" onClick={() => moveWeek(1)} disabled={loading} title="Next week" aria-label="Next week"><ChevronRight size={14}/></button></div>}</div>
        {connected&&creating&&<div className="calendarCreateForm"><input value={eventTitle} onChange={event=>setEventTitle(event.target.value)} placeholder="Meeting title"/><input type="datetime-local" value={eventStart} onChange={event=>setEventStart(event.target.value)}/><label><input type="number" min="0.25" step="0.25" value={eventHours} onChange={event=>setEventHours(Number(event.target.value)||1)}/> hours</label><input value={eventGuests} onChange={event=>setEventGuests(event.target.value)} placeholder="Participant emails"/><button type="button" disabled={loading} onClick={()=>void createCalendarEvent()}>Create</button></div>}
        {!connected && <div className="emailConnectArea"><p>{!configured ? "Add the Gmail client ID and secret in Account settings first." : authorizationPending ? "Finish the Google approval in your browser. FolderRocket is waiting…" : "Connect the private Google Calendar for this block."}</p><button type="button" className="emailConnectButton" onClick={() => void connectCalendar()} disabled={authorizationPending || !configured}>{authorizationPending ? "Connecting…" : "Connect Google Calendar"}</button></div>}
        {error && <p className="calendarError">{error}</p>}
        {connected && <div className="calendarEventList">
            <div className="calendarWeekGridScroll"><div className="calendarWeekGrid" role="grid" aria-label={`Week of ${formatWeekRange(activeWeekStart)}`}>{weekDays.map(day => {
                const dayEvents = events.filter(event => eventDayKey(event.start) === day.key);
                const label = formatGridDay(day.date);
                const attachmentCount = dayEvents.reduce((count, event) => count + (event.attachments?.length ?? 0), 0);
                const className = `calendarDayCell${day.key === selectedDay.key ? " selected" : ""}${day.key === dateKey(new Date()) ? " today" : ""}`;
                return <button type="button" role="gridcell" key={day.key} className={className} onClick={() => setSelectedDayKey(day.key)} aria-pressed={day.key === selectedDay.key} aria-current={day.key === dateKey(new Date()) ? "date" : undefined} title={`${formatSelectedDay(day.date)}${dayEvents.length ? ` · ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`}><span className="calendarDayLabel">{label.weekday}</span><strong>{label.day}</strong><span className="calendarDayIndicators">{dayEvents.length > 0 && <small className="hasEvents">{dayEvents.length}<span> event{dayEvents.length === 1 ? "" : "s"}</span></small>}{attachmentCount > 0 && <small className="hasFiles"><Paperclip size={9}/>{attachmentCount}<span> file{attachmentCount === 1 ? "" : "s"}</span></small>}{dayEvents.length === 0 && attachmentCount === 0 && <i>—</i>}</span></button>;
            })}</div></div>
            <section className="calendarDayDetails" aria-live="polite"><header><strong>{formatSelectedDay(selectedDay.date)}</strong><span>{selectedDayEvents.length ? `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? "" : "s"}` : "No events"}</span></header>{selectedDayEvents.length ? selectedDayEvents.map(event => <article className="calendarEvent" key={event.id || `${event.title}-${event.start}`}><div className="calendarEventSummary"><strong>{event.title}</strong><span className="calendarEventTiming">{formatEventTime(event.start)}{event.end ? ` → ${new Date(event.end).toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})}` : ""}{formatDuration(event.start,event.end) ? <b>{formatDuration(event.start,event.end)}</b> : null}</span>{event.location && <small>{event.location}</small>}<span className="calendarEventLinks">{event.meetingLink && <button type="button" onClick={() => window.open(event.meetingLink, "_blank", "noopener,noreferrer")}>Join video meeting</button>}{event.link && <button type="button" onClick={() => window.open(event.link, "_blank", "noopener,noreferrer")}>Open calendar</button>}</span></div>{event.attachments?.map(attachment => <div key={`${event.id}-${attachment.fileId}`} className="calendarAttachment" draggable onDragStart={dragEvent => startAttachmentDrag(dragEvent, attachment)} title="Drag this file into a FolderRocket folder"><FileKindIcon name={attachment.name}/><span>{attachment.name}</span><button type="button" onClick={() => window.open(attachment.url, "_blank", "noopener,noreferrer")} title="Open file"><ExternalLink size={12}/></button><Paperclip size={11}/></div>)}</article>) : <p>{loading ? "Reading calendar…" : events.length ? "No events or files on this day." : `No events in ${formatWeekRange(activeWeekStart)}.`}</p>}</section>
        </div>}
    </section>;
}
