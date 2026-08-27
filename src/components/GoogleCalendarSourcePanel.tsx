import {CalendarDays, ChevronLeft, ChevronRight, ExternalLink, File, FileSpreadsheet, FileText, Image, Paperclip, RefreshCw} from "lucide-react";
import {useEffect, useState} from "react";
import {API_BASE_URL} from "../api";

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    location: string;
    link: string;
    attachments?: CalendarAttachment[];
}

interface CalendarAttachment {
    fileId: string;
    name: string;
    mimeType: string;
    url: string;
}

export const CALENDAR_ATTACHMENT_TYPE = "application/x-folderrocket-calendar-attachments";
type CalendarView = "week" | "upcoming";

interface GoogleCalendarSourcePanelProps {
    alertBlockId: string;
    days?: number;
    view?: CalendarView;
    weekStart?: string;
    onDaysChange: (value: number) => void;
    onViewChange: (value: CalendarView) => void;
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

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={12}/></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={12}/></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={12}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={12}/></span>;
    return <span className="fileKindIcon generic"><File size={12}/></span>;
}

export default function GoogleCalendarSourcePanel({alertBlockId, days = 14, view = "week", weekStart, onDaysChange, onViewChange, onWeekStartChange}: GoogleCalendarSourcePanelProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [connected, setConnected] = useState(false);

    const activeWeekStart = readWeekStart(weekStart);
    const calendarUrl = (endpoint: string) => `${API_BASE_URL}/calendar/google${endpoint}${endpoint.includes("?") ? "&" : "?"}blockId=${encodeURIComponent(alertBlockId)}`;
    const calendarAuthUrl = (endpoint: string) => `${API_BASE_URL}/auth/calendar${endpoint}?blockId=${encodeURIComponent(alertBlockId)}`;

    useEffect(() => {
        let active = true;
        const refreshStatus = () => void fetch(calendarUrl("/status"), {credentials: "include"}).then(response => response.json()).then((data: {connected?: boolean}) => { if (active) setConnected(Boolean(data.connected)); }).catch(() => { if (active) setConnected(false); });
        refreshStatus();
        window.addEventListener("focus", refreshStatus);
        return () => { active = false; window.removeEventListener("focus", refreshStatus); };
    }, [alertBlockId]);

    useEffect(() => {
        if (connected) void refresh();
    }, [connected]);

    async function refresh(selectedWeekStart = activeWeekStart) {
        if (!connected) return;
        setLoading(true); setError("");
        try {
            const weekQuery = view === "week" ? `&weekStart=${encodeURIComponent(dateKey(selectedWeekStart))}` : "";
            const response = await fetch(`${calendarUrl("/events")}&days=${days}&view=${view}${weekQuery}`, {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {events?: CalendarEvent[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to read Google Calendar.");
            setEvents(Array.isArray(data.events) ? data.events : []);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Unable to read Google Calendar.");
        } finally { setLoading(false); }
    }

    function moveWeek(direction: -1 | 1) {
        const next = new Date(activeWeekStart);
        next.setDate(next.getDate() + direction * 7);
        onWeekStartChange(dateKey(next));
        void refresh(next);
    }

    function startAttachmentDrag(event: React.DragEvent<HTMLElement>, attachment: CalendarAttachment) {
        const data = JSON.stringify([attachment]);
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
            const openedByDesktop = window.folderRocketDesktop ? await window.folderRocketDesktop.openExternal(data.authorizationUrl) : false;
            if (!openedByDesktop) window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Google Calendar could not start the authorization."); }
    }

    return <section className="sourceCard calendarSourceCard">
        <div className="sourceHeader"><CalendarDays className="calendarPanelIcon" size={27}/><span className="sourceTitle">Google Calendar</span></div>
        {!connected ? <div className="emailConnectArea"><p>Connect your private Google Calendar to this block.</p><button type="button" className="emailConnectButton" onClick={() => void connectCalendar()}>Connect Google Calendar</button></div> : <><div className="calendarToolbar"><select value={view} onChange={event => onViewChange(event.target.value as CalendarView)} aria-label="Calendar view"><option value="week">This week</option><option value="upcoming">Upcoming</option></select>{view === "upcoming" && <select value={days} onChange={event => onDaysChange(Number(event.target.value))} aria-label="Upcoming days"><option value={7}>7d</option><option value={14}>14d</option><option value={30}>30d</option><option value={60}>60d</option></select>}<button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh calendar"><RefreshCw className={loading ? "spin" : ""} size={15}/></button></div>{view === "week" && <div className="calendarWeekNavigation"><button type="button" onClick={() => moveWeek(-1)} disabled={loading} title="Previous week" aria-label="Previous week"><ChevronLeft size={15}/></button><strong>{formatWeekRange(activeWeekStart)}</strong><button type="button" onClick={() => moveWeek(1)} disabled={loading} title="Next week"><ChevronRight size={15}/></button></div>}</>}
        {error && <p className="calendarError">{error}</p>}
        <div className="calendarEventList">{events.length ? events.map(event => <article className="calendarEvent" key={event.id || `${event.title}-${event.start}`}><div className="calendarEventSummary"><strong>{event.title}</strong><small>{formatEventTime(event.start)}{event.location ? ` · ${event.location}` : ""}</small></div>{event.link && <button type="button" onClick={() => window.open(event.link, "_blank", "noopener,noreferrer")} title="Open event in Google Calendar"><ExternalLink size={14}/></button>}{event.attachments?.map(attachment => <div key={`${event.id}-${attachment.fileId}`} className="calendarAttachment" draggable onDragStart={dragEvent => startAttachmentDrag(dragEvent, attachment)} title="Drag this file into a FolderRocket folder"><FileKindIcon name={attachment.name}/><span>{attachment.name}</span><button type="button" onClick={() => window.open(attachment.url, "_blank", "noopener,noreferrer")} title="Open file"><ExternalLink size={12}/></button><Paperclip size={11}/></div>)}</article>) : <p>{loading ? "Reading calendar…" : connected ? "Press refresh to read your calendar." : "Connect your private calendar."}</p>}</div>
        <small className="calendarNote">This week is shown by default. Drag event files to a FolderRocket folder, or open them directly.</small>
    </section>;
}
