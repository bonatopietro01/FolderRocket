import {lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode} from "react";
import {BriefcaseBusiness, FolderCog, GripHorizontal, LayoutDashboard, Orbit, Plus, Rocket, Shapes, WandSparkles, Mail} from "lucide-react";
import {AccountMenu, type FolderRocketUser} from "./components/AuthGate";
import {API_BASE_URL} from "./api";
import "./App.css";
import FileDropZone from "./components/FileDropZone";
import FolderScrollFrame from "./components/FolderScrollFrame";
import FolderAppearanceStyles from "./components/FolderAppearanceStyles";
import {folderDescriptionGroups, folderProjectGroups, folderProjectKey} from "./folderProjects";
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
import {clearObsidianAutoSyncPause, dismissObsidianIncompleteSync, recordObsidianIncompleteSync, recordObsidianSyncSuccess, shouldPauseObsidianAutoSync, shouldShowObsidianIncompleteSync, type ObsidianKnowledgeSummary, type ObsidianReasonSummary} from "./obsidianSyncRetry";
import {activeWorldStorageScope, loadWorkspaceWorldState, worldsStorageKey, type WorldAssistantCapability, type WorldAssistantModel, type WorkspaceWorld, type WorldTreeRootMode} from "./worlds";
import {buildWorldObsidianClientRecords, readWorldActivitySnapshot, selectWorldActivitySnapshot} from "./worldActivitySnapshot";
import PlanetGraph from "./components/PlanetGraph";
import EmailConversations from "./components/EmailConversations";

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
const EMPTY_ACTIVITY_NOTIFICATION_SOURCES: string[] = [];
const AI_MODE_KEY = "folderrocket-ai-mode";
const APP_ZOOM_KEY = "folderrocket-app-zoom";
const FLOATING_TOOLS_SCALE_KEY = "folderrocket-floating-tools-scale";
const FLOATING_BOOKMARK_SCALE_KEY = "folderrocket-floating-bookmark-scale";
const FLOATING_BOOKMARK_WIDTH_KEY = "folderrocket-floating-bookmark-width";
const FLOATING_BOOKMARK_HEIGHT_KEY = "folderrocket-floating-bookmark-height";
const MIN_DASHBOARD_HEIGHT = 440;
const MAX_DASHBOARD_HEIGHT = 1400;
type ObsidianSyncReply = {status?:string;lastSyncAt?:string;written?:number;unchanged?:number;conflicts?:number;warnings?:string[]};
type ObsidianSyncResponse = {ok:boolean;status:number;result?:ObsidianSyncReply;config?:WorkspaceWorld["obsidian"];message?:string;code?:string;reasonSummary?:ObsidianReasonSummary;readinessFingerprint?:string;summary?:string};
const obsidianSyncInFlight = new Map<string, {signature:string;request:Promise<ObsidianSyncResponse>}>();

function requestObsidianSync(userId:string, worldId:string, storageScope:string, signature=""): Promise<ObsidianSyncResponse> {
    const key=`${userId}:${worldId}`;
    const existing=obsidianSyncInFlight.get(key);
    if(existing) return existing.signature===signature ? existing.request : existing.request.catch(()=>undefined).then(()=>requestObsidianSync(userId,worldId,storageScope,signature));
    const request=fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/obsidian/sync`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:buildWorldObsidianClientRecords(storageScope)})})
        .then(async response=>{
            const data=await response.json().catch(()=>({})) as {result?:ObsidianSyncReply;config?:WorkspaceWorld["obsidian"];message?:string;code?:string;reasonSummary?:ObsidianReasonSummary;readinessFingerprint?:string;summary?:string};
            if(response.ok) clearObsidianAutoSyncPause(key);
            return {ok:response.ok,status:response.status,result:data.result,config:data.config,message:typeof data.message==="string"?data.message:"",code:typeof data.code==="string"?data.code:undefined,reasonSummary:data.reasonSummary,readinessFingerprint:typeof data.readinessFingerprint==="string"?data.readinessFingerprint:undefined,summary:typeof data.summary==="string"?data.summary:undefined};
        });
    obsidianSyncInFlight.set(key,{signature,request});
    void request.finally(()=>{if(obsidianSyncInFlight.get(key)?.request===request)obsidianSyncInFlight.delete(key);}).catch(()=>{});
    return request;
}

function getObsidianSyncSignature(world:WorkspaceWorld) {
    return JSON.stringify({obsidian:{enabled:world.obsidian?.enabled===true,autoSync:world.obsidian?.autoSync===true,vaultPath:world.obsidian?.vaultPath||"",sourceSelection:world.obsidian?.sourceSelection||{}},emailProvider:world.emailAccount?.provider||"",emailBlockId:world.emailAccount?.blockId||""});
}

function describeObsidianIncompleteSync(response:ObsidianSyncResponse) {
    const knownReasons:Record<string,string>={
        source_index_incomplete:"Some selected sources are still being prepared.",
        selected_source_limit:"Some selected sources exceed the current source limit.",
        content_unavailable:"Some selected content could not be read.",
        knowledge_limit:"The selected material exceeds the current knowledge limit.",
        source_selection_changed:"The selected sources changed while sync was checking them."
    };
    const blockers=(response.reasonSummary?.blockers||[]).filter(blocker=>blocker&&typeof blocker.label==="string"&&typeof blocker.action==="string").slice(0,8);
    if (blockers.length) return blockers.map(blocker=>`${blocker.label}: ${blocker.action}`).join(" · ").slice(0,900);
    const summary=typeof response.summary==="string"?response.summary.trim().slice(0,300):"";
    const reasonLines=(Array.isArray(response.reasonSummary?.reasonCodes)?response.reasonSummary.reasonCodes:[])
        .filter((code):code is string=>typeof code==="string"&&Boolean(knownReasons[code]))
        .map(code=>{
            const count=response.reasonSummary?.counts?.[code];
            return `${knownReasons[code]}${typeof count==="number"&&Number.isInteger(count)&&count>0?` (${count})`:""}`;
        });
    const explanation=reasonLines.join(" ")||summary||"Some selected sources are not ready yet.";
    return `${explanation} The last complete custom-vault revision is preserved. Review this planet’s source settings, then retry Sync now.`;
}

async function getObsidianKnowledgeSummary(worldId:string, signal?:AbortSignal):Promise<ObsidianKnowledgeSummary|null> {
    const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(worldId)}/knowledge?summary=1`,{credentials:"include",signal});
    if(!response.ok) throw new Error(`Unable to check selected Obsidian sources (HTTP ${response.status}).`);
    const data=await response.json().catch(()=>null) as Partial<ObsidianKnowledgeSummary>|null;
    if(!data||data.worldId!==worldId||!(["ready","indexing","blocked"] as unknown[]).includes(data.status)||typeof data.readinessFingerprint!=="string") throw new Error("The selected Obsidian source status could not be verified.");
    return data as ObsidianKnowledgeSummary;
}

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

function WorldWorkspace({user, onLogout, world, worlds, worldNames, onOpenWorlds, onOpenWorldSettings, onViewGraph, onWorldAiModeChange, onTreeRootModeChange, settingsPreloaded, worldAccountReady}: {user: FolderRocketUser; onLogout: () => Promise<void>; world: WorkspaceWorld; worlds: WorkspaceWorld[]; worldNames: Record<string, string>; onOpenWorlds: () => void; onOpenWorldSettings: () => void; onViewGraph: (world:WorkspaceWorld,threadId?:string)=>void; onWorldAiModeChange: (enabled: boolean) => Promise<void>; onTreeRootModeChange: (mode:WorldTreeRootMode)=>Promise<void>; settingsPreloaded: boolean; worldAccountReady:"ready"|"error"|"missing"|undefined}) {
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

    const [page, setPage] = useState<"dashboard" | "folders" | "processing" | "applications" | "daily" | "email">(() => sessionStorage.getItem(`folderrocket-obsidian-open-email-${user.id}`) === world.id ? "email" : "dashboard");
    const [conversationRailPreview,setConversationRailPreview]=useState(false);
    const [conversationNotification,setConversationNotification]=useState<{scope:string;kind:"checking"|"ready"|"unsupported"|"error";message:string;count:number|null}>({scope:"",kind:"checking",message:"Checking email notifications…",count:null});
    const notificationScope=`${world.id}:${world.emailAccount?.provider||"none"}:${world.emailAccount?.blockId||"none"}`;
    const scopedConversationNotification=conversationNotification.scope===notificationScope?conversationNotification:{kind:"checking" as const,message:"Checking email notifications…"};
    const conversationNotificationStatus=world.emailAccount?.provider!=="gmail"?{kind:"unsupported" as const,message:"New-email count is unavailable: no Gmail account is selected for this planet."}:page==="email"&&scopedConversationNotification.kind!=="error"&&scopedConversationNotification.kind!=="unsupported"?{...scopedConversationNotification,message:"Open Conversations to view and acknowledge individual emails."}:scopedConversationNotification;
    const conversationUnreadCount=conversationNotificationStatus.kind==="ready"?conversationNotification.count: null;
    useEffect(()=>{
        let current=true;
        if(world.emailAccount?.provider!=="gmail") return ()=>{current=false;};
        const controller=new AbortController();
        const check=async()=>{try{const response=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(world.id)}/email/notifications`,{credentials:"include",signal:controller.signal});const data=await response.json().catch(()=>({}));if(!current)return;if(response.status===501||data.code==="provider_unsupported"||data.supported===false){setConversationNotification({scope:notificationScope,kind:"unsupported",count:null,message:"Email notification counts are not supported for this account."});return;}if(!response.ok){const message=response.status===401||response.status===403?"Gmail authorization or selected account needs attention.":`Could not check email notifications (HTTP ${response.status}).`;setConversationNotification({scope:notificationScope,kind:"error",count:null,message});return;}const expectedAccountId=world.emailAccount?.provider==="gmail"?world.emailAccount.blockId:"";if(data.configured!==true||!expectedAccountId||data.accountId!==expectedAccountId){setConversationNotification({scope:notificationScope,kind:"error",count:null,message:"The selected Gmail account for this planet could not be verified."});return;}const count=Number(data.count);if(data.supported!==true||!Number.isFinite(count)||count<0){setConversationNotification({scope:notificationScope,kind:"error",count:null,message:"The email notification service returned an invalid status. No unread count is being shown."});return;}setConversationNotification({scope:notificationScope,kind:"ready",count:Math.floor(count),message:count?`${Math.floor(count)} new email${count===1?"":"s"}.`:"No new emails."});}catch{if(current&&!controller.signal.aborted)setConversationNotification({scope:notificationScope,kind:"error",count:null,message:"Could not reach the email notification service. Check your connection and Gmail account."});}};
        const refreshAfterThreadAck=(event:Event)=>{const detail=(event as CustomEvent<{scope?:string;accountBlockId?:string}>).detail;if(detail?.scope===notificationScope&&detail.accountBlockId===world.emailAccount?.blockId)void check();};
        window.addEventListener("folderrocket-refresh-conversation-notifications",refreshAfterThreadAck);
        void check();const timer=window.setInterval(()=>{if(!document.hidden)void check();},30_000);
        return ()=>{current=false;controller.abort();window.clearInterval(timer);window.removeEventListener("folderrocket-refresh-conversation-notifications",refreshAfterThreadAck);};
    },[page,notificationScope,world.emailAccount?.provider,world.emailAccount?.blockId,world.id]);
    const [emailFocusThreadId,setEmailFocusThreadId]=useState("");
    const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
    const [applicationChecking, setApplicationChecking] = useState(false);
    const [dashboardSaveError, setDashboardSaveError] = useState("");
    const [folderPathNotice, setFolderPathNotice] = useState("");
    const [obsidianAutoSyncWarning, setObsidianAutoSyncWarning] = useState("");
    const [obsidianAutoSyncLastMessage, setObsidianAutoSyncLastMessage] = useState("");
    const [obsidianAutoSyncNeedsSettings, setObsidianAutoSyncNeedsSettings] = useState(false);
    const [obsidianAutoSyncFingerprint, setObsidianAutoSyncFingerprint] = useState("");
    const [obsidianAutoSyncStatusOpen, setObsidianAutoSyncStatusOpen] = useState(false);
    const [folders, setFolders] = useState<Folder[]>(() => readFolders(foldersStorageKey, user.workspacePath, user.role === "admin"));
    const obsidianAutoSyncState = useRef({timer:0,inFlight:false,pending:false});
    const scheduleObsidianAutoSync = useRef<() => void>(() => {});
    const obsidianAutoSyncKey = `${user.id}:${world.id}`;

    useEffect(()=>{const pendingKey=`folderrocket-obsidian-open-email-${user.id}`;if(sessionStorage.getItem(pendingKey)===world.id)sessionStorage.removeItem(pendingKey);},[user.id,world.id]);
    useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent<{worldId?:string;threadId?:string}>).detail;if(detail?.worldId!==world.id)return;setEmailFocusThreadId(detail.threadId||"");setPage("email");};window.addEventListener("folderrocket-open-email-thread",open);return()=>window.removeEventListener("folderrocket-open-email-thread",open);},[world.id]);

    const obsidianSyncSignature = getObsidianSyncSignature(world);
    useEffect(()=>{
        let current=true;
        const onSyncStatus=(event:Event)=>{
            const detail=(event as CustomEvent<{worldId?:string;manual?:boolean;blocked?:boolean;readinessFingerprint?:string;reasonSummary?:ObsidianReasonSummary;message?:string}>).detail;
            if(detail?.worldId!==world.id)return;
            if(detail.blocked&&detail.readinessFingerprint){
                recordObsidianIncompleteSync(obsidianAutoSyncKey,obsidianSyncSignature,detail.readinessFingerprint);
                setObsidianAutoSyncFingerprint(detail.readinessFingerprint);
                setObsidianAutoSyncNeedsSettings(true);
                const incomplete:ObsidianSyncResponse={ok:false,status:409,reasonSummary:detail.reasonSummary,readinessFingerprint:detail.readinessFingerprint};
                const described=describeObsidianIncompleteSync(incomplete);
                const hasSpecificReasons=Boolean(detail.reasonSummary?.blockers?.length||detail.reasonSummary?.reasonCodes?.some(code=>["source_index_incomplete","selected_source_limit","content_unavailable","knowledge_limit","source_selection_changed"].includes(code)));
                const message=hasSpecificReasons?described:(detail.message||described);
                setObsidianAutoSyncLastMessage(message);
                if(shouldShowObsidianIncompleteSync(obsidianAutoSyncKey,obsidianSyncSignature,detail.readinessFingerprint)) setObsidianAutoSyncWarning(message);
                return;
            }
            if(!detail.manual)return;
            void getObsidianKnowledgeSummary(world.id).then(summary=>{
                if(!summary||!current)return;
                recordObsidianSyncSuccess(obsidianAutoSyncKey,obsidianSyncSignature);
                setObsidianAutoSyncWarning("");setObsidianAutoSyncLastMessage("");setObsidianAutoSyncFingerprint("");setObsidianAutoSyncNeedsSettings(false);setObsidianAutoSyncStatusOpen(false);
            }).catch(()=>{});
        };
        window.addEventListener("folderrocket:obsidian-sync-status",onSyncStatus);
        return()=>{current=false;window.removeEventListener("folderrocket:obsidian-sync-status",onSyncStatus);};
    },[world.id,obsidianAutoSyncKey,obsidianSyncSignature]);
    useEffect(() => {
        const state = obsidianAutoSyncState.current;
        window.clearTimeout(state.timer);
        state.timer = 0;
        if (isCargoShipWindow || !world.obsidian?.enabled || world.obsidian.autoSync !== true) {
            state.pending = false;
            scheduleObsidianAutoSync.current = () => {};
            return;
        }
        let alive = true;
        let failureReported = false;
        const schedule = () => {
            window.clearTimeout(state.timer);
            state.timer = window.setTimeout(() => {
                state.timer = 0;
                if (!alive) return;
                if (document.visibilityState !== "visible" || !document.hasFocus()) return;
                if (state.inFlight) { state.pending = true; return; }
                state.inFlight = true;
                void getObsidianKnowledgeSummary(world.id)
                    .then(response => {
                        if (!alive) return;
                        if (!response) return;
                        const fingerprint=response.readinessFingerprint;
                        if(response.status!=="ready") {
                            setObsidianAutoSyncFingerprint(fingerprint);
                            const incomplete:ObsidianSyncResponse={ok:false,status:409,code:"KNOWLEDGE_INCOMPLETE",reasonSummary:response.reasonSummary,readinessFingerprint:fingerprint};
                            recordObsidianIncompleteSync(obsidianAutoSyncKey,obsidianSyncSignature,fingerprint);
                            const message=describeObsidianIncompleteSync(incomplete);
                            setObsidianAutoSyncLastMessage(message);
                            if(shouldShowObsidianIncompleteSync(obsidianAutoSyncKey,obsidianSyncSignature,fingerprint)) setObsidianAutoSyncWarning(message);
                            setObsidianAutoSyncNeedsSettings(true);
                            return;
                        }
                        setObsidianAutoSyncFingerprint("");
                        setObsidianAutoSyncWarning("");
                        setObsidianAutoSyncLastMessage("");
                        setObsidianAutoSyncNeedsSettings(false);
                        setObsidianAutoSyncStatusOpen(false);
                        if(shouldPauseObsidianAutoSync(obsidianAutoSyncKey,obsidianSyncSignature,fingerprint)) return;
                        return requestObsidianSync(user.id,world.id,workspaceScope,obsidianSyncSignature).then(syncResponse=>{
                            if(!alive)return;
                            if(!syncResponse.ok) {
                                if(syncResponse.code==="KNOWLEDGE_INCOMPLETE") {
                                    const blockedFingerprint=syncResponse.readinessFingerprint||fingerprint;
                                    setObsidianAutoSyncFingerprint(blockedFingerprint);
                                    recordObsidianIncompleteSync(obsidianAutoSyncKey,obsidianSyncSignature,blockedFingerprint);
                                    const message=describeObsidianIncompleteSync(syncResponse);
                                    setObsidianAutoSyncLastMessage(message);
                                    if(shouldShowObsidianIncompleteSync(obsidianAutoSyncKey,obsidianSyncSignature,blockedFingerprint)) setObsidianAutoSyncWarning(message);
                                    setObsidianAutoSyncNeedsSettings(true);
                                } else {
                                    setObsidianAutoSyncWarning("Automatic Obsidian sync failed. The last successful vault data is preserved; try Sync now or check Diagnostics.");
                                    setObsidianAutoSyncNeedsSettings(false);
                                }
                                if(!failureReported){failureReported=true;captureDiagnostic(user.id,{type:"http",category:"obsidian-auto-sync",message:syncResponse.message||"Automatic Obsidian sync failed.",route:`/worlds/${world.id}/obsidian/sync`,method:"POST",status:syncResponse.status,worldId:world.id});}
                                return;
                            }
                            recordObsidianSyncSuccess(obsidianAutoSyncKey,obsidianSyncSignature);
                            failureReported=false;
                            setObsidianAutoSyncWarning("");
                            setObsidianAutoSyncLastMessage("");
                            setObsidianAutoSyncFingerprint("");
                            setObsidianAutoSyncNeedsSettings(false);
                            setObsidianAutoSyncStatusOpen(false);
                            window.dispatchEvent(new CustomEvent("folderrocket:obsidian-sync-status",{detail:{worldId:world.id,config:syncResponse.config,result:syncResponse.result}}));
                        });
                    })
                    .catch((reason:unknown) => {
                        if (!alive) return;
                        setObsidianAutoSyncWarning(reason instanceof Error?reason.message:"Automatic Obsidian sync failed. The last successful vault data is preserved; try Sync now or check Diagnostics.");
                        setObsidianAutoSyncNeedsSettings(false);
                        if (!failureReported) {
                            failureReported = true;
                            captureDiagnostic(user.id,{type:"http",category:"obsidian-auto-sync",message:"Automatic Obsidian sync request failed.",route:`/worlds/${world.id}/obsidian/sync`,method:"POST",worldId:world.id});
                        }
                    })
                    .finally(() => {
                        state.inFlight = false;
                        if (state.pending) { state.pending = false; scheduleObsidianAutoSync.current(); }
                    });
            }, 1200);
        };
        scheduleObsidianAutoSync.current = schedule;
        const onStorage = (event:StorageEvent) => {
            if (event.key?.includes(workspaceScope) && (event.key.includes("daily-job") || event.key.includes("sticky-notes") || event.key.includes("daily-calendars") || event.key.includes("folders"))) schedule();
        };
        const onScopedEvent = (event:Event) => {
            const detail = (event as CustomEvent<{storageScope?:string}>).detail;
            if (detail?.storageScope && detail.storageScope !== workspaceScope) return;
            schedule();
        };
        const onResume = () => {if (document.visibilityState === "visible" && document.hasFocus()) schedule();};
        window.addEventListener("folderrocket:daily-activity", onScopedEvent);
        window.addEventListener("folderrocket:sticky-notes-updated", onScopedEvent);
        window.addEventListener("folderrocket-calendar-context", onScopedEvent);
        window.addEventListener("folderrocket-files-moved", schedule);
        window.addEventListener("storage", onStorage);
        window.addEventListener("focus", onResume);
        document.addEventListener("visibilitychange", onResume);
        schedule();
        const periodic = window.setInterval(schedule, 5 * 60 * 1000);
        return () => {
            alive = false;
            window.clearTimeout(state.timer);
            state.timer = 0;
            window.clearInterval(periodic);
            window.removeEventListener("folderrocket:daily-activity", onScopedEvent);
            window.removeEventListener("folderrocket:sticky-notes-updated", onScopedEvent);
            window.removeEventListener("folderrocket-calendar-context", onScopedEvent);
            window.removeEventListener("folderrocket-files-moved", schedule);
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("focus", onResume);
            document.removeEventListener("visibilitychange", onResume);
            scheduleObsidianAutoSync.current = () => {};
        };
    }, [isCargoShipWindow,world.id,world.obsidian?.enabled,world.obsidian?.autoSync,obsidianSyncSignature,obsidianAutoSyncKey,workspaceScope,user.id]);
    useEffect(() => {scheduleObsidianAutoSync.current();}, [folders]);
    const [dashboardWidths, setDashboardWidths] = useState<DashboardWidths | null>(() => readDashboardWidths(widthsStorageKey));
    const [dashboardHeight, setDashboardHeight] = useState<number | null>(() => readDashboardHeight(heightStorageKey));
    const navigate=useCallback((next: "dashboard" | "folders" | "processing" | "applications" | "daily" | "email") => {
        if (next !== page && page === "applications" && applicationChecking && !window.confirm("A file check is still running. Leaving Applications will stop it, and you will need to press Continue checking when you return. Leave Applications?")) return;
        if (next === "dashboard" && page === "dashboard") { setDashboardWidths(null); setDashboardHeight(null); }
        setPage(next);
    },[applicationChecking,page]);
    const [dashboardLayout, setDashboardLayout] = useState<"three-column" | "folders-top">(() => localStorage.getItem(`${DASHBOARD_LAYOUT_KEY}-${workspaceScope}`) === "folders-top" ? "folders-top" : "three-column");
    const [searchFolderIds, setSearchFolderIds] = useState<string[]>(() => readSearchFolderSelection(searchStorageKey));
    const [sourceBlocks, setSourceBlocks] = useState<DashboardSourceBlockData[]>(() => readSourceBlocks(sourceBlocksStorageKey));
    const [rightSourceBlocks, setRightSourceBlocks] = useState<DashboardSourceBlockData[]>(() => readSourceBlocks(rightSourceBlocksStorageKey, createDefaultRightSourceBlocks));
    const [preferencesReady, setPreferencesReady] = useState(false);
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [aiConfigured, setAiConfigured] = useState(false);
    const [aiMode, setAiMode] = useState(() => localStorage.getItem(`${AI_MODE_KEY}-${workspaceScope}`) === "on");
    const [appZoom, setAppZoom] = useState(() => readAppZoom(appZoomStorageKey));
    const [appZoomLimits, setAppZoomLimits] = useState<{min:number;max:number;fits:boolean}>({min:.75,max:1.5,fits:true});
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
    const selectedDigestSources = world.activityNotifications?.sources ?? EMPTY_ACTIVITY_NOTIFICATION_SOURCES;
    useEffect(() => {
        if (!world.activityNotifications?.enabled) return;
        let timer = 0;
        let interval = 0;
        let active = true;
        let inFlight = false;
        const sync = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (!active || inFlight) return;
                inFlight = true;
                void fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(world.id)}/activity-snapshot`, {method:"POST", credentials:"include", keepalive:true, headers:{"Content-Type":"application/json"}, body:JSON.stringify({snapshot:selectWorldActivitySnapshot(readWorldActivitySnapshot(workspaceScope),selectedDigestSources)})})
                    .catch(() => {})
                    .finally(() => { inFlight = false; });
            }, 350);
        };
        const onStorage = (event:StorageEvent) => {
            if (event.key?.includes(workspaceScope) && (event.key.includes("daily-job") || event.key.includes("sticky-notes") || event.key.includes("daily-calendars"))) sync();
        };
        sync();
        interval = window.setInterval(sync, 60_000);
        window.addEventListener("folderrocket:daily-activity", sync);
        window.addEventListener("folderrocket:sticky-notes-updated", sync);
        window.addEventListener("folderrocket-calendar-context", sync);
        window.addEventListener("storage", onStorage);
        return () => { active = false; window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener("folderrocket:daily-activity", sync); window.removeEventListener("folderrocket:sticky-notes-updated", sync); window.removeEventListener("folderrocket-calendar-context", sync); window.removeEventListener("storage", onStorage); };
    }, [world.activityNotifications?.enabled, selectedDigestSources, world.id, workspaceScope]);
    useEffect(() => {
        const snapshotsEnabled = world.obsidian?.sourceSelection?.snapshots !== false;
        if (!world.graphEnabled) return;
        let timer=0;
        let interval=0;
        let active=true;
        let inFlight=false;
        const controller=new AbortController();
        const uploadSnapshot=()=>{
            if(!snapshotsEnabled||!active||controller.signal.aborted)return;
            window.clearTimeout(timer);
            timer=window.setTimeout(()=>{
                if(!active||controller.signal.aborted||inFlight)return;
                inFlight=true;
                void fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(world.id)}/graph/snapshot`,{method:"POST",credentials:"include",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({snapshot:readWorldActivitySnapshot(workspaceScope)}),signal:controller.signal})
                    .then(response=>{if(!response.ok)return;})
                    .catch(()=>{})
                    .finally(()=>{inFlight=false;});
            },300);
        };
        const uploadActivity=(event:Event)=>{
            if(!active||controller.signal.aborted)return;
            const activity=(event as CustomEvent<{kind?:string;summary?:string}>).detail;
            if(!activity||typeof activity.kind!=="string"||typeof activity.summary!=="string"||!activity.summary.trim())return;
            const operationId=typeof crypto.randomUUID==="function"?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
            void fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(world.id)}/graph/activity`,{method:"POST",credentials:"include",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({activity:{worldId:world.id,operationId,at:new Date().toISOString(),kind:activity.kind.slice(0,48),summary:activity.summary.slice(0,240)}}),signal:controller.signal}).catch(()=>{});
            uploadSnapshot();
        };
        const onStorage=(event:StorageEvent)=>{if(event.key?.includes(workspaceScope)&&(event.key.includes("daily-job")||event.key.includes("sticky-notes")||event.key.includes("daily-calendars")))uploadSnapshot();};
        window.addEventListener("folderrocket:daily-activity",uploadActivity);
        if(snapshotsEnabled){
            uploadSnapshot();
            interval=window.setInterval(uploadSnapshot,60_000);
            window.addEventListener("folderrocket:sticky-notes-updated",uploadSnapshot);
            window.addEventListener("folderrocket-calendar-context",uploadSnapshot);
            window.addEventListener("storage",onStorage);
        }
        return()=>{active=false;controller.abort();window.clearTimeout(timer);window.clearInterval(interval);window.removeEventListener("folderrocket:daily-activity",uploadActivity);window.removeEventListener("folderrocket:sticky-notes-updated",uploadSnapshot);window.removeEventListener("folderrocket-calendar-context",uploadSnapshot);window.removeEventListener("storage",onStorage);};
    },[world.graphEnabled,world.obsidian?.sourceSelection?.snapshots,world.id,workspaceScope]);
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
        const desktop = window.folderRocketDesktop;
        const refreshZoomLimits = async () => {
            if (!desktop.zoomLimits) return;
            try {
                const limits = await desktop.zoomLimits();
                if (active) setAppZoomLimits({min:Math.max(.75,Math.min(1.5,limits.min)),max:Math.max(.75,Math.min(1.5,limits.max)),fits:Boolean(limits.fits)});
            } catch { /* Keep the browser-compatible zoom range if desktop display limits are unavailable. */ }
        };
        void (async () => {
            await refreshZoomLimits();
            try {
                const value = await desktop.setZoomFactor(initialAppZoomRef.current);
                if (active) setAppZoom(Math.max(.75, Math.min(1.5, value)));
            } catch { /* Preserve the saved zoom state if Electron is restarting its display metrics. */ }
        })();
        const unsubscribe = desktop.onZoomChanged(value => {
            if (active) setAppZoom(Math.max(.75, Math.min(1.5, value)));
            void refreshZoomLimits();
        });
        return () => { active = false; unsubscribe(); };
    }, [isCargoShipWindow]);

    function setDesktopZoom(next: number) {
        const zoom = Math.max(.75, Math.min(appZoomLimits.max, Math.round(next * 100) / 100));
        if (!window.folderRocketDesktop) { setAppZoom(zoom); return; }
        void window.folderRocketDesktop.setZoomFactor(zoom).then(value => { setAppZoom(value); return window.folderRocketDesktop?.zoomLimits?.(); }).then(limits => {
            if (limits) setAppZoomLimits({min:Math.max(.75,Math.min(1.5,limits.min)),max:Math.max(.75,Math.min(1.5,limits.max)),fits:Boolean(limits.fits)});
        });
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
        if (block.type === "gmail") return <GmailSourcePanel key={`${world.id}-${block.id}-${world.emailAccount?.provider === "gmail" ? world.emailAccount.blockId : "none"}`} storageScope={`${workspaceScope}-${block.id}`} alertBlockId={block.id} accountBlockId={world.emailAccount?.provider === "gmail" ? world.emailAccount.blockId : null} accountCatalogKey={user.id} worldId={world.id} worldName={world.name} worldNames={worldNames} aiEnabled={aiEnabled} worldAccountLocked worldAccountStatus={worldAccountReady === "ready" ? "ready" : worldAccountReady === "error" || worldAccountReady === "missing" ? "error" : "loading"} worldAccountReady={worldAccountReady === "ready"} worldAccountEmail={world.emailAccount?.provider === "gmail" ? world.emailAccount.email || "" : ""} onManageWorldAccount={onOpenWorlds} />;
        if (block.type === "outlook") return <OutlookSourcePanel key={`${world.id}-${block.id}-${world.emailAccount?.provider === "outlook" ? world.emailAccount.blockId : "none"}`} storageScope={`${workspaceScope}-${block.id}`} alertBlockId={block.id} accountBlockId={world.emailAccount?.provider === "outlook" ? world.emailAccount.blockId : null} accountCatalogKey={user.id} worldId={world.id} aiEnabled={aiEnabled} worldAccountLocked worldAccountEmail={world.emailAccount?.provider === "outlook" ? world.emailAccount.email || "" : ""} onManageWorldAccount={onOpenWorlds} />;
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
    const dashboardFolderGroups = dashboardLayout === "folders-top" ? folderDescriptionGroups(folders) : folderProjectGroups(folders);
    if (isCargoShipWindow) return <CargoShip {...cargoShipProps} standalone />;
    return <div className="app" style={{"--nav-column-width":dashboardWidths?`${dashboardWidths.left}px`:"calc((min(100vw - 56px, 1420px) - 24px) / 3)"} as CSSProperties}><FolderAppearanceStyles folders={folders}/>
        {obsidianAutoSyncWarning&&<div className="obsidianAutoSyncWarning" role="status"><span>{obsidianAutoSyncWarning}</span>{obsidianAutoSyncNeedsSettings&&<button type="button" className="obsidianAutoSyncSettingsButton" onClick={onOpenWorldSettings}>Review planet settings</button>}<button type="button" onClick={()=>{if(obsidianAutoSyncFingerprint)dismissObsidianIncompleteSync(obsidianAutoSyncKey,obsidianSyncSignature,obsidianAutoSyncFingerprint);setObsidianAutoSyncWarning("");setObsidianAutoSyncNeedsSettings(false);}} aria-label="Dismiss automatic Obsidian sync status">×</button></div>}
        {!obsidianAutoSyncWarning&&obsidianAutoSyncFingerprint&&<div className="obsidianAutoSyncCompact"><button type="button" onClick={()=>setObsidianAutoSyncStatusOpen(value=>!value)} aria-expanded={obsidianAutoSyncStatusOpen}>Obsidian source status needs attention</button>{obsidianAutoSyncStatusOpen&&<div role="status"><span>{obsidianAutoSyncLastMessage||"Automatic sync is waiting for the selected source data. The last complete vault revision is preserved."}</span><button type="button" onClick={onOpenWorldSettings}>Review source settings</button></div>}</div>}
        <header className="appHeader">
            <img className="appLogo" src={folderRocketWordmark} alt="FolderRocket"/>
            <nav className="pageNavigation" aria-label="Pages"><div className="pageMenu" role="group"><div className="pageMenuItems">
                    <button className={page === "dashboard" ? "active" : ""} type="button" aria-label="Dashboard" title="Dashboard" aria-current={page === "dashboard" ? "page" : undefined} onClick={() => navigate("dashboard")}><LayoutDashboard size={15}/><span className="pageNavigationLabel">Dashboard</span></button>
                    <button className={page === "folders" ? "active" : ""} type="button" aria-label="Folder Management" title="Folder Management" aria-current={page === "folders" ? "page" : undefined} onClick={() => navigate("folders")}><FolderCog size={15}/><span className="pageNavigationLabel">Folder Management</span></button>
                    <button className={page === "processing" ? "active" : ""} type="button" aria-label="File Studio" title="File Studio" aria-current={page === "processing" ? "page" : undefined} onClick={() => navigate("processing")}><WandSparkles size={15}/><span className="pageNavigationLabel">File Studio</span></button>
                    <button className={page === "applications" ? "active" : ""} type="button" aria-label="Applications" title="Applications" aria-current={page === "applications" ? "page" : undefined} onClick={() => navigate("applications")}><Shapes size={15}/><span className="pageNavigationLabel">Applications</span></button>
                    <button className={page === "daily" ? "active" : ""} type="button" aria-label="Daily Job" title="Daily Job" aria-current={page === "daily" ? "page" : undefined} onClick={() => navigate("daily")}><BriefcaseBusiness size={15}/><span className="pageNavigationLabel">Daily Job</span></button>
                </div></div>
            </nav>
            <div className="appWorldIdentity" role="img" aria-label={`Pianeta attivo: ${world.name}`} title={`Pianeta attivo: ${world.name}`}><WorldPlanet world={world}/><span>{world.name}</span></div>
            <div className={aiEnabled ? "appAiStatus active" : "appAiStatus inactive"} role="status" aria-live="polite"><span className="appAiStatusDot"/>{aiEnabled ? "AI ON" : "AI OFF"}</div>
            <nav className="appHeaderQuickActions" aria-label="Quick actions">
                {aiEnabled && <button type="button" className="notesAiQuickAdd" onClick={() => setAiNoteAddRequest(current => current + 1)} title="Create an AI post-it" aria-label="Create an AI post-it"><span>AI</span></button>}
                <button type="button" className={aiEnabled ? "notesQuickAdd withAi" : "notesQuickAdd"} onClick={() => setNoteAddRequest(current => current + 1)} title="Add a post-it" aria-label="Add a post-it"><Plus size={19}/></button><button type="button" className="notesReminderQuickAdd" onClick={() => setReminderAddRequest(current => current + 1)} title="Create a reminder post-it" aria-label="Create a reminder post-it"><span>!</span></button>
            </nav>
            <div className="appHeaderTools"><button type="button" className="worldChangeLauncher" onClick={onOpenWorlds} title="Fly To Another Planet"><Orbit size={14}/><span>Fly To Another Planet</span></button><CargoShip {...cargoShipProps} /><AccountMenu user={user} onLogout={onLogout} onOpenDiagnostics={() => setDiagnosticsOpen(true)} appZoom={appZoom} appZoomMax={appZoomLimits.max} appZoomFits={appZoomLimits.fits} onAppZoomChange={setDesktopZoom} aiConfigured={aiConfigured} aiMode={aiMode} onAIModeChange={setAiMode} onAIStatusChange={setAiConfigured} dashboardLayout={dashboardLayout} onDashboardLayoutChange={setDashboardLayout} floatingToolsScale={floatingToolsScale} onFloatingToolsScaleChange={setFloatingToolsScale} bookmarkScale={floatingBookmarkScale} onBookmarkScaleChange={setFloatingBookmarkScale} bookmarkWidth={floatingBookmarkWidth} onBookmarkWidthChange={setFloatingBookmarkWidth} bookmarkHeight={floatingBookmarkHeight} onBookmarkHeightChange={setFloatingBookmarkHeight} /><DiagnosticsCenter userId={user.id} worldNames={worldNames} open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}/></div>
        </header>
        <div className="conversationRailWrap" onMouseEnter={()=>setConversationRailPreview(true)} onMouseLeave={()=>setConversationRailPreview(false)} onFocus={()=>setConversationRailPreview(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setConversationRailPreview(false);}}>
            <button type="button" className={`conversationSideRail${page==="email"?" active":""}${conversationNotificationStatus.kind==="error"?" notificationError":""}`} onClick={()=>navigate("email")} aria-current={page==="email"?"page":undefined} aria-label={`Open Conversations. ${conversationNotificationStatus.message}`} title={conversationNotificationStatus.message}><Mail size={18}/>{conversationUnreadCount!==null&&conversationUnreadCount>0&&<b className="conversationUnreadBadge" aria-label={`${conversationUnreadCount} new email${conversationUnreadCount===1?"":"s"}`}>{conversationUnreadCount>99?"99+":conversationUnreadCount}</b>}<span>CONVERSATION</span></button>
            {conversationRailPreview&&<aside className="conversationRailPreview" role="status"><strong>Conversations</strong><span>{conversationNotificationStatus.message}</span>{conversationUnreadCount!==null&&conversationUnreadCount>0&&<b>{conversationUnreadCount} unread</b>}<small>Activate the tab to open your planet’s email chats.</small></aside>}
        </div>
        {dashboardSaveError&&<div className="appSaveError" role="alert">{dashboardSaveError} Your local copy is still available.</div>}{folderPathNotice&&<div className="appSaveError folderPathNotice" role="status"><span>{folderPathNotice}</span><button type="button" onClick={()=>setFolderPathNotice("")} aria-label="Chiudi avviso">×</button></div>}<DailyAgendaRail storageScope={workspaceScope} onOpenDailyJob={()=>navigate("daily")}/><StickyNotes key={workspaceScope} storageScope={workspaceScope} folders={folders} aiEnabled={aiEnabled} floatingScale={floatingToolsScale} bookmarkScale={floatingBookmarkScale} bookmarkWidth={floatingBookmarkWidth} bookmarkHeight={floatingBookmarkHeight} addRequest={noteAddRequest} aiAddRequest={aiNoteAddRequest} /><div className="pageFrame"><main ref={dashboardRef} style={dashboardStyle} className={`dashboard${page !== "dashboard" ? " pageHidden" : ""}${dashboardLayout === "folders-top" ? " dashboardFoldersTop" : ""}`}>
            <DashboardSourceColumn className="sourcesColumn" title="Sources" blocks={sourceBlocks} onAdd={type => addSourceBlock("left", type)} onDelete={id => deleteSourceBlock("left", id)} onMove={(id, direction) => moveSourceBlock("left", id, direction)} onResize={(id, height) => updateSourceBlock("left", id, {height})} renderBlock={block => renderSourceBlock("left", block)} />
            <div className="dashboardResizer" role="separator" aria-label="Ridimensiona colonne sinistra e centrale" onPointerDown={event => startColumnResize("left", event)} />
            <FolderScrollFrame layout={dashboardLayout} itemCount={dashboardBrowser ? 0 : folders.length}>{dashboardBrowser ? <Suspense fallback={<p className="sourceLoading">Loading folder…</p>}><DashboardFolderBrowser key={dashboardBrowser.path} initialPath={dashboardBrowser.path} initialName={dashboardBrowser.name} onHome={()=>setDashboardBrowser(null)} sourceFolderPaths={folders.filter(item => item.storage !== "imaginary" && Boolean(item.path)).map(item => item.path)} storageScope={workspaceScope} aiEnabled={aiEnabled}/></Suspense> : <div className="foldersContainer">{dashboardFolderGroups.map(group => {
                const groupName = dashboardLayout === "folders-top" ? group.members[0].description || (group.members.length > 1 ? "Other folders" : "") : group.members[0].appearance?.workGroup || group.members[0].description;
                return <div className={group.members.length > 1 ? "dashboardProjectGroup linkedProject" : "dashboardProjectGroup"} key={group.key}>
                    {group.members.length > 1 && <div className="dashboardProjectLabel"><span>{group.symbol}</span><small>{groupName}</small></div>}
                    {group.members.map(folder => <div className={draggedFolderId === folder.id ? "folderOrderItem draggingFolder" : "folderOrderItem"} draggable onDragStart={event => { if (event.target !== event.currentTarget) return; setDraggedFolderId(folder.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-folderrocket-folder-order", folder.id); }} onDragOver={event => { if (event.dataTransfer.types.includes("application/x-folderrocket-folder-order")) event.preventDefault(); }} onDrop={event => { const sourceId = event.dataTransfer.getData("application/x-folderrocket-folder-order"); if (sourceId) { event.preventDefault(); event.stopPropagation(); moveFolder(sourceId, folder.id); } setDraggedFolderId(null); }} onDragEnd={() => setDraggedFolderId(null)} key={folder.id}>
                        <FileDropZone id={folder.id} name={folder.name} pathValue={folder.path} hidePath imaginary={folder.storage === "imaginary"} selected={Boolean(folder.path) && searchFolderIds.includes(folder.id)} sourceFolderPaths={folders.filter(item => item.storage !== "imaginary" && Boolean(item.path)).map(item => item.path)} storageScope={workspaceScope} aiEnabled={aiEnabled} onVirtualFilesAdd={items => updateFolder(folder.id, {virtualFiles: [...(folder.virtualFiles ?? []), ...items.filter(item => !(folder.virtualFiles ?? []).some(file => file.path === item.path))]})} onPathChange={path => updateFolder(folder.id, {path, storage: "physical"})} />
                    </div>)}
                </div>;
            })}</div>}</FolderScrollFrame>
            <div className="dashboardResizer" role="separator" aria-label="Resize center and right columns" onPointerDown={event => startColumnResize("right", event)} />
            <DashboardSourceColumn className="rightSourcesColumn" title="Sources" blocks={rightSourceBlocks} onAdd={type => addSourceBlock("right", type)} onDelete={id => deleteSourceBlock("right", id)} onMove={(id, direction) => moveSourceBlock("right", id, direction)} onResize={(id, height) => updateSourceBlock("right", id, {height})} renderBlock={block => renderSourceBlock("right", block)} />
            <button type="button" className="dashboardHeightResizer" onPointerDown={startDashboardHeightResize} title="Drag to set dashboard height" aria-label="Set dashboard height"><GripHorizontal size={15} /></button>
        </main>{page === "folders" && <div className="folderPage"><Suspense fallback={<p className="sourceLoading">Loading folders…</p>}><FolderManagement folders={folders} onAdd={addFolder} onUpdate={updateFolder} onDelete={deleteFolder} onReorder={moveFolder} aiEnabled={aiEnabled} worldId={world.id} treeRootMode={world.treeRootMode||"computer"} onTreeRootModeChange={onTreeRootModeChange} /></Suspense></div>}{page === "processing" && <div className="processingView"><Suspense fallback={<p className="sourceLoading">Loading File Studio…</p>}><ProcessingWorkspace folders={folders} onUpdate={updateFolder} storageScope={workspaceScope} /></Suspense></div>}{page === "applications" && <div className="applicationsView"><Suspense fallback={<p className="sourceLoading">Loading applications…</p>}><ApplicationsWorkspace storageScope={workspaceScope} folders={folders} onScanningChange={setApplicationChecking} onVirtualFilesAdd={(folderId,items)=>updateFolder(folderId,{virtualFiles:[...(folders.find(folder=>folder.id===folderId)?.virtualFiles??[]),...items.filter(item=>!(folders.find(folder=>folder.id===folderId)?.virtualFiles??[]).some(existing=>existing.path===item.path))]})}/></Suspense></div>}{page === "daily" && <Suspense fallback={<p className="sourceLoading">Loading Daily Job…</p>}><DailyJob storageScope={workspaceScope} worldId={world.id} planetEmailAccount={world.emailAccount} onOpenWorkspace={kind=>navigate(kind==="studio"?"processing":kind==="applications"?"applications":"dashboard")}/></Suspense>}{page === "email"&&<EmailConversations key={world.id} world={world} worlds={worlds} focusThreadId={emailFocusThreadId||undefined} onBack={()=>navigate("dashboard")} onViewGraph={threadId=>onViewGraph(world,threadId)} onGoToDashboard={()=>navigate("dashboard")}/>}</div>
    </div>;
}

function App({user, onLogout}: {user: FolderRocketUser; onLogout: () => Promise<void>}) {
    const [initialWorldState] = useState(() => {
        const state = loadWorkspaceWorldState(user.id);
        migrateDefaultWorldZoom(user.id, state.worlds);
        return state;
    });
    const [worlds, setWorlds] = useState(initialWorldState.worlds);
    const [worldSettingsReady, setWorldSettingsReady] = useState<Record<string, "ready" | "error" | "missing">>({});
    const [activeWorldId, setActiveWorldId] = useState(initialWorldState.activeWorldId);
    const [worldPickerOpen, setWorldPickerOpen] = useState(false);
    const [worldSettingsTargetId,setWorldSettingsTargetId]=useState<string|undefined>();
    const [graphTargetWorld,setGraphTargetWorld]=useState<WorkspaceWorld|null>(null);
    const [graphReturnToPicker,setGraphReturnToPicker]=useState(false);
    const [graphFocusThreadId,setGraphFocusThreadId]=useState("");
    const [worldTravelTarget, setWorldTravelTarget] = useState<WorkspaceWorld | null>(null);
    const [worldSwitchError, setWorldSwitchError] = useState("");
    const [obsidianCommandNotice, setObsidianCommandNotice] = useState("");
    const [preloadedSettingsWorldId, setPreloadedSettingsWorldId] = useState<string | null>(null);
    const worldSwitchSequence = useRef(0);
    const worldSwitchInFlight = useRef(false);
    const selectWorldRef = useRef(selectWorld);
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
        let current=true;
        const controller=new AbortController();
        void Promise.all(initialWorldState.worlds.map(async localWorld=>{
            try{
                const response=await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(localWorld.id)}`,{credentials:"include",signal:controller.signal});
                if(!response.ok){const failure=await response.clone().json().catch(()=>({})) as {code?:string};const missingSettings=response.status===404&&failure.code==="WORLD_SETTINGS_NOT_FOUND";return {id:localWorld.id,world:null,error:!missingSettings,missingSettings};}
                const data=await response.json() as {world?:Partial<WorkspaceWorld>};
                let obsidian:WorkspaceWorld["obsidian"];
                try {const obsidianResponse=await fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(localWorld.id)}/obsidian`,{credentials:"include",signal:controller.signal});if(obsidianResponse.ok){const obsidianData=await obsidianResponse.json() as {config?:WorkspaceWorld["obsidian"]};obsidian=obsidianData.config;}} catch { /* Keep the local world settings if Obsidian settings are unavailable. */ }
                return data.world?{id:localWorld.id,world:{...data.world,...(obsidian?{obsidian}:{})},error:false}:{id:localWorld.id,world:null,error:true};
            }catch{return {id:localWorld.id,world:null,error:true};}
        })).then(remoteWorlds=>{
            if(!current)return;
            setWorldSettingsReady(Object.fromEntries(remoteWorlds.map(item=>[item.id,item.error ? "error" : item.missingSettings ? "missing" : "ready"])));
            const byId=new Map(remoteWorlds.filter((item):item is {id:string;world:Partial<WorkspaceWorld>;error:boolean}=>Boolean(item?.world)).map(item=>[item.id,item.world]));
            setWorlds(existing=>existing.map(world=>{
                const remote=byId.get(world.id);if(!remote)return world;
                return {...world,...(remote.emailAccount!==undefined?{emailAccount:remote.emailAccount}:{}),...(remote.treeRootMode?{treeRootMode:remote.treeRootMode}:{}),...(remote.obsidian?{obsidian:remote.obsidian}:{})};
            }));
        });
        return()=>{current=false;controller.abort();};
    },[initialWorldState.worlds,user.id]);

    useEffect(()=>{selectWorldRef.current=selectWorld;});

    useEffect(()=>{
        const unsubscribe=window.folderRocketDesktop?.onObsidianCommand(command=>{
            if(command.action==="open"){
                const target=worlds.find(item=>item.id===command.worldId);
                if(!target){setObsidianCommandNotice("This planet no longer exists in FolderRocket.");return;}
                if(command.worldId===activeWorld.id){window.dispatchEvent(new CustomEvent("folderrocket-open-email-thread",{detail:{worldId:command.worldId}}));return;}
                const pendingKey=`folderrocket-obsidian-open-email-${user.id}`;
                sessionStorage.setItem(pendingKey,command.worldId);
                setObsidianCommandNotice(`Opening ${target.name} in Conversation…`);
                void selectWorldRef.current(command.worldId).then(()=>{
                    if(localStorage.getItem(`folderrocket-active-world-${user.id}`)!==command.worldId){sessionStorage.removeItem(pendingKey);setObsidianCommandNotice(`Could not switch to ${target.name}.`);}
                }).catch(()=>{sessionStorage.removeItem(pendingKey);setObsidianCommandNotice(`Could not switch to ${target.name}.`);});
                return;
            }
            if(command.action!=="sync")return;
            if(command.worldId!==activeWorld.id){setObsidianCommandNotice("Obsidian requested a sync for another planet. Switch to that planet to synchronize its vault.");return;}
            if(!activeWorld.obsidian?.enabled){setObsidianCommandNotice("Obsidian sync is disabled for this planet. Enable it in Fly To Another Planet settings.");return;}
            setObsidianCommandNotice("Synchronizing this planet’s Obsidian vault…");
            void requestObsidianSync(user.id,activeWorld.id,activeWorldStorageScope(user.id,activeWorld.id),getObsidianSyncSignature(activeWorld)).then(response=>{
                if(!response.ok)throw new Error("Vault synchronization failed.");
                const result=response.result;
                const detail=result?.warnings?.length?` Warnings: ${result.warnings.join(" ")}`:"";
                setObsidianCommandNotice(`${result?.status||"Vault synchronized"}: ${result?.written||0} written, ${result?.unchanged||0} unchanged, ${result?.conflicts||0} conflicts.${detail}`);
            }).catch(()=>setObsidianCommandNotice("Vault synchronization failed. The last successful vault data is preserved; check Diagnostics."));
        });
        return()=>{unsubscribe?.();};
    },[activeWorld, user.id, worlds]);

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
            graphEnabled: false,
            emailAccount: null,
            treeRootMode: "computer",
            obsidian: {enabled:false,vaultPath:""},
            agents: [],
            skills: [],
            permissions: {schemaVersion: 1, configured: false},
            activityNotifications: {enabled:false,senderProvider:"",senderBlockId:"",recipient:"",everyDays:1,time:"08:00",timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",calendarWindow:"today",sources:[]}
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
            const response = await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(updated.id)}`, {method:"PUT", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:updated.name,aiEnabled:updated.aiEnabled,graphEnabled:updated.graphEnabled===true,emailAccount:updated.emailAccount??null,treeRootMode:updated.treeRootMode||"computer",agents:updated.agents,skills:updated.skills,activityNotifications:updated.activityNotifications})});
            const data = await response.json().catch(() => ({})) as {message?:string};
            if (!response.ok) throw new Error(data.message || "Non è stato possibile salvare lo stato AI del pianeta.");
        }
        localStorage.setItem(`${AI_MODE_KEY}-${activeWorldStorageScope(user.id, updated.id)}`, updated.aiEnabled ? "on" : "off");
        window.dispatchEvent(new CustomEvent("folderrocket-world-ai-mode", {detail:{worldId:updated.id, enabled:updated.aiEnabled}}));
        setWorlds(current => current.map(world => world.id === updated.id ? updated : world));
        if (previous) setWorldSettingsReady(current => ({...current,[updated.id]:"ready"}));
        if(updated.graphEnabled&&!previous?.graphEnabled){
            void fetch(`${API_BASE_URL}/worlds/${encodeURIComponent(updated.id)}/graph/index`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({snapshot:readWorldActivitySnapshot(activeWorldStorageScope(user.id,updated.id))})}).catch(()=>{});
        }
    }

    const activeWorldIdForCallbacks = activeWorld.id;
    const updateWorldAiMode = useCallback(async (enabled: boolean) => {
        const response = await fetch(`${API_BASE_URL}/settings/worlds/${encodeURIComponent(activeWorldIdForCallbacks)}`, {method:"PUT", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({aiEnabled:enabled})});
        if (!response.ok) throw new Error("Impossibile sincronizzare l’attivazione AI del pianeta.");
        setWorlds(current => current.map(world => world.id === activeWorldIdForCallbacks ? {...world, aiEnabled: enabled} : world));
        setWorldSettingsReady(current => ({...current,[activeWorldIdForCallbacks]:"ready"}));
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
        {obsidianCommandNotice&&<div className="obsidianCommandNotice" role="status" aria-live="polite"><span>{obsidianCommandNotice}</span><button type="button" onClick={()=>setObsidianCommandNotice("")} aria-label="Dismiss Obsidian status">×</button></div>}
        <WorldWorkspace key={`${user.id}-${activeWorld.id}`} user={user} onLogout={onLogout} world={activeWorld} worlds={worlds} worldNames={worldNames} onOpenWorlds={() => setWorldPickerOpen(true)} onOpenWorldSettings={() => {setWorldSettingsTargetId(activeWorld.id);setWorldPickerOpen(true);}} onViewGraph={(world,threadId)=>{setWorldPickerOpen(false);setGraphReturnToPicker(false);setGraphFocusThreadId(threadId||"");setGraphTargetWorld(world);}} onWorldAiModeChange={updateWorldAiMode} onTreeRootModeChange={mode=>updateWorld({...activeWorld,treeRootMode:mode})} settingsPreloaded={preloadedSettingsWorldId === activeWorld.id} worldAccountReady={worldSettingsReady[activeWorld.id]}/>
        {worldPickerOpen && !isCargoShipWindow && <ChangeWorld worlds={worlds} activeWorldId={activeWorld.id} userId={user.id} storageScope={activeWorldStorageScope(user.id, activeWorld.id)} initialEditWorldId={worldSettingsTargetId} onSyncObsidian={(worldId,signature)=>requestObsidianSync(user.id,worldId,activeWorldStorageScope(user.id,worldId),signature||getObsidianSyncSignature(worlds.find(item=>item.id===worldId)||activeWorld))} onSelect={selectWorld} onViewGraph={world=>{setWorldPickerOpen(false);setGraphFocusThreadId("");setGraphReturnToPicker(true);setGraphTargetWorld(world);}} onInvokeAssistant={invokeWorldAssistant} switchError={worldSwitchError} onBack={() => {setWorldPickerOpen(false);setWorldSettingsTargetId(undefined);}} onAdd={addWorld} onUpdate={updateWorld} onDelete={deleteWorld}/>}
        {graphTargetWorld&&!isCargoShipWindow&&<PlanetGraph key={`${user.id}:${graphTargetWorld.id}`} userId={user.id} world={worlds.find(item=>item.id===graphTargetWorld.id)||graphTargetWorld} active={activeWorld.id===graphTargetWorld.id} focusThreadId={graphFocusThreadId} worldNames={worldNames} onClose={()=>{setGraphTargetWorld(null);setWorldPickerOpen(graphReturnToPicker);setGraphReturnToPicker(false);setGraphFocusThreadId("");}} onOpenConversation={threadId=>{const target=worlds.find(item=>item.id===graphTargetWorld.id);setGraphTargetWorld(null);setWorldPickerOpen(false);setGraphReturnToPicker(false);setGraphFocusThreadId("");if(target?.id===activeWorld.id)window.dispatchEvent(new CustomEvent("folderrocket-open-email-thread",{detail:{worldId:target.id,threadId}}));}} onEnable={async()=>{const current=worlds.find(item=>item.id===graphTargetWorld.id);if(current)await updateWorld({...current,graphEnabled:true});}}/>}
        {worldTravelTarget && <div className="worldTravelScreen" role="status" aria-live="polite" aria-busy="true" style={{"--planet-color":worldTravelTarget.color,"--world-travel-duration":"700ms"} as CSSProperties}><div className="worldTravelStars"/><p className="worldTravelStatus">Preparazione dell’ambiente</p><div className="worldTravelDestination"><WorldPlanet world={worldTravelTarget}/><strong>{worldTravelTarget.name}</strong></div><div className="worldTravelShip" aria-hidden="true"><Rocket size={44}/></div></div>}
    </div>;
}

export default App;
