import {Archive, ExternalLink, File, FileSpreadsheet, FileText, Film, FolderOpen, Image, Music, Plus, Search, Trash2} from "lucide-react";
import {useEffect, useState} from "react";
import {API_BASE_URL} from "../api";

interface LinkedApp {
    id: string;
    name: string;
    icon: string;
    extensions: string[];
    folders: string[];
}

interface FileEntry {
    name: string;
    path: string;
    size?: number;
    createdAt?: string;
}

interface Props { storageScope: string }

const PRESETS: Record<string, {icon: string; extensions: string[]}> = {
    SolidWorks: {icon: "⚙️", extensions: ["sldprt", "sldasm", "slddrw"]},
    "VS Code": {icon: "💻", extensions: ["js", "ts", "tsx", "jsx", "json", "css", "html", "py", "md"]},
    WhatsApp: {icon: "💬", extensions: ["jpg", "jpeg", "png", "mp4", "pdf", "docx"]},
    Downloads: {icon: "📥", extensions: []}
};

function storageKey(scope: string) { return `folderrocket-linked-apps-${scope}`; }
function extensionOf(name: string) { return name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : ""; }
function parentPath(path: string) { return path.replace(/[\\/][^\\/]+$/, ""); }
function formatSize(size = 0) { return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : size ? `${Math.max(1, Math.round(size / 1024))} KB` : ""; }

function readApps(scope: string): LinkedApp[] {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey(scope)) || "[]");
        return Array.isArray(value) ? value.filter(app => !["outlook", "apple"].includes(String(app?.name || "").toLowerCase())) : [];
    } catch {
        return [];
    }
}

function ApplicationFileIcon({name}: {name: string}) {
    const extension = extensionOf(name);
    if (extension === "pdf" || ["doc", "docx", "txt", "md"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14}/></span>;
    if (["csv", "xls", "xlsx"].includes(extension)) return <span className="fileKindIcon csv"><FileSpreadsheet size={14}/></span>;
    if (["mp3", "wav", "m4a", "flac", "aac", "ogg"].includes(extension)) return <span className="fileKindIcon audio"><Music size={14}/></span>;
    if (["mp4", "mov", "avi", "mkv", "webm", "wmv"].includes(extension)) return <span className="fileKindIcon video"><Film size={14}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return <span className="fileKindIcon image"><Image size={14}/></span>;
    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14}/></span>;
    return <span className="fileKindIcon generic"><File size={14}/></span>;
}

export default function ApplicationsWorkspace({storageScope}: Props) {
    const [apps, setApps] = useState<LinkedApp[]>(() => readApps(storageScope));
    const [name, setName] = useState("");
    const [icon, setIcon] = useState("🔗");
    const [extensions, setExtensions] = useState("");
    const [expanded, setExpanded] = useState<string[]>([]);
    const [files, setFiles] = useState<Record<string, FileEntry[]>>({});
    const [appFilters, setAppFilters] = useState<Record<string, string>>({});
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<string[]>([]);
    const [results, setResults] = useState<FileEntry[]>([]);
    const [message, setMessage] = useState("");

    useEffect(() => localStorage.setItem(storageKey(storageScope), JSON.stringify(apps)), [apps, storageScope]);

    function addApp() {
        const trimmed = name.trim();
        if (!trimmed) return;
        const preset = PRESETS[trimmed];
        setApps(current => [...current, {
            id: crypto.randomUUID(),
            name: trimmed,
            icon: icon.trim() || preset?.icon || "🔗",
            extensions: (extensions ? extensions.split(/[,;\s]+/) : preset?.extensions || []).map(value => value.replace(/^\./, "").toLowerCase()).filter(Boolean),
            folders: []
        }]);
        setName("");
        setExtensions("");
        setIcon("🔗");
    }

    async function discover(app: LinkedApp) {
        setMessage(`Scanning this computer for ${app.name} files…`);
        const response = await fetch(`${API_BASE_URL}/applications/discover`, {
            method: "POST",
            credentials: "include",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({extensions: app.extensions})
        });
        const data = await response.json().catch(() => ({})) as {files?: FileEntry[]; folders?: {path: string; count: number}[]; message?: string};
        if (!response.ok) {
            setMessage(data.message || "Scan failed.");
            return [];
        }
        const found = data.files || [];
        setFiles(current => ({...current, [app.id]: found}));
        setApps(current => current.map(item => item.id === app.id ? {...item, folders: (data.folders || []).map(folder => folder.path)} : item));
        setMessage("");
        return found;
    }

    async function openApp(app: LinkedApp) {
        if (!expanded.includes(app.id) && !files[app.id]) await discover(app);
        setExpanded(current => current.includes(app.id) ? current.filter(id => id !== app.id) : [...current, app.id]);
    }

    async function search() {
        const active = apps.filter(app => selected.includes(app.id));
        if (!query.trim() || !active.length) return;
        const collections = await Promise.all(active.map(async app => files[app.id] || discover(app)));
        const lowered = query.trim().toLowerCase();
        setResults(collections.flat().filter(file => file.name.toLowerCase().includes(lowered)));
    }

    async function openFile(path: string) {
        await fetch(`${API_BASE_URL}/search-files/open`, {
            method: "POST",
            credentials: "include",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({path})
        });
    }

    return <main className="applicationsWorkspace">
        <header>
            <div><h1>Applications</h1><p>Select file types and FolderRocket automatically finds their folders across this computer.</p></div>
            <div className="applicationAdd">
                <input value={name} onChange={event => { const value = event.target.value; setName(value); if (PRESETS[value]) { setIcon(PRESETS[value].icon); setExtensions(PRESETS[value].extensions.join(", ")); } }} list="applicationPresets" placeholder="Application name"/>
                <datalist id="applicationPresets">{Object.keys(PRESETS).map(item => <option key={item} value={item}/>)}</datalist>
                <input className="applicationIconInput" value={icon} maxLength={3} onChange={event => setIcon(event.target.value)} aria-label="Application logo"/>
                <input value={extensions} onChange={event => setExtensions(event.target.value)} placeholder="File types: sldprt, sldasm"/>
                <button type="button" onClick={addApp}><Plus size={16}/>Add</button>
            </div>
        </header>
        <div className="applicationsLayout">
            <section className="applicationsGrid">
                {apps.map(app => {
                    const appFiles = files[app.id] || [];
                    const filter = appFilters[app.id] || "all";
                    const counts = appFiles.reduce<Record<string, number>>((result, file) => {
                        const type = extensionOf(file.name) || "other";
                        result[type] = (result[type] || 0) + 1;
                        return result;
                    }, {});
                    const visibleFiles = appFiles.filter(file => filter === "all" || (extensionOf(file.name) || "other") === filter);
                    const grouped = visibleFiles.reduce<Record<string, FileEntry[]>>((result, file) => {
                        const folder = parentPath(file.path) || "Computer";
                        (result[folder] ||= []).push(file);
                        return result;
                    }, {});
                    return <article className="applicationCard" key={app.id}>
                        <button className="applicationCardMain" type="button" onClick={() => void openApp(app)}><span>{app.icon}</span><strong>{app.name}</strong><small>{app.extensions.map(type => `.${type}`).join(" · ") || "Choose file types"}</small></button>
                        <div className="applicationCardActions"><button type="button" onClick={() => void discover(app)}><Search size={14}/>Scan computer</button><button type="button" onClick={() => setApps(current => current.filter(item => item.id !== app.id))} title="Remove application"><Trash2 size={14}/></button></div>
                        {expanded.includes(app.id) && <div className="applicationFiles">
                            <label className="applicationTypeFilter"><span>File format</span><select value={filter} onChange={event => setAppFilters(current => ({...current, [app.id]: event.target.value}))}><option value="all">All ({appFiles.length})</option>{Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => <option value={type} key={type}>{type.toUpperCase()} ({count})</option>)}</select></label>
                            {Object.entries(grouped).map(([folder, folderFiles]) => <section className="applicationFolderGroup" key={folder}>
                                <header title={folder}><FolderOpen size={14}/><strong>{folder}</strong><small>{folderFiles.length}</small></header>
                                {folderFiles.map(file => <button type="button" className="inspectorFile" key={file.path} onClick={() => void openFile(file.path)} title={file.path}><span className="inspectorFileName"><ApplicationFileIcon name={file.name}/><strong>{file.name}</strong></span><small>{formatSize(file.size)}</small><ExternalLink size={12}/></button>)}
                            </section>)}
                            {files[app.id] && !visibleFiles.length ? <p>No matching files found.</p> : null}
                        </div>}
                    </article>;
                })}
                {!apps.length && <div className="applicationsEmpty">Add an application and its file types to scan this computer.</div>}
            </section>
            <aside className="applicationSearch">
                <h2>Search application files</h2>
                {apps.map(app => <label key={app.id}><input type="checkbox" checked={selected.includes(app.id)} onChange={event => setSelected(current => event.target.checked ? [...current, app.id] : current.filter(id => id !== app.id))}/><span>{app.icon}</span>{app.name}</label>)}
                <div><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void search(); }} placeholder="File name"/><button type="button" onClick={() => void search()}><Search size={16}/></button></div>
                {message && <p>{message}</p>}
                <section>{results.map(file => <button type="button" key={file.path} onClick={() => void openFile(file.path)}><span>{file.name}</span><ExternalLink size={12}/></button>)}</section>
            </aside>
        </div>
    </main>;
}
