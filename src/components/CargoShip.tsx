import {useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type RefObject} from "react";
import {CalendarDays, ChevronDown, ChevronLeft, ChevronRight, EyeOff, FilePlus2, FileText, FolderOpen, MailPlus, Minus, Rocket, RotateCw, ScanSearch, Send, Settings2, SlidersHorizontal, StickyNote, Trash2, X, Zap} from "lucide-react";
import {API_BASE_URL} from "../api";
import {browserBridgeDropId, resolveBrowserBridgeDrop} from "../browserBridge";
import {EMAIL_ATTACHMENT_TYPE} from "./GmailSourcePanel";
import {OUTLOOK_ATTACHMENT_TYPE} from "./OutlookSourcePanel";
import {SEARCH_RESULT_TYPE} from "./SearchWorkspace";
import {CALENDAR_ATTACHMENT_TYPE} from "../dragTypes";
import type {ManagedFolder, VirtualFile} from "./FolderManagement";
import {folderProjectGroups} from "../folderProjects";

type CargoFile = {id: string; kind: "file"; file: File; name: string; size: number; sourcePath?: string};
type CargoPath = {id: string; kind: "path"; name: string; path: string; size?: number};
type CargoAttachment = {id: string; kind: "attachment"; provider: "gmail" | "outlook"; name: string; size?: number; attachmentId: string; messageId: string; mimeType: string; sourceBlockId?: string};
type CargoItem = CargoFile | CargoPath | CargoAttachment;
type CargoMode = "transport" | "calendar" | "note" | "text" | "email" | "convert" | "lens";
type CargoCalendarEvent = {title: string; start: string; end: string; location: string; attachments: string[]};
type CargoReminder = {id: string; text: string; reminderAt: string};
type CargoPostIt = {id: string; title?: string; text: string; color?: string; ai?: boolean; reminder?: boolean; reminderAt?: string; hidden?: boolean};
type CargoPostItFilter = "all" | "standard" | "ai" | "reminder";

const CARGO_TOOL_KEYS = ["transport", "calendar", "note", "text", "email", "convert", "lens"] as const;
function normaliseCargoTools(value: unknown): string[] {
    if (!Array.isArray(value)) return [...CARGO_TOOL_KEYS];
    const tools = [...new Set(value.filter((tool): tool is string => typeof tool === "string" && CARGO_TOOL_KEYS.includes(tool as typeof CARGO_TOOL_KEYS[number])))];
    return tools.length ? tools : ["transport"];
}
function sameCargoTools(left: string[], right: string[]) {
    return left.length === right.length && left.every((tool, index) => tool === right[index]);
}
function readCargoPostIts(scope: string): CargoPostIt[] {
    try {
        const value = JSON.parse(localStorage.getItem(`folderrocket-sticky-notes-${scope}`) || "[]");
        return Array.isArray(value) ? value.filter((note): note is CargoPostIt => Boolean(note) && typeof note.id === "string" && typeof note.text === "string") : [];
    } catch { return []; }
}

interface RemoteAttachment { attachmentId: string; messageId: string; mimeType: string; name: string; size?: number; sourceBlockId?: string; }
interface PathItem {name: string; path: string; size?: number}
interface EmailSource {provider: "gmail" | "outlook"; blockId: string; email: string; label: string}
interface CargoLayout {x: number; y: number; width: number; height: number}
interface CargoDestination {folderId: string; name: string; path: string; storage: "physical" | "imaginary"}
interface CargoDirectory {name: string; path: string}

function cargoId() { return crypto.randomUUID(); }
function formatSize(bytes?: number) { return !bytes ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function cargoDestinationKey(destination: CargoDestination) { return destination.storage === "imaginary" ? `virtual:${destination.folderId}` : `path:${destination.path.toLocaleLowerCase()}`; }
function readPayload<T>(value: string): T[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
function layoutKey(scope: string) { return `folderrocket-cargo-ship-layout-${scope}`; }
function noteDraftKey(scope: string) { return `folderrocket-cargo-note-draft-${scope}`; }
const DEFAULT_CARGO_SIZE = {width: 250, height: 230};
const MINIMUM_CARGO_SIZE = {width: 250, height: 230};
const MAXIMUM_CARGO_SIZE = {width: 880, height: 760};

function clampCargoSize(size: CargoLayout): CargoLayout {
    return {
        ...size,
        width: Math.max(MINIMUM_CARGO_SIZE.width, Math.min(MAXIMUM_CARGO_SIZE.width, Math.round(size.width))),
        height: Math.max(MINIMUM_CARGO_SIZE.height, Math.min(MAXIMUM_CARGO_SIZE.height, Math.round(size.height)))
    };
}

function defaultCargoLayout(): CargoLayout {
    return {
        x: typeof window === "undefined" ? 24 : Math.max(12, window.innerWidth - DEFAULT_CARGO_SIZE.width - 18),
        y: 76,
        ...DEFAULT_CARGO_SIZE
    };
}
function readCargoLayout(scope: string): CargoLayout {
    const fallback = defaultCargoLayout();
    try {
        const saved = JSON.parse(localStorage.getItem(layoutKey(scope)) || "null") as CargoLayout | null;
        if (saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) {
            return clampCargoSize({x: Math.max(8, saved.x), y: Math.max(8, saved.y), width: saved.width, height: saved.height});
        }
    } catch { /* Use the default ship location. */ }
    return fallback;
}

function CargoFolderBranch({destination, selectedKey, onSelect, initialChildren}: {destination: CargoDestination; selectedKey: string; onSelect: (destination: CargoDestination) => void; initialChildren?: CargoDirectory[]}) {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [children, setChildren] = useState<CargoDirectory[]>(initialChildren ?? []);
    const [error, setError] = useState("");
    const canReadChildren = destination.storage === "physical" && Boolean(destination.path);
    const visibleChildren = initialChildren ?? children;
    const canExpand = visibleChildren.length > 0;

    useEffect(() => {
        if (!canReadChildren || initialChildren) return;
        const controller = new AbortController();
        let active=true;
        queueMicrotask(()=>{
            if(!active)return;
            setLoading(true);
            setError("");
            void fetch(`${API_BASE_URL}/list-folder-files`, {method: "POST", signal: controller.signal, credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({folder: destination.path})})
                .then(async response => { const data = await response.json().catch(() => ({})) as {folders?: CargoDirectory[]; message?: string}; if (!response.ok) throw new Error(data.message || "Unable to read this folder."); if (!controller.signal.aborted) setChildren(data.folders ?? []); })
                .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to read this folder."); })
                .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        });
        return () => {active=false;controller.abort();};
    }, [canReadChildren, destination.path, initialChildren]);

    return <div className="cargoDestinationBranch">
        <div className="cargoDestinationRow">
            {loading ? <span className="cargoDestinationSpacer"><RotateCw className="cargoSpin" size={11}/></span> : canExpand ? <button type="button" className="cargoDestinationExpand" onClick={() => setExpanded(current => !current)} aria-label={`${expanded ? "Collapse" : "Open"} ${destination.name}`}>{expanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}</button> : <span className="cargoDestinationSpacer"/>}
            <button type="button" className={selectedKey === cargoDestinationKey(destination) ? "cargoDestinationName active" : "cargoDestinationName"} onClick={() => canExpand ? setExpanded(current => !current) : onSelect(destination)}><FolderOpen size={12}/><span>{destination.storage === "imaginary" ? "◇ " : ""}{destination.name}</span>{canExpand && <ChevronRight className="cargoDestinationSideArrow" size={11}/>}</button>
        </div>
        {expanded && <div className="cargoDestinationChildren"><button type="button" className="cargoUseCurrentFolder" onClick={() => onSelect(destination)}>Use {destination.name}</button>{visibleChildren.map(child => <CargoFolderBranch key={child.path} destination={{folderId: destination.folderId, name: child.name, path: child.path, storage: "physical"}} selectedKey={selectedKey} onSelect={onSelect}/>)}</div>}
        {error && <small className="cargoDestinationError">{error}</small>}
    </div>;
}

interface CargoShipProps {
    onOpenFileStudio: () => void;
    aiEnabled: boolean;
    storageScope: string;
    worldId?: string;
    standalone?: boolean;
    folders: ManagedFolder[];
    onVirtualFilesAdd: (folderId: string, files: VirtualFile[]) => void;
}

export default function CargoShip({onOpenFileStudio, aiEnabled, storageScope, worldId = "work", standalone = false, folders, onVirtualFilesAdd}: CargoShipProps) {
    const initialLayoutRef = useRef<CargoLayout>(readCargoLayout(storageScope));
    const [mode, setMode] = useState<CargoMode>("transport");
    const [items, setItems] = useState<CargoItem[]>([]);
    const [dropActive, setDropActive] = useState(false);
    const [text, setText] = useState("");
    const [fileName, setFileName] = useState("FolderRocket note");
    const [noteTitle, setNoteTitle] = useState(() => { try { return String(JSON.parse(localStorage.getItem(noteDraftKey(storageScope)) || "{}").title || ""); } catch { return ""; } });
    const [noteText, setNoteText] = useState(() => { try { return String(JSON.parse(localStorage.getItem(noteDraftKey(storageScope)) || "{}").text || ""); } catch { return ""; } });
    const [noteColor, setNoteColor] = useState<"yellow" | "purple" | "blue" | "green">(() => { try { const color = JSON.parse(localStorage.getItem(noteDraftKey(storageScope)) || "{}").color; return ["yellow", "purple", "blue", "green"].includes(color) ? color : "yellow"; } catch { return "yellow"; } });
    const [postItFilter, setPostItFilter] = useState<CargoPostItFilter>("all");
    const [postIts, setPostIts] = useState<CargoPostIt[]>(() => readCargoPostIts(storageScope));
    const [textFormat, setTextFormat] = useState<"note" | "txt" | "pdf" | "docx">("txt");
    const [recipient, setRecipient] = useState("");
    const [emailSubject, setEmailSubject] = useState("FolderRocket note");
    const [emailSources, setEmailSources] = useState<EmailSource[]>([]);
    const [emailSourceKey, setEmailSourceKey] = useState("");
    const [convertFormat, setConvertFormat] = useState("pdf");
    const [working, setWorking] = useState(false);
    const [message, setMessage] = useState("");
    const [open, setOpen] = useState(false);
    const [minimized, setMinimized] = useState(true);
    const [dragging, setDragging] = useState(false);
    const [position, setPosition] = useState(() => ({x: initialLayoutRef.current.x, y: initialLayoutRef.current.y}));
    const [shipSize, setShipSize] = useState(() => ({
        width: initialLayoutRef.current.width,
        height: initialLayoutRef.current.height
    }));
    const [lensQuery, setLensQuery] = useState("");
    const [lensAnalysis, setLensAnalysis] = useState("");
    const [lensImage, setLensImage] = useState("");
    const [lensFormat, setLensFormat] = useState<"txt" | "docx" | "pdf">("txt");
    const [lensError, setLensError] = useState("");
    const [lensWorking, setLensWorking] = useState(false);
    const [lensCapturing, setLensCapturing] = useState(false);
    const shipRef = useRef<HTMLElement>(null);
    const dockRef = useRef<HTMLButtonElement>(null);
    const dockMovedRef = useRef(false);
    const [selectedWorkspaceKey, setSelectedWorkspaceKey] = useState("");
    const [targetFolderId, setTargetFolderId] = useState("");
    const [targetSubfolder, setTargetSubfolder] = useState<CargoDestination | null>(null);
    const [destinationMenuOpen, setDestinationMenuOpen] = useState(false);
    const [rootSubfolderCounts, setRootSubfolderCounts] = useState<Record<string, number>>({});
    const [rootSubfolders, setRootSubfolders] = useState<Record<string, CargoDirectory[]>>({});
    const [instantDelivery, setInstantDelivery] = useState(false);
    const [desktopShipOpen, setDesktopShipOpen] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<CargoCalendarEvent[]>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(`folderrocket-calendar-context-${storageScope}`) || "null") as {events?: CargoCalendarEvent[]} | null;
            return Array.isArray(saved?.events) ? saved.events : [];
        } catch { return []; }
    });
    const [calendarDay, setCalendarDay] = useState(() => new Date().toISOString().slice(0, 10));
    const [activeReminder, setActiveReminder] = useState<CargoReminder | null>(null);
    const [showToolMenu, setShowToolMenu] = useState(false);
    useEffect(()=>{if(!showToolMenu)return;const close=(event:PointerEvent)=>{if(!(event.target as Element).closest(".cargoShipLauncherWrap"))setShowToolMenu(false);};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[showToolMenu]);
    useEffect(() => {
        if (!destinationMenuOpen) return;
        const closeDestinationMenu = (event: PointerEvent) => {
            if (!(event.target as Element).closest(".cargoDestinationPicker")) setDestinationMenuOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setDestinationMenuOpen(false);
        };
        document.addEventListener("pointerdown", closeDestinationMenu);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeDestinationMenu);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [destinationMenuOpen]);
    const [enabledTools, setEnabledTools] = useState<string[]>(() => { try { return normaliseCargoTools(JSON.parse(localStorage.getItem(`folderrocket-cargo-tools-${storageScope}`) || "null")); } catch { return [...CARGO_TOOL_KEYS]; } });
    const shipScale = 1;
    const workspaceGroups = folderProjectGroups(folders);
    const selectedWorkspace = workspaceGroups.find(group => group.key === selectedWorkspaceKey);
    const targetRootFolder = folders.find(folder => folder.id === targetFolderId);
    const targetDestination: CargoDestination | null = targetSubfolder ?? (targetRootFolder ? {folderId: targetRootFolder.id, name: targetRootFolder.name, path: targetRootFolder.path, storage: targetRootFolder.storage === "imaginary" ? "imaginary" : "physical"} : null);

    useEffect(() => {
        if (mode !== "transport" || (!open && !standalone)) return;
        const controller = new AbortController();
        for (const folder of folders) {
            if (folder.storage === "imaginary" || !folder.path) {
                continue;
            }
            void fetch(`${API_BASE_URL}/list-folder-files`, {method: "POST", signal: controller.signal, credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({folder: folder.path})})
                .then(async response => { const data = await response.json().catch(() => ({})) as {folders?: CargoDirectory[]}; if (response.ok && !controller.signal.aborted) { const children=data.folders??[]; setRootSubfolderCounts(current => ({...current, [folder.id]: children.length})); setRootSubfolders(current=>({...current,[folder.id]:children})); } })
                .catch(() => { /* The destination menu will show the folder without blocking CargoRocket. */ });
        }
        return () => controller.abort();
    }, [folders, mode, open, standalone]);

    function chooseWorkspace(key: string) {
        setSelectedWorkspaceKey(key);
        setTargetFolderId("");
        setTargetSubfolder(null);
        const group = workspaceGroups.find(item => item.key === key);
        if (!group) { setDestinationMenuOpen(false); return; }
        const onlyFolder = group.members.length === 1 ? group.members[0] : null;
        if (onlyFolder && (onlyFolder.storage === "imaginary" || rootSubfolderCounts[onlyFolder.id] === 0)) {
            setTargetFolderId(onlyFolder.id);
            setDestinationMenuOpen(false);
            return;
        }
        setDestinationMenuOpen(true);
    }

    useEffect(() => {
        const receiveCalendar = (event: Event) => {
            const detail = (event as CustomEvent<{storageScope?:string;events?: CargoCalendarEvent[]}>).detail;
            if (detail?.storageScope === storageScope && Array.isArray(detail.events)) setCalendarEvents(detail.events);
        };
        window.addEventListener("folderrocket-calendar-context", receiveCalendar);
        const receiveStorage = (event: StorageEvent) => {
            if (event.key !== `folderrocket-calendar-context-${storageScope}` || !event.newValue) return;
            try { const detail = JSON.parse(event.newValue) as {events?: CargoCalendarEvent[]}; if (Array.isArray(detail.events)) setCalendarEvents(detail.events); } catch { /* Ignore malformed context. */ }
        };
        window.addEventListener("storage", receiveStorage);
        return () => { window.removeEventListener("folderrocket-calendar-context", receiveCalendar); window.removeEventListener("storage", receiveStorage); };
    }, [storageScope]);

    useEffect(() => {
        const receive = (value: CargoReminder) => setActiveReminder(value);
        const local = (event: Event) => receive((event as CustomEvent<CargoReminder>).detail);
        window.addEventListener("folderrocket:reminder-fired", local);
        const channel = "BroadcastChannel" in window ? new BroadcastChannel("folderrocket-reminders") : null;
        if (channel) channel.onmessage = event => receive(event.data as CargoReminder);
        return () => { window.removeEventListener("folderrocket:reminder-fired", local); channel?.close(); };
    }, []);

    // The CargoRocket must never set Electron's page zoom: CargoRocket and the
    // main workspace share the same local origin, so doing so could resize the
    // whole application. The desktop process reports its own window state.
    useEffect(() => {
        if (standalone || !window.folderRocketDesktop?.cargoShipState) return;
        let active = true;
        const syncState = (state: {open: boolean}) => { if (active) setDesktopShipOpen(Boolean(state.open)); };
        void window.folderRocketDesktop.cargoShipState().then(syncState);
        const unsubscribe = window.folderRocketDesktop.onCargoShipStateChanged(syncState);
        return () => { active = false; unsubscribe(); };
    }, [standalone]);

    useEffect(() => {
        localStorage.setItem(layoutKey(storageScope), JSON.stringify({x: position.x, y: position.y, ...shipSize}));
    }, [position, shipSize, storageScope]);
    useEffect(() => {
        const key = `folderrocket-cargo-tools-${storageScope}`;
        localStorage.setItem(key, JSON.stringify(enabledTools));
        const channel = "BroadcastChannel" in window ? new BroadcastChannel("folderrocket-cargo-tools") : null;
        channel?.postMessage({storageScope, tools: enabledTools});
        channel?.close();
    }, [enabledTools, storageScope]);
    useEffect(() => {
        const key = `folderrocket-cargo-tools-${storageScope}`;
        const apply = (value: unknown) => setEnabledTools(current => {
            const next = normaliseCargoTools(value);
            return sameCargoTools(current, next) ? current : next;
        });
        const receiveStorage = (event: StorageEvent) => {
            if (event.key !== key || !event.newValue) return;
            try { apply(JSON.parse(event.newValue)); } catch { /* Ignore malformed saved settings. */ }
        };
        const channel = "BroadcastChannel" in window ? new BroadcastChannel("folderrocket-cargo-tools") : null;
        if (channel) channel.onmessage = event => {
            const data = event.data as {storageScope?: string; tools?: unknown};
            if (data?.storageScope === storageScope) apply(data.tools);
        };
        window.addEventListener("storage", receiveStorage);
        return () => { window.removeEventListener("storage", receiveStorage); channel?.close(); };
    }, [storageScope]);
    useEffect(() => {
        if (enabledTools.includes(mode)) return;
        let active=true;
        queueMicrotask(()=>{if(active)setMode(enabledTools[0] as CargoMode);});
        return()=>{active=false;};
    }, [enabledTools, mode]);
    useEffect(() => { localStorage.setItem(noteDraftKey(storageScope), JSON.stringify({title:noteTitle, text:noteText, color:noteColor})); }, [noteColor, noteText, noteTitle, storageScope]);
    useEffect(() => {
        const reload = () => setPostIts(readCargoPostIts(storageScope));
        const onUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{storageScope?: string}>).detail;
            if (!detail?.storageScope || detail.storageScope === storageScope) reload();
        };
        const onStorage = (event: StorageEvent) => { if (event.key === `folderrocket-sticky-notes-${storageScope}`) reload(); };
        window.addEventListener("folderrocket:sticky-notes-updated", onUpdated);
        window.addEventListener("storage", onStorage);
        return () => { window.removeEventListener("folderrocket:sticky-notes-updated", onUpdated); window.removeEventListener("storage", onStorage); };
    }, [storageScope]);

    useEffect(() => {
        if (!open) return;
        let active = true;
        fetch(`${API_BASE_URL}/cargo-ship/email-sources?worldId=${encodeURIComponent(worldId)}`, {credentials: "include"})
            .then(response => response.ok ? response.json() : {sources: []})
            .then((data: {sources?: EmailSource[]}) => {
                if (!active) return;
                const sources = Array.isArray(data.sources) ? data.sources : [];
                setEmailSources(sources);
                setEmailSourceKey(current => current || (sources[0] ? `${sources[0].provider}:${sources[0].blockId}` : ""));
            })
            .catch(() => { if (active) setEmailSources([]); });
        return () => { active = false; };
    }, [open, worldId]);

    function addItems(incoming: CargoItem[]) {
        if (!incoming.length) return;
        setItems(current => [...current, ...incoming.filter(item => !current.some(existing => {
            if (existing.kind === "path" && item.kind === "path") return existing.path === item.path;
            if (existing.kind === "attachment" && item.kind === "attachment") return existing.provider === item.provider && existing.messageId === item.messageId && existing.attachmentId === item.attachmentId;
            if (existing.kind === "file" && item.kind === "file") return existing.file.name === item.file.name && existing.file.size === item.file.size && existing.file.lastModified === item.file.lastModified;
            return false;
        }))]);
        setMessage(`${incoming.length} item${incoming.length === 1 ? "" : "s"} loaded aboard.`);
    }

    function addOrAutoSend(incoming: CargoItem[]) {
        addItems(incoming);
        if (instantDelivery && targetDestination) void sendToFolder(incoming);
    }

    async function handleDrop(event: DragEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();
        setDropActive(false);
        const bridgeId = browserBridgeDropId(event.dataTransfer.getData("text/plain"));
        if (bridgeId) {
            try {
                const files = await resolveBrowserBridgeDrop(bridgeId);
                if (mode === "email") addItems(files.map(file => ({...file, id: cargoId(), kind: "path" as const}))); else addOrAutoSend(files.map(file => ({...file, id: cargoId(), kind: "path" as const})));
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to prepare the Gmail attachment.");
            }
            return;
        }
        let gmail = event.dataTransfer.getData(EMAIL_ATTACHMENT_TYPE);
        let outlook = event.dataTransfer.getData(OUTLOOK_ATTACHMENT_TYPE);
        const droppedText = event.dataTransfer.getData("text/plain").trim();
        // A custom drag type can be stripped when the CargoRocket is in its own
        // Electron window. The plain-text payload keeps Gmail/Outlook attachments draggable.
        if (!gmail && !outlook && droppedText.startsWith("folderrocket-email:")) {
            try {
                const payload = JSON.parse(droppedText.slice("folderrocket-email:".length)) as {provider?: string; attachments?: RemoteAttachment[]};
                const attachments = JSON.stringify(payload.attachments ?? []);
                if (payload.provider === "gmail") gmail = attachments;
                if (payload.provider === "outlook") outlook = attachments;
            } catch { /* Ignore unrelated text drops. */ }
        }
        const search = event.dataTransfer.getData(SEARCH_RESULT_TYPE);
        let calendar = event.dataTransfer.getData(CALENDAR_ATTACHMENT_TYPE);
        if (!calendar && droppedText.startsWith("folderrocket-calendar:")) calendar = droppedText.slice("folderrocket-calendar:".length);
        if (calendar) {
            try {
                const attachments = readPayload<{fileId:string;name:string;mimeType?:string;sourceBlockId?:string}>(calendar);
                const downloaded = await Promise.all(attachments.map(async attachment => { const parameters=new URLSearchParams({fileId:attachment.fileId,name:attachment.name,mimeType:attachment.mimeType||"",blockId:attachment.sourceBlockId||""}); const response=await fetch(`${API_BASE_URL}/calendar/google/attachments/download?${parameters}`,{credentials:"include"}); if(!response.ok)throw new Error(`Unable to download ${attachment.name}.`); const blob=await response.blob(); const file=new File([blob],attachment.name,{type:attachment.mimeType||blob.type}); return {id:cargoId(),kind:"file" as const,file,name:file.name,size:file.size}; }));
                if (mode === "email") addItems(downloaded); else addOrAutoSend(downloaded);
            } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to prepare the calendar attachment."); }
            return;
        }
        if (gmail || outlook) {
            const provider: "gmail" | "outlook" = gmail ? "gmail" : "outlook";
            const attachments = readPayload<RemoteAttachment>(gmail || outlook).filter(item => item && item.name && item.attachmentId && item.messageId);
            const incoming=attachments.map(item => ({...item, id: cargoId(), kind: "attachment" as const, provider})); if(mode === "email") addItems(incoming); else addOrAutoSend(incoming);
            return;
        }
        if (search) {
            const paths = readPayload<PathItem>(search).filter(item => item && item.name && item.path);
            const incoming=paths.map(item => ({...item, id: cargoId(), kind: "path" as const})); if(mode === "email") addItems(incoming); else addOrAutoSend(incoming);
            return;
        }
        const files = Array.from(event.dataTransfer.files);
        if (files.length) {
            const incoming = await Promise.all(files.map(async file => {
                // Electron 44 no longer exposes File.path. Resolve the original
                // path through the narrow preload bridge so folder delivery can
                // move the actual file; web-only drops remain export/copy based.
                let sourcePath = typeof (file as File & {path?: unknown}).path === "string"
                    ? (file as File & {path: string}).path
                    : undefined;
                if (!sourcePath && window.folderRocketDesktop?.getPathForFile) {
                    try { sourcePath = window.folderRocketDesktop.getPathForFile(file) || undefined; }
                    catch { /* A browser or virtual file has no native source path. */ }
                }
                return {id: cargoId(), kind: "file" as const, file, name: file.name, size: file.size, sourcePath};
            }));
            if (mode === "email") addItems(incoming); else addOrAutoSend(incoming);
            return;
        }
        if (droppedText) {
            setMode("text");
            setText(current => current ? `${current}\n${droppedText}` : droppedText);
            setMessage("Text loaded aboard. Choose a file type below.");
        }
    }

    function handleItemDrag(event: DragEvent<HTMLDivElement>, item: CargoItem) {
        event.dataTransfer.effectAllowed = "copy";
        if (item.kind === "file") { event.dataTransfer.items.add(item.file); return; }
        if (item.kind === "path") {
            const value = JSON.stringify([{name: item.name, path: item.path, size: item.size}]);
            event.dataTransfer.setData(SEARCH_RESULT_TYPE, value);
            event.dataTransfer.setData("text/plain", `folderrocket-search:${value}`);
            return;
        }
        const attachment = {attachmentId: item.attachmentId, messageId: item.messageId, mimeType: item.mimeType, name: item.name, size: item.size, sourceBlockId: item.sourceBlockId};
        event.dataTransfer.setData(item.provider === "gmail" ? EMAIL_ATTACHMENT_TYPE : OUTLOOK_ATTACHMENT_TYPE, JSON.stringify([attachment]));
        event.dataTransfer.setData("text/plain", `folderrocket-email:${JSON.stringify({provider: item.provider, attachments: [attachment]})}`);
    }

    async function createTextFile() {
        if (!text.trim() || working) return;
        if (textFormat === "note") {
            const noteText = fileName.trim() ? `${fileName.trim()}\n\n${text.trim()}` : text.trim();
            const detail = {storageScope, text: noteText};
            window.dispatchEvent(new CustomEvent("folderrocket:create-sticky-note", {detail}));
            if ("BroadcastChannel" in window) {
                const channel = new BroadcastChannel("folderrocket-sticky-notes");
                channel.postMessage(detail);
                channel.close();
            }
            setText("");
            setMessage("A new note is ready on the left side of the workspace.");
            return;
        }
        setWorking(true); setMessage("");
        try {
            const response = await fetch(`${API_BASE_URL}/cargo-ship/text-file`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({name: fileName, text, format: textFormat})});
            const data = await response.json() as {file?: PathItem; message?: string};
            if (!response.ok || !data.file) throw new Error(data.message ?? "Unable to create the file.");
            addItems([{...data.file, id: cargoId(), kind: "path"}]);
            setText("");
            setMessage(`${data.file.name} is ready in CargoRocket.`);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create the file."); }
        finally { setWorking(false); }
    }

    function createPostIt() {
        const body = noteText.trim();
        if (!body) return;
        const detail = {storageScope, title:noteTitle.trim(), text:body, color:noteColor};
        window.dispatchEvent(new CustomEvent("folderrocket:create-sticky-note", {detail}));
        if ("BroadcastChannel" in window) {
            const channel = new BroadcastChannel("folderrocket-sticky-notes");
            channel.postMessage(detail);
            channel.close();
        }
        setNoteTitle("");
        setNoteText("");
        setMessage("Post-it added to the workspace.");
    }

    function createAiPostIt() {
        const detail = {type: "ai", storageScope};
        window.dispatchEvent(new CustomEvent("folderrocket:create-ai-sticky-note", {detail}));
        if ("BroadcastChannel" in window) { const channel = new BroadcastChannel("folderrocket-sticky-notes"); channel.postMessage(detail); channel.close(); }
        setMessage(aiEnabled ? "AI post-it added to this planet." : "Enable AI for this planet to create an AI post-it.");
    }

    function createReminderPostIt() {
        const detail = {type: "reminder", storageScope};
        window.dispatchEvent(new CustomEvent("folderrocket:create-reminder-note", {detail}));
        if ("BroadcastChannel" in window) { const channel = new BroadcastChannel("folderrocket-sticky-notes"); channel.postMessage(detail); channel.close(); }
        setMessage("Reminder post-it added to this planet.");
    }

    const visiblePostIts = postIts.filter(note => postItFilter === "all"
        || (postItFilter === "reminder" ? Boolean(note.reminder) : postItFilter === "ai" ? Boolean(note.ai) : !note.reminder && !note.ai));

    async function createEmailDraft() {
        const source = emailSources.find(item => `${item.provider}:${item.blockId}` === emailSourceKey);
        if (!source || !recipient.trim() || !text.trim() || working) { setMessage("Choose a connected mailbox, add a recipient, and write the email."); return; }
        setWorking(true); setMessage("");
        try {
            const localItems = items.filter((item): item is CargoFile => item.kind === "file");
            const pathItems = items.filter((item): item is CargoPath => item.kind === "path");
            const remoteItems = items.filter((item): item is CargoAttachment => item.kind === "attachment");
            const staged = await stageLocalFiles(localItems);
            const stagedRemote = await stageAttachments(remoteItems);
            const attachments = [...pathItems.map(item => ({name:item.name,path:item.path,size:item.size})), ...staged, ...stagedRemote];
            const response = await fetch(`${API_BASE_URL}/cargo-ship/email-draft`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({provider: source.provider, blockId: source.blockId, to: recipient, subject: emailSubject, text, attachments})});
            const data = await response.json() as {message?: string};
            if (!response.ok) throw new Error(data.message ?? "Unable to save the draft.");
            if (attachments.length) setItems([]);
            setMessage(data.message ?? "Draft saved in the selected mailbox.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the draft."); }
        finally { setWorking(false); }
    }

    async function stageLocalFiles(localItems: CargoFile[]) {
        if (!localItems.length) return [] as PathItem[];
        const formData = new FormData();
        localItems.forEach(item => formData.append("files", item.file));
        const response = await fetch(`${API_BASE_URL}/cargo-ship/stage-files`, {method: "POST", credentials: "include", body: formData});
        const data = await response.json() as {files?: PathItem[]; message?: string};
        if (!response.ok) throw new Error(data.message ?? "Unable to stage local files.");
        return data.files ?? [];
    }

    async function stageAttachments(attachments: CargoAttachment[]) {
        if (!attachments.length) return [] as PathItem[];
        return Promise.all(attachments.map(async attachment => {
            const blockQuery = attachment.sourceBlockId ? `?blockId=${encodeURIComponent(attachment.sourceBlockId)}` : "";
            const response = await fetch(`${API_BASE_URL}/email/${attachment.provider}/attachments/save-reference${blockQuery}`, {
                method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({messageId: attachment.messageId, attachmentId: attachment.attachmentId, name: attachment.name})
            });
            const data = await response.json().catch(() => ({})) as {name?: string; path?: string; size?: number; message?: string};
            if (!response.ok || !data.path || !data.name) throw new Error(data.message ?? `Unable to prepare ${attachment.name}.`);
            return {name: data.name, path: data.path, size: data.size};
        }));
    }

    async function convertItems() {
        if (working) return;
        const pathItems = items.filter((item): item is CargoPath => item.kind === "path");
        const localItems = items.filter((item): item is CargoFile => item.kind === "file");
        if (!pathItems.length && !localItems.length) { setMessage("Add a local file or a search result before converting."); return; }
        setWorking(true); setMessage("Preparing conversion…");
        try {
            const staged = await stageLocalFiles(localItems);
            const allPaths = [...pathItems.map(item => ({name: item.name, path: item.path, size: item.size})), ...staged];
            const response = await fetch(`${API_BASE_URL}/convert-files`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({paths: allPaths.map(item => item.path), files: allPaths, format: convertFormat})});
            const data = await response.json() as {converted?: PathItem[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? "Conversion failed.");
            const converted = data.converted ?? [];
            addItems(converted.map(item => ({...item, id: cargoId(), kind: "path"})));
            setMessage(`Converted ${converted.length}/${allPaths.length} file${allPaths.length === 1 ? "" : "s"}.`);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Conversion failed."); }
        finally { setWorking(false); }
    }

    async function sendToFolder(candidateItems = items) {
        const target = targetDestination;
        if (!target || working) { setMessage("Choose a FolderRocket folder first."); return; }
        const pathItems = candidateItems.filter((item): item is CargoPath => item.kind === "path");
        const localItems = candidateItems.filter((item): item is CargoFile => item.kind === "file");
        const attachments = candidateItems.filter((item): item is CargoAttachment => item.kind === "attachment");
        if (!pathItems.length && !localItems.length && !attachments.length) { setMessage("Add a file, attachment, or search result."); return; }
        setWorking(true); setMessage("Sending cargo…");
        try {
            const originalPathFiles = localItems.filter(item => item.sourcePath);
            const uploadOnlyFiles = localItems.filter(item => !item.sourcePath);
            const staged = await stageLocalFiles(uploadOnlyFiles);
            const stagedAttachments = await stageAttachments(attachments);
            const directFiles = [
                ...pathItems.map(item => ({name: item.name, path: item.path, size: item.size})),
                ...originalPathFiles.map(item => ({name: item.name, path: item.sourcePath!, size: item.size}))
            ];
            const sendable = [...directFiles, ...staged, ...stagedAttachments];
            if (target.storage === "imaginary") {
                onVirtualFilesAdd(target.folderId, sendable.map(item => ({...item, createdAt: new Date().toISOString()})));
                setItems(current => current.filter(item => !candidateItems.some(candidate => candidate.id === item.id)));
                setMessage(`${sendable.length} file${sendable.length === 1 ? "" : "s"} added to ${target.name} as references. Original files remain in their folders.`);
            } else {
                if (!target.path) throw new Error("This folder needs a valid path.");
                const stagedPaths = new Map<string, string>();
                staged.forEach((file, index) => { const item = uploadOnlyFiles[index]; if (item) stagedPaths.set(file.path, item.id); });
                stagedAttachments.forEach((file, index) => { const item = attachments[index]; if (item) stagedPaths.set(file.path, item.id); });
                const directItemIds = new Map<string, string>();
                pathItems.forEach(item => directItemIds.set(item.path, item.id));
                originalPathFiles.forEach(item => directItemIds.set(item.sourcePath!, item.id));
                const conflictChoices: Record<string, "rename" | "replace" | "skip"> = {};
                let data: {message?: string; moved?:Array<{name:string;path:string;sourcePath?:string}>; skipped?:Array<{name:string;path:string;sourcePath?:string}>; conflicts?:Array<{sourcePath:string;name:string}>} = {};

                for (;;) {
                    const response = await fetch(`${API_BASE_URL}/files/move`, {
                        method: "POST",
                        credentials: "include",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({destination: target.path, items: sendable.map(item => ({path: item.path, name: item.name, conflict: conflictChoices[item.path]}))})
                    });
                    data = await response.json().catch(() => ({})) as typeof data;
                    if (response.status !== 409 || !Array.isArray(data.conflicts)) {
                        if (!response.ok) throw new Error(data.message ?? "Unable to send the cargo.");
                        break;
                    }
                    for (const conflict of data.conflicts) {
                        const choice = window.prompt(`“${conflict.name}” esiste già nella cartella di destinazione. Digita rinomina, sostituisci o salta per questo file. Annulla interrompe l’invio.`);
                        if (choice === null) throw new Error("Invio annullato. I file sono ancora in CargoRocket.");
                        const normalized = choice.trim().toLowerCase();
                        const action = ["rinomina", "rename"].includes(normalized) ? "rename" : ["sostituisci", "replace"].includes(normalized) ? "replace" : ["salta", "skip"].includes(normalized) ? "skip" : "";
                        if (!action) throw new Error("Scelta non riconosciuta. Riprova: rinomina, sostituisci o salta.");
                        conflictChoices[conflict.sourcePath] = action;
                    }
                }

                const moved = data.moved ?? [];
                const skipped = data.skipped ?? [];
                const movedOriginals = moved.filter(file => file.sourcePath && directItemIds.has(file.sourcePath));
                const movedItemIds = new Set<string>();
                for (const file of moved) {
                    const itemId = directItemIds.get(file.sourcePath ?? "") ?? stagedPaths.get(file.sourcePath ?? "");
                    if (itemId) movedItemIds.add(itemId);
                }
                const skippedIds = new Set<string>();
                for (const file of skipped) {
                    const itemId = directItemIds.get(file.sourcePath ?? "") ?? stagedPaths.get(file.sourcePath ?? "");
                    if (itemId) skippedIds.add(itemId);
                }
                const undoEntries = movedOriginals.map(file => ({from:file.sourcePath ?? "",to:file.path})).filter(entry => entry.from && entry.to);
                if (movedOriginals.length) window.dispatchEvent(new CustomEvent("folderrocket-files-moved",{detail:{source:"folders",destination:target.path,moved:movedOriginals,undo:{type:"move",entries:undoEntries}}}));
                const completedIds = new Set([...movedItemIds].filter(id => !skippedIds.has(id)));
                setItems(current => current.filter(item => !completedIds.has(item.id)));
                const exportedCount = Math.max(0, moved.length - movedOriginals.length);
                const statusParts: string[] = [];
                if (movedOriginals.length) statusParts.push(`${movedOriginals.length} moved`);
                if (exportedCount) statusParts.push(`${exportedCount} exported; original sources retained`);
                if (skipped.length) statusParts.push(`${skipped.length} skipped and kept aboard`);
                setMessage(statusParts.length ? `${statusParts.join(" · ")}.` : "No files were moved.");
            }
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to send the cargo."); }
        finally { setWorking(false); }
    }

    function startDrag(event: ReactPointerEvent<HTMLElement>, targetRef: RefObject<HTMLElement | HTMLButtonElement | null> = shipRef, allowButton = false) {
        if (!allowButton && (event.target as Element).closest("button, input, select, textarea")) return;
        const bounds = targetRef.current?.getBoundingClientRect();
        if (!bounds) return;
        event.preventDefault();
        const offsetX = event.clientX - bounds.left;
        const offsetY = event.clientY - bounds.top;
        const renderedWidth = bounds.width;
        const renderedHeight = bounds.height;
        dockMovedRef.current = false;
        setDragging(true);
        const move = (moveEvent: PointerEvent) => {
            if (Math.abs(moveEvent.clientX - event.clientX) > 4 || Math.abs(moveEvent.clientY - event.clientY) > 4) dockMovedRef.current = true;
            setPosition({
                x: Math.max(8, Math.min(window.innerWidth - renderedWidth - 8, moveEvent.clientX - offsetX)),
                y: Math.max(8, Math.min(window.innerHeight - renderedHeight - 8, moveEvent.clientY - offsetY))
            });
        };
        const stop = () => {
            setDragging(false);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    function startStandaloneDockDrag(event: ReactPointerEvent<HTMLButtonElement>) {
        if (!standalone) return;
        const startScreenX = event.screenX;
        const startScreenY = event.screenY;
        const startWindowX = window.screenX;
        const startWindowY = window.screenY;
        dockMovedRef.current = false;
        const move = (moveEvent: PointerEvent) => {
            const deltaX = moveEvent.screenX - startScreenX;
            const deltaY = moveEvent.screenY - startScreenY;
            if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) dockMovedRef.current = true;
            void window.folderRocketDesktop?.moveCargoShipWindow({x: startWindowX + deltaX, y: startWindowY + deltaY});
        };
        const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
        event.preventDefault();
        event.stopPropagation();
        const initialSize = standalone
            // `innerWidth` is expressed in the CargoRocket page zoom. Convert
            // it back to desktop pixels before requesting an Electron resize.
            ? {width: Math.round(window.innerWidth * shipScale), height: Math.round(window.innerHeight * shipScale)}
            : shipSize;
        const startX = event.screenX;
        const startY = event.screenY;
        const move = (moveEvent: PointerEvent) => {
            const deltaX = moveEvent.screenX - startX;
            const deltaY = moveEvent.screenY - startY;
            if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
            const nextSize = clampCargoSize({
                x: 0,
                y: 0,
                width: initialSize.width + deltaX,
                height: initialSize.height + deltaY
            });
            if (standalone) {
                void window.folderRocketDesktop?.resizeCargoShipWindow(nextSize);
                return;
            }
            setShipSize(nextSize);
        };
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    async function captureBehindShip() {
        if (!window.folderRocketDesktop?.captureBehindCargoShip) { setLensError("Lens is available in the local FolderRocket desktop app."); return; }
        setLensError(""); setLensCapturing(true);
        try {
            await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
            const imageDataUrl = await window.folderRocketDesktop.captureBehindCargoShip({topInset: 39});
            setLensImage(imageDataUrl);
            return imageDataUrl;
        } catch (error) { setLensError(error instanceof Error ? error.message : "Lens capture failed."); return ""; }
        finally { setLensCapturing(false); }
    }

    async function analyseBehindShip() {
        if (!aiEnabled || lensWorking) return;
        setLensWorking(true); setLensError(""); setLensAnalysis("");
        try {
            const imageDataUrl = lensImage || await captureBehindShip();
            if (!imageDataUrl) return;
            const response = await fetch(`${API_BASE_URL}/projection/analyze`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({imageDataUrl, query: lensQuery})});
            const data = await response.json().catch(() => ({})) as {analysis?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Lens analysis failed.");
            setLensAnalysis(data.analysis || "No readable information was found behind CargoRocket.");
        } catch (error) { setLensError(error instanceof Error ? error.message : "Lens analysis failed."); }
        finally { setLensWorking(false); }
    }

    async function saveLensScreenshot() {
        if (lensWorking) return;
        setLensWorking(true); setLensError("");
        try {
            const imageDataUrl = lensImage || await captureBehindShip();
            if (!imageDataUrl) return;
            const response = await fetch(`${API_BASE_URL}/cargo-ship/lens-screenshot`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({imageDataUrl})});
            const data = await response.json().catch(() => ({})) as {file?: PathItem; message?: string};
            if (!response.ok || !data.file) throw new Error(data.message || "Unable to save screenshot.");
            addOrAutoSend([{...data.file, id: cargoId(), kind: "path"}]);
            setMessage(`${data.file.name} is ready in CargoRocket.`);
        } catch (error) { setLensError(error instanceof Error ? error.message : "Unable to save screenshot."); }
        finally { setLensWorking(false); }
    }

    async function saveLensText() {
        if (!lensAnalysis.trim() || lensWorking) return;
        setLensWorking(true); setLensError("");
        try {
            const response = await fetch(`${API_BASE_URL}/cargo-ship/text-file`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: "Lens reading", text: lensAnalysis, format: lensFormat})});
            const data = await response.json().catch(() => ({})) as {file?: PathItem; message?: string};
            if (!response.ok || !data.file) throw new Error(data.message || "Unable to save the AI reading.");
            addOrAutoSend([{...data.file, id: cargoId(), kind: "path"}]);
            setMessage(`${data.file.name} is ready in CargoRocket.`);
        } catch (error) { setLensError(error instanceof Error ? error.message : "Unable to save the AI reading."); }
        finally { setLensWorking(false); }
    }

    function openShip() {
        if (standalone) {
            setMinimized(false);
            setOpen(true);
            void window.folderRocketDesktop?.setCargoShipExpanded(true);
            return;
        }
        setPosition(current => ({x: Math.max(8, Math.min(window.innerWidth - shipSize.width * shipScale - 8, current.x)), y: Math.max(8, Math.min(window.innerHeight - shipSize.height * shipScale - 8, current.y))}));
        setMinimized(false);
        setOpen(true);
    }
    function minimizeShip() {
        setOpen(false);
        setMinimized(true);
        if (standalone) void window.folderRocketDesktop?.setCargoShipExpanded(false);
    }
    function compactShip() {
        const compactSize = {...MINIMUM_CARGO_SIZE};
        if (standalone) {
            void window.folderRocketDesktop?.resizeCargoShipWindow(compactSize);
            return;
        }
        setShipSize(compactSize);
        setPosition(current => ({
            x: Math.max(8, Math.min(window.innerWidth - compactSize.width * shipScale - 8, current.x)),
            y: Math.max(8, Math.min(window.innerHeight - compactSize.height * shipScale - 8, current.y))
        }));
    }
    function closeShip() {
        if (standalone) {
            void window.folderRocketDesktop?.closeCargoShipWindow();
            return;
        }
        setOpen(false);
        setMinimized(false);
    }
    const shipPanelStyle = standalone
        ? undefined
        : {left: position.x, top: position.y, width: shipSize.width, height: shipSize.height, transform: `scale(${shipScale})`, transformOrigin: "top left"};
    const toolsMenu = showToolMenu && <div className="cargoToolsMenu cargoLauncherToolsMenu"><strong>CargoRocket tools</strong>{[["transport","Files"],["calendar","One-day calendar"],["note","Post-it"],["text","Text"],["email","Email"],["convert","Convert"],...(aiEnabled ? [["lens","Lens"]] : [])].map(([key,label]) => <label key={key}><input type="checkbox" checked={enabledTools.includes(key)} onChange={event => setEnabledTools(current => normaliseCargoTools(event.target.checked ? [...current, key] : current.filter(item => item !== key)))}/>{label}</label>)}</div>;
    const destinationSelector = <div className="cargoFolderSend">
        <select className="cargoWorkspaceSelect" aria-label="Workspace or folder" value={selectedWorkspaceKey} onChange={event => chooseWorkspace(event.target.value)}>
            <option value="">Workspace…</option>
            {workspaceGroups.map(group => { const hasNextLevel = group.members.length > 1 || (group.members.length === 1 && (rootSubfolderCounts[group.members[0].id] ?? 0) > 0); return <option value={group.key} key={group.key}>{group.symbol} {group.members[0].appearance?.workGroup || group.members[0].description || group.members[0].name}{hasNextLevel ? "  ›" : ""}</option>; })}
        </select>
        <div className="cargoDestinationPicker">
            <button type="button" className="cargoDestinationToggle" disabled={!selectedWorkspace} onClick={() => setDestinationMenuOpen(current => !current)} title={targetDestination?.path || "Choose a folder"}><FolderOpen size={12}/><span>{targetDestination?.name || (selectedWorkspace ? "Folder…" : "Choose workspace")}</span><ChevronDown size={11}/></button>
            {destinationMenuOpen && selectedWorkspace && <div className="cargoDestinationMenu" role="menu" aria-label="Folder destination">{selectedWorkspace.members.map(folder => <CargoFolderBranch key={folder.id} initialChildren={rootSubfolders[folder.id]} destination={{folderId: folder.id, name: folder.name, path: folder.path, storage: folder.storage === "imaginary" ? "imaginary" : "physical"}} selectedKey={targetDestination ? cargoDestinationKey(targetDestination) : ""} onSelect={destination => { setTargetFolderId(destination.folderId); const root = folders.find(folder => folder.id === destination.folderId); setTargetSubfolder(root && root.path === destination.path ? null : destination); setDestinationMenuOpen(false); }}/>)}</div>}
        </div>
        <button type="button" className={instantDelivery ? "cargoInstantToggle active" : "cargoInstantToggle"} onClick={() => setInstantDelivery(current => !current)} disabled={!targetDestination} aria-pressed={instantDelivery} title="Toggle instant delivery"><Zap size={13}/>{instantDelivery ? "Instant ON" : "Instant"}</button>
        <button type="button" onClick={() => void sendToFolder()} disabled={!targetDestination || !items.length || working}>Organise</button>
    </div>;
    const shipPanel = <section ref={shipRef} className={`${dragging ? "cargoShip moving" : "cargoShip"}${standalone ? " cargoShipStandalone" : ""}${lensCapturing ? " lensCapturing" : ""}`} style={shipPanelStyle} onDragOver={mode === "email" ? event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } : undefined} onDrop={mode === "email" ? event => void handleDrop(event) : undefined}>
        <header className="cargoShipHeader" onPointerDown={standalone ? undefined : startDrag}><span><Rocket size={15} />CargoRocket <small>{items.length} on board</small></span><span className="cargoShipHeaderActions"><button type="button" title="Use CargoRocket's smallest size" onClick={compactShip}><Minus size={14} /></button><button type="button" className="cargoShipHide" title="Hide CargoRocket as a movable bubble" onClick={minimizeShip}><EyeOff size={14} /></button><button type="button" className="cargoShipClose" title="Close CargoRocket" onClick={closeShip}><X size={14} /></button></span></header>
        <div className="cargoShipModes" role="tablist">{enabledTools.includes("transport") && <button type="button" className={mode === "transport" ? "active" : ""} onClick={() => setMode("transport")}>Files</button>}{enabledTools.includes("calendar") && <button type="button" className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}><CalendarDays size={11}/>Day</button>}{enabledTools.includes("note") && <button type="button" className={mode === "note" ? "active" : ""} onClick={() => setMode("note")}><StickyNote size={11}/>Note</button>}{enabledTools.includes("text") && <button type="button" className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><FilePlus2 size={11} />Text</button>}{enabledTools.includes("email") && <button type="button" className={mode === "email" ? "active" : ""} onClick={() => setMode("email")}><MailPlus size={11} />Email</button>}{enabledTools.includes("convert") && <button type="button" className={mode === "convert" ? "active" : ""} onClick={() => setMode("convert")}><RotateCw size={11} />Convert</button>}{aiEnabled && enabledTools.includes("lens") && <button type="button" className={mode === "lens" ? "active" : ""} onClick={() => setMode("lens")}><ScanSearch size={11} />Lens</button>}</div>
        {mode === "calendar" && <div className="cargoDayCalendar"><div className="cargoDayNavigation"><button type="button" onClick={() => setCalendarDay(current => { const day = new Date(`${current}T12:00:00`); day.setDate(day.getDate() - 1); return day.toISOString().slice(0, 10); })} title="Previous day"><ChevronLeft size={15}/></button><input type="date" value={calendarDay} onChange={event => setCalendarDay(event.target.value)}/><button type="button" onClick={() => setCalendarDay(current => { const day = new Date(`${current}T12:00:00`); day.setDate(day.getDate() + 1); return day.toISOString().slice(0, 10); })} title="Next day"><ChevronRight size={15}/></button></div><div>{calendarEvents.filter(event => event.start.slice(0, 10) === calendarDay).map((event, index) => <article key={`${event.start}-${event.title}-${index}`}><strong>{event.title}</strong><small>{new Date(event.start).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}{event.location ? ` · ${event.location}` : ""}</small>{event.attachments.map(file => <span key={file}><FileText size={11}/>{file}</span>)}</article>)}{!calendarEvents.some(event => event.start.slice(0, 10) === calendarDay) && <p>No events or files for this day.</p>}</div></div>}
        {mode === "transport" && <div className={dropActive ? "cargoDropArea active" : "cargoDropArea"} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={handleDrop}>
            <p>{targetDestination ? (instantDelivery ? `Instant delivery: ${targetDestination.name}.` : `Destination: ${targetDestination.name}.`) : "Choose a workspace and folder."}</p>
            <div className="cargoItemList">{items.length ? items.map(item => <div className="cargoItem" draggable key={item.id} onDragStart={event => handleItemDrag(event, item)}><FileText size={14}/><span title={item.name}>{item.name}</span><small>{formatSize(item.size)}</small><button type="button" title="Remove from CargoRocket" onClick={() => setItems(current => current.filter(currentItem => currentItem.id !== item.id))}><Trash2 size={13}/></button></div>) : <em>Drop files here.</em>}</div>
            {destinationSelector}
            <button type="button" className="cargoClear" onClick={() => setItems([])}>Clear cargo</button>
        </div>}
        {mode === "note" && <div className="cargoPostItWorkspace">
            <div className="cargoPostItTypeBar" role="tablist" aria-label="Post-it type filter">{([ ["all","All"],["standard","Notes"],["ai","AI"],["reminder","Reminders"] ] as [CargoPostItFilter,string][]).map(([key,label])=><button type="button" role="tab" aria-selected={postItFilter===key} className={postItFilter===key?"active":""} key={key} onClick={()=>setPostItFilter(key)}>{label}</button>)}</div>
            <div className="cargoPostItList" aria-label="Post-it salvati in questo pianeta">{visiblePostIts.slice(0,8).map(note=>{
                const kind = note.reminder ? "Reminder" : note.ai ? "AI" : "Note";
                const label = note.title?.trim() || note.text.trim().replace(/\s+/g," ") || "Empty post-it";
                return <button type="button" className={`cargoPostItSummary ${note.reminder?"reminder":note.ai?"ai":"standard"}`} key={note.id} title={`${kind}: ${label}`} onClick={()=>{
                    const detail={type:"reveal",storageScope,id:note.id};
                    window.dispatchEvent(new CustomEvent("folderrocket:reveal-sticky-note",{detail}));
                    if("BroadcastChannel" in window){const channel=new BroadcastChannel("folderrocket-sticky-notes");channel.postMessage(detail);channel.close();}
                }}><span><b>{kind}</b>{note.reminderAt&&<time>{new Date(note.reminderAt).toLocaleString([], {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</time>}</span><strong>{label}</strong></button>;
            })}{visiblePostIts.length>8&&<small>+{visiblePostIts.length-8} more post-it</small>}{!visiblePostIts.length&&<small>No {postItFilter==="all"?"":`${postItFilter} `}post-it in this planet yet.</small>}</div>
            <div className={`cargoPostIt ${noteColor}`}><input value={noteTitle} onChange={event => setNoteTitle(event.target.value)} placeholder="Post-it title" maxLength={80}/><textarea value={noteText} onChange={event => setNoteText(event.target.value)} placeholder="Write a quick note…" /><div className="cargoPostItActions"><span>{(["yellow", "purple", "blue", "green"] as const).map(color => <button type="button" key={color} className={color === noteColor ? `color-${color} active` : `color-${color}`} onClick={() => setNoteColor(color)} title={`${color} post-it`} aria-label={`${color} post-it`}/>)}</span><button type="button" onClick={createPostIt} disabled={!noteText.trim()}><StickyNote size={14}/>Add post-it</button></div><small>The draft stays in CargoRocket until you add it.</small></div>
            <div className="cargoPostItExtraActions"><button type="button" onClick={createAiPostIt} disabled={!aiEnabled} title={!aiEnabled?"Turn on AI for this planet first":"Create an AI post-it"}><span>AI</span>AI post-it</button><button type="button" onClick={createReminderPostIt}><span>!</span>Reminder</button></div>
        </div>}
        {mode === "text" && <div className="cargoForm"><input value={fileName} onChange={event => setFileName(event.target.value)} placeholder="File name or note title" /><textarea value={text} onChange={event => setText(event.target.value)} placeholder="Paste or write text here…" /><div><select value={textFormat} onChange={event => setTextFormat(event.target.value as "note" | "txt" | "pdf" | "docx")}><option value="note">Post-it note</option><option value="txt">TXT file</option><option value="pdf">PDF file</option><option value="docx">Word document</option></select><button type="button" onClick={() => void createTextFile()} disabled={!text.trim() || working}><FilePlus2 size={14} />{textFormat === "note" ? "Create note" : "Create"}</button></div></div>}
        {mode === "email" && <div className="cargoForm cargoEmailForm"><select value={emailSourceKey} onChange={event => setEmailSourceKey(event.target.value)} disabled={!emailSources.length}><option value="">{emailSources.length ? "Choose connected mailbox" : "No connected mailbox"}</option>{emailSources.map(source => <option key={`${source.provider}:${source.blockId}`} value={`${source.provider}:${source.blockId}`}>{source.label}</option>)}</select><input value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="To: name@example.com" /><input value={emailSubject} onChange={event => setEmailSubject(event.target.value)} placeholder="Email subject" /><textarea value={text} onChange={event => setText(event.target.value)} placeholder="Write the email text here…" /><div className="cargoEmailAttachments">{items.length ? items.map(item=><span key={item.id}><FileText size={12}/>{item.name}<button type="button" onClick={()=>setItems(current=>current.filter(value=>value.id!==item.id))}>×</button></span>):<em>Drop files here to attach them to the draft.</em>}</div><button type="button" onClick={() => void createEmailDraft()} disabled={!emailSources.length || !text.trim() || working}><Send size={14} />{working ? "Saving draft…" : "Save draft with attachments"}</button></div>}
        {mode === "convert" && <div className="cargoConvert"><p>Convert files on this PC.</p><select value={convertFormat} onChange={event => setConvertFormat(event.target.value)}><option value="pdf">PDF</option><option value="txt">TXT</option><option value="xlsx">XLSX</option><option value="csv">CSV</option></select><button type="button" onClick={() => void convertItems()} disabled={working}><RotateCw className={working ? "cargoSpin" : ""} size={15} />{working ? "Converting…" : "Convert cargo"}</button><button type="button" className="cargoStudioLink" onClick={onOpenFileStudio}><SlidersHorizontal size={14} />Open File Studio</button></div>}
        {mode === "lens" && aiEnabled && <div className="cargoLens"><p>Lens captures the FolderRocket area directly behind CargoRocket only when you press a button. Save it as a PNG, read its text with AI, or turn the reading into a file.</p><div className="cargoLensActions"><button type="button" onClick={() => void captureBehindShip()} disabled={lensWorking}>Capture screenshot</button><button type="button" onClick={() => void saveLensScreenshot()} disabled={lensWorking}>{lensWorking ? "Working…" : "Save PNG"}</button></div>{lensImage && <img className="cargoLensPreview" src={lensImage} alt="Captured area behind CargoRocket" />}<textarea value={lensQuery} onChange={event => setLensQuery(event.target.value)} placeholder="Ask what is behind CargoRocket, or leave empty to read and summarise the text…" /><button type="button" onClick={() => void analyseBehindShip()} disabled={lensWorking}><ScanSearch size={14}/>{lensWorking ? "Analysing…" : "Read text / analyse with AI"}</button>{lensError && <small className="cargoLensError">{lensError}</small>}{lensAnalysis && <><div className="cargoLensResult">{lensAnalysis}</div><div className="cargoLensSaveText"><select value={lensFormat} onChange={event => setLensFormat(event.target.value as "txt" | "docx" | "pdf")}><option value="txt">TXT</option><option value="docx">Word</option><option value="pdf">PDF</option></select><button type="button" onClick={() => void saveLensText()} disabled={lensWorking}>Save reading</button></div></>}</div>}
        {activeReminder && <div className="cargoReminderAlert"><strong>Reminder</strong><span>{activeReminder.text}</span><small>{new Date(activeReminder.reminderAt).toLocaleString()}</small><button type="button" onClick={() => setActiveReminder(null)}><X size={13}/>Close</button></div>}{message && <p className="cargoMessage">{message}</p>}
        <button type="button" className="cargoShipResize" onPointerDown={startResize} title="Drag to resize CargoRocket" aria-label="Resize CargoRocket" />
    </section>;
    if (standalone) return <main className="cargoShipStandaloneWindow">{minimized && <button ref={dockRef} type="button" className="cargoShipDock cargoShipDockStandalone" onPointerDown={startStandaloneDockDrag} onClick={() => { if (!dockMovedRef.current) openShip(); }} title="Open or move CargoRocket"><Rocket size={25}/>{items.length > 0 && <small>{items.length}</small>}</button>}{open && shipPanel}</main>;
    if (window.folderRocketDesktop?.toggleCargoShipWindow) return <div className="cargoShipRoot"><div className="cargoShipLauncherWrap"><button type="button" className={desktopShipOpen ? "cargoShipLauncher active" : "cargoShipLauncher"} onClick={() => void window.folderRocketDesktop?.toggleCargoShipWindow().then(state => setDesktopShipOpen(Boolean(state.open)))} title={desktopShipOpen ? "Close CargoRocket" : "Open CargoRocket on the desktop"} aria-pressed={desktopShipOpen}><Rocket size={17} />CargoRocket</button><button type="button" className="cargoLauncherSettings" onClick={()=>setShowToolMenu(current=>!current)} title="CargoRocket tools"><Settings2 size={14}/></button>{toolsMenu}</div></div>;
    return <div className="cargoShipRoot">
        <div className="cargoShipLauncherWrap"><button type="button" className={open ? "cargoShipLauncher active" : "cargoShipLauncher"} onClick={() => { if (open) minimizeShip(); else openShip(); }} title={open ? "Minimize CargoRocket" : "Open movable CargoRocket"}><Rocket size={17} />CargoRocket {items.length > 0 && <small>{items.length}</small>}</button><button type="button" className="cargoLauncherSettings" onClick={()=>setShowToolMenu(current=>!current)} title="CargoRocket tools"><Settings2 size={14}/></button>{toolsMenu}</div>
        {minimized && <button ref={dockRef} type="button" className={dragging ? "cargoShipDock moving" : "cargoShipDock"} style={{left: position.x, top: position.y, transform: `scale(${shipScale})`, transformOrigin: "top left"}} onPointerDown={event => startDrag(event, dockRef, true)} onClick={() => { if (!dockMovedRef.current) openShip(); }} title="Open or move CargoRocket"><Rocket size={25}/>{items.length > 0 && <small>{items.length}</small>}</button>}
        {open && shipPanel}
    </div>;
}
