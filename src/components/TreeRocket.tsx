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
    return <svg width={size} height={size} viewBox="0 0 128 132" fill="none" className="treeRocketMark" role="img" aria-label="Tree Rocket folder tree logo proposal">
        <defs>
            <linearGradient id={`${id}-leaf`} x1="20" y1="17" x2="105" y2="84"><stop stopColor="#a5edbd"/><stop offset=".48" stopColor="#43bd91"/><stop offset="1" stopColor="#16718a"/></linearGradient>
            <linearGradient id={`${id}-folder`} x1="20" y1="27" x2="105" y2="77"><stop stopColor="#fff8c8"/><stop offset=".52" stopColor="#ffc94d"/><stop offset="1" stopColor="#e98524"/></linearGradient>
            <linearGradient id={`${id}-rocket`} x1="52" y1="63" x2="76" y2="108"><stop stopColor="#8de0ff"/><stop offset=".55" stopColor="#328fe0"/><stop offset="1" stopColor="#174b9d"/></linearGradient>
            <linearGradient id={`${id}-flame`} x1="64" y1="101" x2="64" y2="130"><stop stopColor="#fff9a8"/><stop offset=".42" stopColor="#ff9b2b"/><stop offset="1" stopColor="#f04419" stopOpacity="0"/></linearGradient>
        </defs>
        <ellipse cx="64" cy="126" rx="25" ry="4" fill="#071a31" opacity=".34"/>
        <path d="M64 91V45M64 65 38 49M64 61 91 46M64 78 39 69M64 76 90 66" stroke="#155f55" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M35 74C20 74 12 64 14 52 8 40 16 27 30 25 34 12 48 7 59 14 70 5 86 11 89 24 103 24 113 36 108 49 116 62 107 76 93 77 84 88 70 87 63 80 54 88 41 84 35 74Z" fill={`url(#${id}-leaf)`} stroke="#15536c" strokeWidth="4" strokeLinejoin="round"/>
        <circle cx="35" cy="42" r="17" fill={`url(#${id}-leaf)`}/><circle cx="64" cy="31" r="18" fill={`url(#${id}-leaf)`}/><circle cx="92" cy="43" r="17" fill={`url(#${id}-leaf)`}/><circle cx="34" cy="65" r="15" fill={`url(#${id}-leaf)`}/><circle cx="64" cy="57" r="20" fill={`url(#${id}-leaf)`}/><circle cx="94" cy="64" r="15" fill={`url(#${id}-leaf)`}/>
        <g fill={`url(#${id}-folder)`} stroke="#9e5a22" strokeWidth="2.5" strokeLinejoin="round">
            <path d="M20 39h10l3 3h13v14H20V39Z"/><path d="M51 25h10l3 3h14v14H51V25Z"/><path d="M79 39h10l3 3h14v14H79V39Z"/><path d="M27 60h10l3 3h14v13H27V60Z"/><path d="M68 60h10l3 3h14v13H68V60Z"/>
        </g>
        <g stroke="#fff5c6" strokeWidth="2" strokeLinecap="round" opacity=".9"><path d="M25 46h15M56 32h17M84 46h16M32 66h16M73 66h16"/></g>
        <path d="M64 65C53 76 50 88 52 103L43 110 57 107 64 116 71 107 85 110 76 103C78 88 75 76 64 65Z" fill={`url(#${id}-rocket)`} stroke="#123e72" strokeWidth="3.5" strokeLinejoin="round"/>
        <circle cx="64" cy="86" r="6" fill="#e6faff" stroke="#144a81" strokeWidth="2.8"/>
        <path d="M53 104c-4 7-8 13-6 22 7-3 11-7 13-13 0 7 2 12 4 16 4-5 6-10 6-16 3 6 7 10 13 13 2-9-3-15-7-22" fill={`url(#${id}-flame)`}/>
        <path d="M61 107c-1 6 0 12 3 17 3-5 4-11 3-17" fill="#fff7bb" opacity=".94"/>
    </svg>;
}

function TreeRocketFolderNode({folder, root = false, loading, onOpen, onShowFiles, onAdd}: {
    folder: TreeFolder; root?: boolean; loading: boolean;
    onOpen: () => void; onShowFiles: () => void; onAdd: () => void;
}) {
    return <article className={`treeRocketNode${root ? " treeRocketRootNode" : ""}`} data-graph-node>
        <span className="treeRocketFolderTab" aria-hidden="true"/>
        <button type="button" className="treeRocketNodeEnter" onClick={onOpen} disabled={loading} title={`Open ${folder.name}`} aria-label={`Open folder ${folder.name}`}>
            <span className="treeRocketNodeIcon">{folder.kind === "computer" ? <HardDrive size={21}/> : <FolderOpen size={21}/>}</span>
            <strong>{folder.name}</strong>
        </button>
        <div className="treeRocketNodeActions">
            <button type="button" onClick={event => {event.stopPropagation(); onShowFiles();}} disabled={loading}><Files size={13}/><span>Show Files</span></button>
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
            if (!response.ok) throw new Error(data.message || "Unable to read files in this folder.");
            if (!controller.signal.aborted) setFilesView({path: folder.path, name: folder.name, files: data.files ?? [], truncated: Boolean(data.truncatedFiles)});
        } catch (reason) { if (!controller.signal.aborted) setFilesError(reason instanceof Error ? reason.message : "Unable to read files in this folder."); }
        finally { if (!controller.signal.aborted) setFilesLoading(false); }
    }

    async function addFolder(folder: TreeFolder) {
        const existing = folders.find(item => item.storage !== "imaginary" && pathKey(item.path) === pathKey(folder.path));
        if (existing) { setError(`“${existing.name}” is already in Folder Management.`); return; }
        setError(""); setNotice("");
        try {
            const result = await onAddFolder(folder.path, folder.name);
            if (result === false) throw new Error(`Unable to add “${folder.name}”. Check whether it is already present.`);
            setNotice(`“${folder.name}” added to Folder Management. Returning to folder management…`);
            window.setTimeout(onClose, 650);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add this folder."); }
    }

    async function search() {
        const query = searchText.trim();
        if (query.length < 2) { setError("Enter at least two characters to search folders and files."); return; }
        searchController.current?.abort();
        const controller = new AbortController(); searchController.current = controller;
        requestSequence.current += 1; setLoading(false); setSearching(true); setError(""); setNotice(""); setFilesView(null);
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-search`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({query}), signal: controller.signal});
            const data = await response.json().catch(() => ({})) as TreeSearchResults & {message?: string};
            if (!response.ok) throw new Error(data.message || "Folder search failed.");
            if (!controller.signal.aborted) setSearchResults({folders: data.folders ?? [], files: data.files ?? [], scannedDirectories: data.scannedDirectories ?? 0, truncated: Boolean(data.truncated)});
        } catch (reason) {
            if (!controller.signal.aborted) { setSearchResults(null); setError(reason instanceof Error ? reason.message : "Folder search failed."); }
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
        catch { setError("Clipboard access is unavailable. Select and copy the path manually."); }
    }

    const visibleSearchFolders = searchResults?.folders ?? [];
    const visibleSearchFiles = searchResults?.files ?? [];

    return createPortal(<section className="treeRocketOverlay" role="dialog" aria-modal="true" aria-labelledby="treeRocketTitle" ref={overlayRef} tabIndex={-1}>
        <div className="treeRocketWindow">
            <header className="treeRocketHeader">
                <button type="button" className="treeRocketBack" onClick={back} disabled={!pathStack.length && !filesView && !searchResults && !searchText}><ArrowLeft size={16}/>Back</button>
                <div className="treeRocketBrand"><span><strong id="treeRocketTitle">Tree Rocket</strong></span></div>
                <button type="button" className="treeRocketClose" onClick={onClose} title="Return to Folder Management" aria-label="Return to Folder Management"><X size={19}/><span>Return to Folder Management</span></button>
            </header>
            <div className="treeRocketToolbar">
                <button type="button" onClick={goRoots} disabled={!pathStack.length && !searchResults && !filesView}><Home size={14}/>Roots</button>
                <nav className="treeRocketBreadcrumbs" aria-label="Folder path"><button type="button" onClick={goRoots} disabled={!pathStack.length}>Computer</button>{pathStack.map((folder, index) => <span key={`${folder.path}-${index}`}><i>›</i><button type="button" onClick={() => { const next = pathStack.slice(0, index + 1); setSearchResults(null); setSearchText(""); setFilesView(null); void refreshFolder(folder, next); }}>{folder.name}</button></span>)}</nav>
                <form className="treeRocketSearch" onSubmit={event => {event.preventDefault(); void search();}}><Search size={14}/><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search folders or files…" aria-label="Search folders and files"/><button type="submit" disabled={searching} aria-label="Search">{searching ? <LoaderCircle className="treeRocketSpinner" size={14}/> : "Search"}</button></form>
                {currentPath && <button type="button" className="treeRocketCopyPath" onClick={() => void copyPath()} title="Copy the selected folder path"><Copy size={14}/>{copied ? "Copied" : "Copy path"}</button>}
                <div className="treeRocketZoom" aria-label="Graph zoom"><button type="button" title="Zoom out" onClick={() => setZoom(value => Math.max(.55, Math.round((value - .1) * 10) / 10))} disabled={zoom <= .55}><Minus size={14}/></button><span>{Math.round(zoom * 100)}%</span><button type="button" title="Zoom in" onClick={() => setZoom(value => Math.min(1.5, Math.round((value + .1) * 10) / 10))} disabled={zoom >= 1.5}><Plus size={14}/></button></div>
            </div>
            {error && <p className="treeRocketError" role="alert">{error}</p>}{notice && <p className="treeRocketNotice" role="status"><Check size={13}/>{notice}</p>}
            <div className="treeRocketBody">
                <main className="treeRocketGraph" aria-label="Folder tree graph" ref={graphRef} onContextMenu={event => {const target = event.target as HTMLElement; if (target.closest("[data-graph-node],button,input")) return; event.preventDefault(); back();}}>
                    <div className="treeRocketGraphCanvas" style={{zoom}}>
                        {searchResults ? <>
                            <div className="treeRocketGraphHeading"><span>RESULTS</span><strong>{visibleSearchFolders.length} folder{visibleSearchFolders.length === 1 ? "" : "s"}</strong></div>
                            <div className="treeRocketSearchGraph">{visibleSearchFolders.map(folder => <TreeRocketFolderNode key={folder.path} folder={folder} loading={loading} onOpen={() => void openSearchFolder(folder)} onShowFiles={() => void showFiles(folder)} onAdd={() => void addFolder(folder)}/>)}{!visibleSearchFolders.length && <p className="treeRocketEmpty">No matching folders.</p>}</div>
                        </> : <>
                            {!currentFolder && <div className="treeRocketLogoProposal" title="Tree Rocket logo proposal"><TreeRocketMark size={44}/></div>}
                            {currentFolder && <TreeRocketFolderNode folder={currentFolder} root loading={loading} onOpen={() => void fetchFolderContents(currentFolder, false, pathStack)} onShowFiles={() => void showFiles(currentFolder)} onAdd={() => void addFolder(currentFolder)}/>}
                            {currentFolder && currentChildren.length > 0 && <div className="treeRocketChildrenHeading"><span>SUBFOLDERS</span><strong>{currentFolder.name}</strong><i>{currentChildren.length}</i></div>}
                            <div className={`treeRocketChildren ${currentFolder ? "hasParent" : "rootNodes"} ${currentChildren.length === 0 ? "emptyChildren" : currentChildren.length === 1 ? "singleChild" : "multipleChildren"}`}>
                                {currentChildren.map(folder => <TreeRocketFolderNode key={folder.path} folder={folder} loading={loading} onOpen={() => void fetchFolderContents(folder)} onShowFiles={() => void showFiles(folder)} onAdd={() => void addFolder(folder)}/>)}
                                {!currentChildren.length && !loading && <p className="treeRocketEmpty">No subfolders at this level.</p>}
                                {loading && <p className="treeRocketLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={15}/> Reading folders…</p>}
                            </div>
                            {contents?.truncatedFolders && <p className="treeRocketLimit">Showing the first 250 folders. Open a subfolder to continue.</p>}
                        </>}
                    </div>
                </main>
                {(filesView || searchResults) && <aside className="treeRocketFiles" aria-label={filesView ? `Files in ${filesView.name}` : "Search results"}>
                    {filesView ? <><header><div><Files size={20}/><strong>Files in {filesView.name}</strong><small>{filesView.files.length} visible</small></div><button type="button" onClick={() => {fileController.current?.abort(); setFilesView(null);}} aria-label="Close file list"><X size={16}/></button></header><div className="treeRocketFileList">{filesLoading && <p role="status"><LoaderCircle className="treeRocketSpinner" size={16}/> Loading files…</p>}{!filesLoading && filesError && <p role="alert">{filesError}</p>}{!filesLoading && filesView.files.map(file => <div className="treeRocketFile" key={file.path}><FileKindIcon name={file.name} size={22}/><strong title={file.name}>{file.name}</strong><button type="button" onClick={() => void copyPath(file.path)} aria-label={`Copy path of ${file.name}`} title="Copy path"><Copy size={14}/></button></div>)}{!filesLoading && !filesView.files.length && !filesError && <p>This folder contains no visible files.</p>}{filesView.truncated && <small>Showing the first 200 files.</small>}</div></> : <><header><div><Search size={20}/><strong>Search results</strong><small>{searchResults?.scannedDirectories ?? 0} folders scanned</small></div><button type="button" onClick={() => setSearchResults(null)} aria-label="Close search results"><X size={16}/></button></header><div className="treeRocketFileList"><h3>Files · {visibleSearchFiles.length}</h3>{visibleSearchFiles.map(file => <button type="button" className="treeRocketFile searchHit" key={file.path} onClick={() => void openSearchFile(file)} title={file.path}><FileKindIcon name={file.name} size={22}/><strong>{file.name}</strong><small>{file.parentName}</small></button>)}{!visibleSearchFiles.length && <p>No matching files.</p>}{searchResults?.truncated && <small>Search was limited to keep browsing responsive. Refine the filename to find more results.</small>}</div></>}
                </aside>}
            </div>
            <footer><span>Click a folder to open · Right-click/Esc: back</span><span>View and zoom are saved for each folder</span></footer>
        </div>
    </section>, document.body);
}
