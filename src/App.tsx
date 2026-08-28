import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {ChevronLeft, ChevronRight, GripHorizontal, Home, Plus, RotateCcw} from "lucide-react";
import {AccountMenu, type FolderRocketUser} from "./components/AuthGate";
import {API_BASE_URL} from "./api";
import "./App.css";
import FileDropZone from "./components/FileDropZone";
import FolderManagement, { type ManagedFolder, type VirtualFile } from "./components/FolderManagement";
import GmailSourcePanel from "./components/GmailSourcePanel";
import OutlookSourcePanel from "./components/OutlookSourcePanel";
import {type DashboardSourceBlockData, type DashboardSourceType} from "./components/DashboardSourceBlock";
import DashboardSourceColumn from "./components/DashboardSourceColumn";
import DomainSourcePanel from "./components/DomainSourcePanel";
import ScreenCaptureSourcePanel from "./components/ScreenCaptureSourcePanel";
import GoogleCalendarSourcePanel from "./components/GoogleCalendarSourcePanel";
import UsbSourcePanel, {type UsbDrive} from "./components/UsbSourcePanel";
import SearchSourcePanel from "./components/SearchSourcePanel";
import ProcessingWorkspace from "./components/ProcessingWorkspace";
import CargoShip from "./components/CargoShip";
import IntegrationSetup from "./components/IntegrationSetup";
import StickyNotes from "./components/StickyNotes";
import folderRocketWordmark from "./assets/folderrocket-wordmark.png";

type Folder = ManagedFolder;
interface DashboardWidths { left: number; center: number; right: number; }
const DASHBOARD_WIDTHS_KEY = "folderrocket-dashboard-widths";
const FOLDERS_KEY = "folderrocket-folders";
const SEARCH_FOLDER_SELECTION_KEY = "folderrocket-search-folder-selection";
const SOURCE_BLOCKS_KEY = "folderrocket-source-blocks";
const RIGHT_SOURCE_BLOCKS_KEY = "folderrocket-right-source-blocks";
const DASHBOARD_HEIGHT_KEY = "folderrocket-dashboard-height";
const AI_MODE_KEY = "folderrocket-ai-mode";
const APP_ZOOM_KEY = "folderrocket-app-zoom";
const FLOATING_TOOLS_SCALE_KEY = "folderrocket-floating-tools-scale";
const FLOATING_BOOKMARK_SCALE_KEY = "folderrocket-floating-bookmark-scale";
const MIN_DASHBOARD_HEIGHT = 440;
const MAX_DASHBOARD_HEIGHT = 1400;

function getMinimumDashboardHeight() {
    return typeof window === "undefined"
        ? MIN_DASHBOARD_HEIGHT
        : Math.max(MIN_DASHBOARD_HEIGHT, window.innerHeight - 135);
}

function createDefaultSourceBlocks(): DashboardSourceBlockData[] {
    return [
        {id: crypto.randomUUID(), type: "gmail", height: 410},
        {id: crypto.randomUUID(), type: "outlook", height: 410}
    ];
}

function createDefaultRightSourceBlocks(): DashboardSourceBlockData[] {
    return [{id: crypto.randomUUID(), type: "search", height: 108}];
}

function normalizeSourceBlocks(value: unknown): DashboardSourceBlockData[] | null {
    if (!Array.isArray(value)) return null;
    const blocks = value.filter((block): block is DashboardSourceBlockData => block
        && typeof block.id === "string"
        && ["gmail", "outlook", "calendar", "usb", "domain", "screen", "search"].includes(block.type)
        && Number.isFinite(block.height));
    return blocks.map(block => {
        // Earlier Search + Fire defaults were intentionally tall. Migrate only
        // those old defaults; a user-resized height remains untouched.
        const legacySearchDefault = block.type === "search" && (block.height === 210 || block.height === 280 || block.height === 640);
        const minimumHeight = block.type === "search" ? 108 : 210;
        return {...block, height: legacySearchDefault ? 108 : Math.min(1100, Math.max(minimumHeight, block.height))};
    });
}

function readSourceBlocks(storageKey: string, fallback: () => DashboardSourceBlockData[] = createDefaultSourceBlocks): DashboardSourceBlockData[] {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        return normalizeSourceBlocks(saved) ?? fallback();
    } catch { return fallback(); }
}

function createDefaultFolders(workspacePath: string, isAdmin: boolean): Folder[] {
    if (!isAdmin) return [{id: crypto.randomUUID(), name: "My workspace", path: workspacePath, description: "Private FolderRocket workspace"}];
    return [
        {id: crypto.randomUUID(), name: "Folder 1", path: "", description: ""},
        {id: crypto.randomUUID(), name: "Folder 2", path: "", description: ""}
    ];
}

function readFolders(storageKey: string, workspacePath: string, isAdmin: boolean): Folder[] {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (!Array.isArray(saved) || !saved.every(folder => folder && typeof folder.id === "string" && typeof folder.name === "string")) {
            return createDefaultFolders(workspacePath, isAdmin);
        }
        return saved as Folder[];
    } catch {
        return createDefaultFolders(workspacePath, isAdmin);
    }
}

function readDashboardWidths(storageKey: string): DashboardWidths | null {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as DashboardWidths | null;
        return saved && [saved.left, saved.center, saved.right].every(value => Number.isFinite(value) && value >= 240) ? saved : null;
    } catch { return null; }
}

function readDashboardHeight(storageKey: string): number | null {
    try {
        const saved = Number(localStorage.getItem(storageKey));
        return Number.isFinite(saved) && saved >= MIN_DASHBOARD_HEIGHT
            ? Math.min(MAX_DASHBOARD_HEIGHT, saved)
            : null;
    } catch { return null; }
}

function readSearchFolderSelection(storageKey: string): string[] {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
    } catch { return []; }
}

function readFloatingToolsScale(storageKey: string): number {
    try {
        const value = Number(localStorage.getItem(storageKey));
        return Number.isFinite(value) && value >= .8 && value <= 1.3 ? value : 1;
    } catch { return 1; }
}

function readAppZoom(storageKey: string): number {
    try {
        const value = Number(localStorage.getItem(storageKey));
        return Number.isFinite(value) && value >= .75 && value <= 1.5 ? value : 1;
    } catch { return 1; }
}

function App({user, onLogout}: {user: FolderRocketUser; onLogout: () => Promise<void>}) {
    const foldersStorageKey = `${FOLDERS_KEY}-${user.id}`;
    const widthsStorageKey = `${DASHBOARD_WIDTHS_KEY}-${user.id}`;
    const heightStorageKey = `${DASHBOARD_HEIGHT_KEY}-${user.id}`;
    const searchStorageKey = `${SEARCH_FOLDER_SELECTION_KEY}-${user.id}`;
    const sourceBlocksStorageKey = `${SOURCE_BLOCKS_KEY}-${user.id}`;
    const rightSourceBlocksStorageKey = `${RIGHT_SOURCE_BLOCKS_KEY}-${user.id}`;
    const appZoomStorageKey = `${APP_ZOOM_KEY}-${user.id}`;
    const floatingToolsScaleStorageKey = `${FLOATING_TOOLS_SCALE_KEY}-${user.id}`;
    const floatingBookmarkScaleStorageKey = `${FLOATING_BOOKMARK_SCALE_KEY}-${user.id}`;
    const isCargoShipWindow = new URLSearchParams(window.location.search).has("folderrocketCargoShip");
    const [page, setPage] = useState<"dashboard" | "folders" | "processing">("dashboard");
    const [folders, setFolders] = useState<Folder[]>(() => readFolders(foldersStorageKey, user.workspacePath, user.role === "admin"));
    const [dashboardWidths, setDashboardWidths] = useState<DashboardWidths | null>(() => readDashboardWidths(widthsStorageKey));
    const [dashboardHeight, setDashboardHeight] = useState<number | null>(() => readDashboardHeight(heightStorageKey));
    const [searchFolderIds, setSearchFolderIds] = useState<string[]>(() => readSearchFolderSelection(searchStorageKey));
    const [sourceBlocks, setSourceBlocks] = useState<DashboardSourceBlockData[]>(() => readSourceBlocks(sourceBlocksStorageKey));
    const [rightSourceBlocks, setRightSourceBlocks] = useState<DashboardSourceBlockData[]>(() => readSourceBlocks(rightSourceBlocksStorageKey, createDefaultRightSourceBlocks));
    const [preferencesReady, setPreferencesReady] = useState(false);
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [aiConfigured, setAiConfigured] = useState(false);
    const [aiMode, setAiMode] = useState(() => localStorage.getItem(`${AI_MODE_KEY}-${user.id}`) === "on");
    const [navigation, setNavigation] = useState({canGoBack: false, canGoForward: false});
    const [appZoom, setAppZoom] = useState(() => readAppZoom(appZoomStorageKey));
    const [floatingToolsScale, setFloatingToolsScale] = useState(() => readFloatingToolsScale(floatingToolsScaleStorageKey));
    const [floatingBookmarkScale, setFloatingBookmarkScale] = useState(() => readFloatingToolsScale(floatingBookmarkScaleStorageKey));
    const [noteAddRequest, setNoteAddRequest] = useState(0);
    const [aiNoteAddRequest, setAiNoteAddRequest] = useState(0);
    const initialAppZoomRef = useRef(appZoom);
    const dashboardRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        let active = true;
        if (user.role !== "admin") { queueMicrotask(() => { if (active) setAiConfigured(false); }); return () => { active = false; }; }
        void fetch(`${API_BASE_URL}/desktop/integrations/status`, {credentials: "include"})
            .then(response => response.ok ? response.json() : {aiConfigured: false})
            .then((data: {aiConfigured?: boolean}) => { if (active) setAiConfigured(Boolean(data.aiConfigured)); })
            .catch(() => { if (active) setAiConfigured(false); });
        return () => { active = false; };
    }, [user.id, user.role]);
    useEffect(() => { localStorage.setItem(`${AI_MODE_KEY}-${user.id}`, aiMode ? "on" : "off"); }, [aiMode, user.id]);
    useEffect(() => { localStorage.setItem(appZoomStorageKey, String(appZoom)); }, [appZoom, appZoomStorageKey]);
    useEffect(() => { localStorage.setItem(floatingToolsScaleStorageKey, String(floatingToolsScale)); }, [floatingToolsScale, floatingToolsScaleStorageKey]);
    useEffect(() => { localStorage.setItem(floatingBookmarkScaleStorageKey, String(floatingBookmarkScale)); }, [floatingBookmarkScale, floatingBookmarkScaleStorageKey]);
    const aiEnabled = aiConfigured && aiMode;

    useEffect(() => {
        let active = true;
        const updateNavigation = () => {
            if (window.folderRocketDesktop) {
                void window.folderRocketDesktop.navigationState().then(state => { if (active) setNavigation(state); });
                return;
            }
            setNavigation({canGoBack: window.history.length > 1, canGoForward: false});
        };
        updateNavigation();
        const unsubscribe = window.folderRocketDesktop?.onNavigationChanged(updateNavigation);
        window.addEventListener("popstate", updateNavigation);
        window.addEventListener("focus", updateNavigation);
        return () => { active = false; unsubscribe?.(); window.removeEventListener("popstate", updateNavigation); window.removeEventListener("focus", updateNavigation); };
    }, []);

    useEffect(() => {
        if (!window.folderRocketDesktop || isCargoShipWindow) return;
        let active = true;
        void window.folderRocketDesktop.setZoomFactor(initialAppZoomRef.current).then(value => { if (active) setAppZoom(Math.max(.75, Math.min(1.5, value))); });
        const unsubscribe = window.folderRocketDesktop.onZoomChanged(value => { if (active) setAppZoom(Math.max(.75, Math.min(1.5, value))); });
        return () => { active = false; unsubscribe(); };
    }, [isCargoShipWindow]);

    function setDesktopZoom(next: number) {
        const zoom = Math.max(.75, Math.min(1.5, Math.round(next * 100) / 100));
        if (!window.folderRocketDesktop) { setAppZoom(zoom); return; }
        void window.folderRocketDesktop.setZoomFactor(zoom).then(setAppZoom);
    }

    function navigateHistory(direction: "back" | "forward") {
        if (window.folderRocketDesktop) {
            void window.folderRocketDesktop.navigateHistory(direction).then(() => window.setTimeout(() => void window.folderRocketDesktop?.navigationState().then(setNavigation), 60));
            return;
        }
        if (direction === "back") window.history.back();
        else window.history.forward();
    }

    useEffect(() => {
        let active = true;
        fetch(`${API_BASE_URL}/settings/dashboard`, {credentials: "include"})
            .then(response => response.ok ? response.json() : {settings: null})
            .then((data: {settings?: {folders?: Folder[]; dashboardWidths?: DashboardWidths | null; dashboardHeight?: number | null; searchFolderIds?: string[]; sourceBlocks?: DashboardSourceBlockData[]; rightSourceBlocks?: DashboardSourceBlockData[] } | null}) => {
                if (!active || !data.settings) return;
                const settings = data.settings;
                if (Array.isArray(settings.folders) && settings.folders.every(folder => folder && typeof folder.id === "string" && typeof folder.name === "string")) setFolders(settings.folders);
                if (settings.dashboardWidths === null || (settings.dashboardWidths && [settings.dashboardWidths.left, settings.dashboardWidths.center, settings.dashboardWidths.right].every(value => Number.isFinite(value) && value >= 240))) setDashboardWidths(settings.dashboardWidths ?? null);
                if (settings.dashboardHeight === null || (Number.isFinite(settings.dashboardHeight) && Number(settings.dashboardHeight) >= MIN_DASHBOARD_HEIGHT)) setDashboardHeight(settings.dashboardHeight === null ? null : Math.min(MAX_DASHBOARD_HEIGHT, Number(settings.dashboardHeight)));
                if (Array.isArray(settings.searchFolderIds)) setSearchFolderIds(settings.searchFolderIds.filter((id): id is string => typeof id === "string"));
                const leftBlocks = normalizeSourceBlocks(settings.sourceBlocks);
                if (leftBlocks) setSourceBlocks(leftBlocks);
                const rightBlocks = normalizeSourceBlocks(settings.rightSourceBlocks);
                if (rightBlocks) setRightSourceBlocks(rightBlocks);
            })
            .finally(() => { if (active) setPreferencesReady(true); });
        return () => { active = false; };
    }, [user.id]);

    useEffect(() => {
        if (!preferencesReady) return;
        if (dashboardWidths) localStorage.setItem(widthsStorageKey, JSON.stringify(dashboardWidths));
        else localStorage.removeItem(widthsStorageKey);
    }, [dashboardWidths, preferencesReady, widthsStorageKey]);
    useEffect(() => {
        if (!preferencesReady) return;
        if (dashboardHeight) localStorage.setItem(heightStorageKey, String(dashboardHeight));
        else localStorage.removeItem(heightStorageKey);
    }, [dashboardHeight, heightStorageKey, preferencesReady]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(foldersStorageKey, JSON.stringify(folders)); }, [folders, foldersStorageKey, preferencesReady]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(searchStorageKey, JSON.stringify(searchFolderIds)); }, [searchFolderIds, searchStorageKey, preferencesReady]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(sourceBlocksStorageKey, JSON.stringify(sourceBlocks)); }, [preferencesReady, sourceBlocks, sourceBlocksStorageKey]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(rightSourceBlocksStorageKey, JSON.stringify(rightSourceBlocks)); }, [preferencesReady, rightSourceBlocks, rightSourceBlocksStorageKey]);
    useEffect(() => {
        if (!preferencesReady) return;
        const timer = window.setTimeout(() => {
            void fetch(`${API_BASE_URL}/settings/dashboard`, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({settings: {folders, dashboardWidths, dashboardHeight, searchFolderIds, sourceBlocks, rightSourceBlocks}})
            });
        }, 350);
        return () => window.clearTimeout(timer);
    }, [dashboardHeight, dashboardWidths, folders, preferencesReady, rightSourceBlocks, searchFolderIds, sourceBlocks]);

    function addFolder() { setFolders(current => [...current, {id: crypto.randomUUID(), name: `Folder ${current.length + 1}`, path: "", description: ""}]); }
    function useUsbDriveAsFolder(drive: UsbDrive) {
        const normalizedPath = drive.path.trim().toLowerCase();
        setFolders(current => {
            if (current.some(folder => folder.path.trim().toLowerCase() === normalizedPath)) return current;
            const label = drive.label?.trim() || drive.id;
            return [...current, {
                id: crypto.randomUUID(),
                name: `USB · ${label}`,
                path: drive.path,
                description: "Connected removable USB drive",
                storage: "physical"
            }];
        });
    }
    function updateFolder(id: string, change: Partial<Folder>) { setFolders(current => current.map(folder => folder.id === id ? {...folder, ...change} : folder)); }
    function deleteFolder(id: string) { setFolders(current => current.filter(folder => folder.id !== id)); }
    function moveFolder(sourceId: string, targetId: string, placement: "before" | "after" = "before") {
        if (sourceId === targetId) return;
        setFolders(current => {
            const sourceIndex = current.findIndex(folder => folder.id === sourceId);
            const targetIndex = current.findIndex(folder => folder.id === targetId);
            if (sourceIndex < 0 || targetIndex < 0) return current;
            const reordered = [...current];
            const [moved] = reordered.splice(sourceIndex, 1);
            const remainingTargetIndex = reordered.findIndex(folder => folder.id === targetId);
            reordered.splice(remainingTargetIndex + (placement === "after" ? 1 : 0), 0, moved);
            return reordered;
        });
    }
    function startColumnResize(divider: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
        const dashboard = dashboardRef.current;
        if (!dashboard) return;
        const left = dashboard.querySelector<HTMLElement>(".sourcesColumn")?.getBoundingClientRect().width ?? 300;
        const center = dashboard.querySelector<HTMLElement>(".foldersColumn")?.getBoundingClientRect().width ?? 320;
        const right = dashboard.querySelector<HTMLElement>(".rightSourcesColumn")?.getBoundingClientRect().width ?? 320;
        const startX = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => {
            const delta = moveEvent.clientX - startX;
            if (divider === "left") {
                const transfer = Math.min(Math.max(delta, -(left - 240)), center - 240);
                setDashboardWidths({left: left + transfer, center: center - transfer, right});
            }
            else {
                const transfer = Math.min(Math.max(delta, -(center - 240)), right - 240);
                setDashboardWidths({left, center: center + transfer, right: right - transfer});
            }
        };
        const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
    }
    function startDashboardHeightResize(event: ReactPointerEvent<HTMLButtonElement>) {
        const dashboard = dashboardRef.current;
        if (!dashboard) return;
        const startY = event.clientY;
        const startHeight = dashboard.getBoundingClientRect().height;
        event.currentTarget.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => setDashboardHeight(Math.min(MAX_DASHBOARD_HEIGHT, Math.max(getMinimumDashboardHeight(), startHeight + moveEvent.clientY - startY)));
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    }
    function resetDashboardLayout() { setDashboardWidths(null); setDashboardHeight(null); }
    function updateColumnBlocks(column: "left" | "right", update: (current: DashboardSourceBlockData[]) => DashboardSourceBlockData[]) {
        if (column === "left") setSourceBlocks(update);
        else setRightSourceBlocks(update);
    }
    function addSourceBlock(column: "left" | "right", type: DashboardSourceType) {
        updateColumnBlocks(column, current => [...current, {id: crypto.randomUUID(), type, height: type === "search" ? 108 : 210}]);
    }
    function deleteSourceBlock(column: "left" | "right", id: string) { updateColumnBlocks(column, current => current.filter(block => block.id !== id)); }
    function moveSourceBlock(column: "left" | "right", id: string, direction: "up" | "down") {
        updateColumnBlocks(column, current => {
            const index = current.findIndex(block => block.id === id);
            const targetIndex = index + (direction === "up" ? -1 : 1);
            if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;
            const next = [...current];
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    }
    function updateSourceBlock(column: "left" | "right", id: string, change: Partial<DashboardSourceBlockData>) { updateColumnBlocks(column, current => current.map(block => block.id === id ? {...block, ...change} : block)); }
    function toggleSearchFolder(id: string) { setSearchFolderIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
    function toggleAllSearchFolders() {
        const availableIds = folders.filter(folder => Boolean(folder.path)).map(folder => folder.id);
        setSearchFolderIds(current => current.some(id => availableIds.includes(id)) ? [] : availableIds);
    }
    function renderSourceBlock(column: "left" | "right", block: DashboardSourceBlockData) {
        if (block.type === "gmail") return <GmailSourcePanel storageScope={`${user.id}-${block.id}`} alertBlockId={block.id} aiEnabled={aiEnabled} />;
        if (block.type === "outlook") return <OutlookSourcePanel storageScope={`${user.id}-${block.id}`} alertBlockId={block.id} aiEnabled={aiEnabled} />;
        if (block.type === "calendar") return <GoogleCalendarSourcePanel alertBlockId={block.id} weekStart={block.calendarWeekStart} onWeekStartChange={calendarWeekStart => updateSourceBlock(column, block.id, {calendarWeekStart})} />;
        if (block.type === "usb") return <UsbSourcePanel onUseDrive={useUsbDriveAsFolder} />;
        if (block.type === "domain") return <DomainSourcePanel url={block.url} onUrlChange={url => updateSourceBlock(column, block.id, {url})} aiEnabled={aiEnabled} />;
        if (block.type === "screen") return <ScreenCaptureSourcePanel crop={block.crop} onCropChange={crop => updateSourceBlock(column, block.id, {crop})} aiEnabled={aiEnabled} />;
        return <SearchSourcePanel aiEnabled={aiEnabled} folders={folders.filter(folder => Boolean(folder.path) && searchFolderIds.includes(folder.id)).map(folder => ({name: folder.name, path: folder.path}))} selectedFolderCount={folders.filter(folder => Boolean(folder.path) && searchFolderIds.includes(folder.id)).length} onToggleFolders={toggleAllSearchFolders} onResultsChange={hasResults => { if (!hasResults) updateColumnBlocks(column, current => current.map(item => item.id === block.id && item.height !== 108 ? {...item, height: 108} : item)); }} />;
    }
    const dashboardStyle = (dashboardWidths || dashboardHeight) ? {
        ...(dashboardWidths ? {"--dashboard-left": `${dashboardWidths.left}px`, "--dashboard-center": `${dashboardWidths.center}px`, "--dashboard-right": `${dashboardWidths.right}px`} : {}),
        ...(dashboardHeight ? {"--dashboard-height": `${dashboardHeight}px`} : {})
    } as CSSProperties : undefined;

    useEffect(() => {
        const openFileStudio = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.data?.type !== "folderrocket-open-file-studio") return;
            setPage("processing");
        };
        window.addEventListener("message", openFileStudio);
        return () => window.removeEventListener("message", openFileStudio);
    }, []);

    const cargoShipProps = {
        onOpenFileStudio: () => setPage("processing"),
        aiEnabled,
        storageScope: user.id,
        folders,
        onVirtualFilesAdd: (folderId: string, files: VirtualFile[]) => updateFolder(folderId, {virtualFiles: [...(folders.find(folder => folder.id === folderId)?.virtualFiles ?? []), ...files.filter(file => !(folders.find(folder => folder.id === folderId)?.virtualFiles ?? []).some(existing => existing.path === file.path))]})
    };
    if (isCargoShipWindow) return <CargoShip {...cargoShipProps} standalone />;
    return <div className="app">
        <header className="appHeader">
            <img className="appLogo" src={folderRocketWordmark} alt="FolderRocket" />
            <nav className="appNavigation">
                {aiEnabled && <button type="button" className="notesAiQuickAdd" onClick={() => setAiNoteAddRequest(current => current + 1)} title="Create an AI post-it" aria-label="Create an AI post-it"><span>AI</span></button>}
                <button type="button" className={aiEnabled ? "notesQuickAdd withAi" : "notesQuickAdd"} onClick={() => setNoteAddRequest(current => current + 1)} title="Add a post-it" aria-label="Add a post-it"><Plus size={19}/></button>
                <button className={page === "dashboard" ? "active" : ""} type="button" onClick={() => setPage("dashboard")}>Dashboard</button>
                <button className={page === "folders" ? "active" : ""} type="button" onClick={() => setPage("folders")}>Folder management</button>
                <button className={page === "processing" ? "active" : ""} type="button" onClick={() => setPage("processing")}>File Studio</button>
                {page === "dashboard" && <button type="button" className="dashboardResetButton" onClick={resetDashboardLayout} title="Restore default dashboard size" aria-label="Restore default dashboard size"><RotateCcw size={14} /></button>}
            </nav>
            <div className="appHeaderTools"><IntegrationSetup isAdmin={user.role === "admin"} onAIStatusChange={setAiConfigured} aiMode={aiMode} onAIModeChange={setAiMode} /><CargoShip {...cargoShipProps} /><AccountMenu user={user} onLogout={onLogout} appZoom={appZoom} onAppZoomChange={setDesktopZoom} floatingToolsScale={floatingToolsScale} onFloatingToolsScaleChange={setFloatingToolsScale} bookmarkScale={floatingBookmarkScale} onBookmarkScaleChange={setFloatingBookmarkScale} /></div>
        </header>
        <StickyNotes key={user.id} storageScope={user.id} folders={folders} aiEnabled={aiEnabled} floatingScale={floatingToolsScale} bookmarkScale={floatingBookmarkScale} addRequest={noteAddRequest} aiAddRequest={aiNoteAddRequest} /><div className="pageFrame"><main ref={dashboardRef} style={dashboardStyle} className={page === "dashboard" ? "dashboard" : "dashboard pageHidden"}>
            <DashboardSourceColumn className="sourcesColumn" title="Sources" blocks={sourceBlocks} onAdd={type => addSourceBlock("left", type)} onDelete={id => deleteSourceBlock("left", id)} onMove={(id, direction) => moveSourceBlock("left", id, direction)} onResize={(id, height) => updateSourceBlock("left", id, {height})} renderBlock={block => renderSourceBlock("left", block)} />
            <div className="dashboardResizer" role="separator" aria-label="Ridimensiona colonne sinistra e centrale" onPointerDown={event => startColumnResize("left", event)} />
            <section className="dashboardColumn foldersColumn"><div className="foldersContainer">{folders.map(folder => <div className={draggedFolderId === folder.id ? "folderOrderItem draggingFolder" : "folderOrderItem"} draggable onDragStart={event => { if (event.target !== event.currentTarget) return; setDraggedFolderId(folder.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-folderrocket-folder-order", folder.id); }} onDragOver={event => { if (event.dataTransfer.types.includes("application/x-folderrocket-folder-order")) event.preventDefault(); }} onDrop={event => { const sourceId = event.dataTransfer.getData("application/x-folderrocket-folder-order"); if (sourceId) { event.preventDefault(); event.stopPropagation(); moveFolder(sourceId, folder.id); } setDraggedFolderId(null); }} onDragEnd={() => setDraggedFolderId(null)} key={folder.id}><FileDropZone id={folder.id} name={folder.name} pathValue={folder.path} hidePath imaginary={folder.storage === "imaginary"} selected={Boolean(folder.path) && searchFolderIds.includes(folder.id)} onClick={event => { if (folder.path && event.target === event.currentTarget) toggleSearchFolder(folder.id); }} sourceFolderPaths={folders.filter(item => item.storage !== "imaginary" && Boolean(item.path)).map(item => item.path)} storageScope={user.id} aiEnabled={aiEnabled} onVirtualFilesAdd={items => updateFolder(folder.id, {virtualFiles: [...(folder.virtualFiles ?? []), ...items.filter(item => !(folder.virtualFiles ?? []).some(file => file.path === item.path))]})} onPathChange={path => updateFolder(folder.id, {path, storage: "physical"})} /></div>)}</div></section>
            <div className="dashboardResizer" role="separator" aria-label="Resize center and right columns" onPointerDown={event => startColumnResize("right", event)} />
            <DashboardSourceColumn className="rightSourcesColumn" title="Sources" blocks={rightSourceBlocks} onAdd={type => addSourceBlock("right", type)} onDelete={id => deleteSourceBlock("right", id)} onMove={(id, direction) => moveSourceBlock("right", id, direction)} onResize={(id, height) => updateSourceBlock("right", id, {height})} renderBlock={block => renderSourceBlock("right", block)} />
            <button type="button" className="dashboardHeightResizer" onPointerDown={startDashboardHeightResize} title="Drag to set dashboard height" aria-label="Set dashboard height"><GripHorizontal size={15} /></button>
        </main><div className={page === "folders" ? "folderPage" : "folderPage pageHidden"}><FolderManagement folders={folders} onAdd={addFolder} onUpdate={updateFolder} onDelete={deleteFolder} onReorder={moveFolder} aiEnabled={aiEnabled} /></div><div className={page === "processing" ? "processingView" : "processingView pageHidden"}><ProcessingWorkspace folders={folders} onUpdate={updateFolder} /></div></div><nav className="navigationHistory" aria-label="Navigation history"><button type="button" onClick={() => navigateHistory("back")} title="Back" disabled={!navigation.canGoBack}><ChevronLeft size={16} /></button><button type="button" onClick={() => setPage("dashboard")} title="Home"><Home size={15} /></button><button type="button" onClick={() => navigateHistory("forward")} title="Forward" disabled={!navigation.canGoForward}><ChevronRight size={16} /></button></nav>
    </div>;
}

export default App;
