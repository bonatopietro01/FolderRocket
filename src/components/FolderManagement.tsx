import {useEffect, useRef, useState, type CSSProperties} from "react";
import {Archive, ArrowLeft, ChevronDown, ChevronRight, ExternalLink, File, FileSpreadsheet, FileText, Flame, FolderClosed, FolderOpen, GripHorizontal, GripVertical, Image, ListOrdered, Pencil, Plus, Search, Sparkles} from "lucide-react";
import {API_BASE_URL} from "../api";
import FireMountain from "./FireMountain";

export interface VirtualFile { name: string; path: string; createdAt?: string; size?: number; }
export interface ManagedFolder { id: string; name: string; path: string; description: string; storage?: "physical" | "imaginary"; virtualFiles?: VirtualFile[]; }
interface FileEntry extends VirtualFile { matches?: string[]; }
interface DirectoryEntry { name: string; path: string; createdAt?: string; }
interface DirectoryContents { files: FileEntry[]; folders: DirectoryEntry[]; }
interface Props { folders: ManagedFolder[]; onAdd: () => void; onUpdate: (id: string, change: Partial<ManagedFolder>) => void; onDelete: (id: string) => void; onReorder: (sourceId: string, targetId: string, placement: "before" | "after") => void; aiEnabled: boolean; }
interface CompactPreview { kind: "loading" | "text" | "image" | "pdf" | "unavailable"; text?: string; url?: string; message?: string; }

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf") return <span className="fileKindIcon pdf" title="PDF"><FileText size={17} /></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word" title="Word document"><FileText size={17} /></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel" title="Spreadsheet"><FileSpreadsheet size={17} /></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt" title="Text file"><FileText size={17} /></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image" title="Image"><Image size={17} /></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive" title="Archive"><Archive size={17} /></span>;
    return <span className="fileKindIcon generic" title="File"><File size={17} /></span>;
}

function FolderQuickPreview({file, slot}: {file: FileEntry | null; slot: number}) {
    const [preview, setPreview] = useState<CompactPreview | null>(null);
    useEffect(() => {
        if (!file?.path) { setPreview(null); return; }
        let disposed = false;
        setPreview({kind: "loading"});
        void (async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/files/preview`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: file.path})});
                const data = await response.json().catch(() => ({})) as CompactPreview;
                if (!disposed) setPreview(response.ok && data.kind ? data : {kind: "unavailable", message: data.message || "Preview unavailable."});
            } catch { if (!disposed) setPreview({kind: "unavailable", message: "Preview unavailable."}); }
        })();
        return () => { disposed = true; };
    }, [file?.path]);
    if (!file) return <article className="folderQuickPreviewSlot empty"><span>{slot + 1}</span><p>Select a file</p></article>;
    return <article className="folderQuickPreviewSlot"><div className="folderQuickPreviewVisual">{preview?.kind === "loading" && <p>Loading…</p>}{preview?.kind === "text" && <pre>{preview.text || "No readable text."}</pre>}{preview?.kind === "image" && preview.url && <img src={`${API_BASE_URL}${preview.url}`} alt={`Preview of ${file.name}`}/>} {preview?.kind === "pdf" && preview.url && <iframe src={`${API_BASE_URL}${preview.url}`} title={`Preview of ${file.name}`}/>} {preview?.kind === "unavailable" && <p>{preview.message || "Preview unavailable."}</p>}</div><div className="folderQuickPreviewName"><FileKindIcon name={file.name}/><strong title={file.name}>{file.name}</strong></div></article>;
}

export default function FolderManagement({folders, onAdd, onUpdate, onDelete, onReorder, aiEnabled}: Props) {
    const [openedFolderIds, setOpenedFolderIds] = useState<string[]>([]);
    const [primaryOpenedId, setPrimaryOpenedId] = useState<string | null>(null);
    const [folderContents, setFolderContents] = useState<Record<string, DirectoryContents>>({});
    const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
    const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set());
    const [results, setResults] = useState<FileEntry[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<FileEntry[]>([]);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [moveQueue, setMoveQueue] = useState<FileEntry[]>([]);
    const [filesVersion, setFilesVersion] = useState(0);
    const [query, setQuery] = useState("");
    const [aiSearchEnabled, setAiSearchEnabled] = useState(false);
    const [message, setMessage] = useState("Select a folder to view its files.");
    const [orderingFolders, setOrderingFolders] = useState(false);
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{id: string; placement: "before" | "after"} | null>(null);
    const [foundFilesHeight, setFoundFilesHeight] = useState(155);
    const [quickPreviewSlots, setQuickPreviewSlots] = useState<Array<FileEntry | null>>([null, null, null]);
    const pointerDraggedFolderId = useRef<string | null>(null);
    const nextQuickPreviewSlot = useRef(0);
    const openedFolders = folders.filter(folder => openedFolderIds.includes(folder.id));
    const primaryOpened = folders.find(folder => folder.id === primaryOpenedId) ?? openedFolders[0];
    const openedFolderKey = openedFolderIds.join("|");
    const openedFolderSignature = openedFolders.map(folder => `${folder.id}:${folder.storage ?? "physical"}:${folder.path}:${JSON.stringify(folder.virtualFiles ?? [])}`).join("|");

    useEffect(() => {
        const dismissDelete = (event: MouseEvent) => {
            if (!(event.target as Element).closest(".folderTablePanel")) setPendingDeleteId(null);
        };
        document.addEventListener("pointerdown", dismissDelete);
        return () => document.removeEventListener("pointerdown", dismissDelete);
    }, []);

    useEffect(() => {
        const dismissSelection = (event: MouseEvent) => {
            if (!(event.target as Element).closest(".folderInspector")) clearFileSelection();
        };
        document.addEventListener("pointerdown", dismissSelection);
        return () => document.removeEventListener("pointerdown", dismissSelection);
    }, []);

    useEffect(() => {
        const refreshFiles = () => setFilesVersion(current => current + 1);
        window.addEventListener("folderrocket-files-moved", refreshFiles);
        return () => window.removeEventListener("folderrocket-files-moved", refreshFiles);
    }, []);

    useEffect(() => {
        if (!aiEnabled) setAiSearchEnabled(false);
    }, [aiEnabled]);

    useEffect(() => {
        setOpenedFolderIds(current => current.filter(id => folders.some(folder => folder.id === id)));
    }, [folders]);

    async function loadDirectory(directoryPath: string) {
        setLoadingDirectories(current => new Set(current).add(directoryPath));
        try {
            const response = await fetch(`${API_BASE_URL}/list-folder-files`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({folder: directoryPath})
            });
            const raw = await response.text();
            const data = (() => {
                try { return JSON.parse(raw) as {files?: FileEntry[]; folders?: DirectoryEntry[]; message?: string}; }
                catch { throw new Error("The backend did not return folder data. Restart the backend and try again."); }
            })();
            if (!response.ok) throw new Error(data.message ?? "Unable to read this folder");
            setFolderContents(current => ({...current, [directoryPath]: {files: data.files ?? [], folders: data.folders ?? []}}));
            setMessage("");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to read this folder");
        } finally {
            setLoadingDirectories(current => {
                const next = new Set(current);
                next.delete(directoryPath);
                return next;
            });
        }
    }

    useEffect(() => {
        setFolderContents({});
        setExpandedDirectories(new Set());
        setResults([]);
        clearFileSelection();
        setQuery("");
        if (!openedFolders.length) {
            setMessage("Select a folder to view its files.");
            return;
        }
        setMessage("Loading files...");
        for (const folder of openedFolders) {
            if (folder.storage === "imaginary") {
                setFolderContents(current => ({...current, [`virtual:${folder.id}`]: {files: folder.virtualFiles ?? [], folders: []}}));
            } else if (folder.path) {
                void loadDirectory(folder.path);
            }
        }
    // Folder paths are part of the identity here: a changed path must reload its root.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openedFolderKey, openedFolderSignature, filesVersion]);

    function folderContentKey(folder: ManagedFolder) { return folder.storage === "imaginary" ? `virtual:${folder.id}` : folder.path; }

    function countReadFiles(folder: ManagedFolder): number | null {
        const rootKey = folderContentKey(folder);
        if (!folderContents[rootKey]) return null;
        const visited = new Set<string>();
        const countContents = (directoryKey: string): number => {
            if (visited.has(directoryKey)) return 0;
            visited.add(directoryKey);
            const contents = folderContents[directoryKey];
            if (!contents) return 0;
            return contents.files.length + contents.folders.reduce((total, child) => total + countContents(child.path), 0);
        };
        return countContents(rootKey);
    }
    function clearFileSelection() {
        setSelectedPaths([]);
        setSelectedFiles([]);
        setQuickPreviewSlots([null, null, null]);
        nextQuickPreviewSlot.current = 0;
    }
    function toggleFile(file: FileEntry) {
        const wasSelected = selectedPaths.includes(file.path);
        setSelectedPaths(current => wasSelected ? current.filter(item => item !== file.path) : [...current, file.path]);
        setSelectedFiles(current => wasSelected ? current.filter(item => item.path !== file.path) : current.some(item => item.path === file.path) ? current : [...current, file]);
        if (wasSelected) {
            setQuickPreviewSlots(current => current.map(item => item?.path === file.path ? null : item));
            return;
        }
        setQuickPreviewSlots(current => {
            const next = [...current];
            next[nextQuickPreviewSlot.current] = file;
            nextQuickPreviewSlot.current = (nextQuickPreviewSlot.current + 1) % next.length;
            return next;
        });
    }
    function openFolderOnly(id: string) {
        setOpenedFolderIds([id]);
        setPrimaryOpenedId(id);
    }

    function toggleFolderInView(id: string) {
        const nextOpened = openedFolderIds.includes(id)
            ? openedFolderIds.filter(folderId => folderId !== id)
            : [...openedFolderIds, id];
        setOpenedFolderIds(nextOpened);
        setPrimaryOpenedId(current => current && nextOpened.includes(current) ? current : null);
    }

    async function toggleDirectory(directory: DirectoryEntry) {
        if (expandedDirectories.has(directory.path)) {
            setExpandedDirectories(current => {
                const next = new Set(current);
                next.delete(directory.path);
                return next;
            });
            return;
        }
        setExpandedDirectories(current => new Set(current).add(directory.path));
        if (!folderContents[directory.path]) await loadDirectory(directory.path);
    }

    async function search() {
        if (!query.trim() || !openedFolders.length) return;
        try {
            const physicalPaths = openedFolders.filter(folder => folder.storage !== "imaginary" && Boolean(folder.path)).map(folder => folder.path);
            const virtualMatches = openedFolders
                .filter(folder => folder.storage === "imaginary")
                .flatMap(folder => (folder.virtualFiles ?? []).filter(file => file.name.toLowerCase().includes(query.trim().toLowerCase())));
            const response = physicalPaths.length
                ? await fetch(`${API_BASE_URL}/search-files`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({folders: physicalPaths, query, ai: aiSearchEnabled})})
                : null;
            const data = response ? await response.json() as {results?: FileEntry[]; message?: string} : {results: []};
            if (response && !response.ok) throw new Error(data.message ?? "Search failed");
            setResults([...(data.results ?? []), ...virtualMatches]);
            setMessage("");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Search failed");
        }
    }

    async function openPaths(paths: string[]) {
        const responses = await Promise.all(paths.map(path => fetch(`${API_BASE_URL}/search-files/open`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path})})));
        const failed = responses.find(response => !response.ok);
        if (failed) {
            const data = await failed.json().catch(() => ({message: "Unable to open file"})) as {message?: string};
            setMessage(data.message ?? "Unable to open file");
        }
    }

    function actionFiles(file: FileEntry) {
        if (!selectedPaths.includes(file.path)) return [file];
        const selectedByPath = new Map(selectedFiles.map(item => [item.path, item]));
        const files = selectedPaths.map(path => selectedByPath.get(path)).filter((item): item is FileEntry => Boolean(item));
        return files.length ? files : [file];
    }

    function sendToFire(file: FileEntry) {
        window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail: actionFiles(file)}));
    }

    function stageForMove(file: FileEntry) {
        const files = actionFiles(file);
        setMoveQueue(current => [...current, ...files.filter(candidate => !current.some(item => item.path === candidate.path))]);
    }

    async function renameFile(file: FileEntry) {
        const name = window.prompt("Enter the new file name:", file.name);
        if (!name?.trim() || name.trim() === file.name) return;
        const response = await fetch(`${API_BASE_URL}/files/rename`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: file.path, name})});
        const data = await response.json() as {path?: string; name?: string; message?: string};
        if (!response.ok || !data.path || !data.name) { setMessage(data.message ?? "Unable to rename file"); return; }
        setResults(current => current.map(item => item.path === file.path ? {...item, path: data.path!, name: data.name!} : item));
        setMoveQueue(current => current.map(item => item.path === file.path ? {...item, path: data.path!, name: data.name!} : item));
        setSelectedPaths(current => current.map(item => item === file.path ? data.path! : item));
        setSelectedFiles(current => current.map(item => item.path === file.path ? {...item, path: data.path!, name: data.name!} : item));
        for (const folder of openedFolders.filter(folder => folder.storage === "imaginary")) {
            onUpdate(folder.id, {virtualFiles: (folder.virtualFiles ?? []).map(item => item.path === file.path ? {...item, path: data.path!, name: data.name!} : item)});
        }
        setFilesVersion(current => current + 1);
    }

    async function sendQueuedFiles(mode: "copy" | "move") {
        if (!primaryOpened || !moveQueue.length) return;
        if (primaryOpened.storage === "imaginary") {
            const virtualFiles = [...(primaryOpened.virtualFiles ?? []), ...moveQueue.filter(file => !(primaryOpened.virtualFiles ?? []).some(item => item.path === file.path))];
            onUpdate(primaryOpened.id, {virtualFiles});
            setMoveQueue([]);
            clearFileSelection();
            setFilesVersion(current => current + 1);
            setMessage(`${virtualFiles.length} file(s) available in ${primaryOpened.name}.`);
            return;
        }
        if (!primaryOpened.path) return;
        const endpoint = mode === "copy" ? "/files/copy" : "/files/move";
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({paths: moveQueue.map(file => file.path), destination: primaryOpened.path})});
        const data = await response.json() as {copied?: FileEntry[]; moved?: FileEntry[]; message?: string};
        if (!response.ok) { setMessage(data.message ?? `Unable to ${mode} files`); return; }
        const completed = mode === "copy" ? data.copied ?? [] : data.moved ?? [];
        if (mode === "move") {
            window.dispatchEvent(new CustomEvent("folderrocket-files-moved", {detail: {sourcePaths: moveQueue.map(file => file.path), moved: completed, destination: primaryOpened.path}}));
        }
        setMoveQueue([]);
        clearFileSelection();
        setFilesVersion(current => current + 1);
        setMessage(`${completed.length} file(s) ${mode === "copy" ? "copied" : "moved"} to ${primaryOpened.name}.`);
    }

    function requestDelete(id: string) { if (pendingDeleteId === id) { onDelete(id); setPendingDeleteId(null); } else setPendingDeleteId(id); }

    async function choosePath(folder: ManagedFolder, option: string) {
        if (option === "imaginary") { onUpdate(folder.id, {path: "", storage: "imaginary"}); return; }
        if (option === "insert") { onUpdate(folder.id, {storage: "physical"}); return; }
        if (option !== "new") return;
        try {
            const parentResponse = await fetch(`${API_BASE_URL}/folders/pick-parent`, {method: "POST", credentials: "include"});
            const parentData = await parentResponse.json() as {path?: string | null; message?: string};
            if (!parentResponse.ok) throw new Error(parentData.message ?? "Unable to open the folder picker");
            if (!parentData.path) return;
            const folderName = window.prompt("Name the new folder:");
            const safeName = folderName?.trim().replace(/[\\/]+/g, "") ?? "";
            if (!safeName) return;
            const requestedPath = `${parentData.path.replace(/[\\/]+$/, "")}\\${safeName}`;
            const response = await fetch(`${API_BASE_URL}/folders/create`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: requestedPath})});
            const data = await response.json() as {path?: string; message?: string};
            if (!response.ok || !data.path) throw new Error(data.message ?? "Folder creation failed");
            onUpdate(folder.id, {path: data.path, storage: "physical"});
        } catch (error) { setMessage(error instanceof Error ? error.message : "Folder creation failed"); }
    }

    function getPointerDropTarget(clientX: number, clientY: number) {
        const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-folder-id]");
        const id = row?.dataset.folderId;
        if (!id || !row) return null;
        const bounds = row.getBoundingClientRect();
        return {id, placement: clientY < bounds.top + bounds.height / 2 ? "before" as const : "after" as const};
    }

    function startFoundFilesResize(event: React.PointerEvent<HTMLButtonElement>) {
        if (!results.length) return;
        const inspector = event.currentTarget.closest<HTMLElement>(".folderInspector");
        if (!inspector) return;
        const startY = event.clientY;
        const startHeight = foundFilesHeight;
        const maximumHeight = Math.max(90, inspector.getBoundingClientRect().height - 230);
        event.currentTarget.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => setFoundFilesHeight(Math.max(72, Math.min(maximumHeight, startHeight + moveEvent.clientY - startY)));
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }

    function renderFile(file: FileEntry, key: string) {
        const selected = selectedPaths.includes(file.path);
        return <div className={selected ? "inspectorFile selectedAttachment" : "inspectorFile"} onClick={() => toggleFile(file)} key={key}>
            <button className="inspectorMove" type="button" title="Add to Copy / Cut files" onClick={event => {event.stopPropagation(); stageForMove(file);}}><ArrowLeft size={14}/></button>
            <button className="inspectorFire" type="button" title="Send to Fire Mountain" onClick={event => {event.stopPropagation(); sendToFire(file);}}><Flame size={14}/></button>
            <span className="inspectorFileName"><FileKindIcon name={file.name} /><strong>{file.name}</strong></span>
            <small>{file.createdAt ? new Date(file.createdAt).toLocaleDateString("en-GB") : ""}</small>
            <button className="inspectorRename" type="button" title="Rename file" onClick={event => {event.stopPropagation(); void renameFile(file);}}><Pencil size={13}/></button>
            <button className="inspectorFileOpen" type="button" title="Open file" onClick={event => {event.stopPropagation(); void openPaths([file.path]);}}><ExternalLink size={14}/></button>
        </div>;
    }

    function renderDirectory(directory: DirectoryEntry, depth: number) {
        const isExpanded = expandedDirectories.has(directory.path);
        const contents = folderContents[directory.path];
        const isLoading = loadingDirectories.has(directory.path);
        return <div className="folderTreeBranch" key={directory.path} style={{"--folder-depth": depth} as CSSProperties}>
            <div className="folderTreeDirectory">
                <button type="button" className="directoryToggle" onClick={() => void toggleDirectory(directory)} title={isExpanded ? "Close folder" : "Open folder"}>{isExpanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
                <FolderClosed size={15}/><strong>{directory.name}</strong>
            </div>
            {isExpanded && <div className="folderTreeChildren">
                {isLoading && !contents ? <p>Loading folder...</p> : null}
                {contents?.files.map(file => renderFile(file, `file-${file.path}`))}
                {contents?.folders.map(child => renderDirectory(child, depth + 1))}
                {contents && !contents.files.length && !contents.folders.length ? <p>This folder is empty.</p> : null}
            </div>}
        </div>;
    }

    return <main className="folderManagementPage">
        <section className="folderManagementLeft"><section className="folderTablePanel">
            <div className="managementHeader"><div><h2>Folder management</h2>{orderingFolders && <p>Drag the handle and release the folder where you want it.</p>}</div><div className="managementActions"><button type="button" className={orderingFolders ? "orderFoldersButton active" : "orderFoldersButton"} onClick={() => { setOrderingFolders(current => !current); setDraggedFolderId(null); setDropTarget(null); }} title={orderingFolders ? "Finish ordering folders" : "Reorder folders"}><ListOrdered size={17}/></button><button type="button" className="addFolder" onClick={onAdd}>+</button></div></div>
            <div className="folderTable" role="table">
                <div className={orderingFolders ? "folderTableRow folderTableHead orderingHead" : "folderTableRow folderTableHead"} role="row">{orderingFolders && <span aria-label="Reorder folder"/>}<span aria-label="Delete folder"/><span>Name</span><span>Path</span><span>Description</span><span aria-label="Open folder"/></div>
                {folders.map(folder => <div className={`${folder.id === primaryOpenedId ? "folderTableRow primaryOpened" : openedFolderIds.includes(folder.id) ? "folderTableRow secondaryOpened" : "folderTableRow"}${orderingFolders ? " orderingFolder" : ""}${draggedFolderId === folder.id ? " draggingFolder" : ""}${dropTarget?.id === folder.id ? ` drop${dropTarget.placement === "before" ? "Before" : "After"}` : ""}`} role="row" key={folder.id} data-folder-id={folder.id}>
                    {orderingFolders && <span className="folderOrderHandle" role="button" tabIndex={0} onPointerDown={event => { event.preventDefault(); pointerDraggedFolderId.current = folder.id; setDraggedFolderId(folder.id); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (pointerDraggedFolderId.current !== folder.id) return; const target = getPointerDropTarget(event.clientX, event.clientY); setDropTarget(target && target.id !== folder.id ? target : null); }} onPointerUp={event => { const sourceId = pointerDraggedFolderId.current; const target = getPointerDropTarget(event.clientX, event.clientY); if (sourceId && target && sourceId !== target.id) onReorder(sourceId, target.id, target.placement); pointerDraggedFolderId.current = null; setDraggedFolderId(null); setDropTarget(null); }} onPointerCancel={() => { pointerDraggedFolderId.current = null; setDraggedFolderId(null); setDropTarget(null); }} title="Hold and drag to reorder"><GripVertical size={14}/></span>}
                    <button type="button" className={pendingDeleteId === folder.id ? "deleteFolder confirmDelete" : "deleteFolder"} onClick={() => requestDelete(folder.id)} title={pendingDeleteId === folder.id ? "Press again to delete" : "Delete folder"}>x</button>
                    <span className="folderNameInput"><input value={folder.name} onChange={event => onUpdate(folder.id, {name: event.target.value})} aria-label="Folder name"/></span>
                    <span className="pathInput"><input value={folder.path} onChange={event => onUpdate(folder.id, {path: event.target.value.replace(/^"|"$/g, ""), storage: "physical"})} placeholder={folder.storage === "imaginary" ? "Imaginary folder" : "Folder path"} aria-label="Folder path" disabled={folder.storage === "imaginary"}/><select aria-label="Path options" value={folder.storage === "imaginary" ? "imaginary" : "insert"} onChange={event => void choosePath(folder, event.target.value)}><option value="insert">Insert path</option><option value="new">New folder</option><option value="imaginary">Imaginary folder</option></select></span>
                    <input value={folder.description} onChange={event => onUpdate(folder.id, {description: event.target.value})} placeholder="Description" aria-label="Folder description"/>
                    <span className="folderRowActions"><button type="button" className={openedFolderIds.includes(folder.id) && folder.id !== primaryOpenedId ? "toggleFolderViewButton active" : "toggleFolderViewButton"} onClick={() => toggleFolderInView(folder.id)} title={openedFolderIds.includes(folder.id) ? "Remove from current view" : "Add to current view"} aria-pressed={openedFolderIds.includes(folder.id) && folder.id !== primaryOpenedId}><Plus size={15}/></button><button type="button" className={folder.id === primaryOpenedId ? "openFolderButton active" : "openFolderButton"} onClick={() => openFolderOnly(folder.id)} title="Open only this folder" aria-pressed={folder.id === primaryOpenedId}><FolderOpen size={17}/></button></span>
                </div>)}
            </div>
        </section><section className="folderQuickPreview"><header><strong>Quick preview</strong><small>Selected files</small></header><div>{quickPreviewSlots.map((file, index) => <FolderQuickPreview key={file ? `${file.path}-${index}` : `empty-${index}`} file={file} slot={index}/>)}</div></section><section className={moveQueue.length ? "fireMountainCard moveFilesCard" : "fireMountainCard moveFilesCard isEmptyMove"}><div className="fireMountainFiles">{moveQueue.length ? moveQueue.map(file => <div className="fireMountainFile" key={file.path}><span className="fireMountainFileInfo"><span className="fireMountainFileName"><FileKindIcon name={file.name}/>{file.name}</span><span className="fireMountainFileSize">{file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "Size unavailable"} · Added {file.createdAt ? new Date(file.createdAt).toLocaleDateString("en-GB") : "now"}</span></span><button className="fireMountainRemoveButton" type="button" onClick={() => setMoveQueue(current => current.filter(item => item.path !== file.path))}>x</button></div>) : <p className="fireMountainEmpty">I like to move it move it</p>}</div><div className="moveFilesActions"><span className="moveActionText">I like to </span><button className="fireMountainButton moveFilesButton" type="button" disabled={!moveQueue.length || !primaryOpened} onClick={() => void sendQueuedFiles("copy")}>Copy 'em</button><span className="moveActionText"> / </span><button className="fireMountainButton moveFilesButton cutPasteButton" type="button" disabled={!moveQueue.length || !primaryOpened?.path || primaryOpened.storage === "imaginary"} onClick={() => void sendQueuedFiles("move")}>Cut 'em</button><span className="moveActionText"> to {primaryOpened?.name ?? "the selected folder"}</span>{moveQueue.length > 0 && <button className="fireMountainClearButton" type="button" onClick={() => setMoveQueue([])}>Clear list</button>}</div></section><FireMountain /></section>
        <aside className="folderInspector">
            <div className="folderInspectorTitle"><FolderOpen size={20}/><div><strong>{openedFolders.length > 1 ? `${openedFolders.length} folders open` : primaryOpened?.name ?? "No folder open"}</strong><small>{openedFolders.length > 1 ? openedFolders.map(folder => folder.name).join(" · ") : primaryOpened?.path || "Open a folder from the table"}</small></div></div>
            <div className="folderSearch"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {if (event.key === "Enter") void search();}} placeholder={aiSearchEnabled ? "Describe a file or its contents" : openedFolders.length > 1 ? "Search open folders" : "Search this folder"} disabled={!openedFolders.length}/>{aiEnabled && <button type="button" className={aiSearchEnabled ? "folderAiSearchToggle enabled" : "folderAiSearchToggle"} onClick={() => setAiSearchEnabled(current => !current)} title={aiSearchEnabled ? "AI Search Assistant is on" : "Turn on AI Search Assistant"} aria-pressed={aiSearchEnabled}><Sparkles size={14}/></button>}<button type="button" onClick={() => void search()} disabled={!openedFolders.length || !query.trim()} title={aiSearchEnabled ? "Search with AI assistance" : "Search files"}><Search size={17}/></button><button type="button" title="Clear search" onClick={() => { setQuery(""); setResults([]); clearFileSelection(); }}>x</button></div><div className="inspectorSelectionActions"><button type="button" disabled={!selectedPaths.length} onClick={clearFileSelection}>Deselect all</button><button type="button" disabled={!selectedPaths.length} onClick={() => void openPaths(selectedPaths)}>Open files</button><button type="button" disabled={!results.length} onClick={() => { setResults([]); clearFileSelection(); }}>Clear all</button></div>
            <section className={results.length ? "inspectorList foundFilesPanel" : "inspectorList foundFilesPanel emptyResults"} style={results.length ? {height: foundFilesHeight} : undefined}><h3>Found files</h3>{results.length ? results.map(file => renderFile(file, `result-${file.path}`)) : <p>No search results.</p>}</section><button type="button" className={results.length ? "inspectorListsResizer" : "inspectorListsResizer disabled"} onPointerDown={startFoundFilesResize} title="Drag to resize file lists" aria-label="Resize Found files and Folder files" disabled={!results.length}><GripHorizontal size={14}/></button>
            <section className="inspectorList folderFiles"><h3>Folder files</h3>{openedFolders.length ? openedFolders.map(folder => { const contents = folderContents[folderContentKey(folder)]; const isLoading = loadingDirectories.has(folderContentKey(folder)); const readFileCount = countReadFiles(folder); return <div className="folderTreeRoot" key={folder.id}><h4><FolderOpen size={15}/>{folder.name}{readFileCount !== null && <small className="folderFileCount" title="Files read in this folder">{readFileCount} files</small>}</h4>{isLoading && !contents ? <p>Loading folder...</p> : null}{!isLoading && !contents ? <p>{message || "Unable to load this folder."}</p> : null}{contents?.files.map(file => renderFile(file, `root-${folder.id}-${file.path}`))}{contents?.folders.map(directory => renderDirectory(directory, 1))}{contents && !contents.files.length && !contents.folders.length ? <p>This folder is empty.</p> : null}</div>; }) : <p>{message}</p>}</section>
        </aside>
    </main>;
}
