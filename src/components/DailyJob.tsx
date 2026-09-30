import {useEffect, useMemo, useState, type ReactNode} from "react";
import {AppWindow, Flag, CalendarDays, ChevronLeft, ChevronRight, Clock, FileCheck2, FileClock, FileCog, Flame, FolderInput, Globe2, Mail, MessageCircle, Smartphone, StickyNote, Usb} from "lucide-react";
import {readDailyActivities, removeDailyActivity, watchDailyActivity, type DailyActivity} from "../dailyActivity";
import {API_BASE_URL} from "../api";

interface CalendarItem { title?: string; start?: string; end?: string; location?: string; }
interface Note { id: string; title?: string; text: string; color?: string; reminderAt?: string; }
interface EmailSource { provider: "gmail" | "outlook"; blockId: string; email: string; label: string; }

const metadata: Record<string, {label: string; color: string; icon: ReactNode}> = {
    gmail: {label: "Gmail", color: "#d84b40", icon: <Mail/>}, outlook: {label: "Outlook", color: "#2476d3", icon: <Mail/>}, teams: {label: "Teams", color: "#6251a4", icon: <MessageCircle/>},
    recent: {label: "Recent files", color: "#607d99", icon: <FileClock/>}, phone: {label: "Phone", color: "#5b54c7", icon: <Smartphone/>},
    domain: {label: "Domain", color: "#168a86", icon: <Globe2/>}, usb: {label: "USB drives", color: "#697685", icon: <Usb/>},
    fire: {label: "Fire Mountain", color: "#e05c2f", icon: <Flame/>}, studio: {label: "File Studio", color: "#9a5bb8", icon: <FileCog/>},
    folders: {label: "Folder transfers", color: "#269562", icon: <FolderInput/>}, applications: {label: "Applications", color: "#3c72a8", icon: <AppWindow/>}
};
const dayKey = (date: Date) => date.toLocaleDateString("sv-SE");
const formatDailyDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : `${date.toLocaleDateString("it-IT", {day: "2-digit", month: "2-digit", year: "numeric"}).replaceAll("/", " ")} ${date.toLocaleTimeString("it-IT", {hour: "2-digit", minute: "2-digit"})}`;
};
const formatTime = (value?: string) => {
    if (!value) return "Orario non specificato";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Orario non specificato" : date.toLocaleTimeString("it-IT", {hour: "2-digit", minute: "2-digit"});
};

export default function DailyJob({storageScope, worldId, onOpenWorkspace}: {storageScope: string; worldId: string; onOpenWorkspace: (kind: DailyActivity["kind"]) => void}) {
    const [date, setDate] = useState(() => new Date());
    const [activities, setActivities] = useState<DailyActivity[]>(() => readDailyActivities(storageScope));
    const [undoing, setUndoing] = useState<string | null>(null);
    const [emailSources, setEmailSources] = useState<EmailSource[]>([]);
    const [emailSourceId, setEmailSourceId] = useState("");
    const [recipientOverride, setRecipientOverride] = useState<string | null>(null);
    const [includeTomorrow, setIncludeTomorrow] = useState(false);
    const [draftBusy, setDraftBusy] = useState(false);
    const [draftMessage, setDraftMessage] = useState("");
    const [draftError, setDraftError] = useState("");

    useEffect(() => {
        let active = true;
        queueMicrotask(() => { if (active) setActivities(readDailyActivities(storageScope, date)); });
        return () => { active = false; };
    }, [date, storageScope]);

    useEffect(() => watchDailyActivity(() => window.setTimeout(() => setActivities(readDailyActivities(storageScope, date)), 0)), [date, storageScope]);

    useEffect(() => {
        const controller = new AbortController();
        void fetch(`${API_BASE_URL}/cargo-ship/email-sources?worldId=${encodeURIComponent(worldId)}`, {credentials: "include", signal: controller.signal})
            .then(async response => {
                const data = await response.json().catch(() => ({})) as {sources?: EmailSource[]; message?: string};
                if (!response.ok) throw new Error(data.message || "Unable to load the selected planet's email accounts.");
                if (!controller.signal.aborted) setEmailSources(Array.isArray(data.sources) ? data.sources : []);
            })
            .catch(error => { if (!controller.signal.aborted) setDraftError(error instanceof Error ? error.message : "Unable to load email accounts."); });
        return () => controller.abort();
    }, [worldId]);

    const selectedSource = emailSources.find(source => `${source.provider}:${source.blockId}` === emailSourceId) ?? emailSources[0];
    const recipient = recipientOverride ?? selectedSource?.email ?? "";

    const allCalendar = useMemo(() => {
        try {
            const blocks = JSON.parse(localStorage.getItem(`folderrocket-daily-calendars-${storageScope}`) || "{}");
            return (Object.values(blocks).flat() as CalendarItem[]).filter(item => item.start).sort((a, b) => String(a.start).localeCompare(String(b.start)));
        } catch { return []; }
    }, [storageScope]);
    const tomorrow = useMemo(() => { const value = new Date(date); value.setDate(value.getDate() + 1); return value; }, [date]);
    const calendar = useMemo(() => allCalendar.filter(item => dayKey(new Date(item.start!)) === dayKey(date)), [allCalendar, date]);
    const tomorrowCalendar = useMemo(() => allCalendar.filter(item => dayKey(new Date(item.start!)) === dayKey(tomorrow)), [allCalendar, tomorrow]);
    const reminders = useMemo(() => {
        try {
            const values = JSON.parse(localStorage.getItem(`folderrocket-sticky-notes-${storageScope}`) || "[]") as Note[];
            return values.filter(note => note.reminderAt && dayKey(new Date(note.reminderAt)) === dayKey(date)).sort((a, b) => String(a.reminderAt).localeCompare(String(b.reminderAt)));
        } catch { return []; }
    }, [date, storageScope]);
    const tomorrowReminders = useMemo(() => {
        try {
            const values = JSON.parse(localStorage.getItem(`folderrocket-sticky-notes-${storageScope}`) || "[]") as Note[];
            return values.filter(note => note.reminderAt && dayKey(new Date(note.reminderAt)) === dayKey(tomorrow)).sort((a, b) => String(a.reminderAt).localeCompare(String(b.reminderAt)));
        } catch { return []; }
    }, [storageScope, tomorrow]);
    const groups = Object.entries(activities.reduce<Record<string, DailyActivity[]>>((result, item) => { (result[item.kind] ??= []).push(item); return result; }, {}));
    const shift = (days: number) => setDate(current => { const next = new Date(current); next.setDate(next.getDate() + days); return next; });

    async function undoActivity(item: DailyActivity) {
        if (!item.undo || undoing) return;
        if (!window.confirm(`Undo “${item.summary}”? FolderRocket will reverse the recorded file operation.`)) return;
        setUndoing(item.id);
        try {
            const response = await fetch(`${API_BASE_URL}/daily-job/undo`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({undo: item.undo})});
            const data = await response.json().catch(() => ({})) as {message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to undo this operation.");
            setActivities(removeDailyActivity(storageScope, item.id, date));
        } catch (error) { window.alert(error instanceof Error ? error.message : "Unable to undo this operation."); }
        finally { setUndoing(null); }
    }

    function removeLog(item: DailyActivity) {
        if (window.confirm("Remove this entry from Daily Job history?")) setActivities(removeDailyActivity(storageScope, item.id, date));
    }

    function makeRecap() {
        const dateLabel = date.toLocaleDateString("it-IT", {day: "2-digit", month: "2-digit", year: "numeric"});
        const lines = [`FolderRocket · Riepilogo del ${dateLabel}`, "", "EVENTI DEL GIORNO", ...(calendar.length ? calendar.map(item => `• ${formatTime(item.start)}${item.end ? `–${formatTime(item.end)}` : ""} · ${item.title || "Evento"}${item.location ? ` · ${item.location}` : ""}`) : ["• Nessun evento in calendario."]), "", "PROMEMORIA IN SCADENZA", ...(reminders.length ? reminders.map(note => `• ${formatTime(note.reminderAt)} · ${note.title || note.text || "Post-it reminder"}`) : ["• Nessun post-it in scadenza."])];
        if (includeTomorrow) lines.push("", "DOMANI", ...(tomorrowCalendar.length ? tomorrowCalendar.map(item => `• ${formatTime(item.start)}${item.end ? `–${formatTime(item.end)}` : ""} · ${item.title || "Evento"}${item.location ? ` · ${item.location}` : ""}`) : ["• Nessun evento in calendario."]), ...(tomorrowReminders.length ? tomorrowReminders.map(note => `• Promemoria ${formatTime(note.reminderAt)} · ${note.title || note.text || "Post-it reminder"}`) : []));
        if (activities.length) lines.push("", "ATTIVITÀ REGISTRATE", ...activities.slice(0, 30).map(item => `• ${formatTime(item.at)} · ${item.summary}`));
        return {subject: `FolderRocket · Riepilogo ${dateLabel}`, text: lines.join("\n")};
    }

    async function createRecapDraft() {
        if (!selectedSource || !recipient.trim() || draftBusy) return;
        setDraftBusy(true); setDraftMessage(""); setDraftError("");
        try {
            const recap = makeRecap();
            const response = await fetch(`${API_BASE_URL}/cargo-ship/email-draft`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...recap, to: recipient.trim(), provider: selectedSource.provider, blockId: selectedSource.blockId})});
            const data = await response.json().catch(() => ({})) as {message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to create the recap draft.");
            setDraftMessage(data.message || "Bozza creata. Rivedila e inviala dalla tua mailbox.");
        } catch (error) { setDraftError(error instanceof Error ? error.message : "Unable to create the recap draft."); }
        finally { setDraftBusy(false); }
    }

    const isToday = dayKey(date) === dayKey(new Date());
    return <main className="dailyJobPage">
        <header><div><h1>Daily Job</h1><p>{isToday ? "Oggi" : "Attività e priorità"} · {date.toLocaleDateString("it-IT", {weekday: "long", day: "2-digit", month: "long", year: "numeric"})}</p></div><nav><button type="button" onClick={() => shift(-1)} title="Previous day"><ChevronLeft size={16}/></button><input type="date" value={dayKey(date)} onChange={event => { const next = new Date(`${event.target.value}T12:00:00`); if (!Number.isNaN(next.getTime())) setDate(next); }}/><button type="button" onClick={() => shift(1)} title="Next day"><ChevronRight size={16}/></button><button type="button" onClick={() => setDate(new Date())}>Today</button></nav></header>
        <section className="dailyPriorities"><h2 className="dailySectionTitle"><span className="dailySectionLogo priorities"><Flag size={25}/></span>Priorities</h2>
            {calendar.length > 0 && <div className="dailyPriorityCategory"><h3><CalendarDays size={15}/>Calendar · {isToday ? "Today" : "Selected day"}</h3><div className="dailyEventRows">{calendar.map((item, index) => <article className="dailyEventRow calendar" key={`${item.start}-${index}`}><span className="dailyEventLogo"><CalendarDays/></span><strong>{item.title || "Calendar appointment"}</strong><time>{formatDailyDate(item.start || "")}</time><small>{item.end ? `– ${formatTime(item.end)}` : ""}</small><small>{item.location || "Calendar"}</small></article>)}</div></div>}
            {reminders.length > 0 && <div className="dailyPriorityCategory"><h3><StickyNote size={15}/>Post-it reminders due</h3><div className="dailyEventRows">{reminders.map(note => <article className={`dailyEventRow note note-${note.color || "orange"}`} key={note.id}><span className="dailyEventLogo"><StickyNote/></span><strong>{note.title || note.text || "Post-it reminder"}</strong><time>{formatDailyDate(note.reminderAt || "")}</time><small>Due today</small><small>Post-it</small></article>)}</div></div>}
            {!calendar.length && !reminders.length && <p>No calendar appointments or post-it reminders are due today.</p>}
        </section>
        <section className="dailySummary"><h2 className="dailySectionTitle"><span className="dailySectionLogo work"><FileCheck2 size={25}/></span>Today’s work</h2><p>{activities.length ? `${activities.length} important action${activities.length === 1 ? "" : "s"} recorded across ${groups.length} block${groups.length === 1 ? "" : "s"}.` : "No work activity has been recorded for this day yet."}</p><div className="dailyGroups">{groups.map(([kind, items]) => { const meta = metadata[kind] || {label: kind, color: "#607d99", icon: <Clock/>}; return <section key={kind} style={{"--daily-accent": meta.color} as React.CSSProperties}><h3><span className="dailyGroupLogo">{meta.icon}</span>{meta.label}<small>{items.length}</small></h3>{items.map(item => <article className="dailyActivityRow" key={item.id}><time>{formatDailyDate(item.at)}</time><strong title={item.summary}>{item.summary}</strong><small className="dailyActivityDetails" title={`${meta.label} · ${item.destination || "—"} · ${item.files?.join(" · ") || "No files"}`}>From: {meta.label} · To: {item.destination || "—"} · {item.files?.join(" · ") || "No files"}</small><div className="dailyActivityActions"><button type="button" onClick={() => onOpenWorkspace(item.kind)}>Open</button>{item.undo ? <button type="button" className="dailyUndoLog" disabled={undoing === item.id} onClick={() => void undoActivity(item)}>{undoing === item.id ? "Undoing…" : "Undo"}</button> : <button type="button" className="dailyUndoLog" onClick={() => removeLog(item)}>Remove log</button>}</div></article>)}</section>; })}</div></section>
        <section className="dailyRecapPanel"><h2><Mail size={20}/>Email recap</h2><p>Prepara una bozza per il tuo account: controllala e inviala manualmente dalla mailbox. Nessuna email viene inviata automaticamente.</p>
            <div className="dailyRecapControls"><label>Email account<select value={selectedSource ? `${selectedSource.provider}:${selectedSource.blockId}` : ""} disabled={!emailSources.length} onChange={event => { setEmailSourceId(event.target.value); setRecipientOverride(null); }}><option value="">{emailSources.length ? "Choose connected account" : "No email account connected in this planet"}</option>{emailSources.map(source => <option key={`${source.provider}:${source.blockId}`} value={`${source.provider}:${source.blockId}`}>{source.label} · {source.provider === "gmail" ? "Gmail" : "Outlook"}</option>)}</select></label><label>To<input type="email" value={recipient} onChange={event => setRecipientOverride(event.target.value)} placeholder="Your email address"/></label></div>
            <label className="dailyRecapTomorrow"><input type="checkbox" checked={includeTomorrow} onChange={event => setIncludeTomorrow(event.target.checked)}/>Include tomorrow’s events and reminders</label>
            <button type="button" className="dailyCreateDraft" disabled={!selectedSource || !recipient.trim() || draftBusy} onClick={() => void createRecapDraft()}><Mail size={15}/>{draftBusy ? "Creating draft…" : "Create recap draft"}</button>
            {draftMessage && <p className="dailyRecapStatus" role="status">{draftMessage}</p>}{draftError && <p className="dailyRecapError" role="alert">{draftError}</p>}
        </section>
    </main>;
}
