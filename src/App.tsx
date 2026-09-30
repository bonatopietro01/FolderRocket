import {lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode} from "react";
import {BriefcaseBusiness, FolderCog, GripHorizontal, LayoutDashboard, Orbit, Plus, Rocket, RotateCcw, Shapes, WandSparkles} from "lucide-react";
import {AccountMenu, type FolderRocketUser} from "./components/AuthGate";
import {API_BASE_URL} from "./api";
import "./App.css";
import FileDropZone from "./components/FileDropZone";
import FolderAppearanceStyles from "./components/FolderAppearanceStyles";
import {folderProjectGroups, folderProjectKey} from "./folderProjects";
import type {ManagedFolder, VirtualFile} from "./components/FolderManagement";
import {watchFolderDragHover} from "./folderDragHover";
import GmailSourcePanel from "./components/GmailSourcePanel";
import OutlookSourcePanel from "./components/OutlookSourcePanel";
import {type DashboardSourceBlockData, type DashboardSourceType} from "./components/DashboardSourceBlock";
import DashboardSourceColumn from "./components/DashboardSourceColumn";
import type {UsbDrive} from "./components/UsbSourcePanel";
import {useUsbDrives} from "./useUsbDrives";
import {isWithinUsbPath, normalizedUsbPath, removeDisconnectedUsbFolders} from "./usbFolders";
import SearchSourcePanel from "./components/SearchSourcePanel";
import CargoShip from "./components/CargoShip";
import StickyNotes from "./components/StickyNotes";
import folderRocketWordmark from "./assets/folderrocket-wordmark.png";
import {listenForDailyActivities,recordDailyActivity} from "./dailyActivity";
import DailyAgendaRail from "./components/DailyAgendaRail";
import ChangeWorld, {Planet as WorldPlanet} from "./components/ChangeWorld";
import DiagnosticsCenter from "./components/DiagnosticsCenter";
import {captureDiagnostic, setDiagnosticWorld} from "./diagnostics";
import {activeWorldStorageScope, loadWorkspaceWorldState, worldsStorageKey, type WorldAssistantCapability, type WorldAssistantModel, type WorkspaceWorld} from "./worlds";

const DomainSourcePanel = lazy(() => import("./components/DomainSourcePanel"));
const FolderManagement = lazy(() => import("./components/FolderManagement"));
const ProcessingWorkspace = lazy(() => import("./components/ProcessingWorkspace"));
const ScreenCaptureSourcePanel = lazy(() => import("./components/ScreenCaptureSourcePanel"));
const GoogleCalendarSourcePanel = lazy(() => import("./components/GoogleCalendarSourcePanel"));
const RecentFilesSourcePanel = lazy(() => import("./components/RecentFilesSourcePanel"));
const PhoneSourcePanel = lazy(() => import("./components/PhoneSourcePanel"));
const UsbSourcePanel = lazy(() => import("./components/UsbSourcePanel"));
const ApplicationsWorkspace = lazy(() => import("./components/ApplicationsWorkspace"));
const DashboardFolderBrowser = lazy(() => import("./components/DashboardFolderBrowser"));
const DailyJob = lazy(() => import("./components/DailyJob"));
const TeamsSourcePanel = lazy(() => import("./components/TeamsSourcePanel"));

type Folder = ManagedFolder;
interface DashboardWidths { left: number; center: number; right: number; }
const DASHBOARD_WIDTHS_KEY = "folderrocket-dashboard-widths";
const FOLDERS_KEY = "folderrocket-folders";
const SEARCH_FOLDER_SELECTION_KEY = "folderrocket-search-folder-selection";
const SOURCE_BLOCKS_KEY = "folderrocket-source-blocks";
const RIGHT_SOURCE_BLOCKS_KEY = "folderrocket-right-source-blocks";
const DASHBOARD_HEIGHT_KEY = "folderrocket-dashboard-height";
const DASHBOARD_LAYOUT_KEY = "folderrocket-dashboard-layout";
const AI_MODE_KEY = "folderrocket-ai-mode";
const APP_ZOOM_KEY = "folderrocket-app-zoom";
const FLOATING_TOOLS_SCALE_KEY = "folderrocket-floating-tools-scale";
const FLOATING_BOOKMARK_SCALE_KEY = "folderrocket-floating-bookmark-scale";
const FLOATING_BOOKMARK_WIDTH_KEY = "folderrocket-floating-bookmark-width";
const FLOATING_BOOKMARK_HEIGHT_KEY = "folderrocket-floating-bookmark-height";
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
        && ["gmail", "outlook", "teams", "calendar", "usb", "domain", "screen", "search", "recent", "phone"].includes(block.type)
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

function readBookmarkDimension(storageKey: string, fallback: number, minimum: number, maximum: number): number {
    try {
        const value = Number(localStorage.getItem(storageKey));
        return Number.isFinite(value) && value >= minimum && value <= maximum ? Math.round(value) : fallback;
    } catch { return fallback; }
}

function readAppZoom(storageKey: string): number {
    try {
        const value = Number(localStorage.getItem(storageKey));
        return Number.isFinite(value) && value >= .75 && value <= 1.5 ? value : .85;
    } catch { return .85; }
}

function migrateDefaultWorldZoom(userId: string, worlds: WorkspaceWorld[]) {
    const migrationKey = `folderrocket-default-zoom-85-v1-${userId}`;
    try {
        if (localStorage.getItem(migrationKey) === "done") return;
        for (const world of worlds) {
            const key = `${APP_ZOOM_KEY}-${activeWorldStorageScope(userId, world.id)}`;
            if (Number(localStorage.getItem(key)) === 1) localStorage.setItem(key, "0.85");
        }
        localStorage.setItem(migrationKey, "done");
    } catch { /* A storage restriction must not prevent FolderRocket from opening. */ }
}

function WorldWorkspace({user, onLogout, world, worldNames, onOpenWorlds, onWorldAiModeChange, settingsPreloaded}: {user: FolderRocketUser; onLogout: () => Promise<void>; world: WorkspaceWorld; worldNames: Record<string, string>; onOpenWorlds: () => void; onWorldAiModeChange: (enabled: boolean) => Promise<void>; settingsPreloaded: boolean}) {
    const workspaceScope = activeWorldStorageScope(user.id, world.id);
    const foldersStorageKey = `${FOLDERS_KEY}-${workspaceScope}`;
    const widthsStorageKey = `${DASHBOARD_WIDTHS_KEY}-${workspaceScope}`;
    const heightStorageKey = `${DASHBOARD_HEIGHT_KEY}-${workspaceScope}`;
    const searchStorageKey = `${SEARCH_FOLDER_SELECTION_KEY}-${workspaceScope}`;
    const sourceBlocksStorageKey = `${SOURCE_BLOCKS_KEY}-${workspaceScope}`;
    const rightSourceBlocksStorageKey = `${RIGHT_SOURCE_BLOCKS_KEY}-${workspaceScope}`;
    const appZoomStorageKey = `${APP_ZOOM_KEY}-${workspaceScope}`;
    const floatingToolsScaleStorageKey = `${FLOATING_TOOLS_SCALE_KEY}-${workspaceScope}`;
    const floatingBookmarkScaleStorageKey = `${FLOATING_BOOKMARK_SCALE_KEY}-${workspaceScope}`;
    const floatingBookmarkWidthStorageKey = `${FLOATING_BOOKMARK_WIDTH_KEY}-${workspaceScope}`;
    const floatingBookmarkHeightStorageKey = `${FLOATING_BOOKMARK_HEIGHT_KEY}-${workspaceScope}`;
    const dashboardSettingsUrl = `${API_BASE_URL}/settings/dashboard?worldId=${encodeURIComponent(world.id)}`;
    const settingsPreloadedRef = useRef(settingsPreloaded);
    const isCargoShipWindow = new URLSearchParams(window.location.search).has("folderrocketCargoShip");
    const [page, setPage] = useState<"dashboard" | "folders" | "processing" | "applications" | "daily">("dashboard");
    const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
    const [applicationChecking, setApplicationChecking] = useState(false);
    const [dashboardSaveError, setDashboardSaveError] = useState("");
    const [folderPathNotice, setFolderPathNotice] = useState("");
    const [folders, setFolders] = useState<Folder[]>(() => readFolders(foldersStorageKey, user.workspacePath, user.role === "admin"));

    const navigate=useCallback((next: "dashboard" | "folders" | "processing" | "applications" | "daily") => {
        if (next !== page && page === "applications" && applicationChecking && !window.confirm("A file check is still running. Leaving Applications will stop it, and you will need to press Continue checking when you return. Leave Applications?")) return;
        setPage(next);
    },[applicationChecking,page]);
    const [dashboardWidths, setDashboardWidths] = useState<DashboardWidths | null>(() => readDashboardWidths(widthsStorageKey));
    const [dashboardHeight, setDashboardHeight] = useState<number | null>(() => readDashboardHeight(heightStorageKey));
    const [dashboardLayout, setDashboardLayout] = useState<"three-column" | "folders-top">(() => localStorage.getItem(`${DASHBOARD_LAYOUT_KEY}-${workspaceScope}`) === "folders-top" ? "folders-top" : "three-column");
    const [searchFolderIds, setSearchFolderIds] = useState<string[]>(() => readSearchFolderSelection(searchStorageKey));
    const [sourceBlocks, setSourceBlocks] = useState<DashboardSourceBlockData[]>(() => readSourceBlocks(sourceBlocksStorageKey));
    const [rightSourceBlocks, setRightSourceBlocks] = useState<DashboardSourceBlockData[]>(() => readSourceBlocks(rightSourceBlocksStorageKey, createDefaultRightSourceBlocks));
    const [preferencesReady, setPreferencesReady] = useState(false);
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [aiConfigured, setAiConfigured] = useState(false);
    const [aiMode, setAiMode] = useState(() => localStorage.getItem(`${AI_MODE_KEY}-${workspaceScope}`) === "on");
    const [appZoom, setAppZoom] = useState(() => readAppZoom(appZoomStorageKey));
    const [floatingToolsScale, setFloatingToolsScale] = useState(() => readFloatingToolsScale(floatingToolsScaleStorageKey));
    const [floatingBookmarkScale, setFloatingBookmarkScale] = useState(() => readFloatingToolsScale(floatingBookmarkScaleStorageKey));
    const [floatingBookmarkWidth, setFloatingBookmarkWidth] = useState(() => readBookmarkDimension(floatingBookmarkWidthStorageKey, 96, 64, 220));
    const [floatingBookmarkHeight, setFloatingBookmarkHeight] = useState(() => readBookmarkDimension(floatingBookmarkHeightStorageKey, 29, 22, 72));
    const [noteAddRequest, setNoteAddRequest] = useState(0);
    const [aiNoteAddRequest, setAiNoteAddRequest] = useState(0);
    const [reminderAddRequest, setReminderAddRequest] = useState(0);
    const [dashboardBrowser, setDashboardBrowser] = useState<{path:string;name:string}|null>(null);
    const initialAppZoomRef = useRef(appZoom);
    const dashboardRef = useRef<HTMLElement | null>(null);
    const usbStatus = useUsbDrives(user.role === "admin" && preferencesReady && !isCargoShipWindow);

    useEffect(() => {
        const syncAiMode = (event: StorageEvent) => {
            if (event.key === `${AI_MODE_KEY}-${workspaceScope}`) setAiMode(event.newValue === "on");
        };
        const syncSelectedWorldAiMode = (event: Event) => {
            const detail = (event as CustomEvent<{worldId?: string; enabled?: boolean}>).detail;
            if (detail?.worldId === world.id) setAiMode(Boolean(detail.enabled));
        };
        window.addEventListener("storage", syncAiMode);
        window.addEventListener("folderrocket-world-ai-mode", syncSelectedWorldAiMode);
        return () => { window.removeEventListener("storage", syncAiMode); window.removeEventListener("folderrocket-world-ai-mode", syncSelectedWorldAiMode); };
    }, [workspaceScope, world.id]);

    useEffect(() => listenForDailyActivities(workspaceScope, () => {}), [workspaceScope]);
    useEffect(() => {
        const rememberCalendar = (event: Event) => {
            const detail=(event as CustomEvent<{storageScope?:string;blockId?:string;events?:unknown[]}>).detail;
            if(detail?.storageScope!==workspaceScope||!detail.blockId||!Array.isArray(detail.events))return;
            const key=`folderrocket-daily-calendars-${workspaceScope}`;
            let current:Record<string,unknown[]>={};try{current=JSON.parse(localStorage.getItem(key)||"{}");}catch{/* replace malformed cache */}
            localStorage.setItem(key,JSON.stringify({...current,[detail.blockId]:detail.events}));
        };
        window.addEventListener("folderrocket-calendar-context",rememberCalendar);
        return()=>window.removeEventListener("folderrocket-calendar-context",rememberCalendar);
    },[workspaceScope]);
    const previousUsbIds = useRef<string[]>([]);
    useEffect(() => {
        const drives = usbStatus.drives ?? [];
        for (const drive of drives.filter(item => !previousUsbIds.current.includes(item.id))) recordDailyActivity({kind:"usb",summary:`Connected USB drive ${drive.label || drive.id}`});
        previousUsbIds.current = drives.map(drive => drive.id);
    }, [usbStatus.drives]);
    useEffect(() => {
        const moved = (event: Event) => {
            const detail=(event as CustomEvent<{moved?:Array<{name?:string}>;destination?:string;source?:string;undo?:import("./dailyActivity").DailyActivityUndo}>).detail || {};
            const names=(detail.moved ?? []).map(file=>file.name || "file");
            recordDailyActivity({kind:["gmail","outlook","recent","phone","usb"].includes(detail.source||"") ? detail.source as "gmail" : "folders",summary:`Moved ${names.length || 1} file${names.length===1?"":"s"}`,files:names,destination:detail.destination,undo:detail.undo});
        };
        window.addEventListener("folderrocket-files-moved", moved);
        return () => window.removeEventListener("folderrocket-files-moved", moved);
    }, []);

    useEffect(() => {
        if (!preferencesReady || !usbStatus.drives) return;
        const remaining = removeDisconnectedUsbFolders(folders, usbStatus.drives);
        if (remaining === folders) return;
        const removed = folders.filter(folder => !remaining.includes(folder));
        let active = true;
        queueMicrotask(() => {
            if (!active) return;
            setFolders(current => removeDisconnectedUsbFolders(current, usbStatus.drives!));
            setSearchFolderIds(current => current.filter(id => !removed.some(folder => folder.id === id)));
            setDashboardBrowser(current => current && removed.some(folder => isWithinUsbPath(current.path, folder.usbDrivePath || folder.path)) ? null : current);
        });
        return () => { active = false; };
    }, [folders, preferencesReady, usbStatus.drives]);

    useEffect(() => { if (reminderAddRequest > 0) window.dispatchEvent(new CustomEvent("folderrocket:create-reminder-note")); }, [reminderAddRequest]);
    useEffect(() => {
        let active = true;
        const openIfNested = async (folder: ManagedFolder, isCurrent = () => active) => {
            const response = await fetch(`${API_BASE_URL}/list-folder-files`, {method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({folder:folder.path})});
            const data = await response.json().catch(() => ({})) as {folders?: unknown[]; code?: string; message?: string};
            if (active && isCurrent() && data.code === "FOLDER_NOT_FOUND") { setFolderPathNotice(`${folder.name}: ${data.message || "Cartella non disponibile. Ricollega il percorso."}`); return; }
            if (active && isCurrent()) setFolderPathNotice("");
            if (active && isCurrent() && response.ok && Array.isArray(data.folders) && data.folders.length > 0) setDashboardBrowser({path:folder.path,name:folder.name});
        };
        const openClickedFolder = (event: MouseEvent) => { const target=event.target as Element; if(target.closest("button,input,select,textarea,.deadlineControls,.deleteZone"))return; const id=target.closest<HTMLElement>(".folderDropZone[data-folder-id]")?.dataset.folderId; const folder=folders.find(item=>item.id===id&&item.storage!=="imaginary"&&item.path); if(folder)void openIfNested(folder); };
        const stopWatching = watchFolderDragHover(".foldersContainer .folderDropZone[data-folder-id]", (block, isCurrent) => {
            const folder = folders.find(item => item.id === block.dataset.folderId && item.storage !== "imaginary" && item.path);
            if (folder) return openIfNested(folder, isCurrent);
        });
        document.addEventListener("click",openClickedFolder);
        return () => { active = false; stopWatching(); document.removeEventListener("click",openClickedFolder); };
    }, [folders]);

    useEffect(() => {
        let active = true;
        if (user.role !== "admin") { queueMicrotask(() => { if (active) setAiConfigured(false); }); return () => { active = false; }; }
        void fetch(`${API_BASE_URL}/desktop/integrations/status`, {credentials: "include"})
            .then(response => response.ok ? response.json() : {aiConfigured: false})
            .then((data: {aiConfigured?: boolean}) => { if (active) setAiConfigured(Boolean(data.aiConfigured)); })
            .catch(() => { if (active) setAiConfigured(false); });
        return () => { active = false; };
    }, [user.id, user.role]);
    useEffect(() => {
        localStorage.setItem(`${AI_MODE_KEY}-${workspaceScope}`, aiMode ? "on" : "off");
        void onWorldAiModeChange(aiMode).catch(() => {
            setDashboardSaveError("Non è stato possibile sincronizzare l’attivazione AI del pianeta. Controlla Diagnostica.");
            captureDiagnostic(user.id, {type:"http", route:"/settings/worlds/:worldId", method:"PUT", message:"Sincronizzazione AI del pianeta non riuscita", worldId:world.id});
        });
    }, [aiMode, onWorldAiModeChange, user.id, workspaceScope, world.id]);
    useEffect(() => { localStorage.setItem(appZoomStorageKey, String(appZoom)); }, [appZoom, appZoomStorageKey]);
    useEffect(() => { localStorage.setItem(floatingToolsScaleStorageKey, String(floatingToolsScale)); }, [floatingToolsScale, floatingToolsScaleStorageKey]);
    useEffect(() => { localStorage.setItem(floatingBookmarkScaleStorageKey, String(floatingBookmarkScale)); }, [floatingBookmarkScale, floatingBookmarkScaleStorageKey]);
    useEffect(() => { localStorage.setItem(floatingBookmarkWidthStorageKey, String(floatingBookmarkWidth)); }, [floatingBookmarkWidth, floatingBookmarkWidthStorageKey]);
    useEffect(() => { localStorage.setItem(floatingBookmarkHeightStorageKey, String(floatingBookmarkHeight)); }, [floatingBookmarkHeight, floatingBookmarkHeightStorageKey]);
    const aiEnabled = aiConfigured && aiMode;

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

    useEffect(() => {
        let active = true;
        if (settingsPreloadedRef.current) {
            queueMicrotask(() => {
                if (!active) return;
                settingsPreloadedRef.current = false;
                setPreferencesReady(true);
            });
            return () => { active = false; };
        }
        fetch(dashboardSettingsUrl, {credentials: "include"})
            .then(response => response.ok ? response.json() : {settings: null})
            .then((data: {settings?: {folders?: Folder[]; dashboardWidths?: DashboardWidths | null; dashboardHeight?: number | null; dashboardLayout?: "three-column" | "folders-top"; searchFolderIds?: string[]; sourceBlocks?: DashboardSourceBlockData[]; rightSourceBlocks?: DashboardSourceBlockData[] } | null}) => {
                if (!active || !data.settings) return;
                const settings = data.settings;
                if (Array.isArray(settings.folders) && settings.folders.every(folder => folder && typeof folder.id === "string" && typeof folder.name === "string")) setFolders(settings.folders);
                if (settings.dashboardWidths === null || (settings.dashboardWidths && [settings.dashboardWidths.left, settings.dashboardWidths.center, settings.dashboardWidths.right].every(value => Number.isFinite(value) && value >= 240))) setDashboardWidths(settings.dashboardWidths ?? null);
                if (settings.dashboardHeight === null || (Number.isFinite(settings.dashboardHeight) && Number(settings.dashboardHeight) >= MIN_DASHBOARD_HEIGHT)) setDashboardHeight(settings.dashboardHeight === null ? null : Math.min(MAX_DASHBOARD_HEIGHT, Number(settings.dashboardHeight)));
                if (settings.dashboardLayout === "three-column" || settings.dashboardLayout === "folders-top") setDashboardLayout(settings.dashboardLayout);
                if (Array.isArray(settings.searchFolderIds)) setSearchFolderIds(settings.searchFolderIds.filter((id): id is string => typeof id === "string"));
                const leftBlocks = normalizeSourceBlocks(settings.sourceBlocks);
                if (leftBlocks) setSourceBlocks(leftBlocks);
                const rightBlocks = normalizeSourceBlocks(settings.rightSourceBlocks);
                if (rightBlocks) setRightSourceBlocks(rightBlocks);
            })
            .finally(() => { if (active) setPreferencesReady(true); });
        return () => { active = false; };
    }, [dashboardSettingsUrl, user.id]);

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
    useEffect(() => { if (preferencesReady) localStorage.setItem(`${DASHBOARD_LAYOUT_KEY}-${workspaceScope}`, dashboardLayout); }, [dashboardLayout, preferencesReady, workspaceScope]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(foldersStorageKey, JSON.stringify(folders)); }, [folders, foldersStorageKey, preferencesReady]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(searchStorageKey, JSON.stringify(searchFolderIds)); }, [searchFolderIds, searchStorageKey, preferencesReady]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(sourceBlocksStorageKey, JSON.stringify(sourceBlocks)); }, [preferencesReady, sourceBlocks, sourceBlocksStorageKey]);
    useEffect(() => { if (preferencesReady) localStorage.setItem(rightSourceBlocksStorageKey, JSON.stringify(rightSourceBlocks)); }, [preferencesReady, rightSourceBlocks, rightSourceBlocksStorageKey]);
    useEffect(() => {
        if (!preferencesReady) return;
        const timer = window.setTimeout(() => {
            void fetch(dashboardSettingsUrl, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({settings: {folders, dashboardWidths, dashboardHeight, dashboardLayout, searchFolderIds, sourceBlocks, rightSourceBlocks}})
            }).then(async response => {
                if (!response.ok) {
                    const data=await response.json().catch(()=>({})) as {message?:string};
                    throw new Error(data.message||"Dashboard settings could not be saved.");
                }
                setDashboardSaveError("");
            }).catch(error=>setDashboardSaveError(error instanceof Error?error.message:"Dashboard settings could not be saved."));
        }, 350);
        return () => window.clearTimeout(timer);
    }, [dashboardHeight, dashboardLayout, dashboardSettingsUrl, dashboardWidths, folders, preferencesReady, rightSourceBlocks, searchFolderIds, sourceBlocks]);

    function addFolder(path = "", name?: string): boolean {
        const normalizedPath = path.trim().replace(/[\\/]+$/, "").toLowerCase();
        if (normalizedPath && folders.some(folder => folder.path.trim().replace(/[\\/]+$/, "").toLowerCase() === normalizedPath)) {
            setFolderPathNotice("This folder is already in Folder Management.");
            return false;
        }
        setFolders(current => normalizedPath && current.some(folder => folder.path.trim().replace(/[\\/]+$/, "").toLowerCase() === normalizedPath) ? current : [...current, {id: crypto.randomUUID(), name: name?.trim() || `Folder ${current.length + 1}`, path, description: "", storage: "physical"}]);
        setFolderPathNotice("");
        return true;
    }
    function useUsbDriveAsFolder(drive: UsbDrive) {
        const normalizedPath = normalizedUsbPath(drive.path);
        setFolders(current => {
            const existing = current.find(folder => normalizedUsbPath(folder.path) === normalizedPath);
            if (existing) return existing.usbDrivePath === drive.path ? current : current.map(folder => folder.id === existing.id ? {...folder, usbDrivePath:drive.path} : folder);
            const label = drive.label?.trim() || drive.id;
            return [...current, {
                id: crypto.randomUUID(),
                name: `USB · ${label}`,
                path: drive.path,
                usbDrivePath: drive.path,
                description: "Connected removable USB drive",
                storage: "physical"
            }];
        });
    }
    function updateFolder(id: string, change: Partial<Folder>) {
        setFolders(current => {
            const source = current.find(folder => folder.id === id);
            if (!source) return current;
            const updated = {...source, ...change}, group = folderProjectKey(updated);
            return current.map(folder => folder.id === id ? updated : group && change.appearance && folderProjectKey(folder) === group ? {...folder, appearance: {...folder.appearance, backgroundColor: change.appearance.backgroundColor, symbol: change.appearance.symbol}} : folder);
        });
    }
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

    function renderSourceBlock(column: "left" | "right", block: DashboardSourceBlockData) {
        const deferred = (content: ReactNode) => <Suspense fallback={<p className="sourceLoading">Loading…</p>}>{content}</Suspense>;
        if (block.type === "gmail") return <GmailSourcePanel key={`${world.id}-${block.id}-${block.accountBlockId === null ? "none" : block.accountBlockId || "default"}`} storageScope={`${workspaceScope}-${block.id}`} alertBlockId={block.id} accountBlockId={block.accountBlockId} onAccountBlockIdChange={accountBlockId => updateSourceBlock(column, block.id, {accountBlockId})} accountCatalogKey={user.id} worldId={world.id} worldName={world.name} worldNames={worldNames} aiEnabled={aiEnabled} />;
        if (block.type === "outlook") return <OutlookSourcePanel storageScope={`${workspaceScope}-${block.id}`} alertBlockId={block.id} accountBlockId={block.accountBlockId ?? undefined} onAccountBlockIdChange={accountBlockId => updateSourceBlock(column, block.id, {accountBlockId})} accountCatalogKey={user.id} worldId={world.id} aiEnabled={aiEnabled} />;
        if (block.type === "teams") return deferred(<TeamsSourcePanel key={`${world.id}-${block.id}-${block.accountBlockId === null ? "none" : block.accountBlockId || "default"}`} blockId={block.id} accountBlockId={block.accountBlockId} onAccountBlockIdChange={accountBlockId => updateSourceBlock(column, block.id, {accountBlockId})} />);
        if (block.type === "calendar") return deferred(<GoogleCalendarSourcePanel storageScope={workspaceScope} alertBlockId={block.id} weekStart={block.calendarWeekStart} onWeekStartChange={calendarWeekStart => updateSourceBlock(column, block.id, {calendarWeekStart})} />);
        if (block.type === "recent") return deferred(<RecentFilesSourcePanel folders={folders.filter(folder => folder.storage !== "imaginary" && folder.path).map(folder => folder.path)} hours={block.recentHours} extraPaths={block.recentPaths} onSettings={(recentHours, recentPaths) => updateSourceBlock(column, block.id, {recentHours, recentPaths})}/>);
        if (block.type === "phone") return deferred(<PhoneSourcePanel hours={block.phoneHours} onHoursChange={phoneHours=>updateSourceBlock(column,block.id,{phoneHours})}/>);
        if (block.type === "usb") return deferred(<UsbSourcePanel onUseDrive={useUsbDriveAsFolder} driveStatus={usbStatus} />);
        if (block.type === "domain") return deferred(<DomainSourcePanel key={`${block.id}-${block.url||"empty"}`} url={block.url} onUrlChange={url => updateSourceBlock(column, block.id, {url})} aiEnabled={aiEnabled} />);
        if (block.type === "screen") return deferred(<ScreenCaptureSourcePanel crop={block.crop} onCropChange={crop => updateSourceBlock(column, block.id, {crop})} aiEnabled={aiEnabled} />);
        return <SearchSourcePanel aiEnabled={aiEnabled} folders={folders.filter(folder => folder.storage !== "imaginary" && Boolean(folder.path)).map(folder => ({name: folder.name, path: folder.path}))} onResultsChange={hasResults => { if (!hasResults) updateColumnBlocks(column, current => current.map(item => item.id === block.id && item.height !== 108 ? {...item, height: 108} : item)); }} />;
    }
    const dashboardStyle = (dashboardWidths || dashboardHeight) ? {
        ...(dashboardWidths ? {"--dashboard-left": `${dashboardWidths.left}px`, "--dashboard-center": `${dashboardWidths.center}px`, "--dashboard-right": `${dashboardWidths.right}px`} : {}),
        ...(dashboardHeight ? {"--dashboard-height": `${dashboardHeight}px`} : {})
    } as CSSProperties : undefined;

    useEffect(() => {
        const openFileStudio = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.data?.type !== "folderrocket-open-file-studio") return;
            navigate("processing");
        };
        window.addEventListener("message", openFileStudio);
        return () => window.removeEventListener("message", openFileStudio);
    }, [navigate]);

    const cargoShipProps = {
        onOpenFileStudio: () => navigate("processing"),
        aiEnabled,
        storageScope: workspaceScope,
        worldId: world.id,
        folders,
        onVirtualFilesAdd: (folderId: string, files: VirtualFile[]) => updateFolder(folderId, {virtualFiles: [...(folders.find(folder => folder.id === folderId)?.virtualFiles ?? []), ...files.filter(file => !(folders.find(folder => folder.id === folderId)?.virtualFiles ?? []).some(existing => existing.path === file.path))]})
    };
    if (isCargoShipWindow) return <CargoShip {...cargoShipProps} standalone />;
    return <div className="app" style={{"--nav-column-width":dashboardWidths?`${dashboardWidths.left}px`:"calc((min(100vw - 56px, 1420px) - 24px) / 3)"} as CSSProperties}><FolderAppearanceStyles folders={folders}/>
        <header className="appHeader">
            <img className="appLogo" src={folderRocketWordmark} alt="FolderRocket" />
            <div className="appWorldIdentity" role="img" aria-label={`Pianeta attivo: ${world.name}`} title={`Pianeta attivo: ${world.name}`}><WorldPlanet world={world}/><span>{world.name}</span></div>
            <div className={aiEnabled ? "appAiStatus active" : "appAiStatus inactive"} role="status" aria-live="polite"><span className="appAiStatusDot"/>{aiEnabled ? "AI ON" : "AI OFF"}</div>
            <nav className="appNavigation">
                {aiEnabled && <button type="button" className="notesAiQuickAdd" onClick={() => setAiNoteAddRequest(current => current + 1)} title="Create an AI post-it" aria-label="Create an AI post-it"><span>AI</span></button>}
                <button type="button" className={aiEnabled ? "notesQuickAdd withAi" : "notesQuickAdd"} onClick={() => setNoteAddRequest(current => current + 1)} title="Add a post-it" aria-label="Add a post-it"><Plus size={19}/></button><button type="button" className="notesReminderQuickAdd" onClick={() => setReminderAddRequest(current => current + 1)} title="Create a reminder post-it" aria-label="Create a reminder post-it"><span>!</span></button>
                <div className="pageMenu" role="group" aria-label="Pages"><div className="pageMenuItems">
                    <button className={page === "dashboard" ? "active" : ""} type="button" onClick={() => navigate("dashboard")}><LayoutDashboard size={15}/>Dashboard</button>
                    <button className={page === "folders" ? "active" : ""} type="button" onClick={() => navigate("folders")}><FolderCog size={15}/>Folder management</button>
                    <button className={page === "processing" ? "active" : ""} type="button" onClick={() => navigate("processing")}><WandSparkles size={15}/>File Studio</button>
                    <button className={page === "applications" ? "active" : ""} type="button" onClick={() => navigate("applications")}><Shapes size={15}/>Applications</button>
                    <button className={page === "daily" ? "active" : ""} type="button" onClick={() => navigate("daily")}><BriefcaseBusiness size={15}/>Daily Job</button>
                </div></div>
                {page === "dashboard" && <button type="button" className="dashboardResetButton" onClick={resetDashboardLayout} title="Restore default dashboard size" aria-label="Restore default dashboard size"><RotateCcw size={14} /></button>}
            </nav>
            <div className="appHeaderTools"><button type="button" className="worldChangeLauncher" onClick={onOpenWorlds} title="Fly To Another Planet"><Orbit size={14}/><span>Fly To Another Planet</span></button><CargoShip {...cargoShipProps} /><AccountMenu user={user} onLogout={onLogout} onOpenDiagnostics={() => setDiagnosticsOpen(true)} appZoom={appZoom} onAppZoomChange={setDesktopZoom} aiConfigured={aiConfigured} aiMode={aiMode} onAIModeChange={setAiMode} onAIStatusChange={setAiConfigured} dashboardLayout={dashboardLayout} onDashboardLayoutChange={setDashboardLayout} floatingToolsScale={floatingToolsScale} onFloatingToolsScaleChange={setFloatingToolsScale} bookmarkScale={floatingBookmarkScale} onBookmarkScaleChange={setFloatingBookmarkScale} bookmarkWidth={floatingBookmarkWidth} onBookmarkWidthChange={setFloatingBookmarkWidth} bookmarkHeight={floatingBookmarkHeight} onBookmarkHeightChange={setFloatingBookmarkHeight} /><DiagnosticsCenter userId={user.id} worldNames={worldNames} open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}/></div>
        </header>
        {dashboardSaveError&&<div className="appSaveError" role="alert">{dashboardSaveError} Your local copy is still available.</div>}{folderPathNotice&&<div className="appSaveError folderPathNotice" role="status"><span>{folderPathNotice}</span><button type="button" onClick={()=>setFolderPathNotice("")} aria-label="Chiudi avviso">×</button></div>}<DailyAgendaRail storageScope={workspaceScope} onOpenDailyJob={()=>navigate("daily")}/><StickyNotes key={workspaceScope} storageScope={workspaceScope} folders={folders} aiEnabled={aiEnabled} floatingScale={floatingToolsScale} bookmarkScale={floatingBookmarkScale} bookmarkWidth={floatingBookmarkWidth} bookmarkHeight={floatingBookmarkHeight} addRequest={noteAddRequest} aiAddRequest={aiNoteAddRequest} /><div className="pageFrame"><main ref={dashboardRef} style={dashboardStyle} className={`dashboard${page !== "dashboard" ? " pageHidden" : ""}${dashboardLayout === "folders-top" ? " dashboardFoldersTop" : ""}`}>
            <DashboardSourceColumn className="sourcesColumn" title="Sources" blocks={sourceBlocks} onAdd={type => addSourceBlock("left", type)} onDelete={id => deleteSourceBlock("left", id)} onMove={(id, direction) => moveSourceBlock("left", id, direction)} onResize={(id, height) => updateSourceBlock("left", id, {height})} renderBlock={block => renderSourceBlock("left", block)} />
            <div className="dashboardResizer" role="separator" aria-label="Ridimensiona colonne sinistra e centrale" onPointerDown={event => startColumnResize("left", event)} />
            <section className="dashboardColumn foldersColumn">{dashboardBrowser ? <Suspense fallback={<p className="sourceLoading">Loading folder…</p>}><DashboardFolderBrowser key={dashboardBrowser.path} initialPath={dashboardBrowser.path} initialName={dashboardBrowser.name} onHome={()=>setDashboardBrowser(null)} sourceFolderPaths={folders.filter(item => item.storage !== "imaginary" && Boolean(item.path)).map(item => item.path)} storageScope={workspaceScope} aiEnabled={aiEnabled}/></Suspense> : <div className="foldersContainer">{folderProjectGroups(folders).map(group=><div className={group.members.length>1?"dashboardProjectGroup linkedProject":"dashboardProjectGroup"} key={group.key}>{group.members.length>1&&<div className="dashboardProjectLabel"><span>{group.symbol}</span><small>{group.members[0].appearance?.workGroup || group.members[0].description}</small></div>}{group.members.map(folder => <div className={draggedFolderId === folder.id ? "folderOrderItem draggingFolder" : "folderOrderItem"} draggable onDragStart={event => { if (event.target !== event.currentTarget) return; setDraggedFolderId(folder.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-folderrocket-folder-order", folder.id); }} onDragOver={event => { if (event.dataTransfer.types.includes("application/x-folderrocket-folder-order")) event.preventDefault(); }} onDrop={event => { const sourceId = event.dataTransfer.getData("application/x-folderrocket-folder-order"); if (sourceId) { event.preventDefault(); event.stopPropagation(); moveFolder(sourceId, folder.id); } setDraggedFolderId(null); }} onDragEnd={() => setDraggedFolderId(null)} key={folder.id}><FileDropZone id={folder.id} name={folder.name} pathValue={folder.path} hidePath imaginary={folder.storage === "imaginary"} selected={Boolean(folder.path) && searchFolderIds.includes(folder.id)} sourceFolderPaths={folders.filter(item => item.storage !== "imaginary" && Boolean(item.path)).map(item => item.path)} storageScope={workspaceScope} aiEnabled={aiEnabled} onVirtualFilesAdd={items => updateFolder(folder.id, {virtualFiles: [...(folder.virtualFiles ?? []), ...items.filter(item => !(folder.virtualFiles ?? []).some(file => file.path === item.path))]})} onPathChange={path => updateFolder(folder.id, {path, storage: "physical"})} /></div>)}</div>)}</div>}</section>
            <div className="dashboardResizer" role="separator" aria-label="Resize center and right columns" onPointerDown={event => startColumnResize("right", event)} />
            <DashboardSourceColumn className="rightSourcesColumn" title="Sources" blocks={rightSourceBlocks} onAdd={type => addSourceBlock("right", type)} onDelete={id => deleteSourceBlock("right", id)} onMove={(id, direction) => moveSourceBlock("right", id, direction)} onResize={(id, height) => updateSourceBlock("right", id, {height})} renderBlock={block => renderSourceBlock("right", block)} />
            <button type="button" className="dashboardHeightResizer" onPointerDown={startDashboardHeightResize} title="Drag to set dashboard height" aria-label="Set dashboard height"><GripHorizontal size={15} /></button>
        </main>{page === "folders" && <div className="folderPage"><Suspense fallback={<p className="sourceLoading">Loading folders…</p>}><FolderManagement folders={folders} onAdd={addFolder} onUpdate={updateFolder} onDelete={deleteFolder} onReorder={moveFolder} aiEnabled={aiEnabled} /></Suspense></div>}{page === "processing" && <div className="processingView"><Suspense fallback={<p className="sourceLoading">Loading File Studio…</p>}><ProcessingWorkspace folders={folders} onUpdate={updateFolder} storageScope={workspaceScope} /></Suspense></div>}{page === "applications" && <div className="applicationsView"><Suspense fallback={<p className="sourceLoading">Loading applications…</p>}><ApplicationsWorkspace storageScope={workspaceScope} folders={folders} onScanningChange={setApplicationChecking} onVirtualFilesAdd={(folderId,items)=>updateFolder(folderId,{virtualFiles:[...(folders.find(folder=>folder.id===folderId)?.virtualFiles??[]),...items.filter(item=>!(folders.find(folder=>folder.id===folderId)?.virtualFiles??[]).some(existing=>existing.path===item.path))]})}/></Suspense></div>}{page === "daily" && <Suspense fallback={<p className="sourceLoading">Loading Daily Job…</p>}><DailyJob storageScope={workspaceScope} worldId={world.id} onOpenWorkspace={kind=>navigate(kind==="studio"?"processing":kind==="applications"?"applications":"dashboard")}/></Suspense>}</div>
    </div>;
}

function App({user, onLogout}: {user: FolderRocketUser; onLogout: () => Promise<void>}) {
    const [initialWorldState] = useState(() => {
        const state = loadWorkspaceWorldState(user.id);
        migrateDefaultWorldZoom(user.id, state.worlds);
        return state;
    });
    const [worlds, setWorlds] = useState(initialWorldState.worlds);
    const [activeWorldId, setActiveWorldId] = useState(initialWorldState.activeWorldId);
    const [worldPickerOpen, setWorldPickerOpen] = useState(false);
    const [worldTravelTarget, setWorldTravelTarget] = useState<WorkspaceWorld | null>(null);
    const [worldSwitchError, setWorldSwitchError] = useState("");
    const [preloadedSettingsWorldId, setPreloadedSettingsWorldId] = useState<string | null>(null);
    const worldSwitchSequence = useRef(0);
    const worldSwitchInFlight = useRef(false);
    const activeWorldSyncedOnServerRef = useRef<string | null>(null);
    const activeWorldSyncControllerRef = useRef<AbortController | null>(null);
    const stateKey = worldsStorageKey(user.id);
    const activeWorld = worlds.find(world => world.id === activeWorldId) ?? worlds[0];
    const worldNames = Object.fromEntries(worlds.map(world => [world.id, world.name]));
    const isCargoShipWindow = new URLSearchParams(window.location.search).has("folderrocketCargoShip");

    useEffect(() => {
        localStorage.setItem(stateKey, JSON.stringify({worlds, activeWorldId}));
    }, [activeWorldId, stateKey, worlds]);

    useEffect(() => {
        setDiagnosticWorld(activeWorld.id);
        if (activeWorldSyncedOnServerRef.current === activeWorld.id) return;
        activeWorldSyncControllerRef.current?.abort();
        const controller = new AbortController();
        activeWorldSyncControllerRef.current = controller;
        void fetch(`${API_BASE_URL}/settings/active-world`, {method:"PUT", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({worldId:activeWorld.id}), signal:controller.signal}).then(response => {
            if (response.ok && !controller.signal.aborted) activeWorldSyncedOnServerRef.current = activeWorld.id;
        }).catch(() => {
            if (!controller.signal.aborted) captureDiagnostic(user.id, {type:"http", route:"/settings/active-world", method:"PUT", message:"Sincronizzazione del pianeta attivo non riuscita", worldId:activeWorld.id});
        });
        return () => controller.abort();
    }, [activeWorld.id, user.id]);

    useEffect(() => {
        if (!isCargoShipWindow) return;
        const syncActiveWorld = (event: StorageEvent) => {
            if (event.key !== `folderrocket-active-world-${user.id}` || !event.newValue) return;
            setActiveWorldId(event.newValue);
        };
        const syncWorldList = (event: StorageEvent) => {
            if (event.key !== stateKey || !event.newValue) return;
            try {
                const next = JSON.parse(event.newValue) as {worlds?: WorkspaceWorld[]};
                if (Array.isArray(next.worlds) && next.worlds.length) setWorlds(next.worlds);
            } catch { /* Keep the last valid local world list. */ }
        };
        window.addEventListener("storage", syncActiveWorld);
        window.addEventListener("storage", syncWorldList);
        return () => { window.removeEventListener("storage", syncActiveWorld); window.removeEventListener("storage", syncWorldList); };
    }, [isCargoShipWindow, stateKey, user.id]);

    function addWorld() {
        const next: WorkspaceWorld = {
            id: `world-${crypto.randomUUID()}`,
            name: `Pianeta ${worlds.length + 1}`,
            color: ["#5dbdff", "#c28cff", "#ff967d", "#79d7a3"][worlds.length % 4],
            style: "ringed",
            aiEnabled: false,
            agents: [],
            skills: [],
            permissions: {schemaVersion: 1, configured: false}
        };
        setWorlds(current => [...current, next]);
        return next;
    }

    async function selectWorld(worldId: string) {
        const targetWorld = worlds.find(world => world.id === worldId);
        if (!targetWorld || worldTravelTarget || worldSwitchInFlight.current) return;
        if (worldId === activeWorldId) { setWorldPickerOpen(false); return; }
        worldSwitchInFlight.current = true;
        const sequence = ++worldSwitchSequence.current;
        const switchStartedAt = performance.now();
        setWorldSwitchError("");
        setWorldTravelTarget(targetWorld);
        try {
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const animationFloor = new Promise(resolve => window.setTimeout(resolve, reducedMotion ? 100 : 700));
            const settingsStartedAt = performance.now();
            let settingsLoadDurationMs = 0;
            const responsePromise = fetch(`${API_BASE_URL}/settings/dashboard?worldId=${encodeURIComponent(worldId)}`, {credentials:"include"}).finally(() => {
                settingsLoadDurationMs = performance.now() - settingsStartedAt;
            });
            const [response] = await Promise.all([responsePromise, animationFloor]);
            if (!response.ok) throw new Error("Non è stato possibile caricare le impostazioni del pianeta.");
            const data = await response.json().catch(() => ({})) as {settings?: Record<string, unknown> | null};
            const settings = data.settings;
            if (settings) {
                const scope = activeWorldStorageScope(user.id, worldId);
                const cacheEntries: Array<[string, unknown]> = [
                    [`${FOLDERS_KEY}-${scope}`, settings.folders],
                    [`${DASHBOARD_WIDTHS_KEY}-${scope}`, settings.dashboardWidths],
                    [`${DASHBOARD_HEIGHT_KEY}-${scope}`, settings.dashboardHeight],
                    [`${DASHBOARD_LAYOUT_KEY}-${scope}`, settings.dashboardLayout],
                    [`${SEARCH_FOLDER_SELECTION_KEY}-${scope}`, settings.searchFolderIds],
                    [`${SOURCE_BLOCKS_KEY}-${scope}`, settings.sourceBlocks],
                    [`${RIGHT_SOURCE_BLOCKS_KEY}-${scope}`, settings.rightSourceBlocks]
                ];
                for (const [key, value] of cacheEntries) if (value !== undefined) localStorage.setItem(key, JSON.stringify(value));
            }
            activeWorldSyncControllerRef.current?.abort();
            const activeWorldSyncStartedAt = performance.now();
            const activeResponse = await fetch(`${API_BASE_URL}/settings/active-world`, {method:"PUT", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({worldId})});
            const activeWorldSyncDurationMs = performance.now() - activeWorldSyncStartedAt;
            if (!activeResponse.ok) throw new Error("Non è stato possibile sincronizzare il pianeta attivo.");
            if (sequence !== worldSwitchSequence.current) return;
            activeWorldSyncedOnServerRef.current = worldId;
            setPreloadedSettingsWorldId(worldId);
            setActiveWorldId(worldId);
            localStorage.setItem(stateKey, JSON.stringify({worlds, activeWorldId: worldId}));
            localStorage.setItem(`folderrocket-active-world-${user.id}`, worldId);
            setWorldPickerOpen(false);
            captureDiagnostic(user.id, {id: `world-switch-${worldId}-${Date.now()}`, type: "performance", category:"world-switch", message: `Cambio pianeta completato · lettura impostazioni ${Math.round(settingsLoadDurationMs)} ms · sincronizzazione ${Math.round(activeWorldSyncDurationMs)} ms`, route: "/settings/dashboard", method: "GET", status: 200, worldId, durationMs: performance.now() - switchStartedAt, resolved: true});
        } catch (error) {
            if (sequence === worldSwitchSequence.current) {
                setWorldSwitchError(error instanceof Error ? error.message : "Cambio di pianeta non riuscito.");
                captureDiagnostic(user.id, {type: "runtime", message: "Cambio pianeta non riuscito", route: "/settings/dashboard", worldId});
            }
        } finally {
            worldSwitchInFlight.current = false;
            if (sequence === worldSwitchSequence.current) setWorldTravelTarget(null);
        }
    }

    async function updateWorld(updated: WorkspaceWorld) {
        const previous = worlds.find(world => world.id === updated.id);
        if (previous) {
            const response = await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(updated.id)}`, {method:"PUT", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({aiEnabled:updated.aiEnabled,agents:updated.agents,skills:updated.skills})});
            const data = await response.json().catch(() => ({})) as {message?:string};
            if (!response.ok) throw new Error(data.message || "Non è stato possibile salvare lo stato AI del pianeta.");
        }
        localStorage.setItem(`${AI_MODE_KEY}-${activeWorldStorageScope(user.id, updated.id)}`, updated.aiEnabled ? "on" : "off");
        window.dispatchEvent(new CustomEvent("folderrocket-world-ai-mode", {detail:{worldId:updated.id, enabled:updated.aiEnabled}}));
        setWorlds(current => current.map(world => world.id === updated.id ? updated : world));
    }

    const activeWorldIdForCallbacks = activeWorld.id;
    const updateWorldAiMode = useCallback(async (enabled: boolean) => {
        const response = await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(activeWorldIdForCallbacks)}`, {method:"PUT", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({aiEnabled:enabled})});
        if (!response.ok) throw new Error("Impossibile sincronizzare l’attivazione AI del pianeta.");
        setWorlds(current => current.map(world => world.id === activeWorldIdForCallbacks ? {...world, aiEnabled: enabled} : world));
    }, [activeWorldIdForCallbacks]);

    async function invokeWorldAssistant(worldId: string, profileId: string, kind: "agent" | "skill", name: string, instructions: string, prompt: string, model: WorldAssistantModel, capabilities: WorldAssistantCapability[]) {
        const world = worlds.find(item => item.id === worldId);
        if (worldId !== activeWorldId) throw new Error("Entra prima nel pianeta per richiamare i suoi agenti o le sue skill.");
        if (!world?.aiEnabled) throw new Error("Attiva prima l’AI nelle impostazioni di questo pianeta.");
        const response = await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/ai/invoke`, {
            method:"POST", credentials:"include", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({profileId,kind,name,instructions,prompt,worldName:world.name,model,capabilities})
        });
        const data = await response.json().catch(() => ({})) as {text?:string;matchedFiles?:string[];message?:string};
        if (!response.ok || !data.text) throw new Error(data.message ?? "L’AI non ha restituito una risposta.");
        return data.matchedFiles?.length ? `${data.text}\n\nFile individuati nelle cartelle di questo pianeta:\n${data.matchedFiles.slice(0, 10).map(name => `• ${name}`).join("\n")}` : data.text;
    }

    async function deleteWorld(worldId: string) {
        if (worlds.length < 2) return;
        const response = await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(worldId)}`, {method:"DELETE", credentials:"include"});
        const data = await response.json().catch(() => ({})) as {message?: string};
        if (!response.ok) throw new Error(data.message ?? "Impossibile eliminare le impostazioni del pianeta.");
        const nextWorlds = worlds.filter(world => world.id !== worldId);
        const nextActive = worldId === activeWorldId ? nextWorlds[0].id : activeWorldId;
        setWorlds(nextWorlds);
        setActiveWorldId(nextActive);
        localStorage.setItem(stateKey, JSON.stringify({worlds: nextWorlds, activeWorldId: nextActive}));
        localStorage.setItem(`folderrocket-active-world-${user.id}`, nextActive);
        const worldScope = activeWorldStorageScope(user.id, worldId);
        const scopedKeys = Array.from({length: localStorage.length}, (_, index) => localStorage.key(index)).filter((key): key is string => key !== null && (key.endsWith(worldScope) || key.includes(`${worldScope}-`)));
        scopedKeys.forEach(key => localStorage.removeItem(key));
        if (worldId === "work") {
            localStorage.removeItem("folderrocket-conversion-rename-template");
            localStorage.removeItem("folderrocket-conversion-rename-template-version");
        }
    }

    if (!activeWorld) return null;
    return <div className="worldApplicationRoot">
        <WorldWorkspace key={`${user.id}-${activeWorld.id}`} user={user} onLogout={onLogout} world={activeWorld} worldNames={worldNames} onOpenWorlds={() => setWorldPickerOpen(true)} onWorldAiModeChange={updateWorldAiMode} settingsPreloaded={preloadedSettingsWorldId === activeWorld.id}/>
        {worldPickerOpen && !isCargoShipWindow && <ChangeWorld worlds={worlds} activeWorldId={activeWorld.id} storageScope={activeWorldStorageScope(user.id, activeWorld.id)} onSelect={selectWorld} onInvokeAssistant={invokeWorldAssistant} switchError={worldSwitchError} onBack={() => setWorldPickerOpen(false)} onAdd={addWorld} onUpdate={updateWorld} onDelete={deleteWorld}/>}
        {worldTravelTarget && <div className="worldTravelScreen" role="status" aria-live="polite" aria-busy="true" style={{"--planet-color":worldTravelTarget.color,"--world-travel-duration":"700ms"} as CSSProperties}><div className="worldTravelStars"/><p className="worldTravelStatus">Preparazione dell’ambiente</p><div className="worldTravelDestination"><span className={`worldPlanet ${worldTravelTarget.style}${worldTravelTarget.aiEnabled ? " aiEnabled" : ""}`}><i/><b/><em/>{worldTravelTarget.aiEnabled && <span className="worldAiSatelliteOrbit"><i/></span>}</span><strong>{worldTravelTarget.name}</strong></div><div className="worldTravelShip" aria-hidden="true"><Rocket size={44}/></div></div>}
    </div>;
}

export default App;
