import {useFilePreview} from '../useFilePreview';
import {useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import {ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Flame, FolderClosed, FolderOpen, GripHorizontal, GripVertical, ListOrdered, Palette, Pencil, Plus, Search, Sparkles} from "lucide-react";
import {API_BASE_URL} from "../api";
import FireMountain from "./FireMountain";
import TreeRocket, {TreeRocketMark} from "./TreeRocket";
import FileKindIcon from "./FileKindIcon";

export interface VirtualFile { name: string; path: string; createdAt?: string; size?: number; }
export interface FolderAppearance { backgroundColor?: string; borderColor?: string; borderWidth?: number; bold?: boolean; italic?: boolean; underline?: boolean; shadow?: boolean; symbol?: string; workGroup?: string; }
export interface ManagedFolder { id: string; name: string; path: string; description: string; storage?: "physical" | "imaginary"; usbDrivePath?: string; virtualFiles?: VirtualFile[]; appearance?: FolderAppearance; }
interface FileEntry extends VirtualFile { matches?: string[]; }
interface DirectoryEntry { name: string; path: string; createdAt?: string; }
interface DirectoryContents { files: FileEntry[]; folders: DirectoryEntry[]; }
interface TransferDestination { folderId: string; name: string; path: string; storage: "physical" | "imaginary"; }
interface Props { folders: ManagedFolder[]; onAdd: (path?: string, name?: string) => boolean | void; onUpdate: (id: string, change: Partial<ManagedFolder>) => void; onDelete: (id: string) => void; onReorder: (sourceId: string, targetId: string, placement: "before" | "after") => void; aiEnabled: boolean; }

function comparablePath(value: string) { return value.trim().replace(/\//g, "\\").replace(/[\\/]+$/, "").toLowerCase(); }
function isChildOfFolder(folderPath: string, candidatePath: string) {
    const root = comparablePath(folderPath);
    const candidate = comparablePath(candidatePath);
    return Boolean(root) && candidate !== root && candidate.startsWith(`${root}\\`);
}
function parentFolderPath(filePath: string) { return filePath.replace(/[\\/][^\\/]+$/, ""); }
function matchesFileFormat(name: string, format: string) {
    if (format === "all") return true;
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    return extension === format;
}

function FolderQuickPreview({file, slot}: {file: FileEntry | null; slot: number}) {
    const preview = useFilePreview(file?.path);
    if (!file) return <article className="folderQuickPreviewSlot empty"><span>{slot + 1}</span><p>Select a file</p></article>;
    return <article className="folderQuickPreviewSlot"><div className="folderQuickPreviewVisual">{preview?.kind === "loading" && <p>Loading…</p>}{preview?.kind === "text" && <pre>{preview.text || "No readable text."}</pre>}{preview?.kind === "image" && preview.url && <img src={`${API_BASE_URL}${preview.url}`} alt={`Preview of ${file.name}`}/>} {preview?.kind === "pdf" && preview.url && <iframe src={`${API_BASE_URL}${preview.url}`} title={`Preview of ${file.name}`}/>} {preview?.kind === "unavailable" && <p>{preview.message || "Preview unavailable."}</p>}</div><div className="folderQuickPreviewName"><FileKindIcon name={file.name}/><strong title={file.name}>{file.name}</strong></div></article>;
}

export default function FolderManagement({folders, onAdd, onUpdate, onDelete, onReorder, aiEnabled}: Props) {
    const [treeRocketOpen, setTreeRocketOpen] = useState(false);
    const [openedFolderIds, setOpenedFolderIds] = useState<string[]>([]);
    const [primaryOpenedId, setPrimaryOpenedId] = useState<string | null>(null);
    const [folderContents, setFolderContents] = useState<Record<string, DirectoryContents>>({});
    const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
    const [selectedDirectoryPaths, setSelectedDirectoryPaths] = useState<string[]>([]);
    const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set());
    const [results, setResults] = useState<FileEntry[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<FileEntry[]>([]);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [newFolder, setNewFolder] = useState<{id:string; name:string; parent:string} | null>(null);
    const [newFolderName, setNewFolderName] = useState("");
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [createFolderError, setCreateFolderError] = useState("");
    const newFolderDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { if (newFolder) newFolderDialog.current?.showModal(); }, [newFolder]);
    const [moveQueue, setMoveQueue] = useState<FileEntry[]>([]);
    const [filesVersion, setFilesVersion] = useState(0);
    const [query, setQuery] = useState("");
    const [aiSearchEnabled, setAiSearchEnabled] = useState(false);
    const [message, setMessage] = useState("Select a folder to view its files.");
    const [orderingFolders, setOrderingFolders] = useState(false);
    const [appearanceFolderId, setAppearanceFolderId] = useState<string | null>(null);
    const [appearanceDraft, setAppearanceDraft] = useState<FolderAppearance>({});
    const [pathEditorId, setPathEditorId] = useState<string | null>(null);
    const [pathMenuId, setPathMenuId] = useState<string | null>(null);
    const [pathDraft, setPathDraft] = useState("");
    const [fileFormat, setFileFormat] = useState("all");
    const [fileTypeCounts, setFileTypeCounts] = useState<Array<[string,number]>>([]);
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{id: string; placement: "before" | "after"} | null>(null);
    const [foundFilesHeight, setFoundFilesHeight] = useState(155);
    const [quickPreviewSlots, setQuickPreviewSlots] = useState<Array<FileEntry | null>>([null, null]);
    const directoryRequests = useRef(new Map<string, AbortController>());
    const pointerDraggedFolderId = useRef<string | null>(null);
    const nextQuickPreviewSlot = useRef(0);
    const visibleOpenedFolderIds = useMemo(() => openedFolderIds.filter(id => folders.some(folder => folder.id === id)), [folders, openedFolderIds]);
    const openedFolders = useMemo(() => folders.filter(folder => visibleOpenedFolderIds.includes(folder.id)), [folders, visibleOpenedFolderIds]);
    const visibleSelectedDirectoryPaths = useMemo(() => {
        const physicalRoots = openedFolders.filter(folder => folder.storage !== "imaginary" && folder.path).map(folder => folder.path);
        return selectedDirectoryPaths.filter(directoryPath => physicalRoots.some(root => isChildOfFolder(root, directoryPath)));
    }, [openedFolders, selectedDirectoryPaths]);
    const effectiveAiSearchEnabled = aiEnabled && aiSearchEnabled;
    const inventoryPaths = JSON.stringify(openedFolders.filter(folder => folder.storage !== "imaginary" && folder.path).map(folder => folder.path));
    const primaryOpened = folders.find(folder => folder.id === primaryOpenedId) ?? openedFolders[0];
    const openedFolderKey = visibleOpenedFolderIds.join("|");
    const openedFolderSignature = openedFolders.map(folder => `${folder.id}:${folder.storage ?? "physical"}:${folder.path}:${JSON.stringify(folder.virtualFiles ?? [])}`).join("|");
    const transferDestinations = (() => {
        const destinations: TransferDestination[] = [];
        for (const folder of openedFolders) {
            if (folder.storage === "imaginary") {
                destinations.push({folderId: folder.id, name: folder.name, path: "", storage: "imaginary"});
                continue;
            }
            if (!folder.path) continue;
            const selectedChildren = visibleSelectedDirectoryPaths.filter(directoryPath => isChildOfFolder(folder.path, directoryPath));
            if (selectedChildren.length) {
                destinations.push(...selectedChildren.map(directoryPath => ({folderId: folder.id, name: directoryPath.split(/[\\/]/).filter(Boolean).pop() ?? folder.name, path: directoryPath, storage: "physical" as const})));
            } else {
                destinations.push({folderId: folder.id, name: folder.name, path: folder.path, storage: "physical"});
            }
        }
        return [...new Map(destinations.map(destination => [destination.storage === "imaginary" ? `imaginary:${destination.folderId}` : `physical:${comparablePath(destination.path)}`, destination])).values()];
    })();



    useEffect(() => {
        if (!appearanceFolderId) return;
        const dismissAppearance = (event: PointerEvent) => {
            if (!(event.target as Element).closest(".folderAppearancePanel,.folderAppearanceButton")) setAppearanceFolderId(null);
        };
        document.addEventListener("pointerdown", dismissAppearance);
        return () => document.removeEventListener("pointerdown", dismissAppearance);
    }, [appearanceFolderId]);

    useEffect(() => {
        if (!pathEditorId && !pathMenuId) return;
        const dismissPathControls = (event: PointerEvent) => {
            if (!(event.target as Element).closest(".pathInput")) {
                setPathEditorId(null);
                setPathMenuId(null);
            }
        };
        document.addEventListener("pointerdown", dismissPathControls);
        return () => document.removeEventListener("pointerdown", dismissPathControls);
    }, [pathEditorId, pathMenuId]);

    useEffect(() => {
        if (!appearanceFolderId) return;
        const controls = document.querySelector<HTMLElement>(".folderAppearancePanel .folderAppearanceControls");
        if (!controls) return;
        const picker = document.createElement("div"); picker.className = "folderSymbolPicker";
        const label = document.createElement("span"); label.textContent = "Corner symbol"; picker.appendChild(label);
        for (const symbol of ["", "☁️", "🔌", "📥", "💾", "🔑", "📁", "💼", "🎓", "🏠", "⭐", "❤️", "📌", "🚀", "📷", "🎵", "🎬", "💻", "🌐", "🧾", "🔒", "🛠️", "📊", "🗂️"]) {
            const button = document.createElement("button"); button.type = "button"; button.textContent = symbol || "None"; button.className = appearanceDraft.symbol === symbol ? "active" : ""; button.addEventListener("click", () => setAppearanceDraft(current => ({...current, symbol}))); picker.appendChild(button);
        }
        const custom = document.createElement("label"); custom.className = "folderCustomSymbol";
        const customLabel = document.createElement("span"); customLabel.textContent = "Custom initials"; custom.appendChild(customLabel);
        const customInput = document.createElement("input"); customInput.type = "text"; customInput.maxLength = 2; customInput.placeholder = "2 letters"; customInput.value = appearanceDraft.symbol && /^[A-Za-zÀ-ÿ]{1,2}$/.test(appearanceDraft.symbol) ? appearanceDraft.symbol : "";
        const customApply = document.createElement("button"); customApply.type = "button"; customApply.textContent = "Use"; customApply.addEventListener("click", () => { const symbol = customInput.value.trim().slice(0, 2).toUpperCase(); if (symbol) setAppearanceDraft(current => ({...current, symbol})); });
        custom.append(customInput, customApply); picker.appendChild(custom);
        controls.appendChild(picker);
        const preview = document.querySelector<HTMLElement>(".folderAppearancePreview > div");
        const badge = document.createElement("span"); badge.className = "folderSymbolPreview"; badge.textContent = appearanceDraft.symbol || ""; if (preview && appearanceDraft.symbol) preview.appendChild(badge);
        return () => { picker.remove(); badge.remove(); };
    }, [appearanceDraft.symbol, appearanceFolderId]);

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            await Promise.resolve();
            if (controller.signal.aborted) return;
            const physicalPaths: string[] = JSON.parse(inventoryPaths);
            if (!physicalPaths.length) { setFileTypeCounts([]); return; }
            try {
                const response = await fetch(`${API_BASE_URL}/file-types/inventory`, {method: "POST", signal: controller.signal, credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({folders: physicalPaths})});
                if (!response.ok) throw new Error("Inventory unavailable");
                const data = await response.json() as {types?: Array<{type: string; count: number}>};
                if (!controller.signal.aborted) setFileTypeCounts((data.types || []).map(item => [item.type, item.count]));
            } catch { if (!controller.signal.aborted) setFileTypeCounts([]); }
        })();
        return () => controller.abort();
    }, [inventoryPaths, filesVersion]);


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

    async function loadDirectory(directoryPath: string) {
        if (directoryRequests.current.has(directoryPath)) return;
        const controller = new AbortController();
        directoryRequests.current.set(directoryPath, controller);
        setLoadingDirectories(current => new Set(current).add(directoryPath));
        try {
            const response = await fetch(`${API_BASE_URL}/list-folder-files`, {
                method: "POST",
                signal: controller.signal,
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({folder: directoryPath})
            });
            const raw = await response.text();
            const data = (() => {
                try { return JSON.parse(raw) as {files?: FileEntry[]; folders?: DirectoryEntry[]; message?: string}; }
                catch { throw new Error("The backend did not return folder data. Restart the backend and try again."); }
            })();
            if (controller.signal.aborted) return;
            if (!response.ok) throw new Error(data.message ?? "Unable to read this folder");
            setFolderContents(current => ({...current, [directoryPath]: {files: data.files ?? [], folders: data.folders ?? []}}));
            setMessage("");
        } catch (error) {
            if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to read this folder");
        } finally {
            if (directoryRequests.current.get(directoryPath) === controller) {
                directoryRequests.current.delete(directoryPath);
                setLoadingDirectories(current => {
                    const next = new Set(current);
                    next.delete(directoryPath);
                    return next;
                });
            }
        }
    }

    useEffect(() => {
        let active = true;
        const requests = directoryRequests.current;
        queueMicrotask(() => {
            if (!active) return;
            setLoadingDirectories(new Set());
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
            });
        return () => { active = false; requests.forEach(controller => controller.abort()); requests.clear(); };

    // Folder paths are part of the identity here: a changed path must reload its root.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openedFolderKey, openedFolderSignature, filesVersion]);

    function folderContentKey(folder: ManagedFolder) { return folder.storage === "imaginary" ? `virtual:${folder.id}` : folder.path; }

    const readFileCounts = useMemo(() => new Map(openedFolders.map(folder => {
        const rootKey = folder.storage === "imaginary" ? `virtual:${folder.id}` : folder.path;
        if (!folderContents[rootKey]) return [folder.id, null] as const;
        const visited = new Set<string>();
        const countContents = (directoryKey: string): number => {
            if (visited.has(directoryKey)) return 0;
            visited.add(directoryKey);
            const contents = folderContents[directoryKey];
            if (!contents) return 0;
            return contents.files.length + contents.folders.reduce((total, child) => total + countContents(child.path), 0);
        };
        return [folder.id, countContents(rootKey)] as const;
    })), [folderContents, openedFolders]);
    function clearFileSelection() {
        setSelectedPaths([]);
        setSelectedFiles([]);
        setQuickPreviewSlots([null, null]);
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
        setSelectedDirectoryPaths([]);
    }

    function toggleFolderInView(id: string) {
        const nextOpened = visibleOpenedFolderIds.includes(id)
            ? visibleOpenedFolderIds.filter(folderId => folderId !== id)
            : [...visibleOpenedFolderIds, id];
        setOpenedFolderIds(nextOpened);
        setPrimaryOpenedId(current => current && nextOpened.includes(current) ? current : null);
        const changedFolder = folders.find(folder => folder.id === id);
        if (changedFolder?.path && visibleOpenedFolderIds.includes(id)) {
            setSelectedDirectoryPaths(current => current.filter(directoryPath => !isChildOfFolder(changedFolder.path, directoryPath)));
        }
    }

    function toggleDirectoryDestination(directory: DirectoryEntry) {
        setSelectedDirectoryPaths(current => current.includes(directory.path)
            ? current.filter(path => path !== directory.path)
            : [...current, directory.path]);
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
        setHasSearched(true);
        try {
            const physicalPaths = openedFolders.filter(folder => folder.storage !== "imaginary" && Boolean(folder.path)).map(folder => folder.path);
            const virtualMatches = openedFolders
                .filter(folder => folder.storage === "imaginary")
                .flatMap(folder => (folder.virtualFiles ?? []).filter(file => file.name.toLowerCase().includes(query.trim().toLowerCase())));
            const response = physicalPaths.length
                ? await fetch(`${API_BASE_URL}/search-files`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({folders: physicalPaths, query, ai: effectiveAiSearchEnabled})})
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
        if (!moveQueue.length || !transferDestinations.length) return;
        const transfer = async (endpoint: "/files/copy" | "/files/move", files: FileEntry[], destination: TransferDestination) => {
            if (!files.length) return [] as FileEntry[];
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({paths: files.map(file => file.path), destination: destination.path})});
            const data = await response.json().catch(() => ({})) as {copied?: FileEntry[]; moved?: FileEntry[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? `Unable to ${endpoint === "/files/move" ? "move" : "copy"} files`);
            const completed = endpoint === "/files/move" ? data.moved ?? [] : data.copied ?? [];
            return completed.map((file, index) => ({...files[index], ...file}));
        };
        const errors: string[] = [];
        let transferred = 0;

        if (mode === "copy") {
            for (const destination of transferDestinations) {
                if (destination.storage === "imaginary") {
                    const folder = folders.find(item => item.id === destination.folderId);
                    if (!folder) continue;
                    const existing = folder.virtualFiles ?? [];
                    const added = moveQueue.filter(file => !existing.some(item => item.path === file.path));
                    onUpdate(folder.id, {virtualFiles: [...existing, ...added]});
                    transferred += added.length;
                    continue;
                }
                const filesForDestination = moveQueue.filter(file => comparablePath(parentFolderPath(file.path)) !== comparablePath(destination.path));
                if (!filesForDestination.length) continue;
                try { transferred += (await transfer("/files/copy", filesForDestination, destination)).length; }
                catch (error) { errors.push(`${destination.name}: ${error instanceof Error ? error.message : "copy failed"}`); }
            }
        } else {
            const physicalDestinations = transferDestinations.filter((destination): destination is TransferDestination & {storage: "physical"} => destination.storage === "physical");
            const primaryDestination = physicalDestinations[0];
            if (!primaryDestination) { setMessage("Cut 'em needs at least one physical folder. Use Copy 'em for an imaginary folder."); return; }
            const filesToMove = moveQueue.filter(file => comparablePath(parentFolderPath(file.path)) !== comparablePath(primaryDestination.path));
            let primaryFiles = moveQueue.filter(file => comparablePath(parentFolderPath(file.path)) === comparablePath(primaryDestination.path));
            let movedFiles: FileEntry[];
            try {
                movedFiles = await transfer("/files/move", filesToMove, primaryDestination);
                primaryFiles = [...primaryFiles, ...movedFiles];
                transferred += movedFiles.length;
            } catch (error) {
                setMessage(`${primaryDestination.name}: ${error instanceof Error ? error.message : "move failed"}`);
                return;
            }
            for (const destination of physicalDestinations.slice(1)) {
                const filesForDestination = primaryFiles.filter(file => comparablePath(parentFolderPath(file.path)) !== comparablePath(destination.path));
                if (!filesForDestination.length) continue;
                try { transferred += (await transfer("/files/copy", filesForDestination, destination)).length; }
                catch (error) { errors.push(`${destination.name}: ${error instanceof Error ? error.message : "copy after cut failed"}`); }
            }
            for (const destination of transferDestinations.filter(destination => destination.storage === "imaginary")) {
                const folder = folders.find(item => item.id === destination.folderId);
                if (!folder) continue;
                const existing = folder.virtualFiles ?? [];
                const added = primaryFiles.filter(file => !existing.some(item => item.path === file.path));
                onUpdate(folder.id, {virtualFiles: [...existing, ...added]});
                transferred += added.length;
            }
            if (movedFiles.length) window.dispatchEvent(new CustomEvent("folderrocket-files-moved", {detail: {sourcePaths: filesToMove.slice(0, movedFiles.length).map(file => file.path), moved: movedFiles, destination: primaryDestination.path}}));
        }

        if (!transferred && errors.length) { setMessage(errors.join(" · ")); return; }
        if (!transferred) { setMessage("The selected files are already in the chosen destination."); return; }
        setMoveQueue([]);
        clearFileSelection();
        setFilesVersion(current => current + 1);
        const destinationText = transferDestinations.length === 1 ? transferDestinations[0].name : `${transferDestinations.length} destinations`;
        const action = mode === "move" && transferDestinations.length > 1 ? "cut to the first destination and copied to the others" : mode === "copy" ? "copied" : "moved";
        setMessage(`${transferred} file(s) ${action} to ${destinationText}.${errors.length ? ` ${errors.length} destination(s) could not be completed.` : ""}`);
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
            setNewFolderName("");
            setCreateFolderError("");
            setNewFolder({id:folder.id, name:folder.name, parent:parentData.path});
        } catch (error) { setMessage(error instanceof Error ? error.message : "Folder creation failed"); }
    }

    async function createAndLinkFolder() {
        if (!newFolder || creatingFolder) return;
        const safeName = newFolderName.trim();
        if (!safeName || /[<>:"/\\|?*]/.test(safeName) || [...safeName].some(character => character.charCodeAt(0) < 32) || /[. ]$/.test(safeName)) {
            setCreateFolderError("Enter a valid folder name without path separators or reserved characters.");
            return;
        }
        setCreatingFolder(true);
        setCreateFolderError("");
        try {
            const requestedPath = `${newFolder.parent.replace(/[\\/]+$/, "")}\\${safeName}`;
            const response = await fetch(`${API_BASE_URL}/folders/create`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: requestedPath})});
            const data = await response.json() as {path?: string; message?: string};
            if (!response.ok || !data.path) throw new Error(data.message ?? "Folder creation failed");
            onUpdate(newFolder.id, {path: data.path, storage: "physical"});
            setMessage(`Folder created and linked to ${newFolder.name}: ${data.path}`);
            setNewFolder(null);
        } catch (error) { setCreateFolderError(error instanceof Error ? error.message : "Folder creation failed"); }
        finally { setCreatingFolder(false); }
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
        if (!matchesFileFormat(file.name, fileFormat)) return null;
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
        const isTransferDestination = visibleSelectedDirectoryPaths.includes(directory.path);
        const contents = folderContents[directory.path];
        const isLoading = loadingDirectories.has(directory.path);
        return <div className="folderTreeBranch" key={directory.path} style={{"--folder-depth": depth} as CSSProperties}>
            <div className={isTransferDestination ? "folderTreeDirectory selectedDestination" : "folderTreeDirectory"}>
                <button type="button" className="directoryToggle" onClick={() => void toggleDirectory(directory)} title={isExpanded ? "Close folder" : "Open folder"}>{isExpanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
                <button type="button" className={isTransferDestination ? "directoryDestinationToggle active" : "directoryDestinationToggle"} onClick={() => toggleDirectoryDestination(directory)} title={isTransferDestination ? "Remove transfer destination" : "Use as transfer destination"} aria-label={isTransferDestination ? `Remove ${directory.name} as transfer destination` : `Use ${directory.name} as transfer destination`} aria-pressed={isTransferDestination}><FolderClosed size={15}/></button><button type="button" className="directoryDestinationName" onClick={() => toggleDirectoryDestination(directory)} title={isTransferDestination ? "Selected transfer destination" : "Select as transfer destination"}>{directory.name}</button>
            </div>
            {isExpanded && <div className="folderTreeChildren">
                {isLoading && !contents ? <p>Loading folder...</p> : null}
                {contents?.files.filter(file => matchesFileFormat(file.name, fileFormat)).map(file => renderFile(file, `file-${file.path}`))}
                {contents?.folders.map(child => renderDirectory(child, depth + 1))}
                {contents && !contents.files.length && !contents.folders.length ? <p>This folder is empty.</p> : null}
            </div>}
        </div>;
    }

    return <main className="folderManagementPage">
        {treeRocketOpen && <TreeRocket folders={folders} onAddFolder={(path, name) => onAdd(path, name)} onClose={() => setTreeRocketOpen(false)}/>}
        {newFolder && <dialog ref={newFolderDialog} className="createFolderDialog" onCancel={event => { event.preventDefault(); if (!creatingFolder) setNewFolder(null); }} aria-labelledby="createFolderTitle">
            <form onSubmit={event => { event.preventDefault(); void createAndLinkFolder(); }}>
                <h2 id="createFolderTitle">New folder</h2>
                <p>Create and link to <strong>{newFolder.name}</strong></p>
                <small>{newFolder.parent}</small>
                <label>Folder name<input autoFocus value={newFolderName} disabled={creatingFolder} onChange={event => setNewFolderName(event.target.value)}/></label>
                {createFolderError && <p role="alert">{createFolderError}</p>}
                <footer><button type="button" disabled={creatingFolder} onClick={() => setNewFolder(null)}>Cancel</button><button type="submit" disabled={creatingFolder || !newFolderName.trim()}>{creatingFolder ? "Creating…" : "Create and link"}</button></footer>
            </form>
        </dialog>}
        <section className="folderManagementLeft"><section className="folderTablePanel">
            <div className="folderTableToolbar" role="toolbar" aria-label="Folder Management controls"><strong>Folders</strong><div className="folderTableToolbarActions"><button type="button" className={orderingFolders ? "orderFoldersButton active" : "orderFoldersButton"} onClick={() => { if (orderingFolders) setAppearanceFolderId(null); setOrderingFolders(!orderingFolders); setDraggedFolderId(null); setDropTarget(null); setPathEditorId(null); setPathMenuId(null); }} title={orderingFolders ? "Finish ordering folders" : "Reorder folders"} aria-label={orderingFolders ? "Finish ordering folders" : "Reorder folders"}><ListOrdered size={15}/><span>{orderingFolders ? "Done" : "Reorder folders"}</span></button><button type="button" className="addFolder" onClick={() => onAdd()} title="Add folder" aria-label="Add folder"><Plus size={16}/><span>Add folder</span></button></div></div>
            <div className="folderTable" role="table">
                <div className={orderingFolders ? "folderTableRow folderTableHead orderingHead" : "folderTableRow folderTableHead"} role="row">{orderingFolders && <span aria-label="Reorder folder"/>}<span aria-label="Delete folder"/><span>Name</span><span>Path</span><span>Description</span><span aria-label="Folder actions"/></div>
                {folders.map(folder => <div className={`${folder.id === primaryOpenedId ? "folderTableRow primaryOpened" : visibleOpenedFolderIds.includes(folder.id) ? "folderTableRow secondaryOpened" : "folderTableRow"}${orderingFolders ? " orderingFolder" : ""}${draggedFolderId === folder.id ? " draggingFolder" : ""}${dropTarget?.id === folder.id ? ` drop${dropTarget.placement === "before" ? "Before" : "After"}` : ""}`} role="row" key={folder.id} data-folder-id={folder.id}>
                    {orderingFolders && <span className="folderOrderHandle" role="button" tabIndex={0} onPointerDown={event => { event.preventDefault(); pointerDraggedFolderId.current = folder.id; setDraggedFolderId(folder.id); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (pointerDraggedFolderId.current !== folder.id) return; const target = getPointerDropTarget(event.clientX, event.clientY); setDropTarget(target && target.id !== folder.id ? target : null); }} onPointerUp={event => { const sourceId = pointerDraggedFolderId.current; const target = getPointerDropTarget(event.clientX, event.clientY); if (sourceId && target && sourceId !== target.id) onReorder(sourceId, target.id, target.placement); pointerDraggedFolderId.current = null; setDraggedFolderId(null); setDropTarget(null); }} onPointerCancel={() => { pointerDraggedFolderId.current = null; setDraggedFolderId(null); setDropTarget(null); }} title="Hold and drag to reorder"><GripVertical size={14}/></span>}
                    <button type="button" className={pendingDeleteId === folder.id ? "deleteFolder confirmDelete" : "deleteFolder"} onClick={() => requestDelete(folder.id)} title={pendingDeleteId === folder.id ? "Press again to delete" : "Delete folder"}>x</button>
                    <span className="folderNameInput"><input value={folder.name} onChange={event => onUpdate(folder.id, {name: event.target.value})} aria-label="Folder name"/></span>
                    <span className="pathInput" data-path-folder-id={folder.id}>
                        {orderingFolders ? <>
                            <span className="folderPathPreview" title={folder.path}>{folder.storage === "imaginary" ? "Imaginary folder" : folder.path || "No path"}</span>
                            <button type="button" className={appearanceFolderId === folder.id ? "folderAppearanceButton active" : "folderAppearanceButton"} onClick={() => { setAppearanceDraft({...folder.appearance, shadow: false}); setAppearanceFolderId(folder.id); }}><Palette size={12}/><span>Style</span></button>
                        </> : <div className="pathSplitControl">
                            <button type="button" className="pathInsertButton" onClick={() => { setPathDraft(folder.path); setPathMenuId(null); setPathEditorId(folder.id); }}>{folder.storage === "imaginary" ? "Imaginary" : "Insert"}</button>
                            <button type="button" className="pathMenuButton" aria-label={`Open path menu for ${folder.name}`} aria-expanded={pathMenuId === folder.id} onClick={() => { setPathEditorId(null); setPathMenuId(current => current === folder.id ? null : folder.id); }}><ChevronDown size={13}/></button>
                        </div>}
                        {pathEditorId === folder.id && <form className="pathEditorPopover" onSubmit={event => { event.preventDefault(); onUpdate(folder.id, {path: pathDraft.trim().replace(/^"|"$/g, ""), storage: "physical"}); setPathEditorId(null); }}>
                            <label htmlFor={`folder-path-${folder.id}`}>Complete path</label>
                            <textarea id={`folder-path-${folder.id}`} autoFocus rows={2} spellCheck={false} value={pathDraft} placeholder="C:\\Folder\\Subfolder" onFocus={event => event.currentTarget.select()} onChange={event => setPathDraft(event.target.value)}/>
                            <footer><button type="button" onClick={() => setPathEditorId(null)}>Cancel</button><button type="submit">Save path</button></footer>
                        </form>}
                        {pathMenuId === folder.id && <div className="pathOptionsMenu" role="menu" aria-label={`Path options for ${folder.name}`}>
                            <button type="button" role="menuitem" onClick={() => { setPathDraft(folder.path); setPathMenuId(null); setPathEditorId(folder.id); }}>Insert path</button>
                            <button type="button" role="menuitem" onClick={() => { setPathMenuId(null); void choosePath(folder, "new"); }}>New folder</button>
                            <button type="button" role="menuitem" onClick={() => { setPathMenuId(null); void choosePath(folder, "imaginary"); }}>Imaginary</button>
                        </div>}
                        {appearanceFolderId === folder.id && <div className="folderAppearancePanel" role="dialog" aria-modal="true" aria-label={`Customise ${folder.name}`}><header><div><strong>Folder appearance</strong><span>Customise the dashboard block</span></div><button type="button" onClick={() => setAppearanceFolderId(null)}>×</button></header><div className="folderAppearanceControls"><label><span>Folder colour</span><input type="color" value={appearanceDraft.backgroundColor || "#ffffff"} onChange={event => setAppearanceDraft(current => ({...current, backgroundColor: event.target.value}))}/></label><label><span>Outline colour</span><input type="color" value={appearanceDraft.borderColor || "#c6d6e5"} onChange={event => setAppearanceDraft(current => ({...current, borderColor: event.target.value}))}/></label><label><span>Outline thickness</span><input type="range" min="0" max="8" value={appearanceDraft.borderWidth ?? 1} onChange={event => setAppearanceDraft(current => ({...current, borderWidth: Number(event.target.value)}))}/><b>{appearanceDraft.borderWidth ?? 1}px</b></label><label className="folderWorkGroup"><span>Join work folders</span><input list="folderWorkGroups" value={appearanceDraft.workGroup ?? folder.description} placeholder="Same project = shared colour and logo" onChange={event=>setAppearanceDraft(current=>({...current,workGroup:event.target.value}))}/><datalist id="folderWorkGroups">{[...new Set(folders.map(item=>(item.appearance?.workGroup ?? item.description).trim()).filter(Boolean))].map(group=><option key={group} value={group}/>)}</datalist><small>Choose an existing project or type a name. Empty separates this folder.</small></label><div className="folderFontButtons"><span>Folder name</span><button type="button" className={appearanceDraft.bold ? "active" : ""} onClick={() => setAppearanceDraft(current => ({...current, bold: !current.bold}))}>Bold</button><button type="button" className={appearanceDraft.italic ? "active" : ""} onClick={() => setAppearanceDraft(current => ({...current, italic: !current.italic}))}>Italic</button><button type="button" className={appearanceDraft.underline ? "active" : ""} onClick={() => setAppearanceDraft(current => ({...current, underline: !current.underline}))}>Underline</button></div></div><section className="folderAppearancePreview"><span>Preview</span><div style={{background: appearanceDraft.backgroundColor || "#fff", borderColor: appearanceDraft.borderColor || "#c6d6e5", borderWidth: appearanceDraft.borderWidth ?? 1}}><strong style={{fontWeight: appearanceDraft.bold ? 800 : 600, fontStyle: appearanceDraft.italic ? "italic" : "normal", textDecoration: appearanceDraft.underline ? "underline" : "none"}}>{folder.name || "Folder name"}</strong><small>Drop files here</small></div></section><footer><button type="button" className="appearanceReset" onClick={() => setAppearanceDraft({})}>Reset folder color</button><button type="button" className="appearanceCancel" onClick={() => setAppearanceFolderId(null)}>Cancel</button><button type="button" className="appearanceConfirm" onClick={() => { onUpdate(folder.id, {appearance: {...appearanceDraft, shadow: false}}); setAppearanceFolderId(null); }}>OK</button></footer></div>}
                    </span>
                    <input value={folder.description} onChange={event => onUpdate(folder.id, {description: event.target.value})} placeholder="Description" aria-label="Folder description"/>
                    <span className="folderRowActions"><button type="button" className={visibleOpenedFolderIds.includes(folder.id) && folder.id !== primaryOpenedId ? "toggleFolderViewButton active" : "toggleFolderViewButton"} onClick={() => toggleFolderInView(folder.id)} title={visibleOpenedFolderIds.includes(folder.id) ? "Remove from current view" : "Add to current view"} aria-pressed={visibleOpenedFolderIds.includes(folder.id) && folder.id !== primaryOpenedId}><Plus size={15}/></button><button type="button" className={folder.id === primaryOpenedId ? "openFolderButton active" : "openFolderButton"} onClick={() => openFolderOnly(folder.id)} title="Open only this folder" aria-pressed={folder.id === primaryOpenedId}><FolderOpen size={17}/></button></span>
                </div>)}
            </div>
        </section><section className="folderQuickPreview"><button type="button" className="treeRocketQuickLauncher" onClick={() => setTreeRocketOpen(true)} aria-label="Open Tree Rocket" title="Explore folders in Tree Rocket"><TreeRocketMark size={80}/><strong>Tree Rocket</strong></button><div>{quickPreviewSlots.map((file, index) => <FolderQuickPreview key={file ? `${file.path}-${index}` : `empty-${index}`} file={file} slot={index + 1}/>)}</div></section><section className={moveQueue.length ? "fireMountainCard moveFilesCard" : "fireMountainCard moveFilesCard isEmptyMove"}><div className="fireMountainFiles">{moveQueue.length ? moveQueue.map(file => <div className="fireMountainFile" key={file.path}><span className="fireMountainFileInfo"><span className="fireMountainFileName"><FileKindIcon name={file.name}/>{file.name}</span><span className="fireMountainFileSize">{file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "Size unavailable"} · Added {file.createdAt ? new Date(file.createdAt).toLocaleDateString("en-GB") : "now"}</span></span><button className="fireMountainRemoveButton" type="button" onClick={() => setMoveQueue(current => current.filter(item => item.path !== file.path))}>x</button></div>) : <p className="fireMountainEmpty">I like to move it move it</p>}</div><div className="moveFilesActions"><span className="moveActionText">I like to </span><button className="fireMountainButton moveFilesButton" type="button" disabled={!moveQueue.length || !transferDestinations.length} onClick={() => void sendQueuedFiles("copy")}>Copy 'em</button><span className="moveActionText"> / </span><button className="fireMountainButton moveFilesButton cutPasteButton" type="button" disabled={!moveQueue.length || !transferDestinations.some(destination => destination.storage === "physical")} onClick={() => void sendQueuedFiles("move")}>Cut 'em</button><span className="moveActionText"> to {transferDestinations.length === 1 ? transferDestinations[0].name : transferDestinations.length > 1 ? `${transferDestinations.length} destinations` : "the selected folder"}</span>{moveQueue.length > 0 && <button className="fireMountainClearButton" type="button" onClick={() => setMoveQueue([])}>Clear list</button>}</div></section><FireMountain /></section>
        <aside className="folderInspector">
            <div className="folderInspectorTitle"><FolderOpen size={20}/><div><strong>{openedFolders.length > 1 ? `${openedFolders.length} folders open` : primaryOpened?.name ?? "No folder open"}</strong><small>{openedFolders.length > 1 ? openedFolders.map(folder => folder.name).join(" · ") : primaryOpened?.path || "Open a folder from the table"}</small></div></div>
            <div className="folderSearch"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {if (event.key === "Enter") void search();}} placeholder={effectiveAiSearchEnabled ? "Describe a file or its contents" : openedFolders.length > 1 ? "Search open folders" : "Search this folder"} disabled={!openedFolders.length}/>{aiEnabled && <button type="button" className={effectiveAiSearchEnabled ? "folderAiSearchToggle enabled" : "folderAiSearchToggle"} onClick={() => setAiSearchEnabled(current => !current)} title={effectiveAiSearchEnabled ? "AI Search Assistant is on" : "Turn on AI Search Assistant"} aria-pressed={effectiveAiSearchEnabled}><Sparkles size={14}/></button>}<button type="button" onClick={() => void search()} disabled={!openedFolders.length || !query.trim()} title={effectiveAiSearchEnabled ? "Search with AI assistance" : "Search files"}><Search size={17}/></button><button type="button" title="Clear search" onClick={() => { setQuery(""); setResults([]); setHasSearched(false); clearFileSelection(); }}>x</button></div><div className="inspectorSelectionActions"><button type="button" disabled={!selectedPaths.length} onClick={clearFileSelection}>Deselect all</button><button type="button" disabled={!selectedPaths.length} onClick={() => void openPaths(selectedPaths)}>Open files</button><button type="button" disabled={!results.length} onClick={() => { setResults([]); clearFileSelection(); }}>Clear all</button></div>
            {hasSearched && <><section className={results.length ? "inspectorList foundFilesPanel" : "inspectorList foundFilesPanel emptyResults"} style={results.length ? {height: foundFilesHeight} : undefined}><h3>Found files</h3>{results.length ? results.map(file => renderFile(file, `result-${file.path}`)) : <p>No search results.</p>}</section><button type="button" className={results.length ? "inspectorListsResizer" : "inspectorListsResizer disabled"} onPointerDown={startFoundFilesResize} title="Drag to resize file lists" aria-label="Resize Found files and Folder files" disabled={!results.length}><GripHorizontal size={14}/></button></>}
            <section className="inspectorList folderFiles">
                <h3>Folder files<select className="folderFilesFormatSelect" aria-label="Filter open folder files by format" value={fileFormat} onChange={event => setFileFormat(event.target.value)}><option value="all">All formats ({fileTypeCounts.reduce((sum, [, count]) => sum + count, 0)})</option>{fileTypeCounts.map(([type, count]) => <option key={type} value={type}>{type.toUpperCase()} ({count})</option>)}</select></h3>
                {openedFolders.length ? openedFolders.map(folder => {
                    const key = folderContentKey(folder);
                    const contents = folderContents[key];
                    const isLoading = loadingDirectories.has(key);
                    const readFileCount = readFileCounts.get(folder.id) ?? null;
                    return <div className="folderTreeRoot" key={folder.id}>
                        <h4><FolderOpen size={15}/>{folder.name}{readFileCount !== null && <small className="folderFileCount" title="Files read in this folder">{readFileCount} files</small>}</h4>
                        {isLoading && !contents ? <p>Loading folder...</p> : null}
                        {!isLoading && !contents ? <p>{message || "Unable to load this folder."}</p> : null}
                        {contents?.files.map(file => renderFile(file, `root-${folder.id}-${file.path}`))}
                        {contents?.folders.map(directory => renderDirectory(directory, 1))}
                        {contents && !contents.files.length && !contents.folders.length ? <p>This folder is empty.</p> : null}
                    </div>;
                }) : <p>{message}</p>}
            </section>
        </aside>
    </main>;
}
