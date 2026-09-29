import {additionalFileIcon} from './AdditionalFileIcons';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

import {
    File,
    FileSpreadsheet,
    FileText,
    Image,
    Archive,
    Mail,
    ExternalLink,
    MessageSquareText,
    RefreshCw,
    BellRing
} from "lucide-react";

import { API_BASE_URL } from "../api";
import {emailAccountContainsBlock, emailAccountOptionLabel, invalidateEmailAccounts, loadEmailAccounts, type EmailAccount} from "../emailAccounts";
import EmailAlertBuilder, {type EmailAlertRule, type EmailAttachmentReader} from "./EmailAlertBuilder";

interface EmailAttachment {
    attachmentId: string;
    messageId: string;
    mimeType: string;
    name: string;
    receivedAt: string;
    sender: string;
    size: number;
    subject: string;
}

type FilterMode = "relative" | "range";

type WarningKind = "ai" | "sender";

type GmailWarningRule = EmailAlertRule;

interface GmailWarningResult {
    ruleId: string;
    total: number;
    newCount: number;
    messageIds: string[];
    messages?: GmailAlertMessage[];
    error?: string;
}

interface GmailAlertMessage {
    id: string;
    sender: string;
    subject: string;
    receivedAt: string;
}

type GmailInboxItem =
    | {type: "attachment"; attachment: EmailAttachment; alertKind?: WarningKind; alertColor?: string; messageGroup?: "start" | "middle" | "end"}
    | {type: "alert"; alert: GmailAlertMessage; alertKind: WarningKind; alertColor?: string};

const DISMISSED_KEY = "folderrocket-dismissed-gmail";
const WARNINGS_KEY = "folderrocket-gmail-warnings";
const WARNING_SEEN_KEY = "folderrocket-gmail-warning-seen";
const WARNING_ALERTED_KEY = "folderrocket-gmail-warning-alerted";
const WARNING_RESULTS_KEY = "folderrocket-gmail-warning-results";
const EMAIL_ATTACHMENT_TYPE = "application/x-folderrocket-gmail-attachments";
const LEGACY_SHARED_GMAIL_ACCOUNT_ID = "folderrocket-legacy-shared-gmail";

function storageKey(key: string, scope: string) { return `${key}-${scope}`; }

function readDismissed(scope: string): string[] {
    try {
        return JSON.parse(localStorage.getItem(storageKey(DISMISSED_KEY, scope)) ?? "[]");
    }
    catch {
        return [];
    }
}

function defaultWarningRule(rule: {id: string; kind: WarningKind; query: string}): GmailWarningRule {
    return {
        ...rule,
        label: rule.kind === "ai" ? "AI alert" : "Sender list",
        color: rule.kind === "ai" ? "red" : "green",
        enabled: true,
        filter: {mode: "hours", hours: 24, startAt: "", endAt: ""},
        schedule: {enabled: false, frequency: "manual", time: "09:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6]}
    };
}

function readWarnings(scope: string): GmailWarningRule[] {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey(WARNINGS_KEY, scope)) ?? "[]");
        return Array.isArray(saved)
            ? saved.filter((rule): rule is {id: string; kind: WarningKind; query: string} => rule && typeof rule.id === "string" && (rule.kind === "ai" || rule.kind === "sender") && typeof rule.query === "string").map(rule => {
                const stored = rule as Partial<GmailWarningRule>;
                const defaults = defaultWarningRule(rule);
                return {...defaults, ...stored, filter: stored.filter ?? defaults.filter, schedule: {...defaults.schedule, ...stored.schedule}};
            })
            : [];
    }
    catch {
        return [];
    }
}

function readWarningSeen(scope: string): Record<string, string[]> {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey(WARNING_SEEN_KEY, scope)) ?? "{}");
        return saved && typeof saved === "object" ? saved as Record<string, string[]> : {};
    }
    catch {
        return {};
    }
}

function readWarningAlerts(scope: string): Record<string, string[]> {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey(WARNING_ALERTED_KEY, scope)) ?? "{}");
        return saved && typeof saved === "object" ? saved as Record<string, string[]> : {};
    }
    catch {
        return {};
    }
}

function readWarningResults(scope: string): GmailWarningResult[] {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey(WARNING_RESULTS_KEY, scope)) ?? "[]");
        return Array.isArray(saved) ? saved.filter((result): result is GmailWarningResult => result && typeof result.ruleId === "string" && Array.isArray(result.messageIds)) : [];
    } catch {
        return [];
    }
}

function formatSize(bytes: number): string {
    return bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatReceivedAt(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", {day: "2-digit", month: "short"});
}

function mergeAttachments(current: EmailAttachment[], incoming: EmailAttachment[]) {
    const merged = new Map(current.map(item => [`${item.messageId}:${item.attachmentId}`, item]));
    for (const item of incoming) merged.set(`${item.messageId}:${item.attachmentId}`, item);
    return [...merged.values()].sort((first, second) => new Date(second.receivedAt).getTime() - new Date(first.receivedAt).getTime());
}

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, 14);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={14} /></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14} /></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={14} /></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt"><FileText size={14} /></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={14} /></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14} /></span>;
    return <span className="fileKindIcon generic"><File size={14} /></span>;
}

function GmailSourcePanel({storageScope, alertBlockId, accountBlockId, onAccountBlockIdChange, accountCatalogKey = "", worldId = "work", worldNames = {}, worldName = "", aiEnabled = false}: {storageScope: string; alertBlockId: string; accountBlockId?: string | null; onAccountBlockIdChange?: (accountBlockId?: string | null) => void; accountCatalogKey?: string; worldId?: string; worldNames?: Record<string, string>; worldName?: string; aiEnabled?: boolean}) {
    const accountBlockChangeRef = useRef(onAccountBlockIdChange);
    useEffect(() => { accountBlockChangeRef.current = onAccountBlockIdChange; }, [onAccountBlockIdChange]);
    const credentialBlockId = accountBlockId === null ? "" : accountBlockId || alertBlockId;
    const accountDataScope = `${storageScope}-gmail-${credentialBlockId || "none"}`;
    const alertSettingsUrl = `${API_BASE_URL}/email/alerts/settings/gmail?blockId=${encodeURIComponent(alertBlockId)}&worldId=${encodeURIComponent(worldId)}`;
    const gmailUrl = useCallback((endpoint: string) => `${API_BASE_URL}/email/gmail${endpoint}${endpoint.includes("?") ? "&" : "?"}blockId=${encodeURIComponent(credentialBlockId)}`, [credentialBlockId]);
    const gmailAuthUrl = (endpoint: string, targetBlockId = credentialBlockId) => `${API_BASE_URL}/auth/gmail${endpoint}?blockId=${encodeURIComponent(targetBlockId)}`;
    const [connected, setConnected] = useState(false);
    const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [dismissedIds, setDismissedIds] = useState<string[]>(() => readDismissed(accountDataScope));
    const [mode, setMode] = useState<FilterMode>("relative");
    const [days, setDays] = useState(7);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [liveReading, setLiveReading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showWarnings, setShowWarnings] = useState(false);
    const [warnings, setWarnings] = useState<GmailWarningRule[]>(() => readWarnings(storageScope));
    const [favorites, setFavorites] = useState<GmailWarningRule[]>([]);
    const [attachmentReader, setAttachmentReader] = useState<EmailAttachmentReader>({enabled: true, filter: {mode: "relative", days: 7, startDate: "", endDate: ""}});
    const [alertSettingsReady, setAlertSettingsReady] = useState(false);
    const [warningResults, setWarningResults] = useState<GmailWarningResult[]>(() => readWarningResults(accountDataScope));
    const [visibleWarningKind, setVisibleWarningKind] = useState<WarningKind | null>(null);
    const [warningLoading, setWarningLoading] = useState(false);
    const [warningError, setWarningError] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [disconnectArmed, setDisconnectArmed] = useState(false);
    const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
    const selectedCatalogAccount = emailAccounts.find(account => emailAccountContainsBlock(account, credentialBlockId));
    const hasAccountSelected = accountBlockId !== null && (Boolean(accountBlockId) || Boolean(selectedCatalogAccount));
    const accountPickerValue = accountBlockId === null
        ? ""
        : selectedCatalogAccount
            ? credentialBlockId
            : accountBlockId
                ? credentialBlockId
                : "";
    const canDisconnectGlobally = credentialBlockId === alertBlockId || credentialBlockId === LEGACY_SHARED_GMAIL_ACCOUNT_ID;
    const selectedAccountDescription = !accountPickerValue
        ? `Nessun account selezionato per ${worldName || "questo pianeta"}`
        : selectedCatalogAccount
            ? `Selezionato per ${worldName || "questo pianeta"} · ${selectedCatalogAccount.email || selectedCatalogAccount.label}`
            : "Selezione salvata · origine non specificata";
    const visibleWarnings = useMemo(() => warnings.filter(rule => aiEnabled || rule.kind !== "ai"), [aiEnabled, warnings]);

    useEffect(() => {
        if (!accountCatalogKey) return;
        let active = true;
        const refreshAccounts = (force = false) => void loadEmailAccounts("gmail", accountCatalogKey, force)
            .then(accounts => { if (active) setEmailAccounts(accounts); })
            .catch(() => { if (active) setEmailAccounts([]); });
        refreshAccounts();
        const refreshOnFocus = () => refreshAccounts(true);
        window.addEventListener("focus", refreshOnFocus);
        return () => { active = false; window.removeEventListener("focus", refreshOnFocus); };
    }, [accountCatalogKey]);

    const visibleAttachments = useMemo(
        () => attachments.filter(
            attachment => !dismissedIds.includes(`${attachment.messageId}:${attachment.attachmentId}`)
        ),
        [attachments, dismissedIds]
    );

    const inboxItems = useMemo<GmailInboxItem[]>(() => {
        const alertsByMessage = new Map<string, {alert: GmailAlertMessage; alertKind: WarningKind; alertColor: string}>();
        for (const result of warningResults) {
            const rule = visibleWarnings.find(item => item.id === result.ruleId);
            if (!rule || !rule.enabled) continue;
            for (const alert of result.messages ?? []) {
                const current = alertsByMessage.get(alert.id);
                if (!current || rule.kind === "sender") alertsByMessage.set(alert.id, {alert, alertKind: rule.kind, alertColor: rule.color});
            }
        }
        const attachedMessageIds = new Set(visibleAttachments.map(attachment => attachment.messageId));
        const items: GmailInboxItem[] = [
            ...visibleAttachments.map(attachment => ({type: "attachment" as const, attachment, alertKind: alertsByMessage.get(attachment.messageId)?.alertKind, alertColor: alertsByMessage.get(attachment.messageId)?.alertColor})),
            ...[...alertsByMessage.values()].filter(({alert}) => !attachedMessageIds.has(alert.id)).map(({alert, alertKind, alertColor}) => ({type: "alert" as const, alert, alertKind, alertColor}))
        ];
        const ordered = items.sort((first, second) => {
            const firstDate = first.type === "attachment" ? first.attachment.receivedAt : first.alert.receivedAt;
            const secondDate = second.type === "attachment" ? second.attachment.receivedAt : second.alert.receivedAt;
            return new Date(secondDate).getTime() - new Date(firstDate).getTime();
        });
        const totalByMessage = new Map<string, number>();
        for (const item of ordered) if (item.type === "attachment") totalByMessage.set(item.attachment.messageId, (totalByMessage.get(item.attachment.messageId) ?? 0) + 1);
        const seenByMessage = new Map<string, number>();
        return ordered.map(item => {
            if (item.type !== "attachment") return item;
            const total = totalByMessage.get(item.attachment.messageId) ?? 1;
            if (total < 2) return item;
            const seen = (seenByMessage.get(item.attachment.messageId) ?? 0) + 1;
            seenByMessage.set(item.attachment.messageId, seen);
            return {...item, messageGroup: seen === 1 ? "start" as const : seen === total ? "end" as const : "middle" as const};
        });
    }, [visibleAttachments, visibleWarnings, warningResults]);

    const warningMessages = useMemo(() => {
        const grouped: Record<WarningKind, GmailAlertMessage[]> = {ai: [], sender: []};
        const seen: Record<WarningKind, Set<string>> = {ai: new Set(), sender: new Set()};
        for (const result of warningResults) {
            const rule = visibleWarnings.find(item => item.id === result.ruleId);
            const kind = rule?.enabled ? rule.kind : undefined;
            if (!kind) continue;
            for (const message of result.messages ?? []) {
                if (seen[kind].has(message.id)) continue;
                seen[kind].add(message.id);
                grouped[kind].push(message);
            }
        }
        for (const kind of ["ai", "sender"] as WarningKind[]) grouped[kind].sort((first, second) => new Date(second.receivedAt).getTime() - new Date(first.receivedAt).getTime());
        return grouped;
    }, [visibleWarnings, warningResults]);

    const checkWarnings = useCallback(async (rulesToCheck = warnings) => {
        const activeRules = rulesToCheck.filter(rule => rule.enabled !== false && (aiEnabled || rule.kind !== "ai"));
        if (!connected || !hasAccountSelected || !activeRules.length) return;
        setWarningLoading(true);
        setWarningError("");
        try {
            const seenByRule = readWarningSeen(accountDataScope);
            const response = await fetch(gmailUrl("/warnings/check"), {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({rules: activeRules, seenByRule, mode, days, startDate, endDate})
            });
            const data = await response.json() as {results?: GmailWarningResult[]; attachments?: EmailAttachment[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? "Unable to check Gmail warnings");
            const results = Array.isArray(data.results) ? data.results : [];
            setWarningResults(results);
            localStorage.setItem(storageKey(WARNING_RESULTS_KEY, accountDataScope), JSON.stringify(results));
            if (Array.isArray(data.attachments) && data.attachments.length) setAttachments(current => mergeAttachments(current, data.attachments ?? []));
            const aiError = aiEnabled ? results.find(result => warnings.find(rule => rule.id === result.ruleId)?.kind === "ai" && result.error)?.error : undefined;
            if (aiError) setWarningError(aiError);
            const nextSeen = {...seenByRule};
            const nextAlerts = {...readWarningAlerts(accountDataScope)};
            for (const result of results) {
                const newIds = result.messageIds.filter(messageId => !(nextSeen[result.ruleId] ?? []).includes(messageId));
                nextSeen[result.ruleId] = [...new Set([...(nextSeen[result.ruleId] ?? []), ...result.messageIds])].slice(-200);
                nextAlerts[result.ruleId] = [...new Set([...(nextAlerts[result.ruleId] ?? []), ...newIds])].slice(-200);
            }
            localStorage.setItem(storageKey(WARNING_SEEN_KEY, accountDataScope), JSON.stringify(nextSeen));
            localStorage.setItem(storageKey(WARNING_ALERTED_KEY, accountDataScope), JSON.stringify(nextAlerts));
        }
        catch (warningCheckError) {
            setWarningError(warningCheckError instanceof Error ? warningCheckError.message : "Unable to check Gmail warnings");
        }
        finally {
            setWarningLoading(false);
        }
    }, [accountDataScope, aiEnabled, connected, days, endDate, hasAccountSelected, mode, startDate, warnings, gmailUrl]);

    const refresh = useCallback(async () => {
        if (!connected || !hasAccountSelected) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            if (attachmentReader.enabled) {
                const response = await fetch(gmailUrl("/attachments"), {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    credentials: "include",
                    body: JSON.stringify(attachmentReader.filter)
                });
                const data = await response.json() as {attachments?: EmailAttachment[]; message?: string};
                if (!response.ok) {
                    throw new Error(data.message ?? "Unable to refresh Gmail");
                }
                setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
            } else {
                setAttachments([]);
            }
            void checkWarnings();
        }
        catch (refreshError) {
            setError(refreshError instanceof Error ? refreshError.message : "Errore Gmail");
        }
        finally {
            setLoading(false);
        }
    }, [attachmentReader, checkWarnings, connected, hasAccountSelected, gmailUrl]);

    useEffect(() => {
        let active = true;
        const refreshConnection = () => {
            if (!hasAccountSelected) {
                setConnected(false);
                setAttachments([]);
                setWarningResults([]);
                setSelectedIds([]);
                return;
            }
            void fetch(gmailUrl("/status"), {credentials: "include"})
                .then(response => response.json())
                .then((data: {connected?: boolean}) => { if (active) setConnected(Boolean(data.connected)); })
                .catch(() => { if (active) setConnected(false); });
        };
        refreshConnection();
        window.addEventListener("focus", refreshConnection);
        return () => { active = false; window.removeEventListener("focus", refreshConnection); };
    }, [gmailUrl, hasAccountSelected]);

    useEffect(() => {
        let active = true;
        fetch(alertSettingsUrl, {credentials: "include"})
            .then(response => response.ok ? response.json() : null)
            .then((data: {providerSettings?: {accountBlockId?: string | null; attachmentReader?: EmailAttachmentReader; rules?: GmailWarningRule[]; runtime?: {accountBlockId?: string; rules?: Record<string, {result?: GmailWarningResult; attachments?: EmailAttachment[]}>}}; favorites?: GmailWarningRule[]} | null) => {
                if (!active || !data?.providerSettings) return;
                const provider = data.providerSettings;
                if (accountBlockId === undefined && provider.accountBlockId === null) accountBlockChangeRef.current?.(null);
                else if (accountBlockId === undefined && typeof provider.accountBlockId === "string" && provider.accountBlockId) {
                    accountBlockChangeRef.current?.(provider.accountBlockId === alertBlockId ? undefined : provider.accountBlockId);
                }
                if (provider.attachmentReader) {
                    const filter = provider.attachmentReader.filter;
                    setAttachmentReader(provider.attachmentReader);
                    setMode(filter.mode);
                    setDays(filter.days);
                    setStartDate(filter.startDate);
                    setEndDate(filter.endDate);
                }
                if (Array.isArray(provider.rules) && provider.rules.length) setWarnings(provider.rules);
                if (Array.isArray(data.favorites)) setFavorites(data.favorites);
                const configuredAccountId = provider.accountBlockId === null ? "" : provider.accountBlockId || alertBlockId;
                const runtimeAccountId = (provider.runtime as {accountBlockId?: string} | undefined)?.accountBlockId;
                const runtimeMatches = configuredAccountId === credentialBlockId && (!runtimeAccountId || runtimeAccountId === credentialBlockId);
                const scheduledResults = runtimeMatches ? Object.values(provider.runtime?.rules ?? {}).map(item => item?.result).filter((item): item is GmailWarningResult => Boolean(item)) : [];
                if (scheduledResults.length) { setWarningResults(scheduledResults); localStorage.setItem(storageKey(WARNING_RESULTS_KEY, accountDataScope), JSON.stringify(scheduledResults)); }
                const scheduledAttachments = runtimeMatches ? Object.values(provider.runtime?.rules ?? {}).flatMap(item => item?.attachments ?? []) : [];
                if (runtimeMatches && scheduledAttachments.length) setAttachments(current => mergeAttachments(current, scheduledAttachments));
            })
            .finally(() => { if (active) setAlertSettingsReady(true); });
        return () => { active = false; };
    }, [accountBlockId, accountDataScope, alertBlockId, alertSettingsUrl, credentialBlockId]);

    useEffect(() => {
        if (!alertSettingsReady) return;
        const timer = window.setTimeout(() => {
            void fetch(alertSettingsUrl, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({providerSettings: {attachmentReader, rules: warnings, accountBlockId: accountBlockId === null ? null : credentialBlockId}, favorites})
            }).then(async response=>{if(!response.ok){const data=await response.json().catch(()=>({})) as {message?:string};throw new Error(data.message||"Unable to save Gmail settings.");}}).catch(reason=>setError(reason instanceof Error?reason.message:"Unable to save Gmail settings."));
        }, 350);
        return () => window.clearTimeout(timer);
    }, [accountBlockId, alertSettingsReady, alertSettingsUrl, attachmentReader, credentialBlockId, favorites, warnings]);

    useEffect(() => {
        if (!connected) return;
        const interval = window.setInterval(() => {
            void fetch(alertSettingsUrl, {credentials: "include"})
                .then(response => response.ok ? response.json() : null)
                .then((data: {providerSettings?: {accountBlockId?: string | null; runtime?: {accountBlockId?: string; rules?: Record<string, {result?: GmailWarningResult; attachments?: EmailAttachment[]}>}}; favorites?: GmailWarningRule[]} | null) => {
                    const provider = data?.providerSettings as ({accountBlockId?: string | null; runtime?: {accountBlockId?: string; rules?: Record<string, {result?: GmailWarningResult; attachments?: EmailAttachment[]}>}} | undefined);
                    const configuredAccountId = provider?.accountBlockId === null ? "" : provider?.accountBlockId || alertBlockId;
                    const runtimeAccountId = provider?.runtime?.accountBlockId;
                    if (configuredAccountId !== credentialBlockId || (runtimeAccountId && runtimeAccountId !== credentialBlockId)) return;
                    const runtimeRules = Object.values(provider?.runtime?.rules ?? {});
                    const results = runtimeRules.map(item => item?.result).filter((item): item is GmailWarningResult => Boolean(item));
                    if (results.length) { setWarningResults(results); localStorage.setItem(storageKey(WARNING_RESULTS_KEY, accountDataScope), JSON.stringify(results)); }
                    const scheduledAttachments = runtimeRules.flatMap(item => item?.attachments ?? []);
                    if (scheduledAttachments.length) setAttachments(current => mergeAttachments(current, scheduledAttachments));
                    if (Array.isArray(data?.favorites)) setFavorites(data.favorites);
                });
        }, 60_000);
        return () => window.clearInterval(interval);
    }, [accountDataScope, alertBlockId, alertSettingsUrl, connected, credentialBlockId]);

    useEffect(() => {
        if (!liveReading || !connected) {
            return;
        }
        const initialRefresh = window.setTimeout(
            () => void refresh(),
            0
        );
        const interval = window.setInterval(() => void refresh(), 60_000);
        return () => {
            window.clearTimeout(initialRefresh);
            window.clearInterval(interval);
        };
    }, [connected, liveReading, refresh]);

    useEffect(() => {
        if (!connected || !attachmentReader.enabled) return;
        const timer = window.setTimeout(() => void refresh(), 0);
        return () => window.clearTimeout(timer);
    }, [attachmentReader.enabled, connected, refresh]);

    useEffect(() => {
        const dismissWhenOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest(".emailSourceCard")) setSelectedIds([]);
            if (!target.closest(".gmailWarningsMenu") && !target.closest(".gmailWarningToggle")) setShowWarnings(false);
            if (!target.closest(".emailReaderHeaderControl")) { setShowSettings(false); setDisconnectArmed(false); }
        };
        document.addEventListener("pointerdown", dismissWhenOutside);
        return () => document.removeEventListener("pointerdown", dismissWhenOutside);
    }, []);

    useEffect(() => {
        const syncFavorites = (event: Event) => {
            const favorites = (event as CustomEvent<GmailWarningRule[]>).detail;
            if (Array.isArray(favorites)) setFavorites(favorites);
        };
        window.addEventListener("folderrocket-email-alert-favorites", syncFavorites);
        return () => window.removeEventListener("folderrocket-email-alert-favorites", syncFavorites);
    }, []);

    useEffect(() => {
        const refreshFromSplitButton = (event: MouseEvent) => {
            if (!(event.target as Element).closest(".emailReaderHeaderButton svg")) return;
            event.preventDefault(); event.stopPropagation();
            if (attachmentReader.enabled && !loading) void refresh();
        };
        document.addEventListener("click", refreshFromSplitButton, true);
        return () => document.removeEventListener("click", refreshFromSplitButton, true);
    }, [attachmentReader.enabled, loading, refresh]);

    function toggleSelection(id: string) {
        setSelectedIds(current => current.includes(id)
            ? current.filter(currentId => currentId !== id)
            : [...current, id]);
    }

    function dismissSelected() {
        const toDismiss = selectedIds;
        setDismissedIds(current => {
            const updated = [...new Set([...current, ...toDismiss])];
            localStorage.setItem(storageKey(DISMISSED_KEY, accountDataScope), JSON.stringify(updated));
            return updated;
        });
        setSelectedIds([]);
    }

    async function openSelected() {
        await Promise.all(attachments.filter(attachment => selectedIds.includes(`${attachment.messageId}:${attachment.attachmentId}`)).map(async attachment => {
            await fetch(gmailUrl("/attachments/open"), {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({messageId: attachment.messageId, attachmentId: attachment.attachmentId, name: attachment.name})});
        }));
    }

    function saveWarnings(next: GmailWarningRule[]) {
        setWarnings(next);
        localStorage.setItem(storageKey(WARNINGS_KEY, storageScope), JSON.stringify(next));
    }

    function persistAlertSettings(nextWarnings: GmailWarningRule[], nextFavorites: GmailWarningRule[]) {
        void fetch(alertSettingsUrl, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            credentials: "include",
            keepalive: true,
            body: JSON.stringify({providerSettings: {attachmentReader, rules: nextWarnings, accountBlockId: accountBlockId === null ? null : credentialBlockId}, favorites: nextFavorites})
        }).then(async response=>{if(!response.ok){const data=await response.json().catch(()=>({})) as {message?:string};throw new Error(data.message||"Unable to save Gmail settings.");}setError("");}).catch(reason=>setError(reason instanceof Error?reason.message:"Unable to save Gmail settings."));
    }

    function toggleWarnings() {
        setVisibleWarningKind(null);
        setShowWarnings(current => {
            if (!current) {
                localStorage.setItem(storageKey(WARNING_ALERTED_KEY, accountDataScope), "{}");
            }
            return !current;
        });
    }

    function toggleWarningPreview(kind: WarningKind) {
        setShowWarnings(false);
        setVisibleWarningKind(current => current === kind ? null : kind);
    }

    async function disconnect() {
        try {
            const isGlobalLegacyAccount = credentialBlockId === LEGACY_SHARED_GMAIL_ACCOUNT_ID;
            const canDisconnectGlobally = credentialBlockId === alertBlockId || isGlobalLegacyAccount;
            if (!canDisconnectGlobally) {
                onAccountBlockIdChange?.(null);
                setConnected(false);
                setLiveReading(false);
                setAttachments([]);
                setSelectedIds([]);
                setWarningResults([]);
                setDisconnectArmed(false);
                return;
            }
            const response = await fetch(gmailAuthUrl("/disconnect", credentialBlockId), {method: "POST", credentials: "include"});
            if (!response.ok) throw new Error("Gmail could not be disconnected. Access may still be active.");
            onAccountBlockIdChange?.(null);
            setConnected(false);
            setLiveReading(false);
            setAttachments([]);
            setSelectedIds([]);
            setWarningResults([]);
            setError("");
            setDisconnectArmed(false);
            if (accountCatalogKey) {
                invalidateEmailAccounts("gmail", accountCatalogKey);
                void loadEmailAccounts("gmail", accountCatalogKey, true).then(setEmailAccounts).catch(() => setEmailAccounts([]));
            }
        }
        catch (disconnectError) {
            setError(disconnectError instanceof Error ? disconnectError.message : "Gmail could not be disconnected. Access may still be active.");
        }
    }

    async function connectGmail() {
        setError("");
        try {
            const targetBlockId = hasAccountSelected ? credentialBlockId : alertBlockId;
            if (!hasAccountSelected) onAccountBlockIdChange?.(undefined);
            const authorizationQuery = new URLSearchParams({worldId, worldName});
            const response = await fetch(`${gmailAuthUrl("/start", targetBlockId)}&${authorizationQuery}&format=json`, {
                headers: {Accept: "application/json"},
                credentials: "include"
            });
            const data = await response.json() as {authorizationUrl?: string; message?: string};
            if (!response.ok || !data.authorizationUrl) throw new Error(data.message ?? "Gmail could not start the authorization.");
            const openedByDesktop = window.folderRocketDesktop
                ? await window.folderRocketDesktop.openExternal(data.authorizationUrl)
                : false;
            if (!openedByDesktop) {
                const popup = window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
                if (!popup) window.location.assign(data.authorizationUrl);
            }
        }
        catch (connectionError) {
            setError(connectionError instanceof Error ? connectionError.message : "Gmail could not start the authorization.");
        }
    }

    function openMessage(event: React.MouseEvent<HTMLButtonElement>, messageId: string) {
        event.stopPropagation();
        window.open(`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`, "_blank", "noopener,noreferrer");
    }

    function dragAttachments(event: React.DragEvent<HTMLElement>, attachment: EmailAttachment) {
        event.stopPropagation();
        const attachmentId = `${attachment.messageId}:${attachment.attachmentId}`;
        const dragged = selectedIds.includes(attachmentId)
            ? visibleAttachments.filter(item => selectedIds.includes(`${item.messageId}:${item.attachmentId}`))
            : [attachment];
        const payload = dragged.map(item => ({...item, sourceBlockId: credentialBlockId}));
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.dropEffect = "copy";
        event.dataTransfer.setData(EMAIL_ATTACHMENT_TYPE, JSON.stringify(payload));
        event.dataTransfer.setData("text/plain", `folderrocket-email:${JSON.stringify({provider: "gmail", attachments: payload})}`);
    }

    return (
        <section className={`${inboxItems.length ? "sourceCard emailSourceCard" : "sourceCard emailSourceCard isEmptySource"}${showWarnings || visibleWarningKind ? " warningsOpen" : ""}`}>
            <div className="sourceHeader">
                <Mail className="gmailPanelIcon" size={29} />
                <span className="sourceTitle">Gmail</span>
                <span className="emailReaderHeaderControl"><button type="button" className={`emailReaderHeaderButton${attachmentReader.enabled ? " active" : ""}`} onClick={() => { setShowSettings(current => !current); setDisconnectArmed(false); }} aria-expanded={showSettings} title="Account, Read attachments and options"><span className="emailRefreshIcon"><RefreshCw className={loading ? "spin" : ""} size={13}/></span><span>Read attachments</span></button>{showSettings && <div className="emailReaderHeaderMenu" onClick={event => event.stopPropagation()}>
                    <header><strong>Gmail account · {worldName || "current planet"}</strong></header>
                    <label className="emailAccountPickerRow"><span>Account Gmail</span><select aria-label={`Account Gmail per ${worldName || "questo pianeta"}`} title={selectedCatalogAccount ? emailAccountOptionLabel(selectedCatalogAccount, worldNames) : "Seleziona l’account Gmail usato da questo pianeta"} value={accountPickerValue} onChange={event => {
                        const value = event.target.value;
                        onAccountBlockIdChange?.(value === "" ? null : value === alertBlockId ? undefined : value);
                        setConnected(false);
                        setAttachments([]);
                        setWarningResults([]);
                        setSelectedIds([]);
                    }}>
                        <option value="">Nessun account selezionato</option>
                        {accountBlockId && !selectedCatalogAccount && <option value={credentialBlockId}>Selezione salvata · origine non specificata</option>}
                        {emailAccounts.map(account => {
                            const optionValue = emailAccountContainsBlock(account, credentialBlockId) ? credentialBlockId : account.blockId;
                            return <option key={account.blockId} value={optionValue}>{emailAccountOptionLabel(account, worldNames)}</option>;
                        })}
                    </select><small>{selectedAccountDescription}</small></label>
                    <div className="emailAccountMenuActions">{connected ? <><span className="emailAccountMenuStatus">Connected · {selectedCatalogAccount?.email || selectedCatalogAccount?.label || "Gmail"}</span><button type="button" className={disconnectArmed ? "emailDisconnectButton armed" : "emailDisconnectButton"} onClick={() => { if (disconnectArmed) void disconnect(); else setDisconnectArmed(true); }} title={disconnectArmed ? (canDisconnectGlobally ? "Press again to disconnect this account from FolderRocket" : "Press again to remove this planet's account link") : (canDisconnectGlobally ? "Disconnect globally" : "Unlink from this planet")}>{disconnectArmed ? (canDisconnectGlobally ? "Confirm disconnect" : "Confirm unlink") : (canDisconnectGlobally ? "Disconnect" : "Unlink from planet")}</button></> : <><span className="emailAccountMenuStatus">{hasAccountSelected ? "Selected account is not connected" : "No account selected for this planet"}</span><button type="button" className="emailConnectButton" onClick={() => void connectGmail()}>{hasAccountSelected ? "Connect selected account" : "Connect Gmail to this planet"}</button></>}</div>
                    <hr/>
                    <header><strong>Read attachments</strong><button type="button" onClick={() => void refresh()} disabled={loading || !connected || !attachmentReader.enabled} title="Refresh attachments"><RefreshCw className={loading ? "spin" : ""} size={14}/></button></header>
                    <label className="emailReaderEnabled"><input type="checkbox" checked={attachmentReader.enabled} disabled={!connected} onChange={event => { const enabled = event.target.checked; setAttachmentReader(current => ({...current, enabled})); if (!enabled) setAttachments([]); }}/>Enable attachment reading</label>
                    <select value={mode} disabled={!connected} onChange={event => { const nextMode = event.target.value as FilterMode; setMode(nextMode); setAttachmentReader(current => ({...current, filter: {...current.filter, mode: nextMode}})); }}><option value="relative">Last days</option><option value="range">Date range</option></select>
                    {mode === "relative" ? <label>Days back<input type="number" min="1" value={days} disabled={!connected} onChange={event => { const value = Math.max(1, Number(event.target.value) || 1); setDays(value); setAttachmentReader(current => ({...current, filter: {...current.filter, days: value}})); }}/></label> : <div className="emailDateRange"><label>From<input type="date" value={startDate} disabled={!connected} onChange={event => { setStartDate(event.target.value); setAttachmentReader(current => ({...current, filter: {...current.filter, startDate: event.target.value}})); }}/></label><label>To<input type="date" value={endDate} disabled={!connected} onChange={event => { setEndDate(event.target.value); setAttachmentReader(current => ({...current, filter: {...current.filter, endDate: event.target.value}})); }}/></label></div>}
                    <button type="button" className="emailReaderApply" disabled={!connected} onClick={() => { setShowSettings(false); if (attachmentReader.enabled) void refresh(); }}>Apply & refresh</button>
                </div>}</span>
                {connected && <button type="button" className="gmailWarningToggle" onClick={toggleWarnings} title="Gmail alerts"><BellRing size={15} /></button>}
                {connected && <span className={warningLoading ? "emailAlertSlots analyzing" : "emailAlertSlots"}>{warningLoading ? "Analyzing…" : visibleWarnings.filter(rule => rule.enabled).slice(0, 5).map(rule => { const result = warningResults.find(item => item.ruleId === rule.id); return result ? <button key={`ready-${rule.id}`} type="button" className={`gmailAlertCount alertColor-${rule.color}`} title={`Show ${rule.label} emails`} onClick={() => toggleWarningPreview(rule.kind)}>{result.total}</button> : <span key={`ready-${rule.id}`} className={`emailAlertReadyDot alertColor-${rule.color}`} title={`${rule.label} is active`} />; })}</span>}
                {connected && <span className="emailHeaderReading">Virtual: <button type="button" className={liveReading ? "emailVirtualReadingToggle active" : "emailVirtualReadingToggle"} onClick={() => setLiveReading(current => !current)} aria-pressed={liveReading} title={liveReading ? "Turn Virtual Reading off" : "Turn Virtual Reading on"}>{liveReading ? "ON" : "OFF"}</button></span>}
            </div>

            {!connected ? (
                <div className="emailConnectArea">
                    <p>{hasAccountSelected ? "This Gmail account is not connected in FolderRocket. Open Read attachments to connect it." : `Nessun account Gmail è selezionato per ${worldName || "questo pianeta"}. Apri Read attachments per selezionare o collegare un account.`}</p>
                </div>
            ) : (
                <>
                    {visibleWarningKind && <div className={`gmailWarningPreview ${visibleWarningKind === "ai" ? "aiAlertPreview" : "senderAlertPreview"}`}>
                        <strong>{visibleWarningKind === "ai" ? "AI alert emails" : "Sender-list emails"}</strong>
                        <div>{warningMessages[visibleWarningKind].map(message => <article key={message.id}><div><span>{message.subject || "No subject"}</span><small>{message.sender || "Unknown sender"}</small></div><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Gmail" onClick={event => openMessage(event, message.id)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={() => window.open(gmailUrl(`/messages/view?messageId=${encodeURIComponent(message.id)}`), "_blank", "noopener,noreferrer")}><MessageSquareText size={14} /></button></span></article>)}</div>
                    </div>}
                    {showWarnings && <div className="gmailWarningsMenu">
                            <EmailAlertBuilder
                                providerLabel="Gmail"
                                rules={warnings}
                                favorites={favorites}
                                onChange={({rules: nextRules, favorites: nextFavorites}) => {
                                    saveWarnings(nextRules);
                                    setFavorites(nextFavorites);
                                    persistAlertSettings(nextRules, nextFavorites);
                                    window.dispatchEvent(new CustomEvent("folderrocket-email-alert-favorites", {detail: nextFavorites}));
                                }}
                            onCheckNow={rules => void checkWarnings(rules)}
                            allowAi={aiEnabled}
                        />
                        {warningLoading && <p className="gmailWarningStatus">Checking the current Gmail view…</p>}
                        {warningError && <p className="emailError">{warningError}</p>}
                    </div>}
                    <div className="emailToolbar emailSelectionToolbar">
                        {visibleAttachments.length > 0 && <div className="gmailSelectionActions emailInlineSelectionActions"><button type="button" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Deselect all</button><button type="button" disabled={!selectedIds.length} onClick={dismissSelected}>Hide selected</button><button type="button" disabled={!selectedIds.length} onClick={() => void openSelected()}>Open files</button><button type="button" onClick={() => { setAttachments([]); setSelectedIds([]); }}>Clear all</button></div>}
                    </div>

                    {error && <p className="emailError">{error}</p>}
                    <div className="emailAttachmentList">
                        {inboxItems.length === 0 ? <p className="sourcePlaceholder">No attachments or alerts found. Press refresh.</p> : inboxItems.map(item => {
                            if (item.type === "alert") {
                                return <div key={`alert-${item.alert.id}`} className={`emailAttachment emailAlertItem ${item.alertColor ? `alertColor-${item.alertColor}` : item.alertKind === "sender" ? "senderAlertItem" : "aiAlertItem"}`}>
                                    <div className="emailAttachmentPrimary"><span className="emailAttachmentName"><Mail size={14} />{item.alert.subject || "Matching email"}</span></div>
                                    <div className="emailAttachmentSecondary"><small>{item.alert.sender || "Unknown sender"}</small><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Gmail" onClick={event => openMessage(event, item.alert.id)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={() => window.open(gmailUrl(`/messages/view?messageId=${encodeURIComponent(item.alert.id)}`), "_blank", "noopener,noreferrer")}><MessageSquareText size={14} /></button></span></div>
                                </div>;
                            }
                            const attachment = item.attachment;
                            const id = `${attachment.messageId}:${attachment.attachmentId}`;
                            const alertClass = item.alertColor ? ` alertColor-${item.alertColor}` : item.alertKind === "sender" ? " senderAlertItem" : item.alertKind === "ai" ? " aiAlertItem" : "";
                            return <div key={id} className={`${selectedIds.includes(id) ? "emailAttachment selectedAttachment" : "emailAttachment"}${alertClass}${item.messageGroup ? ` emailMessageGroup messageGroup-${item.messageGroup}` : ""}`} draggable onClick={() => toggleSelection(id)} onDragStart={event => dragAttachments(event, attachment)}>
                                <div className="emailAttachmentPrimary"><span className="emailAttachmentName">{item.messageGroup === "start" && <span className="emailMessageGroupMarker" title="More attachments from this email"><Mail size={10}/></span>}<FileKindIcon name={attachment.name} />{attachment.name}</span><span>{formatSize(attachment.size)}{formatReceivedAt(attachment.receivedAt) ? ` · ${formatReceivedAt(attachment.receivedAt)}` : ""}</span></div>
                                <div className="emailAttachmentSecondary"><small>{attachment.sender || attachment.subject}</small><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Gmail" onClick={event => openMessage(event, attachment.messageId)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={event => { event.stopPropagation(); window.open(gmailUrl(`/messages/view?messageId=${encodeURIComponent(attachment.messageId)}`), "_blank", "noopener,noreferrer"); }}><MessageSquareText size={14} /></button></span></div>
                            </div>;
                        })}
                    </div>
                </>
            )}
        </section>
    );
}

export { EMAIL_ATTACHMENT_TYPE };
export default GmailSourcePanel;
