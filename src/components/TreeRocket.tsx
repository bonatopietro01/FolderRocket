import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {AppWindow, ArrowLeft, Check, Copy, Files, FolderOpen, FolderPlus, HardDrive, LoaderCircle, Plus, RefreshCw, Search, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import treeRocketLogo from "../assets/tree-rocket-logo.png";
import type {WorldTreeRootMode} from "../worlds";
import FileKindIcon from "./FileKindIcon";

interface TreeFolder { name: string; path: string; kind?: "computer" | "user" | "workspace" | "linked" | "desktop"; directFileCount?: number; directFolderCount?: number; }
interface InstalledApplication {name: string; appId: string; iconDataUrl?: string;}
interface TreeFile { name: string; path: string; }
interface TreeContents { path: string; folders: TreeFolder[]; files: TreeFile[]; directFileCount?: number; directFolderCount?:number; folderOffset?:number; folderTotal?:number; nextFolderOffset?:number|null; fileOffset?:number; fileTotal?:number; nextFileOffset?:number|null; truncatedFolders?: boolean; truncatedFiles?: boolean; folderCountsLimited?: boolean; }
interface LinkedFolder { id: string; name: string; path: string; storage?: "physical" | "imaginary"; }
interface SearchFolder extends TreeFolder { rootPath: string; rootName: string; depth: number; }
interface SearchFile extends TreeFile { parentPath: string; parentName: string; rootPath: string; rootName: string; }
interface TreeSearchResults { folders: SearchFolder[]; files: SearchFile[]; scannedDirectories: number; truncated: boolean; }
interface FileView { path: string; name: string; files: TreeFile[]; fileTotal?:number; nextFileOffset?:number|null; truncated: boolean; }
interface TreeCamera { scrollProgress: number; }
interface Props { folders: LinkedFolder[]; worldId:string; treeRootMode:WorldTreeRootMode; onTreeRootModeChange:(mode:WorldTreeRootMode)=>Promise<void>; onAddFolder: (path: string, name: string) => boolean | void | Promise<boolean | void>; onClose: () => void; }

let installedApplicationsCache: InstalledApplication[] | null = null;

function canonicalTreePath(value: string) {
    const windowsPath = /^[a-z]:[\\/]/i.test(value) || value.includes("\\");
    let normalized = windowsPath ? value.replaceAll("/", "\\").replace(/[\\]+$/, "") : value.replaceAll("\\", "/").replace(/\/+$/, "");
    if (windowsPath && /^[a-z]:$/i.test(normalized)) normalized += "\\";
    if (!windowsPath && !normalized && value.startsWith("/")) normalized = "/";
    return windowsPath ? normalized.toLocaleLowerCase() : normalized;
}
function pathKey(value: string) { return canonicalTreePath(value); }
function graphNodeId(kind:"folder"|"file", value:string) { return `${kind}:${canonicalTreePath(value)}`; }
function desktopRootLabel(folder: TreeFolder) {
    if(folder.kind!=="desktop")return folder.name;
    if(folder.name.toLocaleLowerCase()==="desktop")return "My Desktop";
    if(folder.name.toLocaleLowerCase()==="public desktop")return "Public Desktop · shared";
    return `${folder.name} · desktop root`;
}
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

function TreeRocketFolderNode({folder, root = false, displayName = folder.name, loading, added = false, managed = false, showingFiles = false, onOpen, onShowFiles, onAdd}: {
    folder: TreeFolder; root?: boolean; displayName?: string; loading: boolean; added?: boolean; managed?: boolean;
    showingFiles?: boolean;
    onOpen: () => void; onShowFiles: (trigger: HTMLButtonElement) => void; onAdd: () => void;
}) {
    const folderCountLabel = folder.directFolderCount === 1 ? "1 folder" : `${folder.directFolderCount ?? "—"} folders`;
    return <article className={`treeRocketNode${root ? " treeRocketRootNode" : ""}`} data-graph-node data-tree-node-id={graphNodeId("folder", folder.path)} role="group" tabIndex={loading ? -1 : 0} aria-label={`Folder ${displayName}. Press Enter or Space to open.`} onClick={event => {if (event.target instanceof Element && event.target.closest("button")) return; if (!loading) onOpen();}} onKeyDown={event => {if (event.target !== event.currentTarget || loading) return; if (event.key === "Enter" || event.key === " ") {event.preventDefault(); onOpen();}}}>
        <span className="treeRocketFolderTab" aria-hidden="true"/>
        <button type="button" className="treeRocketNodeEnter" onClick={onOpen} disabled={loading} title={`Open ${displayName}`} aria-label={`Open folder ${displayName}`}>
            <span className="treeRocketNodeIcon">{folder.kind === "computer" ? <HardDrive size={21}/> : <FolderOpen size={21}/>}</span>
            <span className="treeRocketNodeTitle"><strong>{displayName}</strong></span>
        </button>
        <div className="treeRocketNodeMeta">
            <span className="treeRocketFileCount"><Files size={12}/>{folder.directFileCount ?? "—"} files</span>
            <span className="treeRocketFolderCount">{folderCountLabel}</span>
        </div>
        <div className="treeRocketNodeActions">
            {folder.directFileCount !== 0 && <button type="button" className="treeRocketSeeFiles" onClick={event => {event.stopPropagation(); onShowFiles(event.currentTarget);}} aria-expanded={showingFiles} aria-haspopup="dialog" aria-controls="treeRocketFilePreview" disabled={loading}>{showingFiles ? "Hide files" : "See files"}</button>}
            <button type="button" className={managed ? "treeRocketAddedButton" : "treeRocketAddFolderButton"} onClick={event => {event.stopPropagation(); onAdd();}} disabled={managed} title={managed ? (added ? "Added to Folder Management" : "Already in Folder Management") : "Add to Folder Management"} aria-label={managed ? (added ? "Added to Folder Management" : "Already in Folder Management") : "Add to Folder Management"}>{managed ? <><Check size={14}/><span className="treeRocketVisuallyHidden">{added ? "Added to Folder Management" : "Already in Folder Management"}</span></> : <Plus size={15}/>}</button>
        </div>
    </article>;
}

function InstalledApplicationIcon({application}: {application: InstalledApplication}) {
    const [failedIconDataUrl, setFailedIconDataUrl] = useState("");
    return <span className="treeRocketAppIcon">{application.iconDataUrl && failedIconDataUrl !== application.iconDataUrl ? <img src={application.iconDataUrl} alt="" aria-hidden="true" onError={() => setFailedIconDataUrl(application.iconDataUrl ?? "")}/> : <AppWindow size={42} aria-hidden="true"/>}</span>;
}

export default function TreeRocket({folders, worldId, treeRootMode, onTreeRootModeChange, onAddFolder, onClose}: Props) {
    const linkedRoots = useMemo(() => folders.filter(folder => folder.storage !== "imaginary" && folder.path.trim()).map(folder => ({name: folder.name || "FolderRocket folder", path: folder.path, kind: "linked" as const})), [folders]);
    const [hostRoots, setHostRoots] = useState<TreeFolder[]>([]);
    const [rootsLoadedScope, setRootsLoadedScope] = useState("");
    const [pathStack, setPathStack] = useState<TreeFolder[]>([]);
    const [contents, setContents] = useState<TreeContents | null>(null);
    const [filesView, setFilesView] = useState<FileView | null>(null);
    const filesViewRef = useRef<FileView | null>(null);
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
    const fileRequestSequence = useRef(0);
    const childrenController = useRef<AbortController | null>(null);
    const fileController = useRef<AbortController | null>(null);
    const overlayRef = useRef<HTMLElement>(null);
    const filePreviewRef = useRef<HTMLElement>(null);
    const filePreviewCloseRef = useRef<HTMLButtonElement>(null);
    const filePreviewTriggerRef = useRef<HTMLButtonElement>(null);
    const foldersTabRef = useRef<HTMLButtonElement>(null);
    const [filePreviewPosition, setFilePreviewPosition] = useState({top:12,left:12,maxHeight:320});
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
        void fetch(`${API_BASE_URL}/filesystem/tree-roots?worldId=${encodeURIComponent(worldId)}&mode=${treeRootMode}`, {credentials: "include", signal: controller.signal})
            .then(async response => {
                const data = await response.json().catch(() => ({})) as {roots?: TreeFolder[]; message?: string;partial?:boolean;unavailableRoots?:string[]};
                if (!response.ok) throw new Error(data.message || "Unable to load computer folders.");
                if (!controller.signal.aborted) {setHostRoots(Array.isArray(data.roots) ? data.roots : []);setRootsLoadedScope(`${worldId}:${treeRootMode}`);if(data.partial)setNotice(`Desktop view is partial. These roots are unavailable: ${(data.unavailableRoots||[]).join(", ")||"permission denied"}.`);}
            })
            .catch(reason => { if (!controller.signal.aborted) {setRootsLoadedScope(`${worldId}:${treeRootMode}`);setError(reason instanceof Error ? reason.message : "Unable to load folder roots.");} });
        return () => { controller.abort(); requestSequence.current += 1; fileRequestSequence.current += 1; childrenController.current?.abort(); searchController.current?.abort(); fileController.current?.abort(); appsController.current?.abort(); };
    }, [treeRootMode,worldId]);

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
        // Desktop is intentionally limited to the actual personal/public Desktop roots returned by the host.
        // Folder Management links stay available in Computer mode only.
        const combined = treeRootMode === "desktop" ? hostRoots.filter(folder => folder.kind === "desktop") : [...linkedRoots, ...hostRoots];
        const seen = new Set<string>();
        return combined.filter(folder => {
            const key = pathKey(folder.path);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [hostRoots, linkedRoots, treeRootMode]);
    const rootsLoaded = rootsLoadedScope === `${worldId}:${treeRootMode}`;
    const currentFolder = pathStack.at(-1) ?? null;
    const currentChildren = currentFolder ? contents?.folders ?? [] : roots;
    const currentPath = currentFolder?.path ?? "";

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
    const cancelFileRequest = useCallback(() => {
        fileRequestSequence.current += 1;
        fileController.current?.abort();
        fileController.current = null;
        setFilesLoading(false);
    }, []);
    const closeFilesPanel = useCallback((restoreFocus = false) => {
        const trigger = filePreviewTriggerRef.current;
        cancelFileRequest();
        setFilesView(null);
        setFilesError("");
        filePreviewTriggerRef.current = null;
        if (restoreFocus) requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
    }, [cancelFileRequest]);
    const closeFilesPanelForAnchorLoss = useCallback(() => {
        const focusWasInPreview = Boolean(filePreviewRef.current?.contains(document.activeElement));
        closeFilesPanel();
        if (focusWasInPreview) requestAnimationFrame(() => {
            if (document.activeElement === document.body || !(document.activeElement instanceof HTMLElement) || !document.activeElement.isConnected) foldersTabRef.current?.focus();
        });
    }, [closeFilesPanel]);
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
        cancelFileRequest();
        setFilesView(null); setFilesError("");
        setShowAddFolders(false); setSelectedFolderPaths([]);
        rememberCamera();
        const requestId = ++requestSequence.current;
        childrenController.current?.abort();
        const controller = new AbortController(); childrenController.current = controller;
        setLoading(true); setError(""); setNotice("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {
                method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({path: folder.path, includeFiles:true, includeFolderFileCounts: true,mode:treeRootMode,worldId}), signal:controller.signal
            });
            const data = await response.json().catch(() => ({})) as TreeContents & {message?: string};
            if (!response.ok) throw new Error(data.message || "This folder cannot be opened.");
            if (requestId !== requestSequence.current) return;
            if (trail) setPathStack(trail);
            else setPathStack(current => [...current.filter(item => pathKey(item.path) !== pathKey(folder.path)), folder]);
            setContents(data);
            setFilesView(includeFiles ? {path: folder.path, name: folder.name, files: data.files ?? [],fileTotal:data.fileTotal,nextFileOffset:data.nextFileOffset,truncated: Boolean(data.truncatedFiles)} : null);
            setSearchResults(null); setSearchText(""); restoreCamera(folder.path);
        } catch (reason) {
            if (!controller.signal.aborted && requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "This folder cannot be opened.");
        } finally { if (requestId === requestSequence.current) setLoading(false); }
    }

    async function refreshFolder(folder: TreeFolder, trail = pathStack, includeFiles = false): Promise<boolean> {
        cancelFileRequest();
        setFilesView(null); setFilesError("");
        setShowAddFolders(false); setSelectedFolderPaths([]);
        rememberCamera();
        const requestId = ++requestSequence.current;
        childrenController.current?.abort();
        const controller = new AbortController(); childrenController.current = controller;
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: folder.path, includeFiles:true, includeFolderFileCounts: true,mode:treeRootMode,worldId}), signal:controller.signal});
            const data = await response.json().catch(() => ({})) as TreeContents & {message?: string};
            if (requestId !== requestSequence.current) return false;
            if (!response.ok) throw new Error(data.message || "This folder cannot be opened.");
            setPathStack(trail); setContents(data);
            setFilesView(includeFiles ? {path: folder.path, name: folder.name, files: data.files ?? [],fileTotal:data.fileTotal,nextFileOffset:data.nextFileOffset,truncated: Boolean(data.truncatedFiles)} : null);
            setSearchResults(null); setSearchText(""); restoreCamera(folder.path);
            return true;
        } catch (reason) { if (!controller.signal.aborted && requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : "This folder cannot be opened."); return false; }
        finally { if (requestId === requestSequence.current) setLoading(false); }
    }

    async function loadMoreChildren() {
        const current=pathStack.at(-1);
        if(!current||!contents?.truncatedFolders||contents.path!==current.path||contents.nextFolderOffset===null||contents.nextFolderOffset===undefined||loading)return;
        const requestId=++requestSequence.current;setLoading(true);setError("");
        try {
            const response=await fetch(`${API_BASE_URL}/filesystem/tree-children`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:current.path,includeFiles:true,includeFolderFileCounts:true,folderOffset:contents.nextFolderOffset,fileOffset:0,mode:treeRootMode,worldId})});
            const data=await response.json().catch(()=>({})) as TreeContents&{message?:string};
            if(requestId!==requestSequence.current)return;
            if(!response.ok)throw new Error(data.message||"Unable to load more folders.");
            setContents(previous=>previous?.path===current.path?{...data,folders:[...previous.folders,...data.folders],files:previous.files,fileOffset:previous.fileOffset,nextFileOffset:previous.nextFileOffset,truncatedFiles:previous.truncatedFiles,fileTotal:previous.fileTotal}:previous);
        } catch(reason) {if(requestId===requestSequence.current)setError(reason instanceof Error?reason.message:"Unable to load more folders.");}
        finally {if(requestId===requestSequence.current)setLoading(false);}
    }

    async function loadMoreFilePreview() {
        const current = filesView;
        const fileOffset = current?.nextFileOffset;
        if (!current || fileOffset === null || fileOffset === undefined || filesLoading) return;
        const requestId = ++fileRequestSequence.current;
        fileController.current?.abort();
        const controller = new AbortController(); fileController.current = controller;
        setFilesLoading(true); setFilesError("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:current.path,includeFiles:true,fileOffset,mode:treeRootMode,worldId}),signal:controller.signal});
            const data = await response.json().catch(()=>({})) as TreeContents & {message?:string};
            if (!response.ok) throw new Error(data.message || "Unable to read more files in this folder.");
            if (controller.signal.aborted || requestId !== fileRequestSequence.current) return;
            setFilesView(previous => {
                if (previous?.path !== current.path) return previous;
                const seen = new Set(previous.files.map(file => pathKey(file.path)));
                return {...previous,files:[...previous.files,...(data.files ?? []).filter(file => !seen.has(pathKey(file.path)))],fileTotal:data.fileTotal,nextFileOffset:data.nextFileOffset,truncated:Boolean(data.truncatedFiles)};
            });
        } catch (reason) { if (!controller.signal.aborted && requestId === fileRequestSequence.current) setFilesError(reason instanceof Error ? reason.message : "Unable to read more files in this folder."); }
        finally { if (!controller.signal.aborted && requestId === fileRequestSequence.current) setFilesLoading(false); }
    }

    function back() {
        searchController.current?.abort();
        if (searchResults || searchText) { setSearchResults(null); setSearchText(""); setSearching(false); setError(""); return; }
        if (filesView) { closeFilesPanel(true); setError(""); return; }
        rememberCamera();
        childrenController.current?.abort();
        requestSequence.current += 1;
        setLoading(false); setError(""); setNotice("");
        const next = pathStack.slice(0, -1);
        setPathStack(next);
        if (!next.length) { setContents(null); restoreCamera(""); return; }
        void refreshFolder(next[next.length - 1], next);
    }

    useEffect(() => { backHandler.current = back; });
    useLayoutEffect(() => { filesViewRef.current = filesView; }, [filesView]);
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            const target = event.target;
            const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
            if (event.key === "Escape") {
                const targetElement = target instanceof HTMLElement ? target : null;
                if (filesViewRef.current) {
                    const previewHasFocus = target instanceof Node && filePreviewRef.current?.contains(target);
                    const triggerHasFocus = target instanceof Node && filePreviewTriggerRef.current?.contains(target);
                    if (previewHasFocus || triggerHasFocus) { event.preventDefault(); event.stopPropagation(); closeFilesPanel(true); }
                    return;
                }
                if (targetElement?.closest("button,select,input,textarea,[role='tab']") && !targetElement.closest(".treeRocketSearch")) return;
                event.preventDefault(); event.stopPropagation(); backHandler.current(); return;
            }
            if ((event.altKey && event.key === "ArrowLeft") || (event.key === "Backspace" && !editing)) {
                event.preventDefault();
                event.stopPropagation();
                backHandler.current();
            }
        }
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [closeFilesPanel]);

    useLayoutEffect(() => {
        if (!filesView) return;
        const positionPreview = () => {
            const trigger = filePreviewTriggerRef.current;
            if (!trigger?.isConnected) { closeFilesPanelForAnchorLoss(); return; }
            const rect = trigger.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth;
            const viewportHeight = document.documentElement.clientHeight;
            if (rect.bottom <= 0 || rect.top >= viewportHeight) { closeFilesPanelForAnchorLoss(); return; }
            const gap = 8;
            const width = Math.max(0, Math.min(360, viewportWidth - 24));
            const visibleTop = Math.max(0, rect.top);
            const visibleBottom = Math.min(viewportHeight, rect.bottom);
            const below = Math.max(0, viewportHeight - visibleBottom - gap - 12);
            const above = Math.max(0, visibleTop - gap - 12);
            const placeAbove = above >= Math.min(220, below) || above > below;
            const maxHeight = Math.max(80, Math.min(620, placeAbove ? above : below));
            const previewHeight = Math.min(filePreviewRef.current?.offsetHeight ?? 320, maxHeight);
            const candidateTop = placeAbove ? visibleTop - gap - previewHeight : visibleBottom + gap;
            const top = Math.max(12, Math.min(viewportHeight - previewHeight - 12, candidateTop));
            const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
            setFilePreviewPosition({top,left,maxHeight});
        };
        let frame = 0;
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(positionPreview); };
        schedule();
        document.addEventListener("scroll", schedule, true);
        window.addEventListener("resize", schedule);
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
        if (filePreviewRef.current) observer?.observe(filePreviewRef.current);
        if (filePreviewTriggerRef.current) observer?.observe(filePreviewTriggerRef.current);
        return () => { cancelAnimationFrame(frame); document.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); observer?.disconnect(); };
    }, [filesView, closeFilesPanelForAnchorLoss]);

    useEffect(() => {
        if (!filesView) return;
        const dismissOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node) || filePreviewRef.current?.contains(target) || filePreviewTriggerRef.current?.contains(target)) return;
            const clickedFocusable = target instanceof Element && target.closest("a,button,input,select,textarea,[tabindex]:not([tabindex='-1'])");
            closeFilesPanel(!clickedFocusable);
        };
        document.addEventListener("pointerdown", dismissOutside, true);
        return () => document.removeEventListener("pointerdown", dismissOutside, true);
    }, [filesView, closeFilesPanel]);

    useEffect(() => {
        if (!filesView?.path) { filePreviewTriggerRef.current = null; return; }
        const frame = requestAnimationFrame(() => filePreviewCloseRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [filesView?.path]);

    function goRoots() {
        childrenController.current?.abort(); setShowAddFolders(false); setSelectedFolderPaths([]);
        rememberCamera(); searchController.current?.abort(); cancelFileRequest(); requestSequence.current += 1; setSearching(false);
        setLoading(false); setError(""); setNotice(""); setSearchText(""); setSearchResults(null);
        cameraByPath.current.set("__roots__", {scrollProgress: 0});
        if (graphRef.current) graphRef.current.scrollTop = 0;
        setPathStack([]); setContents(null); setFilesView(null); setFilesLoading(false); setFilesError("");
    }

    function changeRootMode(mode:WorldTreeRootMode){
        if(mode===treeRootMode)return;
        childrenController.current?.abort(); cancelFileRequest(); requestSequence.current += 1;
        setError("");setNotice("");setPathStack([]);setContents(null);setSearchResults(null);setSearchText("");setFilesView(null);setFilesError("");
        void onTreeRootModeChange(mode).catch(reason=>setError(reason instanceof Error?reason.message:"Could not save Tree Rocket origin."));
    }

    async function showFiles(folder: TreeFolder, trigger: HTMLButtonElement) {
        if (filesView && pathKey(filesView.path) === pathKey(folder.path)) {
            closeFilesPanel(); return;
        }
        filePreviewTriggerRef.current = trigger;
        const requestId = ++fileRequestSequence.current;
        fileController.current?.abort();
        const controller = new AbortController(); fileController.current = controller;
        setSearchResults(null);
        setFilesView({path: folder.path, name: folder.name, files: [], truncated: false});
        setFilesLoading(true); setFilesError("");
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-children`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: folder.path, includeFiles: true,mode:treeRootMode,worldId}), signal: controller.signal});
            const data = await response.json().catch(() => ({})) as TreeContents & {message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to read files in this folder.");
            if (!controller.signal.aborted && requestId === fileRequestSequence.current) setFilesView({path: folder.path, name: folder.name, files: data.files ?? [],fileTotal:data.fileTotal,nextFileOffset:data.nextFileOffset, truncated: Boolean(data.truncatedFiles)});
        } catch (reason) { if (!controller.signal.aborted && requestId === fileRequestSequence.current) setFilesError(reason instanceof Error ? reason.message : "Unable to read files in this folder."); }
        finally { if (!controller.signal.aborted && requestId === fileRequestSequence.current) setFilesLoading(false); }
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
        childrenController.current?.abort();
        const controller = new AbortController(); searchController.current = controller;
        requestSequence.current += 1; cancelFileRequest(); setLoading(false); setSearching(true); setError(""); setNotice(""); setFilesView(null);
        try {
            const response = await fetch(`${API_BASE_URL}/filesystem/tree-search`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({query,worldId,mode:treeRootMode}), signal: controller.signal});
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

    async function copyPath(path: string) {
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
    const currentFolderDisplay = currentFolder && contents?.path === currentFolder.path ? {...currentFolder, directFileCount: contents.directFileCount, directFolderCount:contents.directFolderCount} : currentFolder;
    const currentFolderDisplayName = currentFolderDisplay && treeRootMode === "desktop" && pathStack.length === 1 ? desktopRootLabel(currentFolderDisplay) : currentFolderDisplay?.name ?? "";
    const fileNodeProps = (folder:TreeFolder) => ({showingFiles:Boolean(filesView && pathKey(filesView.path) === pathKey(folder.path))});

    return createPortal(<section className="treeRocketOverlay" role="dialog" aria-modal="true" aria-labelledby="treeRocketTitle" ref={overlayRef} tabIndex={-1}>
        <div className="treeRocketWindow">
            <header className="treeRocketHeader">
                <button type="button" className="treeRocketBack" onClick={onClose}><ArrowLeft size={16}/>Back to FolderRocket</button>
                <div className="treeRocketBrand">
                    <div className="treeRocketBrandTitle"><TreeRocketMark size={82}/><strong id="treeRocketTitle"><span>Tree</span><span>Rocket</span></strong></div>
                </div>
                <div className="treeRocketHeaderTools">
                    <div className="treeRocketAddFoldersWrap"><button type="button" className="treeRocketAddFoldersButton" onClick={() => {setSelectedFolderPaths([]); setShowAddFolders(value => !value);}} disabled={section !== "folders" || loading || !currentChildren.length} aria-expanded={showAddFolders}><FolderPlus size={15}/>Add folders</button>
                    {showAddFolders && <div className="treeRocketAddFoldersMenu" role="dialog" aria-label="Add current folders to Folder Management">
                        <strong>Add folders from this location</strong><div>{currentChildren.map(folder => <label key={folder.path}><input type="checkbox" disabled={folderIsManaged(folder)} checked={selectedFolderPaths.some(path => pathKey(path) === pathKey(folder.path))} onChange={event => setSelectedFolderPaths(current => event.target.checked ? [...current, folder.path] : current.filter(path => pathKey(path) !== pathKey(folder.path)))}/><span>{folder.name}</span><small>{folderIsManaged(folder) ? "Already added" : "Existing folder"}</small></label>)}</div>
                        {contents?.folderCountsLimited && <small>File counts are limited to the first folders in this location to keep browsing responsive.</small>}
                        <footer><button type="button" onClick={() => setShowAddFolders(false)}>Cancel</button><button type="button" onClick={() => void addSelectedFolders()} disabled={addingFolders || !selectedFolderPaths.length}>{addingFolders ? "Adding…" : `Add selected (${selectedFolderPaths.length})`}</button></footer>
                    </div>}
                    </div>
                </div>
            </header>
            <nav className="treeRocketToolbar" aria-label="Browse, folder and app controls">
                <label className="treeRocketBrowseSelect"><span>Browse</span><select aria-label="Browse location" value={treeRootMode} disabled={section!=="folders"} onChange={event=>changeRootMode(event.target.value as WorldTreeRootMode)}><option value="computer">Computer</option><option value="desktop">Desktop</option></select></label><span className="treeRocketOriginCount" aria-live="polite" aria-label={`${treeRootMode === "desktop" ? "Desktop" : "Computer"} root count: ${rootsLoaded ? roots.length : "loading"} ${roots.length === 1 ? "folder" : "folders"}`}>{rootsLoaded ? `${roots.length} ${roots.length === 1 ? "folder" : "folders"}` : "Loading folders…"}</span>
                <div className="treeRocketTabs" role="tablist" aria-label="Tree Rocket view"><button ref={foldersTabRef} type="button" role="tab" aria-selected={section === "folders"} className={section === "folders" ? "active" : ""} onClick={() => {setSection("folders"); setShowAddFolders(false);}}>Folder</button><button type="button" role="tab" aria-selected={section === "apps"} className={section === "apps" ? "active" : ""} onClick={() => {if (!appsLoaded || (appsError && !applications.length)) {setAppsLoading(true);setAppsError("");setAppsLoaded(false);setAppsRetry(value=>value+1);} setSection("apps"); setShowAddFolders(false); closeFilesPanel();}}>Apps</button><button type="button" className={`treeRocketAppsRefresh${section === "folders" ? " reserved" : ""}`} onClick={() => {setAppsLoading(true);setAppsError("");setAppsLoaded(false);setAppsRetry(value => value + 1);}} disabled={section !== "apps" || appsLoading} aria-hidden={section !== "apps"} tabIndex={section === "apps" ? 0 : -1} title="Refresh installed applications" aria-label="Refresh installed applications"><RefreshCw className={appsLoading ? "treeRocketSpinner" : ""} size={14}/></button></div>
                <form className="treeRocketSearch" onSubmit={event => {event.preventDefault(); if (section === "apps") setSection("folders"); void search();}}><Search size={14}/><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search folders or files…" aria-label="Search folders and files"/><button type="submit" disabled={searching} aria-label="Search">{searching ? <LoaderCircle className="treeRocketSpinner" size={14}/> : "Search"}</button></form>
            </nav>
            {section === "folders" && pathStack.length>0 && <nav className="treeRocketBreadcrumbs" aria-label="Folder path"><button type="button" onClick={goRoots}>{treeRootMode === "desktop" ? "Desktop roots" : "Computer"}</button>{pathStack.map((folder,index)=><span key={`${folder.path}-${index}`}><i>›</i><button type="button" onClick={()=>{const next=pathStack.slice(0,index+1);setSearchResults(null);setSearchText("");setFilesView(null);void refreshFolder(folder,next);}}>{index===0&&treeRootMode==="desktop"?desktopRootLabel(folder):folder.name}</button></span>)}{currentPath&&<button type="button" className="treeRocketCopyPath" onClick={()=>void copyPath(currentPath)} title="Copy the selected folder path"><Copy size={13}/>{copied?"Copied":"Copy path"}</button>}<span className="treeRocketBreadcrumbSubfolders" aria-label={`Subfolders in ${currentFolderDisplayName||"selected folder"}`}><strong>SUBFOLDERS</strong><b>{currentFolderDisplayName}</b><i>{contents?.folderTotal??currentChildren.length} {((contents?.folderTotal??currentChildren.length)===1)?"folder":"folders"}</i></span></nav>}
            {error && <p className="treeRocketError" role="alert">{error}</p>}{notice && <p className="treeRocketNotice" role="status"><Check size={13}/>{notice}</p>}
            <div className={`treeRocketBody${section === "folders" && searchResults ? " withSidebar" : ""}`}>
                {section === "apps" ? <main className="treeRocketAppsPanel" role="tabpanel" aria-label="Tree Rocket Apps">
                    <p className="treeRocketAppsMeta" aria-live="polite">{appsLoading ? applications.length ? "Refreshing applications…" : "Loading applications…" : `${applications.length} applications · Windows Start menu`}</p>
                    <div className="treeRocketAppsScroll">
                        {appsLoading && !applications.length && <p className="treeRocketAppsLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={16}/>Loading applications…</p>}
                        {appsError && <p className="treeRocketAppsError" role="alert">{appsError} {applications.length ? "The last available catalog is still shown; refresh to retry." : "Use Refresh to try again."}</p>}
                        {applications.length > 0 && <div className="treeRocketAppGrid">{applications.map(application => <button type="button" className="treeRocketAppCard" key={application.appId} onClick={() => void openApplication(application)} disabled={Boolean(openingAppId)} aria-busy={openingAppId === application.appId} title={`Open ${application.name}`}><InstalledApplicationIcon application={application}/><strong>{application.name}</strong></button>)}</div>}
                        {!appsLoading && !appsError && !applications.length && <p className="treeRocketAppsEmpty">No applications were found in the Windows Start menu.</p>}
                    </div>
                </main> : <main className={`treeRocketGraph${currentFolder ? " hasOpenBranch" : ""}`} aria-label="Folder tree graph" ref={graphRef} onContextMenu={event => {event.preventDefault(); back();}}>
                    <div className="treeRocketGraphCanvas">
                        {searchResults ? <>
                            <div className="treeRocketGraphHeading"><span>RESULTS</span><strong>{visibleSearchFolders.length} folder{visibleSearchFolders.length === 1 ? "" : "s"}</strong></div>
                            <div className="treeRocketSearchGraph">{visibleSearchFolders.map(folder => <TreeRocketFolderNode key={folder.path} {...fileNodeProps(folder)} folder={folder} loading={loading} added={folderIsAdded(folder)} managed={folderIsManaged(folder)} onOpen={() => void openSearchFolder(folder)} onShowFiles={trigger => void showFiles(folder,trigger)} onAdd={() => void addFolder(folder)}/>)}{!visibleSearchFolders.length && <p className="treeRocketEmpty">No matching folders.</p>}</div>
                        </> : currentFolderDisplay ? <div className="treeRocketGraphStage">
                            <TreeRocketFolderNode {...fileNodeProps(currentFolderDisplay)} folder={{...currentFolderDisplay, directFolderCount:contents?.folderTotal??currentChildren.length}} displayName={currentFolderDisplayName} root loading={loading} added={folderIsAdded(currentFolderDisplay)} managed={folderIsManaged(currentFolderDisplay)} onOpen={() => void fetchFolderContents(currentFolderDisplay, false, pathStack)} onShowFiles={trigger => void showFiles(currentFolderDisplay,trigger)} onAdd={() => void addFolder(currentFolderDisplay)}/>
                            <section className="treeRocketBranch" aria-label={`Subfolders in ${currentFolderDisplay.name}`}>
                                <div ref={branchScrollRef} className={`treeRocketChildren hasParent${currentChildren.length === 0 ? " emptyChildren" : ""}`}>
                                    {currentChildren.map(folder => <TreeRocketFolderNode key={graphNodeId("folder",folder.path)} {...fileNodeProps(folder)} folder={folder} loading={loading} added={folderIsAdded(folder)} managed={folderIsManaged(folder)} onOpen={() => void fetchFolderContents(folder)} onShowFiles={trigger => void showFiles(folder,trigger)} onAdd={() => void addFolder(folder)}/>)}
                                    {!currentChildren.length && !loading && <p className="treeRocketEmpty">No subfolders.</p>}
                                    {loading && <p className="treeRocketLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={15}/> Reading folder contents…</p>}
                                    {contents?.truncatedFolders&&<button type="button" className="treeRocketLoadMore" title="Load the next page of direct folders." onClick={()=>void loadMoreChildren()} disabled={loading}>{loading?<LoaderCircle className="treeRocketSpinner" size={14}/>:<FolderPlus size={14}/>}Load next page of folders ({currentChildren.length} of {contents.folderTotal})</button>}
                                </div>
                                {contents?.folderCountsLimited && <p className="treeRocketLimit">Direct file counts are limited to keep browsing responsive.</p>}
                            </section>
                        </div> : <>
                            <div className={`treeRocketChildren rootNodes${currentChildren.length === 0 ? " emptyChildren" : ""}`}>
                                {currentChildren.map(folder => <TreeRocketFolderNode key={folder.path} {...fileNodeProps(folder)} folder={folder} displayName={treeRootMode==="desktop"?desktopRootLabel(folder):folder.name} loading={loading} added={folderIsAdded(folder)} managed={folderIsManaged(folder)} onOpen={() => void fetchFolderContents(folder,false,treeRootMode==="desktop"?[folder]:undefined)} onShowFiles={trigger => void showFiles(folder,trigger)} onAdd={() => void addFolder(folder)}/>)}
                                {!currentChildren.length && !loading && <p className="treeRocketEmpty">{treeRootMode === "desktop" ? "Desktop is not available in the folders currently authorized for this account." : "No computer folders are available to this account."}</p>}
                                {loading && <p className="treeRocketLoading" role="status"><LoaderCircle className="treeRocketSpinner" size={15}/> Reading folders…</p>}
                            </div>
                        </>}
                    </div>
                </main>}
                {section === "folders" && searchResults && <aside className="treeRocketFiles" aria-label={filesView ? `Files in ${filesView.name}` : searchResults ? "Search results" : "Folder file preview"}>
                    {filesView ? <><header><div><Files size={20}/><strong>Files in {filesView.name}</strong><small>{filesView.files.length} of {filesView.fileTotal ?? filesView.files.length} visible</small></div><button type="button" onClick={() => closeFilesPanel()} aria-label="Close file list"><X size={16}/></button></header><div className="treeRocketFileList">{filesLoading && <p role="status"><LoaderCircle className="treeRocketSpinner" size={16}/> Loading files…</p>}{!filesLoading && filesError && <p role="alert">{filesError}</p>}{!filesLoading && filesView.files.map(file => <div className="treeRocketFile" key={graphNodeId("file",file.path)}><FileKindIcon name={file.name} size={22}/><strong title={file.name}>{file.name}</strong><button type="button" onClick={() => void copyPath(file.path)} aria-label={`Copy path of ${file.name}`} title="Copy path"><Copy size={14}/></button></div>)}{!filesLoading && !filesView.files.length && !filesError && <p>This folder contains no visible files.</p>}{filesView.truncated && <button type="button" className="treeRocketLoadMore" onClick={()=>void loadMoreFilePreview()} disabled={filesLoading}>Load next page of files ({filesView.files.length} of {filesView.fileTotal})</button>}</div></> : searchResults ? <><header><div><Search size={20}/><strong>Search results</strong><small>{searchResults.scannedDirectories} folders scanned</small></div><button type="button" onClick={() => setSearchResults(null)} aria-label="Close search results"><X size={16}/></button></header><div className="treeRocketFileList"><h3>Files · {visibleSearchFiles.length}</h3>{visibleSearchFiles.map(file => <button type="button" className="treeRocketFile searchHit" key={file.path} onClick={() => void openSearchFile(file)} title={file.path}><FileKindIcon name={file.name} size={22}/><strong>{file.name}</strong><small>{file.parentName}</small></button>)}{!visibleSearchFiles.length && <p>No matching files.</p>}{searchResults.truncated && <small>Search was limited to keep browsing responsive. Refine the filename to find more results.</small>}</div></> : <><header><div><Files size={20}/><strong>File preview</strong><small>Folder contents</small></div></header><div className="treeRocketFileList"><p>Choose “See files” on a folder to preview its files here.</p></div></>}
                </aside>}
            </div>
        </div>
        {section === "folders" && filesView && <aside id="treeRocketFilePreview" className="treeRocketFiles treeRocketFilesFloating" ref={filePreviewRef} role="dialog" aria-labelledby="treeRocketFilesTitle" style={{top:filePreviewPosition.top,left:filePreviewPosition.left,maxHeight:filePreviewPosition.maxHeight}}>
        <header><div><Files size={20}/><strong id="treeRocketFilesTitle">Files in {filesView.name}</strong><small>{filesView.files.length} of {filesView.fileTotal ?? filesView.files.length} visible</small></div><button ref={filePreviewCloseRef} type="button" onClick={() => closeFilesPanel(true)} aria-label="Close file list"><X size={16}/></button></header>
        <div className="treeRocketFileList">{filesLoading && <p role="status"><LoaderCircle className="treeRocketSpinner" size={16}/> Loading files…</p>}{!filesLoading && filesError && <p role="alert">{filesError}</p>}{!filesLoading && filesView.files.map(file => <div className="treeRocketFile" key={graphNodeId("file",file.path)}><FileKindIcon name={file.name} size={22}/><strong title={file.name}>{file.name}</strong><button type="button" onClick={() => void copyPath(file.path)} aria-label={`Copy path of ${file.name}`} title="Copy path"><Copy size={14}/></button></div>)}{!filesLoading && !filesView.files.length && !filesError && <p>This folder contains no visible files.</p>}{filesView.truncated && <button type="button" className="treeRocketLoadMore" onClick={()=>void loadMoreFilePreview()} disabled={filesLoading}>Load next page of files ({filesView.files.length} of {filesView.fileTotal})</button>}</div>
    </aside>}
    </section>, document.body);
}
