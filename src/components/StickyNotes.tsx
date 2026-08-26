import {useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from "react";
import {PanelLeftClose, Trash2} from "lucide-react";
import {API_BASE_URL} from "../api";
import type {ManagedFolder} from "./FolderManagement";

type NoteColor = "yellow" | "purple" | "blue" | "green";
interface StickyNote {id: string; color: NoteColor; text: string; relatedFiles?: string[]; x: number; y: number; width: number; height: number; hidden?: boolean; autoHeight?: boolean;}
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

function FloatingStickyNote({note, deleteArmed, floatingScale, onChange, onDelete, onHide}: {note: StickyNote; deleteArmed: boolean; floatingScale: number; onChange: (change: Partial<StickyNote>) => void; onDelete: () => void; onHide: () => void}) {
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
    return <article ref={noteRef} className={`floatingStickyNote ${note.color}`} style={{left: note.x, top: note.y, width: note.width, height: note.height, transform: `scale(${displayScale})`, transformOrigin: "top left"}}>
        <div className="stickyNoteTop" onPointerDown={beginMove} title="Drag this post-it"><button type="button" className="stickyNoteHide" onClick={onHide} title="Hide as a bookmark"><PanelLeftClose size={18}/></button><div className="stickyNoteColors">{colors.map(color => <button key={color} type="button" className={color === note.color ? "active" : ""} onClick={() => onChange({color})} aria-label={`Use ${color} note`} />)}</div><button type="button" className={`stickyNoteDelete${deleteArmed ? " confirm" : ""}`} onClick={onDelete} title={deleteArmed ? "Press again to delete" : "Delete note"}><Trash2 size={18}/></button></div><textarea ref={textAreaRef} value={note.text} onChange={event => updateText(event.target.value)} placeholder="Write a note…" />{note.relatedFiles?.length ? <small>{note.relatedFiles.join(" · ")}</small> : null}<button type="button" className="stickyNoteResize" onPointerDown={beginResize} title="Drag to resize this post-it" aria-label="Resize this post-it" />
    </article>;
}

function StickyBookmark({note, index, onOpen}: {note: StickyNote; index: number; onOpen: () => void}) {
    const trimmed = note.text.trim();
    const title = trimmed.includes("\n\n") ? trimmed.split("\n\n", 1)[0].trim() : "";
    const label = title || trimmed.split(/\s+/).slice(0, 3).join(" ") || "Empty";
    return <button type="button" className={`floatingStickyBookmark ${note.color}`} style={{top: 132 + index * 35}} onClick={onOpen} title={`Show post-it: ${label}`} aria-label={`Show hidden post-it: ${label}`}><span>{label}</span></button>;
}

export default function StickyNotes({storageScope, folders, aiEnabled, floatingScale, addRequest}: {storageScope: string; folders: ManagedFolder[]; aiEnabled: boolean; floatingScale: number; addRequest: number}) {
    const [notes, setNotes] = useState<StickyNote[]>(() => readNotes(storageScope));
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const handledAddRequest = useRef(addRequest);

    useEffect(() => { localStorage.setItem(storageKey(storageScope), JSON.stringify(notes)); }, [notes, storageScope]);
    useEffect(() => {
        const reset = (event: PointerEvent) => { if (!(event.target as Element).closest(".floatingStickyNote")) setDeleteId(null); };
        window.addEventListener("pointerdown", reset);
        return () => window.removeEventListener("pointerdown", reset);
    }, []);

    const addNote = useCallback((color: NoteColor = "yellow", text = "", relatedFiles: string[] = []) => {
        setNotes(current => [createNote(current.length, color, text, relatedFiles), ...current]);
    }, []);
    function update(id: string, change: Partial<StickyNote>) { setNotes(current => current.map(note => note.id === id ? {...note, ...change} : note)); }
    function remove(id: string) { if (deleteId === id) { setNotes(current => current.filter(note => note.id !== id)); setDeleteId(null); } else setDeleteId(id); }
    function reveal(id: string, bookmarkIndex: number) { update(id, {hidden: false, x: 16, y: Math.max(88, 124 + bookmarkIndex * 35)}); }

    useEffect(() => {
        if (addRequest === handledAddRequest.current) return;
        handledAddRequest.current = addRequest;
        addNote();
    }, [addRequest, addNote]);

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
        const createAiNote = async (event: Event) => {
            if (!aiEnabled) return;
            const prompt = String((event as CustomEvent<{prompt?: string}>).detail?.prompt || "").trim();
            if (!prompt) return;
            if (!window.confirm("FolderRocket will send this request and a compact list of local file names to OpenAI. This may use AI credit. Continue?")) return;
            try {
                const physicalFolders = folders.filter(folder => folder.storage !== "imaginary" && folder.path).map(folder => folder.path);
                const response = await fetch(`${API_BASE_URL}/sticky-notes/ai`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({prompt, folders: physicalFolders})});
                const data = await response.json().catch(() => ({})) as {text?: string; relatedFiles?: {name: string}[]; message?: string};
                if (!response.ok || !data.text) throw new Error(data.message || "Unable to create the AI note.");
                addNote("purple", data.text, (data.relatedFiles || []).map(file => file.name));
            } catch (error) { window.alert(error instanceof Error ? error.message : "Unable to create the AI note."); }
        };
        window.addEventListener("folderrocket:create-ai-sticky-note", createAiNote);
        return () => window.removeEventListener("folderrocket:create-ai-sticky-note", createAiNote);
    }, [addNote, aiEnabled, folders]);

    const visibleNotes = notes.filter(note => !note.hidden);
    const hiddenNotes = notes.filter(note => note.hidden);
    return <>{hiddenNotes.map((note, index) => <StickyBookmark key={`bookmark-${note.id}`} note={note} index={index} onOpen={() => reveal(note.id, index)} />)}{visibleNotes.map(note => <FloatingStickyNote key={note.id} note={note} deleteArmed={deleteId === note.id} floatingScale={floatingScale} onChange={change => update(note.id, change)} onDelete={() => remove(note.id)} onHide={() => update(note.id, {hidden: true})} />)}</>;
}
