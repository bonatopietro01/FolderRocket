import {useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent} from "react";
import {ArrowLeft, Check, Copy, Files, FolderOpen, FolderTree, HardDrive, Home, LoaderCircle, Minus, Plus, Search, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import folderRocketWordmark from "../assets/folderrocket-wordmark.png";
import FileKindIcon from "./FileKindIcon";

interface TreeFolder { name: string; path: string; kind?: "computer" | "user" | "workspace" | "linked"; }
interface TreeFile { name: string; path: string; }
interface TreeContents { path: string; folders: TreeFolder[]; files: TreeFile[]; truncatedFolders?: boolean; truncatedFiles?: boolean; }
interface LinkedFolder { id: string; name: string; path: string; storage?: "physical" | "imaginary"; }
interface SearchFolder extends TreeFolder { rootPath: string; rootName: string; depth: number; }
interface SearchFile extends TreeFile { parentPath: string; parentName: string; rootPath: string; rootName: string; }
interface TreeSearchResults { folders: SearchFolder[]; files: SearchFile[]; scannedDirectories: number; truncated: boolean; }
interface FileView { path: string; name: string; files: TreeFile[]; truncated: boolean; }
interface Props { folders: LinkedFolder[]; onAddFolder: (path: string, name: string) => boolean | void | Promise<boolean | void>; onClose: () => void; }

function pathKey(value: string) { return value.replaceAll("/", "\\").replace(/[\\]+$/, "").toLowerCase(); }
function pathTrail(rootPath: string, rootName: string, targetPath: string): TreeFolder[] {
    const separator = rootPath.includes("\\") ? "\\" : "/";
    const root: TreeFolder = {name: rootName, path: rootPath, kind: "computer"};
    const relative = targetPath.slice(rootPath.length).split(/[\\/]+/).filter(Boolean);
    const trail = [root];
    let parent = rootPath;
    for (const name of relative) {
        parent = `${parent.replace(/[\\/]+$/, "")}${separator}${name}`;
        trail.push({name, path: parent});
    }
    return trail;
}

export function TreeRocketMark({size = 23}: {size?: number}) {
    return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className="treeRocketMark">
        <path d="M31.8 37.4v11.2M31.8 47 19.4 56M31.8 47l12.8 9M30.3 47l-4.9 11M33.4 47l5.2 11" stroke="#356b4e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M31.8 6.5c-7.2 4.9-11.8 13.1-13 24.7h26.1C43.5 19.6 39 11.4 31.8 6.5Z" fill="#6fc58a" stroke="#286947" strokeWidth="2.7" strokeLinejoin="round"/>
        <rect x="17.7" y="20.7" width="10.7" height="8.2" rx="1.8" fill="#f5fff5" stroke="#398361" strokeWidth="1.8"/><rect x="30.7" y="14.1" width="11.2" height="8.1" rx="1.8" fill="#f5fff5" stroke="#398361" strokeWidth="1.8"/><rect x="25" y="25.4" width="13.2" height="8.5" rx="1.8" fill="#f5fff5" stroke="#398361" strokeWidth="1.8"/>
        <path d="M22.4 23.6v3.1h2.9m9.4-10.5v3h3.1m-8.4 8.1v3.1h3.1" stroke="#398361" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M27 51.4 22.1 61M37.1 51.4l4.4 9.6M31.9 52.1v10" stroke="#f3a34a" strokeWidth="2.8" strokeLinecap="round"/>
        <path d="M21.1 59.2c-1.1 1.3-1.5 2.6-1.4 3.5 1.4-.3 2.4-1.3 3-2.9m17.8-.1c.8 1.3 1 2.4.8 3.3-1.3-.4-2.2-1.4-2.6-2.7" fill="#ffcf69"/>
        <circle cx="12.3" cy="36.8" r="1.7" fill="#efb354"/><circle cx="50.5" cy="36.3" r="1.5" fill="#77c7e8"/>
    </svg>;
}

export default function TreeRocket({folders, onAddFolder, onClose}: Props) {
    const linkedRoots = useMemo(() => folders.filter(folder => folder.storage !== "imaginary" && folder.path.trim()).map(folder => ({name: folder.name || "FolderRocket folder", path: folder.path, kind: "linked" as const})), [folders]);
    const [hostRoots, setHostRoots] = useState<TreeFolder[]>([]);
    const [pathStack, setPathStack] = useState<TreeFolder[]>([]);
    const [contents, setContents] = useState<TreeContents | null>(null);
    const [filesView, setFilesView] = useState<FileView | null>(null);
    const [searchText, setSearchText] = useState("");
    const [searchResults, setSearchResults] = useState<TreeSearchResults | null>(null);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({x: 0, y: 0});
    const [copied, setCopied] = useState(false);
    const requestSequence = useRef(0);
    const searchController = useRef<AbortController | null>(null);
    const dragState = useRef<{x: number; y: number; panX: number; panY: number} | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        void fetch(`${API_BASE_URL}/filesystem/tree-roots`, {credentials: "include", signal: controller.signal})
            .then(async response => {
                const data = await response.json().catch(() => ({})) as {roots?: TreeFolder[]; message?: string};
                if (!response.ok) throw new Error(data.message || "Unable to load computer folders.");
                if (!controller.signal.aborted) setHostRoots(Array.isArray(data.roots) ? data.roots : []);
            })
            .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load folder roots."); });
        return () => { controller.abort(); searchController.current?.abort(); };
    }, []);

    const roots = useMemo(() => {
        const combined = [...linkedRoots, ...hostRoots];
        const seen = new Set<string>();
        return combined.filter(folder => {
            const key = pathKey(folder.path);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [hostRoots, linkedRoots]);
    const currentFolder = pathStack.at(-1) ?? null;
    const currentChildren = currentFolder ? contents?.folders ?? [] : roots;
    const currentPath = currentFolder?.path ?? "";

    async function fetchFolderContents(folder: TreeFolder, includeFiles = false, trail?: TreeFolder[]) {
        const requestId = ++requestSequence.current;
        setLoading(true); setError(""); setNotice("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {
                method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({path: folder.path, includeFiles})
            });
            const data = await response.json().catch(() => ({})) as TreeContents & {message?: string};
            if (!response.ok) throw new Error(data.message || "This folder cannot be opened.");
            if (requestId !== requestSequence.current) return;
            if (trail) setPathStack(trail);
            else setPathStack(current => [...current.filter(item => pathKey(item.path) !== pathKey(folder.path)), folder]);
            setContents(data);
            setFilesView(includeFiles ? {path: folder.path, name: folder.name, files: data.files ?? [], truncated: Boolean(data.truncatedFiles)} : null);
            setSearchResults(null); setSearchText(""); setPan({x: 0, y: 0});
        } catch (reason) {
            if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "This folder cannot be opened.");
        } finally { if (requestId === requestSequence.current) setLoading(false); }
    }

    async function refreshFolder(folder: TreeFolder, trail = pathStack, includeFiles = false): Promise<boolean> {
        const requestId = ++requestSequence.current;
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: folder.path, includeFiles})});
            const data = await response.json().catch(() => ({})) as TreeContents & {message?: string};
            if (requestId !== requestSequence.current) return false;
            if (!response.ok) throw new Error(data.message || "This folder cannot be opened.");
            setPathStack(trail); setContents(data);
            setFilesView(includeFiles ? {path: folder.path, name: folder.name, files: data.files ?? [], truncated: Boolean(data.truncatedFiles)} : null);
            return true;
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "This folder cannot be opened."); return false; }
        finally { if (requestId === requestSequence.current) setLoading(false); }
    }

    function back() {
        searchController.current?.abort();
        if (searchResults || searchText) { setSearchResults(null); setSearchText(""); setSearching(false); setError(""); return; }
        if (filesView) { setFilesView(null); setError(""); return; }
        requestSequence.current += 1;
        setLoading(false); setError(""); setNotice("");
        const next = pathStack.slice(0, -1);
        setPathStack(next); setPan({x: 0, y: 0});
        if (!next.length) { setContents(null); return; }
        void refreshFolder(next[next.length - 1], next);
    }

    function goRoots() {
        searchController.current?.abort(); requestSequence.current += 1; setSearching(false);
        setLoading(false); setError(""); setNotice(""); setSearchText(""); setSearchResults(null);
        setPathStack([]); setContents(null); setFilesView(null); setPan({x: 0, y: 0});
    }

    async function showFiles(folder: TreeFolder) { await fetchFolderContents(folder, true); }

    async function addFolder(folder: TreeFolder) {
        const existing = folders.find(item => item.storage !== "imaginary" && pathKey(item.path) === pathKey(folder.path));
        if (existing) { setError(`“${existing.name}” è già presente in Folder Management.`); return; }
        setError(""); setNotice("");
        try {
            const result = await onAddFolder(folder.path, folder.name);
            if (result === false) throw new Error(`Impossibile aggiungere “${folder.name}”. Controlla se è già presente.`);
            setNotice(`“${folder.name}” aggiunta a Folder Management. Ritorno alla gestione cartelle…`);
            window.setTimeout(onClose, 650);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossibile aggiungere questa cartella."); }
    }

    async function search() {
        const query = searchText.trim();
        if (query.length < 2) { setError("Scrivi almeno due caratteri per cercare cartelle e file."); return; }
        searchController.current?.abort();
        const controller = new AbortController(); searchController.current = controller;
        requestSequence.current += 1; setLoading(false); setSearching(true); setError(""); setNotice(""); setFilesView(null);
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-search`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({query}), signal: controller.signal});
            const data = await response.json().catch(() => ({})) as TreeSearchResults & {message?: string};
            if (!response.ok) throw new Error(data.message || "Ricerca cartelle non riuscita.");
            if (!controller.signal.aborted) setSearchResults({folders: data.folders ?? [], files: data.files ?? [], scannedDirectories: data.scannedDirectories ?? 0, truncated: Boolean(data.truncated)});
        } catch (reason) {
            if (!controller.signal.aborted) { setSearchResults(null); setError(reason instanceof Error ? reason.message : "Ricerca cartelle non riuscita."); }
        } finally { if (!controller.signal.aborted) setSearching(false); }
    }

    async function openSearchFolder(hit: SearchFolder) {
        const trail = pathTrail(hit.rootPath, hit.rootName, hit.path);
        await refreshFolder(hit, trail);
    }

    async function openSearchFile(hit: SearchFile) {
        const parent = {name: hit.parentName, path: hit.parentPath};
        const trail = pathTrail(hit.rootPath, hit.rootName, hit.parentPath);
        const opened = await refreshFolder(parent, trail, true);
        if (opened) setFilesView(current => current ? {...current, files: [{name: hit.name, path: hit.path}]} : current);
    }

    async function copyPath(path = currentPath) {
        if (!path) return;
        try { await navigator.clipboard.writeText(path); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }
        catch { setError("Clipboard non disponibile. Seleziona il percorso e copialo manualmente."); }
    }

    function startCanvasPan(event: PointerEvent<HTMLDivElement>) {
        const target = event.target as HTMLElement;
        if (target.closest("button,input,a,[data-graph-node]")) return;
        event.preventDefault();
        dragState.current = {x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y};
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function moveCanvasPan(event: PointerEvent<HTMLDivElement>) {
        const start = dragState.current;
        if (start) setPan({x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y});
    }
    function stopCanvasPan() { dragState.current = null; }

    function onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === "Escape") { event.preventDefault(); back(); }
        if ((event.altKey && event.key === "ArrowLeft") || (event.key === "Backspace" && !(event.target instanceof HTMLInputElement))) { event.preventDefault(); back(); }
        if (event.key === "Enter" && event.target instanceof HTMLButtonElement && event.target.matches(".treeRocketNodeEnter")) event.target.click();
    }

    const visibleSearchFolders = searchResults?.folders ?? [];
    const visibleSearchFiles = searchResults?.files ?? [];

    return <section className="treeRocketOverlay" role="dialog" aria-modal="true" aria-labelledby="treeRocketTitle" onKeyDown={onKeyDown}>
        <div className="treeRocketWindow">
            <header className="treeRocketHeader">
                <button type="button" className="treeRocketBack" onClick={back} disabled={!pathStack.length && !filesView && !searchResults && !searchText}><ArrowLeft size={16}/>Indietro</button>
                <div className="treeRocketBrand"><img src={folderRocketWordmark} alt="FolderRocket"/><span><TreeRocketMark size={25}/><strong id="treeRocketTitle">Tree Rocket</strong></span></div>
                <button type="button" className="treeRocketClose" onClick={onClose} title="Close Tree Rocket" aria-label="Close Tree Rocket"><X size={19}/></button>
            </header>
            <div className="treeRocketToolbar">
                <button type="button" onClick={goRoots} disabled={!pathStack.length && !searchResults && !filesView}><Home size={14}/>Radici</button>
                <nav className="treeRocketBreadcrumbs" aria-label="Folder path"><button type="button" onClick={goRoots} disabled={!pathStack.length}>Computer</button>{pathStack.map((folder, index) => <span key={`${folder.path}-${index}`}><i>›</i><button type="button" onClick={() => { const next = pathStack.slice(0, index + 1); setSearchResults(null); setSearchText(""); setFilesView(null); void refreshFolder(folder, next); }}>{folder.name}</button></span>)}</nav>
                <form className="treeRocketSearch" onSubmit={event => {event.preventDefault(); void search();}}><Search size={14}/><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Cerca cartelle o file…" aria-label="Search folders and files"/><button type="submit" disabled={searching} aria-label="Search">{searching ? <LoaderCircle className="treeRocketSpinner" size={14}/> : "Cerca"}</button></form>
                {currentPath && <><code className="treeRocketPath" title={currentPath}>{currentPath}</code><button type="button" className="treeRocketCopyPath" onClick={() => void copyPath()} title="Copy selected folder path"><Copy size={14}/>{copied ? "Copiato" : "Copia path"}</button></>}
                <div className="treeRocketZoom" aria-label="Graph zoom"><button type="button" title="Zoom out" onClick={() => setZoom(value => Math.max(.55, Math.round((value - .1) * 10) / 10))} disabled={zoom <= .55}><Minus size={14}/></button><span>{Math.round(zoom * 100)}%</span><button type="button" title="Zoom in" onClick={() => setZoom(value => Math.min(1.5, Math.round((value + .1) * 10) / 10))} disabled={zoom >= 1.5}><Plus size={14}/></button></div>
            </div>
            {error && <p className="treeRocketError" role="alert">{error}</p>}{notice && <p className="treeRocketNotice" role="status"><Check size={13}/>{notice}</p>}
            <div className={filesView || searchResults ? "treeRocketBody withSidebar" : "treeRocketBody"}>
                {(filesView || searchResults) && <aside className="treeRocketFiles" aria-label={filesView ? `Files in ${filesView.name}` : "Search results"}>
                    {filesView ? <><header><div><Files size={17}/><strong>File in {filesView.name}</strong><small title={filesView.path}>{filesView.path}</small></div><button type="button" onClick={() => setFilesView(null)} aria-label="Close file list"><X size={15}/></button></header><div className="treeRocketFileList">{filesView.files.map(file => <div className="treeRocketFile" key={file.path}><FileKindIcon name={file.name} size={16}/><strong title={file.name}>{file.name}</strong><button type="button" onClick={() => void copyPath(file.path)} aria-label={`Copy path of ${file.name}`} title="Copy file path"><Copy size={12}/></button></div>)}{!filesView.files.length && <p>Questa cartella non contiene file visibili.</p>}{filesView.truncated && <small>Mostrati i primi 200 file.</small>}</div></> : <><header><div><Search size={17}/><strong>Risultati ricerca</strong><small>{searchResults?.scannedDirectories ?? 0} cartelle esplorate</small></div><button type="button" onClick={() => setSearchResults(null)} aria-label="Close search results"><X size={15}/></button></header><div className="treeRocketFileList"><h3>File · {visibleSearchFiles.length}</h3>{visibleSearchFiles.map(file => <button type="button" className="treeRocketFile searchHit" key={file.path} onClick={() => void openSearchFile(file)} title={file.path}><FileKindIcon name={file.name} size={16}/><strong>{file.name}</strong><small>{file.parentName}</small></button>)}{!visibleSearchFiles.length && <p>Nessun file corrispondente.</p>}{searchResults?.truncated && <small>Ricerca limitata per mantenere l’esplorazione rapida. Affina il nome per altri risultati.</small>}</div></>}
                </aside>}
                <main className="treeRocketGraph" aria-label="Folder tree graph" onContextMenu={event => {event.preventDefault(); back();}} onPointerDown={startCanvasPan} onPointerMove={moveCanvasPan} onPointerUp={stopCanvasPan} onPointerCancel={stopCanvasPan}>
                    <div className="treeRocketGraphCanvas" style={{transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}}>
                        {searchResults ? <>
                            <div className="treeRocketGraphHeading"><span>RISULTATI</span><strong>{visibleSearchFolders.length} cartelle</strong></div>
                            <div className="treeRocketSearchGraph">{visibleSearchFolders.map(folder => <article className="treeRocketNode searchFolderNode" key={folder.path} data-graph-node><button type="button" className="treeRocketNodeEnter" onClick={() => void openSearchFolder(folder)} disabled={loading} title={`Apri ${folder.path}`}><FolderOpen size={22}/><strong>{folder.name}</strong><small title={folder.path}>{folder.path}</small></button><button type="button" className="treeRocketAddButton" onClick={() => void addFolder(folder)}><FolderTree size={14}/>Add to Folder Management</button></article>)}{!visibleSearchFolders.length && <p className="treeRocketEmpty">Nessuna cartella corrispondente.</p>}</div>
                        </> : <>
                            {currentFolder && <><div className="treeRocketCurrentNode" data-graph-node><FolderOpen size={26}/><div><small>ROOT CARTELLA</small><strong title={currentFolder.name}>{currentFolder.name}</strong><code title={currentFolder.path}>{currentFolder.path}</code></div><button type="button" onClick={() => void addFolder(currentFolder)}><FolderTree size={14}/>Add to Folder Management</button></div><div className="treeRocketTrunk" aria-hidden="true"/> </>}
                            <div className={currentFolder ? "treeRocketChildren hasParent" : "treeRocketChildren rootNodes"}>
                                {currentChildren.map(folder => <article className="treeRocketNode" key={`${folder.path}-${folder.kind ?? "folder"}`} data-graph-node>
                                    <button type="button" className="treeRocketNodeEnter" onClick={() => void fetchFolderContents(folder)} disabled={loading} title={`Open ${folder.path}`}><span className="treeRocketNodeIcon">{folder.kind === "computer" ? <HardDrive size={21}/> : <FolderOpen size={21}/>}</span><strong>{folder.name}</strong><small title={folder.path}>{folder.path}</small></button>
                                    <div className="treeRocketNodeActions"><button type="button" onClick={() => void showFiles(folder)} disabled={loading}><Files size={13}/>Mostra file</button><button type="button" onClick={() => void addFolder(folder)}><FolderTree size={13}/>Add to Folder Management</button></div>
                                </article>)}
                                {!currentChildren.length && !loading && <p className="treeRocketEmpty">Nessuna sottocartella in questo livello.</p>}
                                {loading && <p className="treeRocketLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={15}/> Lettura cartelle…</p>}
                            </div>
                            {contents?.truncatedFolders && <p className="treeRocketLimit">Mostrate le prime 250 cartelle. Apri una sottocartella per continuare.</p>}
                        </>}
                    </div>
                </main>
            </div>
            <footer><span>Sinistro/Invio: entra · Destro/Esc: indietro · Trascina lo sfondo per spostare il grafo</span><span>Caricamento progressivo, file solo su richiesta</span></footer>
        </div>
    </section>;
}
