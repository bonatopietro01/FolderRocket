import {additionalFileIcon} from './AdditionalFileIcons';
import {Archive, Check, ExternalLink, File, FileInput, FileSpreadsheet, FileText, Film, Flame, FolderOpen, Image, Maximize2, Music, Pencil, Plus, Search, Trash2, X} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import type {ReactNode} from "react";
import {createPortal} from "react-dom";
import {API_BASE_URL} from "../api";
import {applicationFileSensitivity, applicationSensitivityLabel, extensionOf, filterApplicationFiles, groupApplicationFiles} from "../applicationFiles";
import type {ApplicationFileEntry as FileEntry} from "../applicationFiles";
import {SEARCH_RESULT_TYPE} from "./SearchWorkspace";
import {enqueueFireMountainFiles} from "./FireMountain";
import type {ManagedFolder, VirtualFile} from "./FolderManagement";

interface LinkedApp {
    id: string;
    name: string;
    icon: string;
    extensions: string[];
    folders: string[];
}

interface Props { storageScope: string; folders: ManagedFolder[]; onVirtualFilesAdd: (folderId: string, files: VirtualFile[]) => void; onScanningChange?: (active: boolean) => void }
interface DiscoveryProgress { inspected:number; directoriesScanned:number; queuedDirectories:number; found:number; skipped:number; latest:string[] }

const PRESETS: Record<string, {icon: string; extensions: string[]}> = {
    Word: {icon: "📄", extensions: ["doc", "docx", "odt", "rtf"]},
    Excel: {icon: "📊", extensions: ["xls", "xlsx", "xlsm", "csv", "ods"]},
    PowerPoint: {icon: "📽️", extensions: ["ppt", "pptx", "odp"]},
    Inkscape: {icon: "✒️", extensions: ["svg", "svgz", "eps", "pdf"]},
    SolidWorks: {icon: "⚙️", extensions: ["sldprt", "sldasm", "slddrw"]},
    "VS Code": {icon: "💻", extensions: ["js", "ts", "tsx", "jsx", "json", "css", "html", "py", "md"]},
    WhatsApp: {icon: "💬", extensions: ["jpg", "jpeg", "png", "mp4", "pdf", "docx"]},
    Downloads: {icon: "📥", extensions: []}
};

function storageKey(scope: string) { return `folderrocket-linked-apps-${scope}`; }
function fileCacheKey(scope: string) { return `folderrocket-linked-app-files-${scope}`; }
function pausedScanKey(scope: string) { return `folderrocket-paused-application-scans-${scope}`; }
function formatSize(size = 0) { return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : size ? `${Math.max(1, Math.round(size / 1024))} KB` : ""; }
function ApplicationLogo({app}:{app:LinkedApp}) { const key=app.name.toLowerCase().replace(/[^a-z]/g,''); const brands:Record<string,string>={word:'W',excel:'X',powerpoint:'P',inkscape:'◒',solidworks:'3D',vscode:'〈〉',whatsapp:'☎',downloads:'↓'}; return <span className={`applicationBrandLogo brand-${key}`}>{brands[key]??app.icon}</span>; }

function readApps(scope: string): LinkedApp[] {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey(scope)) || "[]");
        return Array.isArray(value) ? value.filter(app => !["outlook", "apple"].includes(String(app?.name || "").toLowerCase())) : [];
    } catch {
        return [];
    }
}
function readRememberedFiles(scope:string):Record<string,FileEntry[]>{try{const value=JSON.parse(sessionStorage.getItem(fileCacheKey(scope))||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}catch{return {}}}
function readPausedScans(scope:string):string[]{try{const value=JSON.parse(sessionStorage.getItem(pausedScanKey(scope))||"[]");return Array.isArray(value)?value.filter(value=>typeof value==="string"):[]}catch{return []}}

function ApplicationFileIcon({name}: {name: string}) {
    const extension = extensionOf(name);
    const additional = additionalFileIcon(extension, 14);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
    if (extension === "pdf" || ["doc", "docx", "txt", "md"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14}/></span>;
    if (["csv", "xls", "xlsx"].includes(extension)) return <span className="fileKindIcon csv"><FileSpreadsheet size={14}/></span>;
    if (["mp3", "wav", "m4a", "flac", "aac", "ogg"].includes(extension)) return <span className="fileKindIcon audio"><Music size={14}/></span>;
    if (["mp4", "mov", "avi", "mkv", "webm", "wmv"].includes(extension)) return <span className="fileKindIcon video"><Film size={14}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return <span className="fileKindIcon image"><Image size={14}/></span>;
    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14}/></span>;
    return <span className="fileKindIcon generic"><File size={14}/></span>;
}

function ApplicationFileWindow({app, onClose, children}: {app: LinkedApp; onClose: () => void; children: ReactNode}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        dialog?.showModal();
        return () => {
            dialog?.close();
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
        };
    }, []);
    return createPortal(<dialog ref={dialogRef} className="applicationFileWindow" aria-labelledby="applicationFileWindowTitle" onCancel={onClose} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <section>
            <header><span>{app.icon}</span><h2 id="applicationFileWindowTitle">{app.name} files</h2><button type="button" onClick={onClose} title="Close file window" aria-label="Close file window"><X size={21}/></button></header>
            {children}
        </section>
    </dialog>, document.body);
}

export default function ApplicationsWorkspace({storageScope, folders, onVirtualFilesAdd, onScanningChange}: Props) {
    const [apps, setApps] = useState<LinkedApp[]>(() => readApps(storageScope));
    const [name, setName] = useState("");
    const [icon, setIcon] = useState("🔗");
    const [extensions, setExtensions] = useState("");
    const [expanded, setExpanded] = useState<string[]>([]);
    const [files, setFiles] = useState<Record<string, FileEntry[]>>(() => readRememberedFiles(storageScope));
    const [appFilters, setAppFilters] = useState<Record<string, string>>({});
    const [appQueries, setAppQueries] = useState<Record<string, string>>({});
    const [fileWindowId, setFileWindowId] = useState<string | null>(null);
    const [scanning, setScanning] = useState<Record<string, boolean>>({});
    const [scanProgress, setScanProgress] = useState<Record<string, DiscoveryProgress>>({});
    const [scanErrors, setScanErrors] = useState<Record<string, string>>({});
    const [pausedScans, setPausedScans] = useState<string[]>(() => readPausedScans(storageScope));
    const scansInFlight = useRef(new Map<string, Promise<FileEntry[]>>());
    const scanControllers = useRef(new Map<string, AbortController>());
    const hydratedCacheIds = useRef(new Set<string>());
    const fileWindowApp = apps.find(app => app.id === fileWindowId);
    const [appDateFrom, setAppDateFrom] = useState<Record<string, string>>({});
    const [appDateTo, setAppDateTo] = useState<Record<string, string>>({});
    const [appLocationFilters, setAppLocationFilters] = useState<Record<string, "all" | "local" | "shared">>({});
    const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
    const [message, setMessage] = useState("");
    const [folderMenuPath,setFolderMenuPath]=useState<string|null>(null);
    const [editingFormats,setEditingFormats]=useState<string|null>(null),[formatDraft,setFormatDraft]=useState('');
    const [removeArmed,setRemoveArmed]=useState<string|null>(null);

    useEffect(() => localStorage.setItem(storageKey(storageScope), JSON.stringify(apps)), [apps, storageScope]);
    useEffect(() => { const timer=window.setTimeout(()=>{try{sessionStorage.setItem(fileCacheKey(storageScope),JSON.stringify(files));}catch{/* Results remain in memory. */}},250);return()=>window.clearTimeout(timer); }, [files, storageScope]);
    useEffect(() => { sessionStorage.setItem(pausedScanKey(storageScope), JSON.stringify(pausedScans)); }, [pausedScans, storageScope]);
    useEffect(() => { onScanningChange?.(Object.values(scanning).some(Boolean)); }, [onScanningChange, scanning]);
    useEffect(() => () => {
        const pending = [...scanControllers.current.keys()];
        if (pending.length) sessionStorage.setItem(pausedScanKey(storageScope), JSON.stringify([...new Set([...readPausedScans(storageScope), ...pending])]));
        scanControllers.current.forEach(controller => controller.abort());
        onScanningChange?.(false);
    }, [onScanningChange, storageScope]);

    function addApp() {
        const trimmed = name.trim();
        if (!trimmed) return;
        const preset = PRESETS[trimmed];
        const added: LinkedApp = {
            id: crypto.randomUUID(),
            name: trimmed,
            icon: icon.trim() || preset?.icon || "🔗",
            extensions: (extensions ? extensions.split(/[,;\s]+/) : preset?.extensions || []).map(value => value.replace(/^\./, "").toLowerCase()).filter(Boolean),
            folders: []
        };
        setApps(current => [...current, added]);
        setName("");
        setExtensions("");
        setIcon("🔗");
    }
    function clearDiscoveryCache(appId:string){void fetch(`${API_BASE_URL}/applications/discover`,{method:'DELETE',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId})});}
    function saveFormats(app:LinkedApp){const next=[...new Set(formatDraft.split(/[,;\s]+/).map(value=>value.replace(/^\./,'').toLowerCase()).filter(value=>/^[a-z0-9]{1,12}$/.test(value)))];const updated={...app,extensions:next};setApps(current=>current.map(item=>item.id===app.id?updated:item));setFiles(current=>{const copy={...current};delete copy[app.id];return copy;});clearDiscoveryCache(app.id);setEditingFormats(null);}

    function discover(app: LinkedApp, options: {reveal?: boolean; cachedOnly?: boolean} = {}): Promise<FileEntry[]> {
        const pending = scansInFlight.current.get(app.id);
        if (pending) return pending;
        if (!options.cachedOnly) setPausedScans(current => current.filter(id => id !== app.id));
        setScanning(current => ({...current, [app.id]: true}));
        setScanErrors(current => ({...current, [app.id]: ""}));
        if (options.reveal !== false) setExpanded(current => current.includes(app.id) ? current : [...current, app.id]);
        const controller = new AbortController();
        scanControllers.current.set(app.id, controller);
        const request = (async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/applications/discover`, {
                    method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({appId: app.id, extensions: app.extensions, cachedOnly: Boolean(options.cachedOnly)}), signal:controller.signal
                });
                if (!response.ok) { const failed=await response.json().catch(()=>({})) as {message?:string};throw new Error(failed.message||"Scan failed."); }
                let data:{files?:FileEntry[];folders?:{path:string;count:number}[];message?:string;skipped?:number;cacheMiss?:boolean}={};
                const reader=response.body?.getReader();
                if(!reader)throw new Error("Live scan is not available.");
                const decoder=new TextDecoder();let buffered="";
                while(true){const {done,value}=await reader.read();buffered+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffered.split("\n");buffered=lines.pop()||"";for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line) as {type:string;message?:string;result?:typeof data;files?:FileEntry[];inspected?:number;directoriesScanned?:number;queuedDirectories?:number;found?:number;skipped?:number};if(event.type==="error")throw new Error(event.message||"Scan failed.");if(event.type==="complete")data=event.result||{};if(event.type==="progress"){const batch=event.files||[];setScanProgress(current=>({...current,[app.id]:{inspected:event.inspected||0,directoriesScanned:event.directoriesScanned||0,queuedDirectories:event.queuedDirectories||0,found:event.found||0,skipped:event.skipped||0,latest:batch.slice(-3).map(file=>file.name)}}));}}if(done)break;}
                const found = data.files || [];
                if (options.cachedOnly && data.cacheMiss) return [];
                if (data.skipped) setScanErrors(current => ({...current, [app.id]: `${data.skipped} locations or files could not be accessed. Cloud files must be visible in a mounted or synced folder.`}));
                setFiles(current => ({...current, [app.id]: found.slice(0, 5000)}));
                setApps(current => current.map(item => item.id === app.id ? {...item, folders: (data.folders || []).map(folder => folder.path)} : item));
                return found;
            } catch (error) {
                const stopped=error instanceof DOMException&&error.name==="AbortError";
                setScanErrors(current => ({...current, [app.id]: stopped ? "Scan stopped. Run it again whenever you are ready." : error instanceof Error ? error.message : "Scan failed."}));
                return [];
            } finally {
                setScanning(current => ({...current, [app.id]: false}));
                scansInFlight.current.delete(app.id);
                scanControllers.current.delete(app.id);
            }
        })();
        scansInFlight.current.set(app.id, request);
        return request;
    }

    useEffect(() => {
        const timer = window.setTimeout(() => {
            for (const app of apps) {
                if (!app.extensions.length) continue;
                const key = `${storageScope}:${app.id}`;
                if (hydratedCacheIds.current.has(key)) continue;
                hydratedCacheIds.current.add(key);
                void discover(app, {reveal:false, cachedOnly:true});
            }
        }, 0);
        return () => window.clearTimeout(timer);
        // Each saved application cache is hydrated once per local profile.
    }, [apps, storageScope]);
    function stopDiscovery(appId:string){scanControllers.current.get(appId)?.abort();}

    async function openApp(app: LinkedApp) {
        try {
            const response = await fetch(`${API_BASE_URL}/applications/open`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: app.name})});
            const data = await response.json().catch(() => ({})) as {message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to open application.");
            setMessage("");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to open application."); }
    }

    async function openFile(path: string, containingFolder = false) {
        try {
            const response = await fetch(`${API_BASE_URL}/${containingFolder ? 'files/open-location' : 'search-files/open'}`, {
                method: 'POST', credentials: 'include', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path})
            });
            const data = await response.json().catch(() => ({})) as {message?:string};
            if (!response.ok) throw new Error(data.message || 'Unable to open this location.');
            setMessage("");
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to open file.'); }
    }

    async function openFiles(items: FileEntry[]) {
        await Promise.all(items.map(file => openFile(file.path)));
    }

    async function copyToSavedFolder(items: FileEntry[], folder: ManagedFolder) {
        if (!items.length) return;
        setFolderMenuPath(null);
        if (folder.storage === "imaginary") {
            onVirtualFilesAdd(folder.id, items);
            setMessage(`${items.length} file${items.length===1?"":"s"} added to ${folder.name}.`);
            return;
        }
        if (!folder.path) { setMessage(`${folder.name} does not have a saved path.`); return; }
        try {
            const response=await fetch(`${API_BASE_URL}/files/copy`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:items.map(file=>file.path),destination:folder.path})});
            const data=await response.json().catch(() => ({})) as {copied?: FileEntry[];message?:string};
            if(!response.ok)throw new Error(data.message||'Unable to copy the selected files.');
            setMessage(`${data.copied?.length||0} file${data.copied?.length===1?"":"s"} copied to ${folder.name}.`);
        } catch(error){setMessage(error instanceof Error?error.message:'Unable to copy the selected files.');}
    }

    function sendToFire(items: FileEntry[]) {
        if (!items.length) return;
        const risky = items.filter(file => applicationFileSensitivity(file));
        if (risky.length) {
            const labels=[...new Set(risky.map(file=>applicationSensitivityLabel(applicationFileSensitivity(file))))].join(", ");
            if (!window.confirm(`Sensitive files selected (${labels}). They may be shared, synchronized, required by an application, or required by Windows. Add ${risky.length} sensitive file${risky.length===1?"":"s"} to Fire Mountain?`)) return;
            if (!window.confirm(`Second approval: sending these files to Fire Mountain can later remove them from this computer and connected services. Continue?`)) return;
        }
        enqueueFireMountainFiles(items);
        setMessage(`${items.length} file${items.length === 1 ? "" : "s"} added to Fire Mountain.`);
    }

    function renderFile(file: FileEntry, availableFiles: FileEntry[] = []) {
        const selectedFile = selectedFilePaths.includes(file.path);
        const actionFiles=selectedFile ? availableFiles.filter(item => selectedFilePaths.includes(item.path)) : [file];
        const sensitivity = applicationFileSensitivity(file), sensitivityLabel=applicationSensitivityLabel(sensitivity);
        return <div className={selectedFile ? "inspectorFile applicationFileRow selectedAttachment" : "inspectorFile applicationFileRow"} key={file.path} title={file.path} draggable onClick={() => setSelectedFilePaths(current => current.includes(file.path) ? current.filter(path => path !== file.path) : [...current, file.path])} onDragStart={event => { const dragged = selectedFile ? availableFiles.filter(item => selectedFilePaths.includes(item.path)) : [file]; const value = JSON.stringify(dragged); event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(SEARCH_RESULT_TYPE, value); event.dataTransfer.setData("text/plain", `folderrocket-search:${value}`); }}>
            <button type="button" className="applicationFireAction fileActionPulse" title="Add to Fire Mountain" aria-label={`Add ${file.name} to Fire Mountain`} onClick={event => { event.stopPropagation(); sendToFire(selectedFile ? availableFiles.filter(item => selectedFilePaths.includes(item.path)) : [file]); }}><Flame size={14}/></button>
            <span className="inspectorFileName"><ApplicationFileIcon name={file.name}/><strong>{file.name}</strong></span>
            {sensitivity && <span className={`applicationFileRisk ${sensitivity}`} title={`${sensitivityLabel}. Removing this file may affect an application, Windows, collaborators, or a synchronized copy.`} aria-label={sensitivityLabel}><b>!</b>{sensitivityLabel}</span>}
            <span className="applicationFileMetadata"><small>{file.createdAt ? new Date(file.createdAt).toLocaleDateString("en-GB") : ""}</small><small>{formatSize(file.size)}</small></span>
            <span className="applicationFileActions">
                <button className="applicationOpenAction fileActionPulse" type="button" title="Open file" aria-label={`Open ${file.name}`} onClick={event => { event.stopPropagation(); void openFile(file.path); }}><ExternalLink size={14}/></button>
                <span className="applicationSavedFolderAction"><button className="applicationSendFolderAction fileActionPulse" type="button" title="Copy to a saved folder" aria-label={`Copy ${file.name} to a saved folder`} onClick={event=>{event.stopPropagation();setFolderMenuPath(current=>current===file.path?null:file.path);}}><FileInput size={14}/></button>{folderMenuPath===file.path&&<span className="applicationDestinationMenu" onClick={event=>event.stopPropagation()}>{folders.length?folders.map(folder=><button type="button" key={folder.id} onClick={()=>void copyToSavedFolder(actionFiles,folder)}>{folder.storage==='imaginary'?'◇ ':''}{folder.name}</button>):<small>No saved folders</small>}</span>}</span>
                <button className="applicationFolderAction fileActionPulse" type="button" title="Open containing folder" aria-label={`Open folder containing ${file.name}`} onClick={event => { event.stopPropagation(); void openFile(file.path, true); }}><FolderOpen size={14}/></button>
            </span>
        </div>;
    }

    function renderAppSearch(app: LinkedApp, windowView = false) {
        return <label className="applicationQuickSearch">
            <Search size={15}/>
            <input type="search" value={appQueries[app.id] || ""} aria-label={`Search ${app.name} files${windowView ? " in window" : ""}`} placeholder="Search files or folders…" onChange={event => {
                setAppQueries(current => ({...current, [app.id]: event.target.value}));
                setExpanded(current => current.includes(app.id) ? current : [...current, app.id]);
            }}/>
        </label>;
    }

    function renderAppFiles(app: LinkedApp, windowView = false) {
        const appFiles = files[app.id] || [];
        const counts = appFiles.reduce<Record<string, number>>((result, file) => {
            const type = extensionOf(file.name) || "other";
            result[type] = (result[type] || 0) + 1;
            return result;
        }, {});
        const requestedFilter = appFilters[app.id] || "all";
        const filter = requestedFilter === "all" || counts[requestedFilter] ? requestedFilter : "all";
        const titleTerms = (appQueries[app.id] || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
        const from = appDateFrom[app.id] || "";
        const to = appDateTo[app.id] || "";
        const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
        const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
        const location = appLocationFilters[app.id] || "all";
        const visibleFiles = filterApplicationFiles(appFiles, "", filter).filter(file => {
            if (titleTerms.length && !titleTerms.every(term => file.name.toLowerCase().includes(term))) return false;
            if (fromTime !== null || toTime !== null) {
                const fileTime = file.createdAt ? new Date(file.createdAt).getTime() : Number.NaN;
                if (!Number.isFinite(fileTime) || (fromTime !== null && fileTime < fromTime) || (toTime !== null && fileTime > toTime)) return false;
            }
            const sensitivity = applicationFileSensitivity(file);
            const sharedLocation = sensitivity === "shared" || sensitivity === "synced";
            return location === "all" || (location === "shared" ? sharedLocation : !sharedLocation);
        });
        const selectedVisibleFiles = visibleFiles.filter(file => selectedFilePaths.includes(file.path));
        return <div className="applicationFiles" aria-busy={Boolean(scanning[app.id])}>
            <label className="applicationTypeFilter"><span>File format</span><select aria-label={`${app.name} file format${windowView ? " in window" : ""}`} value={filter} onChange={event => setAppFilters(current => ({...current, [app.id]: event.target.value}))}><option value="all">All ({appFiles.length})</option>{Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => <option value={type} key={type}>{type.toUpperCase()} ({count})</option>)}</select></label>
            <div className="applicationInlineFilters">
                <label><span>From</span><input type="date" value={from} max={to || undefined} onChange={event => setAppDateFrom(current => ({...current, [app.id]: event.target.value}))}/></label>
                <label><span>To</span><input type="date" value={to} min={from || undefined} onChange={event => setAppDateTo(current => ({...current, [app.id]: event.target.value}))}/></label>
                <label className="applicationInlineLocation"><span>Location</span><select value={location} onChange={event => setAppLocationFilters(current => ({...current, [app.id]: event.target.value as "all" | "local" | "shared"}))}><option value="all">All locations</option><option value="local">Local only</option><option value="shared">Shared / synced</option></select></label>
                <button type="button" onClick={() => { setAppQueries(current => ({...current, [app.id]: ""})); setAppDateFrom(current => ({...current, [app.id]: ""})); setAppDateTo(current => ({...current, [app.id]: ""})); setAppLocationFilters(current => ({...current, [app.id]: "all"})); setAppFilters(current => ({...current, [app.id]: "all"})); }}>Clear filters</button>
            </div>
            {scanning[app.id] && <div className="applicationScanProgress" role="status"><span><strong>Finding files… {scanProgress[app.id]?.found || 0} found</strong><small>{scanProgress[app.id]?.directoriesScanned || 0} folders checked · {scanProgress[app.id]?.inspected || 0} files inspected</small>{scanProgress[app.id]?.latest?.map(name=><em key={name}>{name}</em>)}</span><button type="button" onClick={()=>stopDiscovery(app.id)}>Stop</button></div>}
            {scanErrors[app.id] && <p role="alert">{scanErrors[app.id]}</p>}
            {windowView && !!visibleFiles.length && <div className="applicationBulkToolbar"><button type="button" onClick={() => setSelectedFilePaths(current => [...new Set([...current, ...visibleFiles.map(file => file.path)])])}>Select all</button><button type="button" disabled={!selectedVisibleFiles.length} onClick={() => setSelectedFilePaths(current => current.filter(path => !selectedVisibleFiles.some(file => file.path === path)))}>Deselect</button><button className="applicationOpenAction fileActionPulse" type="button" disabled={!selectedVisibleFiles.length} onClick={() => void openFiles(selectedVisibleFiles)}><ExternalLink size={13}/>Open files</button><button className="applicationFireAction fileActionPulse" type="button" disabled={!selectedVisibleFiles.length} onClick={() => sendToFire(selectedVisibleFiles)}><Flame size={13}/>Fire Mountain</button></div>}
            {groupApplicationFiles(visibleFiles).map(([folder, folderFiles]) => <section className="applicationFolderGroup" key={folder}>
                <header title={folder}><FolderOpen size={14}/><strong>{folder}</strong><small>{folderFiles.length}</small></header>
                {folderFiles.map(file => renderFile(file, visibleFiles))}
            </section>)}
            {!scanning[app.id] && !scanErrors[app.id] && !visibleFiles.length && <p>{files[app.id] ? "No matching files found." : "Scan computer to load this application's files."}</p>}
        </div>;
    }

    return <main className="applicationsWorkspace">
        <header>
            <div><h1>Applications</h1><p>Choose file types, then start a check only when you need it. Saved indexes make later searches fast.</p></div>
            <div className="applicationAdd"><select aria-label="Application preset" value="" onChange={event=>{const preset=PRESETS[event.target.value];if(preset){setName(event.target.value);setIcon(preset.icon);setExtensions(preset.extensions.join(", "));}}}><option value="">Choose application / formats</option>{Object.keys(PRESETS).map(item=><option key={item} value={item}>{item}</option>)}</select>
                <input value={name} onChange={event => { const value = event.target.value; setName(value); if (PRESETS[value]) { setIcon(PRESETS[value].icon); setExtensions(PRESETS[value].extensions.join(", ")); } }} list="applicationPresets" placeholder="Application name"/>
                <datalist id="applicationPresets">{Object.keys(PRESETS).map(item => <option key={item} value={item}/>)}</datalist>
                <input className="applicationIconInput" value={icon} maxLength={3} onChange={event => setIcon(event.target.value)} aria-label="Application logo"/>
                <input value={extensions} onChange={event => setExtensions(event.target.value)} placeholder="File types: sldprt, sldasm"/>
                <button type="button" onClick={addApp}><Plus size={16}/>Add</button>
            </div>
        </header>
        {message && <p className="applicationWorkspaceMessage" role="alert">{message}</p>}
        <div className="applicationsLayout">
            <section className="applicationsGrid">
                {apps.map(app => <article className="applicationCard" key={app.id}>
                    <button type="button" className="applicationExpandFiles" title={`Open ${app.name} files in window`} aria-label={`Open ${app.name} files in window`} onClick={() => setFileWindowId(app.id)}><Maximize2 size={16}/></button>
                    <div className="applicationCardMain"><button className="applicationLogo" type="button" title={`Double-click to open ${app.name}`} aria-label={`Open ${app.name}`} onDoubleClick={() => void openApp(app)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openApp(app); } }}><ApplicationLogo app={app}/></button><strong>{app.name}</strong>{editingFormats===app.id?<span className="applicationFormatEditor"><input aria-label={`Edit ${app.name} file formats`} value={formatDraft} onChange={event=>setFormatDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')saveFormats(app);if(event.key==='Escape')setEditingFormats(null);}} autoFocus/><button onClick={()=>saveFormats(app)} title="Save formats"><Check size={13}/></button></span>:<small>{app.extensions.map(type => `.${type}`).join(" · ") || "Choose file types"}</small>}</div>
                    {renderAppSearch(app)}
                    <div className="applicationCardActions"><button type="button" disabled={scanning[app.id]} onClick={() => void discover(app)}><Search size={14}/>{scanning[app.id] ? "Checking…" : pausedScans.includes(app.id) ? "Continue checking" : "Check for new files"}</button><button type="button" onClick={()=>{setEditingFormats(app.id);setFormatDraft(app.extensions.join(', '));}} title="Edit file formats"><Pencil size={14}/></button><button type="button" className={removeArmed===app.id?"applicationRemoveButton armed":"applicationRemoveButton"} onClick={() => { if(removeArmed!==app.id){setRemoveArmed(app.id);return;} clearDiscoveryCache(app.id); setApps(current => current.filter(item => item.id !== app.id)); setFiles(current => { const next={...current}; delete next[app.id]; return next; }); setPausedScans(current => current.filter(id => id !== app.id)); setRemoveArmed(null); }} title={removeArmed===app.id?"Press again to remove application":"Remove application"} aria-label={removeArmed===app.id?`Press again to remove ${app.name}`:`Remove ${app.name}`}><Trash2 size={14}/></button></div>
                    {expanded.includes(app.id) && renderAppFiles(app)}
                </article>)}
                {!apps.length && <div className="applicationsEmpty">Add an application and its file types to scan this computer.</div>}
            </section>
        </div>
        {fileWindowApp && <ApplicationFileWindow app={fileWindowApp} onClose={() => setFileWindowId(null)}>
            <div className="applicationWindowToolbar">{renderAppSearch(fileWindowApp, true)}<button type="button" disabled={scanning[fileWindowApp.id]} onClick={() => void discover(fileWindowApp)}>{pausedScans.includes(fileWindowApp.id) ? "Continue checking" : "Check for new files"}</button></div>
            {renderAppFiles(fileWindowApp, true)}
        </ApplicationFileWindow>}
    </main>;
}
