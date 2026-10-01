import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {AppWindow, ArrowLeft, Check, Copy, Files, FolderOpen, FolderPlus, FolderTree, HardDrive, LoaderCircle, RefreshCw, Search, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import treeRocketLogo from "../assets/tree-rocket-logo.png";
import FileKindIcon from "./FileKindIcon";

interface TreeFolder { name: string; path: string; kind?: "computer" | "user" | "workspace" | "linked"; directFileCount?: number; directFolderCount?: number; }
interface InstalledApplication {name: string; appId: string; iconDataUrl?: string;}
interface TreeFile { name: string; path: string; }
interface TreeContents { path: string; folders: TreeFolder[]; files: TreeFile[]; directFileCount?: number; truncatedFolders?: boolean; truncatedFiles?: boolean; folderCountsLimited?: boolean; }
interface LinkedFolder { id: string; name: string; path: string; storage?: "physical" | "imaginary"; }
interface SearchFolder extends TreeFolder { rootPath: string; rootName: string; depth: number; }
interface SearchFile extends TreeFile { parentPath: string; parentName: string; rootPath: string; rootName: string; }
interface TreeSearchResults { folders: SearchFolder[]; files: SearchFile[]; scannedDirectories: number; truncated: boolean; }
interface FileView { path: string; name: string; files: TreeFile[]; truncated: boolean; }
interface TreeCamera { scrollProgress: number; }
interface Props { folders: LinkedFolder[]; onAddFolder: (path: string, name: string) => boolean | void | Promise<boolean | void>; onClose: () => void; }

let installedApplicationsCache: InstalledApplication[] | null = null;

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
    return <img src={treeRocketLogo} width={size} height={size} className="treeRocketMark" alt="" aria-hidden="true"/>;
}

function TreeRocketFolderNode({folder, root = false, loading, added = false, managed = false, onOpen, onShowFiles, onAdd}: {
    folder: TreeFolder; root?: boolean; loading: boolean; added?: boolean; managed?: boolean;
    onOpen: () => void; onShowFiles: () => void; onAdd: () => void;
}) {
    return <article className={`treeRocketNode${root ? " treeRocketRootNode" : ""}`} data-graph-node>
        <span className="treeRocketFolderTab" aria-hidden="true"/>
        <button type="button" className="treeRocketNodeEnter" onClick={onOpen} disabled={loading} title={`Open ${folder.name}`} aria-label={`Open folder ${folder.name}`}>
            <span className="treeRocketNodeIcon">{folder.kind === "computer" ? <HardDrive size={21}/> : <FolderOpen size={21}/>}</span>
            <span className="treeRocketNodeTitle"><strong>{folder.name}</strong><small className="treeRocketNodeCount">{folder.directFileCount ?? "—"} files · {folder.directFolderCount ?? "—"} folders</small></span>
        </button>
        <div className="treeRocketNodeActions">
            <button type="button" className="treeRocketShowFiles" onClick={event => {event.stopPropagation(); onShowFiles();}} disabled={loading}><Files size={13}/><span>Show Files</span></button>
            <button type="button" className={managed ? "treeRocketAddedButton" : ""} onClick={event => {event.stopPropagation(); onAdd();}} disabled={managed} title={managed ? (added ? "Added to Folder Management" : "Already in Folder Management") : "Add to Folder Management"} aria-label={managed ? (added ? "Added to Folder Management" : "Already in Folder Management") : "Add to Folder Management"}>{managed ? <><Check size={14}/><span className="treeRocketVisuallyHidden">{added ? "Added to Folder Management" : "Already in Folder Management"}</span></> : <><FolderTree size={13}/><span>Add to Folder Management</span></>}</button>
        </div>
    </article>;
}

function InstalledApplicationIcon({application}: {application: InstalledApplication}) {
    const [failedIconDataUrl, setFailedIconDataUrl] = useState("");
    return <span className="treeRocketAppIcon">{application.iconDataUrl && failedIconDataUrl !== application.iconDataUrl ? <img src={application.iconDataUrl} alt="" aria-hidden="true" onError={() => setFailedIconDataUrl(application.iconDataUrl ?? "")}/> : <AppWindow size={23} aria-hidden="true"/>}</span>;
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
    const [copied, setCopied] = useState(false);
    const [filesLoading, setFilesLoading] = useState(false);
    const [filesError, setFilesError] = useState("");
    const [section, setSection] = useState<"folders" | "apps">("folders");
    const [applications, setApplications] = useState<InstalledApplication[]>(() => installedApplicationsCache ?? []);
    const [appsLoading, setAppsLoading] = useState(false);
    const [appsError, setAppsError] = useState("");
    const [openingAppId, setOpeningAppId] = useState("");
    const [appsLoaded, setAppsLoaded] = useState(() => installedApplicationsCache !== null);
    const [appsRetry, setAppsRetry] = useState(0);
    const [showAddFolders, setShowAddFolders] = useState(false);
    const [selectedFolderPaths, setSelectedFolderPaths] = useState<string[]>([]);
    const [addedFolderPaths, setAddedFolderPaths] = useState<string[]>([]);
    const [addingFolders, setAddingFolders] = useState(false);
    const requestSequence = useRef(0);
    const fileController = useRef<AbortController | null>(null);
    const overlayRef = useRef<HTMLElement>(null);
    const graphRef = useRef<HTMLElement>(null);
    const branchScrollRef = useRef<HTMLDivElement>(null);
    const searchController = useRef<AbortController | null>(null);
    const backHandler = useRef<() => void>(() => {});
    const cameraByPath = useRef(new Map<string, TreeCamera>());
    const appsController = useRef<AbortController | null>(null);

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
        return () => { controller.abort(); searchController.current?.abort(); fileController.current?.abort(); appsController.current?.abort(); };
    }, []);

    useEffect(() => {
        if (section !== "apps" || appsLoaded) return;
        const controller = new AbortController(); appsController.current = controller;
        void fetch(`${API_BASE_URL}/applications/catalog`, {credentials:"include", signal:controller.signal})
            .then(async response => {
                const data = await response.json().catch(() => ({})) as {applications?:InstalledApplication[];message?:string};
                if (!response.ok) throw new Error(data.message || "Unable to read installed applications.");
                if (!controller.signal.aborted) {
                    const nextApplications = Array.isArray(data.applications) ? data.applications : [];
                    installedApplicationsCache = nextApplications;
                    setApplications(nextApplications);
                    setAppsLoaded(true);
                }
            })
            .catch(reason => { if (!controller.signal.aborted) { setAppsError(reason instanceof Error ? reason.message : "Unable to read installed applications."); setAppsLoaded(true); } })
            .finally(() => { if (!controller.signal.aborted) setAppsLoading(false); });
        return () => controller.abort();
    }, [section, appsLoaded, appsRetry]);

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

    useEffect(() => {
        if (!filesView) return;
        const dismissOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element) || target.closest(".treeRocketFiles,.treeRocketShowFiles")) return;
            fileController.current?.abort();
            setFilesView(null); setFilesLoading(false); setFilesError("");
        };
        document.addEventListener("pointerdown", dismissOutside, true);
        return () => document.removeEventListener("pointerdown", dismissOutside, true);
    }, [filesView]);

    useEffect(() => {
        if (!showAddFolders) return;
        const dismissOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element) || target.closest(".treeRocketAddFoldersWrap")) return;
            setShowAddFolders(false);
        };
        document.addEventListener("pointerdown", dismissOutside, true);
        return () => document.removeEventListener("pointerdown", dismissOutside, true);
    }, [showAddFolders]);

    function rememberCamera(path = currentPath) {
        const graph = branchScrollRef.current ?? graphRef.current;
        const maxScroll = graph ? Math.max(0, graph.scrollHeight - graph.clientHeight) : 0;
        cameraByPath.current.set(pathKey(path) || "__roots__", {scrollProgress: maxScroll ? (graph?.scrollTop ?? 0) / maxScroll : 0});
    }
    function restoreCamera(path: string) {
        const camera = cameraByPath.current.get(pathKey(path) || "__roots__") ?? {scrollProgress: 0};
        requestAnimationFrame(() => {
            const graph = branchScrollRef.current ?? graphRef.current;
            if (graph) graph.scrollTop = (graph.scrollHeight - graph.clientHeight) * camera.scrollProgress;
        });
    }

    useEffect(() => {
        const graph = branchScrollRef.current ?? graphRef.current;
        if (!graph) return;
        const camera = cameraByPath.current.get(pathKey(currentPath) || "__roots__");
        const frame = requestAnimationFrame(() => {
            graph.scrollLeft = 0;
            graph.scrollTop = (graph.scrollHeight - graph.clientHeight) * (camera?.scrollProgress ?? 0);
        });
        return () => cancelAnimationFrame(frame);
    }, [currentPath, roots.length, contents?.folders.length, searchResults]);

    async function fetchFolderContents(folder: TreeFolder, includeFiles = false, trail?: TreeFolder[]) {
        setShowAddFolders(false); setSelectedFolderPaths([]);
        rememberCamera();
        const requestId = ++requestSequence.current;
        setLoading(true); setError(""); setNotice("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {
                method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({path: folder.path, includeFiles, includeFolderFileCounts: true})
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
        setShowAddFolders(false); setSelectedFolderPaths([]);
        rememberCamera();
        const requestId = ++requestSequence.current;
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: folder.path, includeFiles, includeFolderFileCounts: true})});
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
        setShowAddFolders(false); setSelectedFolderPaths([]);
        rememberCamera(); searchController.current?.abort(); fileController.current?.abort(); requestSequence.current += 1; setSearching(false);
        setLoading(false); setError(""); setNotice(""); setSearchText(""); setSearchResults(null);
        cameraByPath.current.set("__roots__", {scrollProgress: 0});
        if (graphRef.current) graphRef.current.scrollTop = 0;
        setPathStack([]); setContents(null); setFilesView(null); setFilesLoading(false); setFilesError("");
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
        if (addedFolderPaths.some(path => pathKey(path) === pathKey(folder.path))) return true;
        if (existing) { setError(`“${existing.name}” is already in Folder Management.`); return; }
        setError(""); setNotice("");
        try {
            const result = await onAddFolder(folder.path, folder.name);
            if (result === false) throw new Error(`Unable to add “${folder.name}”. Check whether it is already present.`);
            setAddedFolderPaths(current => current.some(path => pathKey(path) === pathKey(folder.path)) ? current : [...current, folder.path]);
            setNotice(`“${folder.name}” added to Folder Management.`);
            return true;
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add this folder."); }
        return false;
    }

    async function addSelectedFolders() {
        if (addingFolders) return;
        const selected = currentChildren.filter(folder => selectedFolderPaths.some(path => pathKey(path) === pathKey(folder.path)));
        if (!selected.length) return;
        setAddingFolders(true); setError(""); setNotice("");
        let added = 0;
        for (const folder of selected) if (await addFolder(folder)) added += 1;
        setAddingFolders(false); setShowAddFolders(false); setSelectedFolderPaths([]);
        if (added) setNotice(`${added} folder${added === 1 ? "" : "s"} added to Folder Management.`);
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

    async function openApplication(application: InstalledApplication) {
        if (openingAppId) return;
        setOpeningAppId(application.appId); setAppsError("");
        try {
            const response = await fetch(`${API_BASE_URL}/applications/open-installed`, {method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({appId:application.appId})});
            const data = await response.json().catch(() => ({})) as {message?:string};
            if (!response.ok) throw new Error(data.message || `Unable to open ${application.name}.`);
        } catch (reason) { setAppsError(reason instanceof Error ? reason.message : `Unable to open ${application.name}.`); }
        finally { setOpeningAppId(""); }
    }

    const visibleSearchFolders = searchResults?.folders ?? [];
    const visibleSearchFiles = searchResults?.files ?? [];

    const folderIsAdded = (folder: TreeFolder) => addedFolderPaths.some(path => pathKey(path) === pathKey(folder.path));
    const folderIsManaged = (folder: TreeFolder) => folderIsAdded(folder) || folders.some(item => item.storage !== "imaginary" && pathKey(item.path) === pathKey(folder.path));
    const currentFolderDisplay = currentFolder && contents?.path === currentFolder.path ? {...currentFolder, directFileCount: contents.directFileCount} : currentFolder;

    return createPortal(<section className="treeRocketOverlay" role="dialog" aria-modal="true" aria-labelledby="treeRocketTitle" ref={overlayRef} tabIndex={-1}>
        <div className="treeRocketWindow">
            <header className="treeRocketHeader">
                <button type="button" className="treeRocketBack" onClick={onClose}><ArrowLeft size={16}/>Back to FolderRocket</button>
                <div className="treeRocketBrand">
                    <div className="treeRocketTabs" role="tablist" aria-label="Tree Rocket view">
                        <button type="button" role="tab" aria-selected={section === "folders"} className={section === "folders" ? "active" : ""} onClick={() => {setSection("folders"); setShowAddFolders(false);}}>Folder</button>
                        <button type="button" role="tab" aria-selected={section === "apps"} className={section === "apps" ? "active" : ""} onClick={() => {if (!appsLoaded) {setAppsLoading(true);setAppsError("");} setSection("apps"); setShowAddFolders(false); setFilesView(null);}}>Apps</button>
                        {section === "apps" && <button type="button" className="treeRocketAppsRefresh" onClick={() => {setAppsLoading(true);setAppsError("");setAppsLoaded(false);setAppsRetry(value => value + 1);}} disabled={appsLoading} title="Refresh installed applications" aria-label="Refresh installed applications"><RefreshCw className={appsLoading ? "treeRocketSpinner" : ""} size={14}/></button>}
                    </div>
                    <div className="treeRocketBrandTitle"><TreeRocketMark size={82}/><strong id="treeRocketTitle"><span>Tree</span><span>Rocket</span></strong></div>
                </div>
                <div className="treeRocketHeaderTools">
                    {section === "folders" && <form className="treeRocketSearch" onSubmit={event => {event.preventDefault(); void search();}}><Search size={14}/><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search folders or files…" aria-label="Search folders and files"/><button type="submit" disabled={searching} aria-label="Search">{searching ? <LoaderCircle className="treeRocketSpinner" size={14}/> : "Search"}</button></form>}
                    <div className="treeRocketAddFoldersWrap"><button type="button" className="treeRocketAddFoldersButton" onClick={() => {setSelectedFolderPaths([]); setShowAddFolders(value => !value);}} disabled={section !== "folders" || loading || !currentChildren.length} aria-expanded={showAddFolders}><FolderPlus size={15}/>Add folders</button>
                    {showAddFolders && <div className="treeRocketAddFoldersMenu" role="dialog" aria-label="Add current folders to Folder Management">
                        <strong>Add folders from this location</strong><div>{currentChildren.map(folder => <label key={folder.path}><input type="checkbox" disabled={folderIsManaged(folder)} checked={selectedFolderPaths.some(path => pathKey(path) === pathKey(folder.path))} onChange={event => setSelectedFolderPaths(current => event.target.checked ? [...current, folder.path] : current.filter(path => pathKey(path) !== pathKey(folder.path)))}/><span>{folder.name}</span><small>{folderIsManaged(folder) ? "Already added" : "Existing folder"}</small></label>)}</div>
                        {contents?.folderCountsLimited && <small>File counts are limited to the first folders in this location to keep browsing responsive.</small>}
                        <footer><button type="button" onClick={() => setShowAddFolders(false)}>Cancel</button><button type="button" onClick={() => void addSelectedFolders()} disabled={addingFolders || !selectedFolderPaths.length}>{addingFolders ? "Adding…" : `Add selected (${selectedFolderPaths.length})`}</button></footer>
                    </div>}
                    </div>
                </div>
            </header>
            {section === "folders" && <nav className="treeRocketToolbar" aria-label="Folder navigation"><div className="treeRocketBreadcrumbs"><button type="button" onClick={goRoots} disabled={!pathStack.length}>Computer</button>{pathStack.map((folder, index) => <span key={`${folder.path}-${index}`}><i>›</i><button type="button" onClick={() => { const next = pathStack.slice(0, index + 1); setSearchResults(null); setSearchText(""); setFilesView(null); void refreshFolder(folder, next); }}>{folder.name}</button></span>)}{currentPath && <button type="button" className="treeRocketCopyPath" onClick={() => void copyPath()} title="Copy the selected folder path"><Copy size={13}/>{copied ? "Copied" : "Copy path"}</button>}</div></nav>}
            {error && <p className="treeRocketError" role="alert">{error}</p>}{notice && <p className="treeRocketNotice" role="status"><Check size={13}/>{notice}</p>}
            <div className={`treeRocketBody${section === "folders" && (filesView || searchResults) ? " withSidebar" : ""}`}>
                {section === "apps" ? <main className="treeRocketAppsPanel" role="tabpanel" aria-label="Tree Rocket Apps">
                    <p className="treeRocketAppsMeta" aria-live="polite">{appsLoading ? applications.length ? "Refreshing applications…" : "Loading applications…" : `${applications.length} applications · Windows Start menu`}</p>
                    <div className="treeRocketAppsScroll">
                        {appsLoading && !applications.length && <p className="treeRocketAppsLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={16}/>Loading applications…</p>}
                        {appsError && <p className="treeRocketAppsError" role="alert">{appsError} {applications.length ? "The last available catalog is still shown; refresh to retry." : "Use Refresh to try again."}</p>}
                        {applications.length > 0 && <div className="treeRocketAppGrid">{applications.map(application => <button type="button" className="treeRocketAppCard" key={application.appId} onClick={() => void openApplication(application)} disabled={Boolean(openingAppId)} title={`Open ${application.name}`}><InstalledApplicationIcon application={application}/><strong>{application.name}</strong>{openingAppId === application.appId && <LoaderCircle className="treeRocketSpinner" size={14}/>}</button>)}</div>}
                        {!appsLoading && !appsError && !applications.length && <p className="treeRocketAppsEmpty">No applications were found in the Windows Start menu.</p>}
                    </div>
                </main> : <main className={`treeRocketGraph${currentFolder ? " hasOpenBranch" : ""}`} aria-label="Folder tree graph" ref={graphRef} onContextMenu={event => {event.preventDefault(); back();}}>
                    <div className="treeRocketGraphCanvas">
                        {searchResults ? <>
                            <div className="treeRocketGraphHeading"><span>RESULTS</span><strong>{visibleSearchFolders.length} folder{visibleSearchFolders.length === 1 ? "" : "s"}</strong></div>
                            <div className="treeRocketSearchGraph">{visibleSearchFolders.map(folder => <TreeRocketFolderNode key={folder.path} folder={folder} loading={loading} added={folderIsAdded(folder)} managed={folderIsManaged(folder)} onOpen={() => void openSearchFolder(folder)} onShowFiles={() => void showFiles(folder)} onAdd={() => void addFolder(folder)}/>)}{!visibleSearchFolders.length && <p className="treeRocketEmpty">No matching folders.</p>}</div>
                        </> : currentFolderDisplay ? <div className="treeRocketGraphStage">
                            <TreeRocketFolderNode folder={{...currentFolderDisplay, directFolderCount:currentChildren.length}} root loading={loading} added={folderIsAdded(currentFolderDisplay)} managed={folderIsManaged(currentFolderDisplay)} onOpen={() => void fetchFolderContents(currentFolderDisplay, false, pathStack)} onShowFiles={() => void showFiles(currentFolderDisplay)} onAdd={() => void addFolder(currentFolderDisplay)}/>
                            <section className="treeRocketBranch" aria-label={`Subfolders of ${currentFolderDisplay.name}`}>
                                <div className="treeRocketChildrenHeading"><span>SUBFOLDERS</span><strong>{currentFolderDisplay.name}</strong><i>{currentChildren.length}</i></div>
                                <div ref={branchScrollRef} className={`treeRocketChildren hasParent${currentChildren.length === 0 ? " emptyChildren" : ""}`}>
                                    {currentChildren.map(folder => <TreeRocketFolderNode key={folder.path} folder={folder} loading={loading} added={folderIsAdded(folder)} managed={folderIsManaged(folder)} onOpen={() => void fetchFolderContents(folder)} onShowFiles={() => void showFiles(folder)} onAdd={() => void addFolder(folder)}/>)}
                                    {!currentChildren.length && !loading && <p className="treeRocketEmpty">No subfolders at this level.</p>}
                                    {loading && <p className="treeRocketLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={15}/> Reading folders…</p>}
                                </div>
                                {contents?.folderCountsLimited && <p className="treeRocketLimit">Direct file counts are limited to keep browsing responsive.</p>}
                                {contents?.truncatedFolders && <p className="treeRocketLimit">Showing the first 250 folders. Open a subfolder to continue.</p>}
                            </section>
                        </div> : <>
                            <div className="treeRocketGraphHeading"><span>FOLDERS</span><strong>{currentChildren.length} folders</strong></div>
                            <div className={`treeRocketChildren rootNodes${currentChildren.length === 0 ? " emptyChildren" : ""}`}>
                                {currentChildren.map(folder => <TreeRocketFolderNode key={folder.path} folder={folder} loading={loading} added={folderIsAdded(folder)} managed={folderIsManaged(folder)} onOpen={() => void fetchFolderContents(folder)} onShowFiles={() => void showFiles(folder)} onAdd={() => void addFolder(folder)}/>)}
                                {!currentChildren.length && !loading && <p className="treeRocketEmpty">No folders are available.</p>}
                                {loading && <p className="treeRocketLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={15}/> Reading folders…</p>}
                            </div>
                        </>}
                    </div>
                </main>}
                {section === "folders" && (filesView || searchResults) && <aside className="treeRocketFiles" aria-label={filesView ? `Files in ${filesView.name}` : "Search results"}>
                    {filesView ? <><header><div><Files size={20}/><strong>Files in {filesView.name}</strong><small>{filesView.files.length} visible</small></div><button type="button" onClick={() => {fileController.current?.abort(); setFilesView(null);}} aria-label="Close file list"><X size={16}/></button></header><div className="treeRocketFileList">{filesLoading && <p role="status"><LoaderCircle className="treeRocketSpinner" size={16}/> Loading files…</p>}{!filesLoading && filesError && <p role="alert">{filesError}</p>}{!filesLoading && filesView.files.map(file => <div className="treeRocketFile" key={file.path}><FileKindIcon name={file.name} size={22}/><strong title={file.name}>{file.name}</strong><button type="button" onClick={() => void copyPath(file.path)} aria-label={`Copy path of ${file.name}`} title="Copy path"><Copy size={14}/></button></div>)}{!filesLoading && !filesView.files.length && !filesError && <p>This folder contains no visible files.</p>}{filesView.truncated && <small>Showing the first 200 files.</small>}</div></> : <><header><div><Search size={20}/><strong>Search results</strong><small>{searchResults?.scannedDirectories ?? 0} folders scanned</small></div><button type="button" onClick={() => setSearchResults(null)} aria-label="Close search results"><X size={16}/></button></header><div className="treeRocketFileList"><h3>Files · {visibleSearchFiles.length}</h3>{visibleSearchFiles.map(file => <button type="button" className="treeRocketFile searchHit" key={file.path} onClick={() => void openSearchFile(file)} title={file.path}><FileKindIcon name={file.name} size={22}/><strong>{file.name}</strong><small>{file.parentName}</small></button>)}{!visibleSearchFiles.length && <p>No matching files.</p>}{searchResults?.truncated && <small>Search was limited to keep browsing responsive. Refine the filename to find more results.</small>}</div></>}
                </aside>}
            </div>
        </div>
    </section>, document.body);
}
