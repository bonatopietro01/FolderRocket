import {useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from "react";
import {LoaderCircle, PanelLeftClose, Sparkles, Trash2} from "lucide-react";
import {API_BASE_URL} from "../api";
import type {ManagedFolder} from "./FolderManagement";

type NoteColor = "yellow" | "orange" | "red" | "purple" | "blue" | "green";
interface StickyNote {id: string; color: NoteColor; text: string; relatedFiles?: string[]; x: number; y: number; width: number; height: number; hidden?: boolean; autoHeight?: boolean; ai?: boolean; aiPrompt?: string; aiResponse?: string; aiWorking?: boolean; reminder?: boolean; reminderAt?: string; reminderFired?: boolean;}
interface CalendarContextEvent {title?: string; start?: string; end?: string; location?: string; attachments?: string[];}
const colors: NoteColor[] = ["yellow", "purple", "blue", "green"];

function storageKey(scope: string) { return `folderrocket-sticky-notes-${scope}`; }
function defaultNoteLayout(index: number): Pick<StickyNote, "x" | "y" | "width" | "height"> {
    return {x: 8, y: 112 + index * 70, width: 142, height: 66};
}
function readNotes(scope: string): StickyNote[] {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey(scope)) || "[]");
        return Array.isArray(value) ? value.filter(note => note && typeof note.id === "string" && typeof note.text === "string").map((note, index) => ({...defaultNoteLayout(index), ...note})) : [];
    } catch { return []; }
}
function createNote(index: number, color: NoteColor, text = "", relatedFiles: string[] = []): StickyNote {
    return {id: crypto.randomUUID(), color, text, relatedFiles, autoHeight: true, ...defaultNoteLayout(index)};
}

function FloatingStickyNote({note, deleteArmed, floatingScale, displayPosition, onChange, onDelete, onHide, onAskAI}: {note: StickyNote; deleteArmed: boolean; floatingScale: number; displayPosition?: {x: number; y: number}; onChange: (change: Partial<StickyNote>) => void; onDelete: () => void; onHide: () => void; onAskAI: () => void}) {
    const noteRef = useRef<HTMLElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const displayScale = Math.max(.8, Math.min(1.3, floatingScale));
    function beginMove(event: ReactPointerEvent<HTMLElement>) {
        if ((event.target as Element).closest("button, textarea, input, select")) return;
        const bounds = noteRef.current?.getBoundingClientRect();
        if (!bounds) return;
        event.preventDefault();
        const offsetX = event.clientX - bounds.left;
        const offsetY = event.clientY - bounds.top;
        const move = (moveEvent: PointerEvent) => onChange({x: Math.max(6, Math.min(window.innerWidth - note.width * displayScale - 6, moveEvent.clientX - offsetX)), y: Math.max(6, Math.min(window.innerHeight - note.height * displayScale - 6, moveEvent.clientY - offsetY))});
        const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
    }
    function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
        event.preventDefault(); event.stopPropagation();
        const initial = note;
        const startX = event.clientX;
        const startY = event.clientY;
        const move = (moveEvent: PointerEvent) => onChange({autoHeight: false, width: Math.max(145, Math.min((window.innerWidth - initial.x - 6) / displayScale, initial.width + (moveEvent.clientX - startX) / displayScale)), height: Math.max(76, Math.min((window.innerHeight - initial.y - 6) / displayScale, initial.height + (moveEvent.clientY - startY) / displayScale))});
        const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
    }
    function updateText(text: string) {
        if (note.autoHeight === false) {
            onChange({text});
            return;
        }
        // A post-it grows only for explicit new lines. Long wrapped text remains
        // inside the textarea and scrolls instead of changing the card's height.
        const lineCount = Math.max(1, text.split("\n").length);
        const nextHeight = Math.max(66, Math.min(Math.max(66, window.innerHeight - note.y - 8), 66 + (lineCount - 1) * 18 + (note.relatedFiles?.length ? 17 : 0)));
        onChange({text, height: nextHeight});
    }
    const aiMessage = note.aiWorking ? "AI is reading your request…" : note.aiResponse || "";
    const aiComment = note.aiWorking || note.aiResponse?.startsWith("Unable") === true;
    return <article ref={noteRef} className={`floatingStickyNote ${note.color}${note.ai ? " aiStickyNote" : ""}`} style={{left: displayPosition?.x ?? note.x, top: displayPosition?.y ?? note.y, width: note.width, height: note.height, transform: `scale(${displayScale})`, transformOrigin: "top left"}}>
        <div className="stickyNoteTop" onPointerDown={beginMove} title="Drag this post-it"><button type="button" className="stickyNoteHide" onClick={onHide} title="Hide as a bookmark"><PanelLeftClose size={18}/></button>{note.ai ? <span /> : <div className="stickyNoteColors">{colors.map(color => <button key={color} type="button" className={color === note.color ? "active" : ""} onClick={() => onChange({color})} aria-label={`Use ${color} note`} />)}</div>}<button type="button" className={`stickyNoteDelete${deleteArmed ? " confirm" : ""}`} onClick={onDelete} title={deleteArmed ? "Press again to delete" : "Delete note"}><Trash2 size={18}/></button></div>
        {note.ai ? <><textarea ref={textAreaRef} value={note.aiPrompt ?? ""} maxLength={400} onChange={event => onChange({aiPrompt: event.target.value, aiResponse: ""})} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); onAskAI(); } }} placeholder="Quick request (one sentence)…" /><button type="button" className="stickyAiAsk" onClick={onAskAI} disabled={note.aiWorking || !(note.aiPrompt ?? "").trim()}>{note.aiWorking ? <LoaderCircle className="spinning" size={13}/> : <Sparkles size={13}/>} {note.aiWorking ? "Reading…" : "Quick AI"}</button>{aiMessage && <div className={`stickyAiResponse${aiComment ? " comment" : ""}${note.aiResponse?.startsWith("Unable") ? " error" : ""}`}>{aiMessage}</div>}</> : <textarea ref={textAreaRef} value={note.text} onChange={event => updateText(event.target.value)} placeholder="Write a note…" />}
        {note.reminder && <label className="stickyReminderTime"><span>Reminder</span><input type="datetime-local" value={note.reminderAt ?? ""} onChange={event => onChange({reminderAt: event.target.value, reminderFired: false})}/></label>}{note.relatedFiles?.length ? <small>{note.relatedFiles.join(" · ")}</small> : null}<button type="button" className="stickyNoteResize" onPointerDown={beginResize} title="Drag to resize this post-it" aria-label="Resize this post-it" />
    </article>;
}

function StickyBookmark({note, index, scale, onOpen}: {note: StickyNote; index: number; scale: number; onOpen: () => void}) {
    const trimmed = note.text.trim();
    const title = trimmed.includes("\n\n") ? trimmed.split("\n\n", 1)[0].trim() : "";
    const label = title || trimmed.split(/\s+/).slice(0, 3).join(" ") || "Empty";
    return <button type="button" className={`floatingStickyBookmark ${note.color}`} style={{left: 0, top: 132 + index * 35 * scale, transform: `scale(${scale})`, transformOrigin: "left top"}} onClick={onOpen} title={`Show post-it: ${label}`} aria-label={`Show hidden post-it: ${label}`}><span>{label}</span></button>;
}

export default function StickyNotes({storageScope, folders, aiEnabled, floatingScale, bookmarkScale, addRequest, aiAddRequest}: {storageScope: string; folders: ManagedFolder[]; aiEnabled: boolean; floatingScale: number; bookmarkScale: number; addRequest: number; aiAddRequest: number}) {
    const [notes, setNotes] = useState<StickyNote[]>(() => readNotes(storageScope));
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const handledAddRequest = useRef(addRequest);
    const handledAiAddRequest = useRef(aiAddRequest);
    const calendarContext = useRef<CalendarContextEvent[]>([]);

    useEffect(() => { localStorage.setItem(storageKey(storageScope), JSON.stringify(notes)); }, [notes, storageScope]);
    useEffect(() => {
        const reset = (event: PointerEvent) => { if (!(event.target as Element).closest(".floatingStickyNote")) setDeleteId(null); };
        window.addEventListener("pointerdown", reset);
        return () => window.removeEventListener("pointerdown", reset);
    }, []);

    useEffect(() => {
        const updateCalendarContext = (event: Event) => {
            const values = (event as CustomEvent<{events?: CalendarContextEvent[]}>).detail?.events;
            if (!Array.isArray(values)) return;
            calendarContext.current = values
                .filter(item => item && typeof item.title === "string")
                .slice(0, 20)
                .map(item => ({title: item.title?.slice(0, 180), start: item.start?.slice(0, 60), end: item.end?.slice(0, 60), location: item.location?.slice(0, 140), attachments: Array.isArray(item.attachments) ? item.attachments.filter(name => typeof name === "string").slice(0, 5).map(name => name.slice(0, 120)) : []}));
        };
        window.addEventListener("folderrocket-calendar-context", updateCalendarContext);
        return () => window.removeEventListener("folderrocket-calendar-context", updateCalendarContext);
    }, []);

    const addNote = useCallback((color: NoteColor = "yellow", text = "", relatedFiles: string[] = []) => {
        setNotes(current => [createNote(current.length, color, text, relatedFiles), ...current]);
    }, []);
    const addAiNote = useCallback((prompt = "") => {
        setNotes(current => [{...createNote(current.length, "red"), ai: true, aiPrompt: prompt, aiResponse: "", aiWorking: false, autoHeight: false, width: 188, height: 132}, ...current]);
    }, []);
    const addReminderNote = useCallback(() => {
        setNotes(current => [{...createNote(current.length, "orange", "Reminder"), reminder: true, reminderAt: "", reminderFired: false, autoHeight: false, width: 230, height: 150}, ...current]);
    }, []);
    function update(id: string, change: Partial<StickyNote>) { setNotes(current => current.map(note => note.id === id ? {...note, ...change} : note)); }
    function remove(id: string) { if (deleteId === id) { setNotes(current => current.filter(note => note.id !== id)); setDeleteId(null); } else setDeleteId(id); }
    function reveal(id: string, bookmarkIndex: number) { update(id, {hidden: false, x: 16, y: Math.max(88, 124 + bookmarkIndex * 35)}); }

    async function askAi(note: StickyNote) {
        const prompt = (note.aiPrompt ?? "").trim();
        if (!aiEnabled || !prompt || note.aiWorking) return;
        update(note.id, {aiWorking: true, aiResponse: ""});
        try {
            const physicalFolders = folders.filter(folder => folder.storage !== "imaginary" && folder.path).map(folder => folder.path);
            const response = await fetch(`${API_BASE_URL}/sticky-notes/ai`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({prompt, folders: physicalFolders, calendarEvents: calendarContext.current})});
            const data = await response.json().catch(() => ({})) as {text?: string; relatedFiles?: {name: string}[]; message?: string};
            if (!response.ok || !data.text) throw new Error(data.message || "Unable to create the AI note.");
            update(note.id, {aiWorking: false, aiResponse: data.text, relatedFiles: (data.relatedFiles || []).map(file => file.name)});
        } catch (error) {
            update(note.id, {aiWorking: false, aiResponse: `Unable to read this request: ${error instanceof Error ? error.message : "Unknown error."}`});
        }
    }

    useEffect(() => {
        if (addRequest === handledAddRequest.current) return;
        handledAddRequest.current = addRequest;
        addNote();
    }, [addRequest, addNote]);

    useEffect(() => {
        if (aiAddRequest === handledAiAddRequest.current || !aiEnabled) return;
        handledAiAddRequest.current = aiAddRequest;
        addAiNote();
    }, [addAiNote, aiAddRequest, aiEnabled]);

    useEffect(() => {
        window.addEventListener("folderrocket:create-reminder-note", addReminderNote);
        return () => window.removeEventListener("folderrocket:create-reminder-note", addReminderNote);
    }, [addReminderNote]);

    useEffect(() => {
        const checkReminders = () => {
            const now = Date.now();
            setNotes(current => current.map(note => {
                if (!note.reminder || note.reminderFired || !note.reminderAt || new Date(note.reminderAt).getTime() > now) return note;
                const width = 340; const height = 230;
                const fired = {...note, color: "orange" as NoteColor, reminderFired: true, hidden: false, autoHeight: false, width, height, x: Math.max(16, window.innerWidth / 2 - width / 2), y: 90};
                const detail = {id: note.id, text: note.text || "Reminder", reminderAt: note.reminderAt};
                window.dispatchEvent(new CustomEvent("folderrocket:reminder-fired", {detail}));
                if ("BroadcastChannel" in window) { const channel = new BroadcastChannel("folderrocket-reminders"); channel.postMessage(detail); channel.close(); }
                return fired;
            }));
        };
        checkReminders();
        const timer = window.setInterval(checkReminders, 15_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const createCargoNote = (event: Event) => {
            const detail = (event as CustomEvent<{storageScope?: string; text?: string}>).detail;
            if (detail?.storageScope && detail.storageScope !== storageScope) return;
            const text = String(detail?.text || "").trim();
            if (text) addNote("yellow", text);
        };
        window.addEventListener("folderrocket:create-sticky-note", createCargoNote);
        const channel = "BroadcastChannel" in window ? new BroadcastChannel("folderrocket-sticky-notes") : null;
        if (channel) channel.onmessage = event => createCargoNote(new CustomEvent("folderrocket:create-sticky-note", {detail: event.data}));
        return () => { window.removeEventListener("folderrocket:create-sticky-note", createCargoNote); channel?.close(); };
    }, [addNote, storageScope]);

    useEffect(() => {
        const createAiNote = (event: Event) => {
            if (!aiEnabled) return;
            addAiNote(String((event as CustomEvent<{prompt?: string}>).detail?.prompt || "").trim());
        };
        window.addEventListener("folderrocket:create-ai-sticky-note", createAiNote);
        return () => window.removeEventListener("folderrocket:create-ai-sticky-note", createAiNote);
    }, [addAiNote, aiEnabled]);

    const visibleNotes = notes.filter(note => !note.hidden);
    const hiddenNotes = notes.filter(note => note.hidden);
    return <>{hiddenNotes.map((note, index) => <StickyBookmark key={`bookmark-${note.id}`} note={note} index={index} scale={bookmarkScale} onOpen={() => reveal(note.id, index)} />)}{visibleNotes.map(note => <FloatingStickyNote key={note.id} note={note} deleteArmed={deleteId === note.id} floatingScale={floatingScale} onChange={change => update(note.id, change)} onDelete={() => remove(note.id)} onHide={() => update(note.id, {hidden: true})} onAskAI={() => void askAi(note)} />)}</>;
}
