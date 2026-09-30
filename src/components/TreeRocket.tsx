import {useEffect, useId, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {ArrowLeft, Check, Copy, Files, FolderOpen, FolderTree, HardDrive, Home, LoaderCircle, Minus, Plus, Search, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import FileKindIcon from "./FileKindIcon";

interface TreeFolder { name: string; path: string; kind?: "computer" | "user" | "workspace" | "linked"; }
interface TreeFile { name: string; path: string; }
interface TreeContents { path: string; folders: TreeFolder[]; files: TreeFile[]; truncatedFolders?: boolean; truncatedFiles?: boolean; }
interface LinkedFolder { id: string; name: string; path: string; storage?: "physical" | "imaginary"; }
interface SearchFolder extends TreeFolder { rootPath: string; rootName: string; depth: number; }
interface SearchFile extends TreeFile { parentPath: string; parentName: string; rootPath: string; rootName: string; }
interface TreeSearchResults { folders: SearchFolder[]; files: SearchFile[]; scannedDirectories: number; truncated: boolean; }
interface FileView { path: string; name: string; files: TreeFile[]; truncated: boolean; }
interface TreeCamera { zoom: number; scrollProgress: number; }
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
    const id = useId().replaceAll(":", "");
    return <svg width={size} height={size} viewBox="0 0 120 128" fill="none" className="treeRocketMark" role="img" aria-label="Tree Rocket: albero di cartelle con razzo in decollo">
        <defs>
            <linearGradient id={`${id}-crown`} x1="18" y1="12" x2="103" y2="91"><stop stopColor="#8ee8b5"/><stop offset=".52" stopColor="#30ad90"/><stop offset="1" stopColor="#176c88"/></linearGradient>
            <linearGradient id={`${id}-folder`} x1="30" y1="29" x2="88" y2="70"><stop stopColor="#fff7c1"/><stop offset=".48" stopColor="#ffc749"/><stop offset="1" stopColor="#e88a22"/></linearGradient>
            <linearGradient id={`${id}-rocket`} x1="48" y1="62" x2="73" y2="111"><stop stopColor="#8ad8ff"/><stop offset=".55" stopColor="#278fd7"/><stop offset="1" stopColor="#124b9d"/></linearGradient>
            <linearGradient id={`${id}-flame`} x1="60" y1="97" x2="60" y2="126"><stop stopColor="#fff4a0"/><stop offset=".43" stopColor="#ff9d28"/><stop offset="1" stopColor="#f04a16" stopOpacity="0"/></linearGradient>
        </defs>
        <circle cx="60" cy="49" r="43" fill={`url(#${id}-crown)`} stroke="#164d72" strokeWidth="4"/>
        <path d="M28 61c-11-5-15-15-11-25 2-8 10-13 19-12-1-10 6-17 16-18 8 0 14 4 17 11 10-5 22-1 26 8 11 2 17 12 14 22-2 9-9 14-18 15-8 9-20 12-31 8-10 6-24 2-32-9Z" fill={`url(#${id}-crown)`} stroke="#164d72" strokeWidth="3.5" strokeLinejoin="round"/>
        <path d="M27 47c-4-8 0-16 7-20m51-8c10 1 16 9 15 17M31 64c8 6 16 6 23 2" stroke="#d8fff0" strokeOpacity=".62" strokeWidth="4" strokeLinecap="round"/>
        <path d="M25 38h15l5 5h17v23H25V38Zm40-13h15l5 5h16v22H65V25Zm-22 31h13l4 4h16v18H43V56Z" fill={`url(#${id}-folder)`} stroke="#a95b1b" strokeWidth="2.8" strokeLinejoin="round"/>
        <path d="M30 45h25m21-14h23M49 63h20" stroke="#fff9d3" strokeWidth="2.6" strokeLinecap="round" opacity=".85"/>
        <path d="M49 73 39 94l14-5 7 13 7-13 14 5-10-21" fill={`url(#${id}-rocket)`} stroke="#164b7e" strokeWidth="3.5" strokeLinejoin="round"/>
        <path d="M48 71 60 59l12 12-5 33H53l-5-33Z" fill={`url(#${id}-rocket)`} stroke="#123e72" strokeWidth="3.2" strokeLinejoin="round"/>
        <circle cx="60" cy="81" r="6" fill="#e0f8ff" stroke="#134680" strokeWidth="2.6"/>
        <path d="M49 104c-2 7-9 12-9 19 7-3 11-8 13-13 0 6 3 11 7 15 4-5 7-9 7-15 3 5 8 10 14 13 0-8-6-13-9-19" fill={`url(#${id}-flame)`}/>
        <path d="M57 105c-1 6-1 11 3 16 5-6 4-11 3-16" fill="#fff6b6" opacity=".92"/>
    </svg>;
}

function TreeRocketFolderNode({folder, root = false, loading, onOpen, onShowFiles, onAdd}: {
    folder: TreeFolder; root?: boolean; loading: boolean;
    onOpen: () => void; onShowFiles: () => void; onAdd: () => void;
}) {
    return <article className={`treeRocketNode${root ? " treeRocketRootNode" : ""}`} data-graph-node>
        <span className="treeRocketFolderTab" aria-hidden="true"/>
        <button type="button" className="treeRocketNodeEnter" onClick={onOpen} disabled={loading} title={`Apri ${folder.name}`}>
            <span className="treeRocketNodeIcon">{folder.kind === "computer" ? <HardDrive size={21}/> : <FolderOpen size={21}/>}</span>
            <strong>{folder.name}</strong>
        </button>
        <div className="treeRocketNodeActions">
            <button type="button" onClick={event => {event.stopPropagation(); onShowFiles();}} disabled={loading}><Files size={13}/><span>Mostra file</span></button>
            <button type="button" onClick={event => {event.stopPropagation(); onAdd();}}><FolderTree size={13}/><span>Add to Folder Management</span></button>
        </div>
    </article>;
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
    const [copied, setCopied] = useState(false);
    const [filesLoading, setFilesLoading] = useState(false);
    const [filesError, setFilesError] = useState("");
    const requestSequence = useRef(0);
    const fileController = useRef<AbortController | null>(null);
    const overlayRef = useRef<HTMLElement>(null);
    const graphRef = useRef<HTMLElement>(null);
    const searchController = useRef<AbortController | null>(null);
    const backHandler = useRef<() => void>(() => {});
    const cameraByPath = useRef(new Map<string, TreeCamera>());

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        const appRoot = document.getElementById("root");
        const previousInert = appRoot?.inert ?? false;
        document.body.style.overflow = "hidden";
        if (appRoot) appRoot.inert = true;
        overlayRef.current?.focus();
        return () => { document.body.style.overflow = previousOverflow; if (appRoot) appRoot.inert = previousInert; };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void fetch(`${API_BASE_URL}/filesystem/tree-roots`, {credentials: "include", signal: controller.signal})
            .then(async response => {
                const data = await response.json().catch(() => ({})) as {roots?: TreeFolder[]; message?: string};
                if (!response.ok) throw new Error(data.message || "Unable to load computer folders.");
                if (!controller.signal.aborted) setHostRoots(Array.isArray(data.roots) ? data.roots : []);
            })
            .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load folder roots."); });
        return () => { controller.abort(); searchController.current?.abort(); fileController.current?.abort(); };
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

    function rememberCamera(path = currentPath) {
        const graph = graphRef.current;
        const maxScroll = graph ? Math.max(0, graph.scrollHeight - graph.clientHeight) : 0;
        cameraByPath.current.set(pathKey(path) || "__roots__", {zoom, scrollProgress: maxScroll ? (graph?.scrollTop ?? 0) / maxScroll : 0});
    }
    function restoreCamera(path: string) {
        const camera = cameraByPath.current.get(pathKey(path) || "__roots__") ?? {zoom: 1, scrollProgress: 0};
        setZoom(camera.zoom);
    }

    useEffect(() => {
        const graph = graphRef.current;
        if (!graph) return;
        const camera = cameraByPath.current.get(pathKey(currentPath) || "__roots__");
        const frame = requestAnimationFrame(() => {
            graph.scrollLeft = 0;
            graph.scrollTop = (graph.scrollHeight - graph.clientHeight) * (camera?.scrollProgress ?? 0);
        });
        return () => cancelAnimationFrame(frame);
    }, [currentPath, roots.length, contents?.folders.length, searchResults]);

    async function fetchFolderContents(folder: TreeFolder, includeFiles = false, trail?: TreeFolder[]) {
        rememberCamera();
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
            setSearchResults(null); setSearchText(""); restoreCamera(folder.path);
        } catch (reason) {
            if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "This folder cannot be opened.");
        } finally { if (requestId === requestSequence.current) setLoading(false); }
    }

    async function refreshFolder(folder: TreeFolder, trail = pathStack, includeFiles = false): Promise<boolean> {
        rememberCamera();
        const requestId = ++requestSequence.current;
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: folder.path, includeFiles})});
            const data = await response.json().catch(() => ({})) as TreeContents & {message?: string};
            if (requestId !== requestSequence.current) return false;
            if (!response.ok) throw new Error(data.message || "This folder cannot be opened.");
            setPathStack(trail); setContents(data);
            setFilesView(includeFiles ? {path: folder.path, name: folder.name, files: data.files ?? [], truncated: Boolean(data.truncatedFiles)} : null);
            setSearchResults(null); setSearchText(""); restoreCamera(folder.path);
            return true;
        } catch (reason) { if (requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "This folder cannot be opened."); return false; }
        finally { if (requestId === requestSequence.current) setLoading(false); }
    }

    function back() {
        searchController.current?.abort();
        if (searchResults || searchText) { setSearchResults(null); setSearchText(""); setSearching(false); setError(""); return; }
        if (filesView) { fileController.current?.abort(); setFilesView(null); setFilesLoading(false); setFilesError(""); setError(""); return; }
        rememberCamera();
        requestSequence.current += 1;
        setLoading(false); setError(""); setNotice("");
        const next = pathStack.slice(0, -1);
        setPathStack(next);
        if (!next.length) { setContents(null); restoreCamera(""); return; }
        void refreshFolder(next[next.length - 1], next);
    }

    useEffect(() => { backHandler.current = back; });
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            const target = event.target;
            const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
            if (event.key === "Escape" || (event.altKey && event.key === "ArrowLeft") || (event.key === "Backspace" && !editing)) {
                event.preventDefault();
                event.stopPropagation();
                backHandler.current();
            }
        }
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, []);

    function goRoots() {
        rememberCamera(); searchController.current?.abort(); fileController.current?.abort(); requestSequence.current += 1; setSearching(false);
        setLoading(false); setError(""); setNotice(""); setSearchText(""); setSearchResults(null);
        const rootCamera = cameraByPath.current.get("__roots__") ?? {zoom: 1, scrollProgress: 0};
        cameraByPath.current.set("__roots__", {...rootCamera, scrollProgress: 0});
        if (graphRef.current) graphRef.current.scrollTop = 0;
        setPathStack([]); setContents(null); setFilesView(null); setFilesLoading(false); setFilesError(""); setZoom(rootCamera.zoom);
    }

    async function showFiles(folder: TreeFolder) {
        fileController.current?.abort();
        const controller = new AbortController(); fileController.current = controller;
        setFilesView({path: folder.path, name: folder.name, files: [], truncated: false});
        setFilesLoading(true); setFilesError("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: folder.path, includeFiles: true}), signal: controller.signal});
            const data = await response.json().catch(() => ({})) as TreeContents & {message?: string};
            if (!response.ok) throw new Error(data.message || "Impossibile leggere i file della cartella.");
            if (!controller.signal.aborted) setFilesView({path: folder.path, name: folder.name, files: data.files ?? [], truncated: Boolean(data.truncatedFiles)});
        } catch (reason) { if (!controller.signal.aborted) setFilesError(reason instanceof Error ? reason.message : "Impossibile leggere i file della cartella."); }
        finally { if (!controller.signal.aborted) setFilesLoading(false); }
    }

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

    const visibleSearchFolders = searchResults?.folders ?? [];
    const visibleSearchFiles = searchResults?.files ?? [];

    return createPortal(<section className="treeRocketOverlay" role="dialog" aria-modal="true" aria-labelledby="treeRocketTitle" ref={overlayRef} tabIndex={-1}>
        <div className="treeRocketWindow">
            <header className="treeRocketHeader">
                <button type="button" className="treeRocketBack" onClick={back} disabled={!pathStack.length && !filesView && !searchResults && !searchText}><ArrowLeft size={16}/>Indietro</button>
                <div className="treeRocketBrand"><TreeRocketMark size={62}/><span><small>FOLDERROCKET</small><strong id="treeRocketTitle">Tree Rocket</strong></span></div>
                <button type="button" className="treeRocketClose" onClick={onClose} title="Torna a Folder Management" aria-label="Torna a Folder Management"><X size={19}/><span>Torna a Folder Management</span></button>
            </header>
            <div className="treeRocketToolbar">
                <button type="button" onClick={goRoots} disabled={!pathStack.length && !searchResults && !filesView}><Home size={14}/>Radici</button>
                <nav className="treeRocketBreadcrumbs" aria-label="Folder path"><button type="button" onClick={goRoots} disabled={!pathStack.length}>Computer</button>{pathStack.map((folder, index) => <span key={`${folder.path}-${index}`}><i>›</i><button type="button" onClick={() => { const next = pathStack.slice(0, index + 1); setSearchResults(null); setSearchText(""); setFilesView(null); void refreshFolder(folder, next); }}>{folder.name}</button></span>)}</nav>
                <form className="treeRocketSearch" onSubmit={event => {event.preventDefault(); void search();}}><Search size={14}/><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Cerca cartelle o file…" aria-label="Search folders and files"/><button type="submit" disabled={searching} aria-label="Search">{searching ? <LoaderCircle className="treeRocketSpinner" size={14}/> : "Cerca"}</button></form>
                {currentPath && <button type="button" className="treeRocketCopyPath" onClick={() => void copyPath()} title="Copia il percorso della cartella selezionata"><Copy size={14}/>{copied ? "Copiato" : "Copia path"}</button>}
                <div className="treeRocketZoom" aria-label="Graph zoom"><button type="button" title="Zoom out" onClick={() => setZoom(value => Math.max(.55, Math.round((value - .1) * 10) / 10))} disabled={zoom <= .55}><Minus size={14}/></button><span>{Math.round(zoom * 100)}%</span><button type="button" title="Zoom in" onClick={() => setZoom(value => Math.min(1.5, Math.round((value + .1) * 10) / 10))} disabled={zoom >= 1.5}><Plus size={14}/></button></div>
            </div>
            {error && <p className="treeRocketError" role="alert">{error}</p>}{notice && <p className="treeRocketNotice" role="status"><Check size={13}/>{notice}</p>}
            <div className="treeRocketBody">
                <main className="treeRocketGraph" aria-label="Folder tree graph" ref={graphRef} onContextMenu={event => {const target = event.target as HTMLElement; if (target.closest("[data-graph-node],button,input")) return; event.preventDefault(); back();}}>
                    <div className="treeRocketGraphCanvas" style={{zoom}}>
                        {searchResults ? <>
                            <div className="treeRocketGraphHeading"><span>RISULTATI</span><strong>{visibleSearchFolders.length} cartelle</strong></div>
                            <div className="treeRocketSearchGraph">{visibleSearchFolders.map(folder => <TreeRocketFolderNode key={folder.path} folder={folder} loading={loading} onOpen={() => void openSearchFolder(folder)} onShowFiles={() => void showFiles(folder)} onAdd={() => void addFolder(folder)}/>)}{!visibleSearchFolders.length && <p className="treeRocketEmpty">Nessuna cartella corrispondente.</p>}</div>
                        </> : <>
                            {currentFolder && <TreeRocketFolderNode folder={currentFolder} root loading={loading} onOpen={() => void fetchFolderContents(currentFolder, false, pathStack)} onShowFiles={() => void showFiles(currentFolder)} onAdd={() => void addFolder(currentFolder)}/>}
                            {currentFolder && currentChildren.length > 0 && <div className="treeRocketChildrenHeading"><span>SOTTOCARTELLE</span><strong>{currentFolder.name}</strong><i>{currentChildren.length}</i></div>}
                            <div className={`treeRocketChildren ${currentFolder ? "hasParent" : "rootNodes"} ${currentChildren.length === 0 ? "emptyChildren" : currentChildren.length === 1 ? "singleChild" : "multipleChildren"}`}>
                                {currentChildren.map(folder => <TreeRocketFolderNode key={folder.path} folder={folder} loading={loading} onOpen={() => void fetchFolderContents(folder)} onShowFiles={() => void showFiles(folder)} onAdd={() => void addFolder(folder)}/>)}
                                {!currentChildren.length && !loading && <p className="treeRocketEmpty">Nessuna sottocartella in questo livello.</p>}
                                {loading && <p className="treeRocketLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={15}/> Lettura cartelle…</p>}
                            </div>
                            {contents?.truncatedFolders && <p className="treeRocketLimit">Mostrate le prime 250 cartelle. Apri una sottocartella per continuare.</p>}
                        </>}
                    </div>
                </main>
                {(filesView || searchResults) && <aside className="treeRocketFiles" aria-label={filesView ? `Files in ${filesView.name}` : "Search results"}>
                    {filesView ? <><header><div><Files size={20}/><strong>File in {filesView.name}</strong><small>{filesView.files.length} file visibili</small></div><button type="button" onClick={() => {fileController.current?.abort(); setFilesView(null);}} aria-label="Chiudi elenco file"><X size={16}/></button></header><div className="treeRocketFileList">{filesLoading && <p role="status"><LoaderCircle className="treeRocketSpinner" size={16}/> Caricamento file…</p>}{!filesLoading && filesError && <p role="alert">{filesError}</p>}{!filesLoading && filesView.files.map(file => <div className="treeRocketFile" key={file.path}><FileKindIcon name={file.name} size={22}/><strong title={file.name}>{file.name}</strong><button type="button" onClick={() => void copyPath(file.path)} aria-label={`Copia percorso di ${file.name}`} title="Copia percorso"><Copy size={14}/></button></div>)}{!filesLoading && !filesView.files.length && !filesError && <p>Questa cartella non contiene file visibili.</p>}{filesView.truncated && <small>Mostrati i primi 200 file.</small>}</div></> : <><header><div><Search size={20}/><strong>Risultati ricerca</strong><small>{searchResults?.scannedDirectories ?? 0} cartelle esplorate</small></div><button type="button" onClick={() => setSearchResults(null)} aria-label="Chiudi risultati ricerca"><X size={16}/></button></header><div className="treeRocketFileList"><h3>File · {visibleSearchFiles.length}</h3>{visibleSearchFiles.map(file => <button type="button" className="treeRocketFile searchHit" key={file.path} onClick={() => void openSearchFile(file)} title={file.path}><FileKindIcon name={file.name} size={22}/><strong>{file.name}</strong><small>{file.parentName}</small></button>)}{!visibleSearchFiles.length && <p>Nessun file corrispondente.</p>}{searchResults?.truncated && <small>Ricerca limitata per mantenere l’esplorazione rapida. Affina il nome per altri risultati.</small>}</div></>}
                </aside>}
            </div>
            <footer><span>Seleziona una cartella per entrare · Destro/Esc: indietro</span><span>Vista e zoom conservati per ogni cartella</span></footer>
        </div>
    </section>, document.body);
}
