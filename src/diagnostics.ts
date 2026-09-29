import {API_BASE_URL} from "./api";

export type DiagnosticType = "http" | "runtime" | "unhandled-rejection" | "performance" | "backend" | "electron";
export type DiagnosticSeverity = "info" | "warning" | "error" | "critical";
export interface DiagnosticEvent {
    id: string;
    at: string;
    type: DiagnosticType;
    severity: DiagnosticSeverity;
    category: string;
    message: string;
    route: string;
    screen: string;
    component: string;
    stack: string;
    method: string;
    status: number | null;
    worldId: string;
    requestId: string;
    durationMs: number | null;
    resolved?: boolean;
    reviewed?: boolean;
}

interface DiagnosticsDatabaseEntry {userId: string; events: DiagnosticEvent[]}
const EVENT_NAME = "folderrocket:diagnostics-updated";
const MAX_LOCAL_EVENTS = 120;
const LOCAL_RETENTION_DAYS = 30;
const DATABASE_NAME = "folderrocket-diagnostics";
const STORE_NAME = "events";
let activeWorldId = "";
let diagnosticsUserId = "";
let storageWarningSent = false;
let databasePromise: Promise<IDBDatabase | null> | null = null;
const cache = new Map<string, DiagnosticEvent[]>();
const loads = new Map<string, Promise<DiagnosticEvent[]>>();
const pendingCaptures = new Map<string, DiagnosticEvent[]>();
const captureFlushes = new Map<string, Promise<void>>();
const performanceSampleTimes = new Map<string, number>();

function storageKey(userId: string) { return `folderrocket-diagnostics-v1-${userId}`; }

function safeText(value: unknown, max = 260) {
    return String(value ?? "").replace(/\bBearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(access[_-]?token|refresh[_-]?token|api[_-]?key|password)\s*[:=]\s*\S+/gi, "$1=[redacted]").replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted key]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").replace(/(?:[A-Z]:\\|\\\\|\/Users\/|\/home\/)[^\s"']+/gi, "[local path]").replace(/[\r\n\t]+/g, " ").slice(0, max);
}

function normalizeEntry(value: Partial<DiagnosticEvent>): DiagnosticEvent {
    const allowed: DiagnosticType[] = ["http", "runtime", "unhandled-rejection", "performance", "backend", "electron"];
    const type = allowed.includes(value.type as DiagnosticType) ? value.type as DiagnosticType : "runtime";
    const status = value.status !== null && value.status !== undefined && Number.isFinite(Number(value.status)) ? Number(value.status) : null;
    return {
        id: safeText(value.id || crypto.randomUUID(), 80),
        at: safeText(value.at || new Date().toISOString(), 40),
        type,
        severity: value.severity || (type === "performance" ? "info" : status !== null && status >= 500 ? "error" : status !== null ? "warning" : "error"),
        category: safeText(value.category || type, 50),
        message: safeText(value.message || "Errore applicativo"),
        route: safeText(value.route, 180),
        screen: safeText(value.screen, 100),
        component: safeText(value.component, 100),
        stack: safeText(value.stack, 2000),
        method: safeText(value.method, 10),
        status,
        worldId: /^[a-zA-Z0-9_-]{1,80}$/.test(String(value.worldId || "")) ? String(value.worldId) : "",
        requestId: safeText(value.requestId, 80),
        durationMs: value.durationMs !== null && value.durationMs !== undefined && Number.isFinite(Number(value.durationMs)) ? Math.max(0, Math.round(Number(value.durationMs))) : null,
        resolved: Boolean(value.resolved),
        reviewed: Boolean(value.reviewed)
    };
}

function pruneEvents(entries: Partial<DiagnosticEvent>[]) {
    const cutoff = Date.now() - LOCAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return entries.filter(item => item && Number.isFinite(Date.parse(String(item.at || ""))) && Date.parse(String(item.at)) >= cutoff).map(item => normalizeEntry(item)).slice(0, MAX_LOCAL_EVENTS);
}

function openDatabase(): Promise<IDBDatabase | null> {
    if (databasePromise) return databasePromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    databasePromise = new Promise(resolve => {
        try {
            const request = indexedDB.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, {keyPath: "userId"});
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch { resolve(null); }
    });
    return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
}

async function readDatabaseEntry(userId: string): Promise<DiagnosticsDatabaseEntry | undefined> {
    const db = await openDatabase();
    if (!db) return undefined;
    try {
        const transaction = db.transaction(STORE_NAME, "readonly");
        return await requestResult(transaction.objectStore(STORE_NAME).get(userId)) as DiagnosticsDatabaseEntry | undefined;
    } catch { return undefined; }
}

async function writeDatabaseEntry(userId: string, events: DiagnosticEvent[]) {
    const db = await openDatabase();
    if (!db) throw new Error("Asynchronous local diagnostic storage is unavailable.");
    await new Promise<void>((resolve, reject) => {
        try {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put({userId, events} satisfies DiagnosticsDatabaseEntry);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
            transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
        } catch (error) { reject(error); }
    });
}

async function deleteDatabaseEntry(userId: string) {
    const db = await openDatabase();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
        try {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).delete(userId);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
            transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
        } catch (error) { reject(error); }
    });
}

async function persistEvents(userId: string, entries: DiagnosticEvent[]) {
    const valid = pruneEvents(entries);
    try {
        await writeDatabaseEntry(userId, valid);
    } catch {
        // Preserve the in-memory events and tell the UI; never fall back to a blocking storage write.
        if (!storageWarningSent && typeof window !== "undefined") {
            storageWarningSent = true;
            window.dispatchEvent(new Event("folderrocket:diagnostic-storage-unavailable"));
        }
    }
}

async function loadDiagnostics(userId: string): Promise<DiagnosticEvent[]> {
    if (cache.has(userId)) return [...(cache.get(userId) || [])];
    const existing = loads.get(userId);
    if (existing) return [...await existing];
    const loading = (async () => {
        const databaseEntry = await readDatabaseEntry(userId);
        let raw = databaseEntry?.events;
        if (!Array.isArray(raw)) {
            try { raw = JSON.parse(localStorage.getItem(storageKey(userId)) || "[]"); }
            catch { raw = []; }
        }
        const entries = pruneEvents(Array.isArray(raw) ? raw : []);
        cache.set(userId, entries);
        if (!databaseEntry && entries.length) void persistEvents(userId, entries);
        return entries;
    })();
    loads.set(userId, loading);
    try { return [...await loading]; }
    finally { loads.delete(userId); }
}

export function setDiagnosticWorld(worldId: string) {
    activeWorldId = /^[a-zA-Z0-9_-]{1,80}$/.test(worldId) ? worldId : "";
}

export function hasDiagnosticStorageWarning() { return storageWarningSent; }

export function readLocalDiagnostics(userId: string): Promise<DiagnosticEvent[]> {
    return loadDiagnostics(userId);
}

export function saveLocalDiagnostics(userId: string, entries: DiagnosticEvent[]) {
    if (!userId) return;
    const valid = pruneEvents(entries);
    cache.set(userId, valid);
    void persistEvents(userId, valid);
    window.dispatchEvent(new Event(EVENT_NAME));
}

export async function clearLocalDiagnostics(userId: string) {
    cache.set(userId, []);
    pendingCaptures.delete(userId);
    try { await deleteDatabaseEntry(userId); } catch { /* Clear the compatibility store below as well. */ }
    window.setTimeout(() => { try { localStorage.removeItem(storageKey(userId)); } catch { /* Keep the app usable if local storage is unavailable. */ } }, 0);
    window.dispatchEvent(new Event(EVENT_NAME));
}

export function captureDiagnostic(userId: string, entry: Partial<DiagnosticEvent>) {
    if (!userId || typeof window === "undefined") return;
    const route = entry.route || "";
    const category = entry.category || (route.startsWith("/") ? route.split("/").filter(Boolean)[0] : entry.type || "app");
    const next = normalizeEntry({...entry, category, screen: entry.screen || window.location.pathname, worldId: entry.worldId === undefined ? activeWorldId : entry.worldId});
    const current = cache.get(userId);
    if (current) {
        saveLocalDiagnostics(userId, [next, ...current.filter(item => item.id !== next.id)]);
    } else {
        const pending = pendingCaptures.get(userId) || [];
        pendingCaptures.set(userId, [next, ...pending.filter(item => item.id !== next.id)]);
        if (!captureFlushes.has(userId)) {
            const flush = loadDiagnostics(userId).then(entries => {
                const captured = pendingCaptures.get(userId) || [];
                pendingCaptures.delete(userId);
                const latest = cache.get(userId) || entries;
                saveLocalDiagnostics(userId, [...captured, ...latest.filter(item => !captured.some(capture => capture.id === item.id))]);
            }).catch(() => { pendingCaptures.delete(userId); }).finally(() => captureFlushes.delete(userId));
            captureFlushes.set(userId, flush);
        }
    }
    window.dispatchEvent(new CustomEvent("folderrocket:diagnostic-captured", {detail:next}));
}

function isBackendRequest(input: RequestInfo | URL) {
    try {
        const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url, window.location.href);
        return url.origin === new URL(API_BASE_URL).origin && url.pathname !== "/diagnostics";
    } catch { return false; }
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url, window.location.href);
    return {
        route: url.pathname,
        method: String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase(),
        worldId: url.searchParams.get("worldId") || activeWorldId,
        screen: window.location.pathname
    };
}

declare global { interface Window { __folderRocketDiagnosticsInstalled?: boolean; } }

export function installDiagnostics(userId: string) {
    const previousUserId = diagnosticsUserId;
    diagnosticsUserId = userId;
    if (previousUserId === "startup" && userId !== "startup") {
        void readLocalDiagnostics("startup").then(startupEvents => {
            if (!startupEvents.length) return;
            void readLocalDiagnostics(userId).then(userEvents => {
                saveLocalDiagnostics(userId, [...startupEvents, ...userEvents]);
                saveLocalDiagnostics("startup", []);
            });
        });
    }
    if (typeof window === "undefined" || window.__folderRocketDiagnosticsInstalled) return;
    window.__folderRocketDiagnosticsInstalled = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!isBackendRequest(input)) return originalFetch(input, init);
        const details = requestDetails(input, init);
        const startedAt = performance.now();
        const clientRequestId = crypto.randomUUID();
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        headers.set("X-FolderRocket-Screen", details.screen);
        headers.set("X-FolderRocket-Diagnostic-Id", clientRequestId);
        if (details.worldId) headers.set("X-FolderRocket-World-Id", details.worldId);
        try {
            const response = await originalFetch(input, {...init, headers});
            const durationMs = performance.now() - startedAt;
            const requestId = response.headers.get("X-FolderRocket-Diagnostic-Id") || clientRequestId;
            if (!response.ok) {
                const body = await response.clone().json().catch(() => null) as {message?: unknown; code?: unknown} | null;
                const expectedMissingResource = response.status === 404 && (
                    details.route === "/domain/preview" && body?.code === "REMOTE_PAGE_NOT_FOUND"
                    || details.route === "/list-folder-files" && body?.code === "FOLDER_NOT_FOUND"
                );
                if (!expectedMissingResource) captureDiagnostic(diagnosticsUserId, {
                    id: requestId || crypto.randomUUID(),
                    type: "http",
                    category: details.route.split("/").filter(Boolean)[0] || "backend",
                    severity: response.status >= 500 ? "error" : "warning",
                    message: safeText(body?.message || (response.status >= 500 ? "Il backend non è riuscito a completare la richiesta." : "La richiesta è stata rifiutata o non completata.")),
                    ...details,
                    component: details.route,
                    status: response.status,
                    requestId,
                    durationMs
                });
            } else {
                const now = Date.now();
                const sampleKey = `${details.method}:${details.route}`;
                if (now - (performanceSampleTimes.get(sampleKey) || 0) >= 60_000) {
                    performanceSampleTimes.set(sampleKey, now);
                    captureDiagnostic(diagnosticsUserId, {id:`request-${sampleKey}-${Math.floor(now / 60_000)}`, type:"performance", severity:"info", category:"api-performance", message:"Tempo di risposta API", ...details, status:response.status, requestId, durationMs, resolved:true});
                }
            }
            return response;
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error;
            captureDiagnostic(diagnosticsUserId, {id:clientRequestId, requestId:clientRequestId, type: "http", severity:"error", category:details.route.split("/").filter(Boolean)[0] || "backend", message: "Il backend non è raggiungibile o la connessione si è interrotta.", ...details, component:details.route, durationMs: performance.now() - startedAt, stack:error instanceof Error ? error.stack : ""});
            throw error;
        }
    };

    window.addEventListener("error", event => {
        const source = event.filename ? event.filename.split(/[\\/]/).slice(-2).join("/") : "";
        captureDiagnostic(diagnosticsUserId, {type: "runtime", category:"interfaccia", message: safeText(event.message || "Errore JavaScript"), route: source ? `${source}:${event.lineno || 0}` : window.location.pathname, stack:event.error instanceof Error ? event.error.stack : ""});
    });
    window.addEventListener("unhandledrejection", event => {
        const reason = event.reason;
        const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason || "Promise rifiutata senza dettagli");
        captureDiagnostic(diagnosticsUserId, {type: "unhandled-rejection", category:"interfaccia", message: safeText(message), route: window.location.pathname, stack:reason instanceof Error ? reason.stack : ""});
    });
    const originalWarn = console.warn.bind(console);
    let warningWindowStarted = performance.now();
    let warningsCaptured = 0;
    console.warn = (...args: unknown[]) => {
        originalWarn(...args);
        const now = performance.now();
        if (now - warningWindowStarted > 60_000) { warningWindowStarted = now; warningsCaptured = 0; }
        if (warningsCaptured >= 12) return;
        warningsCaptured++;
        const message = safeText(args.map(argument => argument instanceof Error ? `${argument.name}: ${argument.message}` : String(argument)).join(" "));
        captureDiagnostic(diagnosticsUserId, {type:"runtime", severity:"warning", category:"console", message, route:window.location.pathname});
    };

    const captureLoad = () => {
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const loadEventEnd = Number(navigation?.loadEventEnd || 0);
        if (navigation && loadEventEnd > 0) captureDiagnostic(diagnosticsUserId, {id: `load-${Math.round(navigation.startTime)}-${Math.round(loadEventEnd)}`, type: "performance", category:"startup", message: "Caricamento iniziale della pagina", route: window.location.pathname, durationMs: loadEventEnd, resolved: true});
    };
    if (document.readyState === "complete") captureLoad();
    else window.addEventListener("load", captureLoad, {once: true});
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
        try {
            let lastLongTaskCapture = -3000;
            let capturedLongTasks = 0;
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) if (entry.duration >= 300 && entry.startTime - lastLongTaskCapture >= 3000 && capturedLongTasks < 15) {
                    lastLongTaskCapture = entry.startTime;
                    capturedLongTasks++;
                    captureDiagnostic(diagnosticsUserId, {id: `longtask-${Math.round(entry.startTime)}-${Math.round(entry.duration)}`, type: "performance", category:"interfaccia", message: "Blocco prolungato dell’interfaccia", route: window.location.pathname, durationMs: entry.duration, resolved: true});
                }
            });
            observer.observe({type: "longtask", buffered: true});
        } catch { /* Long task monitoring is optional on browsers without this entry type. */ }
    }
}
