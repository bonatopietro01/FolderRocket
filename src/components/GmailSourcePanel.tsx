import {
    useCallback,
    useEffect,
    useMemo,
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
    Unplug,
    RefreshCw,
    Settings2,
    BellRing
} from "lucide-react";

import { API_BASE_URL } from "../api";
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
    | {type: "attachment"; attachment: EmailAttachment; alertKind?: WarningKind; alertColor?: string}
    | {type: "alert"; alert: GmailAlertMessage; alertKind: WarningKind; alertColor?: string};

const DISMISSED_KEY = "folderrocket-dismissed-gmail";
const WARNINGS_KEY = "folderrocket-gmail-warnings";
const WARNING_SEEN_KEY = "folderrocket-gmail-warning-seen";
const WARNING_ALERTED_KEY = "folderrocket-gmail-warning-alerted";
const WARNING_RESULTS_KEY = "folderrocket-gmail-warning-results";
const EMAIL_ATTACHMENT_TYPE = "application/x-folderrocket-gmail-attachments";

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

function mergeAttachments(current: EmailAttachment[], incoming: EmailAttachment[]) {
    const merged = new Map(current.map(item => [`${item.messageId}:${item.attachmentId}`, item]));
    for (const item of incoming) merged.set(`${item.messageId}:${item.attachmentId}`, item);
    return [...merged.values()].sort((first, second) => new Date(second.receivedAt).getTime() - new Date(first.receivedAt).getTime());
}

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={14} /></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14} /></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={14} /></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt"><FileText size={14} /></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={14} /></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14} /></span>;
    return <span className="fileKindIcon generic"><File size={14} /></span>;
}

function GmailSourcePanel({storageScope, alertBlockId, aiEnabled = false}: {storageScope: string; alertBlockId: string; aiEnabled?: boolean}) {
    const alertSettingsUrl = `${API_BASE_URL}/email/alerts/settings/gmail?blockId=${encodeURIComponent(alertBlockId)}`;
    const gmailUrl = (endpoint: string) => `${API_BASE_URL}/email/gmail${endpoint}${endpoint.includes("?") ? "&" : "?"}blockId=${encodeURIComponent(alertBlockId)}`;
    const gmailAuthUrl = (endpoint: string) => `${API_BASE_URL}/auth/gmail${endpoint}?blockId=${encodeURIComponent(alertBlockId)}`;
    const [connected, setConnected] = useState(false);
    const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [dismissedIds, setDismissedIds] = useState<string[]>(() => readDismissed(storageScope));
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
    const [warningResults, setWarningResults] = useState<GmailWarningResult[]>(() => readWarningResults(storageScope));
    const [visibleWarningKind, setVisibleWarningKind] = useState<WarningKind | null>(null);
    const [warningLoading, setWarningLoading] = useState(false);
    const [warningError, setWarningError] = useState("");
    const [analysisCompletedAt, setAnalysisCompletedAt] = useState<Date | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const visibleWarnings = useMemo(() => warnings.filter(rule => aiEnabled || rule.kind !== "ai"), [aiEnabled, warnings]);

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
        return items.sort((first, second) => {
            const firstDate = first.type === "attachment" ? first.attachment.receivedAt : first.alert.receivedAt;
            const secondDate = second.type === "attachment" ? second.attachment.receivedAt : second.alert.receivedAt;
            return new Date(secondDate).getTime() - new Date(firstDate).getTime();
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
        if (!connected || !activeRules.length) return;
        setWarningLoading(true);
        setWarningError("");
        try {
            const seenByRule = readWarningSeen(storageScope);
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
            localStorage.setItem(storageKey(WARNING_RESULTS_KEY, storageScope), JSON.stringify(results));
            if (Array.isArray(data.attachments) && data.attachments.length) setAttachments(current => mergeAttachments(current, data.attachments ?? []));
            const aiError = aiEnabled ? results.find(result => warnings.find(rule => rule.id === result.ruleId)?.kind === "ai" && result.error)?.error : undefined;
            if (aiError) setWarningError(aiError);
            else setAnalysisCompletedAt(new Date());
            const nextSeen = {...seenByRule};
            const nextAlerts = {...readWarningAlerts(storageScope)};
            for (const result of results) {
                const newIds = result.messageIds.filter(messageId => !(nextSeen[result.ruleId] ?? []).includes(messageId));
                nextSeen[result.ruleId] = [...new Set([...(nextSeen[result.ruleId] ?? []), ...result.messageIds])].slice(-200);
                nextAlerts[result.ruleId] = [...new Set([...(nextAlerts[result.ruleId] ?? []), ...newIds])].slice(-200);
            }
            localStorage.setItem(storageKey(WARNING_SEEN_KEY, storageScope), JSON.stringify(nextSeen));
            localStorage.setItem(storageKey(WARNING_ALERTED_KEY, storageScope), JSON.stringify(nextAlerts));
        }
        catch (warningCheckError) {
            setWarningError(warningCheckError instanceof Error ? warningCheckError.message : "Unable to check Gmail warnings");
        }
        finally {
            setWarningLoading(false);
        }
    }, [aiEnabled, connected, days, endDate, mode, startDate, storageScope, warnings]);

    const refresh = useCallback(async () => {
        if (!connected) {
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
    }, [attachmentReader, checkWarnings, connected]);

    useEffect(() => {
        let active = true;
        const refreshConnection = () => {
            void fetch(gmailUrl("/status"), {credentials: "include"})
                .then(response => response.json())
                .then((data: {connected?: boolean}) => { if (active) setConnected(Boolean(data.connected)); })
                .catch(() => { if (active) setConnected(false); });
        };
        refreshConnection();
        window.addEventListener("focus", refreshConnection);
        return () => { active = false; window.removeEventListener("focus", refreshConnection); };
    }, [alertBlockId]);

    useEffect(() => {
        let active = true;
        fetch(alertSettingsUrl, {credentials: "include"})
            .then(response => response.ok ? response.json() : null)
            .then((data: {providerSettings?: {attachmentReader?: EmailAttachmentReader; rules?: GmailWarningRule[]; runtime?: {rules?: Record<string, {result?: GmailWarningResult; attachments?: EmailAttachment[]}>}}; favorites?: GmailWarningRule[]} | null) => {
                if (!active || !data?.providerSettings) return;
                const provider = data.providerSettings;
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
                const scheduledResults = Object.values(provider.runtime?.rules ?? {}).map(item => item?.result).filter((item): item is GmailWarningResult => Boolean(item));
                if (scheduledResults.length) { setWarningResults(scheduledResults); localStorage.setItem(storageKey(WARNING_RESULTS_KEY, storageScope), JSON.stringify(scheduledResults)); }
                const scheduledAttachments = Object.values(provider.runtime?.rules ?? {}).flatMap(item => item?.attachments ?? []);
                if (scheduledAttachments.length) setAttachments(current => mergeAttachments(current, scheduledAttachments));
            })
            .finally(() => { if (active) setAlertSettingsReady(true); });
        return () => { active = false; };
    }, [alertSettingsUrl]);

    useEffect(() => {
        if (!alertSettingsReady) return;
        const timer = window.setTimeout(() => {
            void fetch(alertSettingsUrl, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({providerSettings: {attachmentReader, rules: warnings}, favorites})
            });
        }, 350);
        return () => window.clearTimeout(timer);
    }, [alertSettingsReady, alertSettingsUrl, attachmentReader, favorites, warnings]);

    useEffect(() => {
        if (!connected) return;
        const interval = window.setInterval(() => {
            void fetch(alertSettingsUrl, {credentials: "include"})
                .then(response => response.ok ? response.json() : null)
                .then((data: {providerSettings?: {runtime?: {rules?: Record<string, {result?: GmailWarningResult; attachments?: EmailAttachment[]}>}}; favorites?: GmailWarningRule[]} | null) => {
                    const runtimeRules = Object.values(data?.providerSettings?.runtime?.rules ?? {});
                    const results = runtimeRules.map(item => item?.result).filter((item): item is GmailWarningResult => Boolean(item));
                    if (results.length) { setWarningResults(results); localStorage.setItem(storageKey(WARNING_RESULTS_KEY, storageScope), JSON.stringify(results)); }
                    const scheduledAttachments = runtimeRules.flatMap(item => item?.attachments ?? []);
                    if (scheduledAttachments.length) setAttachments(current => mergeAttachments(current, scheduledAttachments));
                    if (Array.isArray(data?.favorites)) setFavorites(data.favorites);
                });
        }, 60_000);
        return () => window.clearInterval(interval);
    }, [alertSettingsUrl, connected]);

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
        const dismissWhenOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest(".emailSourceCard")) setSelectedIds([]);
            if (!target.closest(".gmailWarningsMenu") && !target.closest(".gmailWarningToggle")) setShowWarnings(false);
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

    function toggleSelection(id: string) {
        setSelectedIds(current => current.includes(id)
            ? current.filter(currentId => currentId !== id)
            : [...current, id]);
    }

    function dismissSelected() {
        const toDismiss = selectedIds;
        setDismissedIds(current => {
            const updated = [...new Set([...current, ...toDismiss])];
            localStorage.setItem(storageKey(DISMISSED_KEY, storageScope), JSON.stringify(updated));
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
            body: JSON.stringify({providerSettings: {attachmentReader, rules: nextWarnings}, favorites: nextFavorites})
        });
    }

    function toggleWarnings() {
        setVisibleWarningKind(null);
        setShowWarnings(current => {
            if (!current) {
                localStorage.setItem(storageKey(WARNING_ALERTED_KEY, storageScope), "{}");
            }
            return !current;
        });
    }

    function toggleWarningPreview(kind: WarningKind) {
        setShowWarnings(false);
        setVisibleWarningKind(current => current === kind ? null : kind);
    }

    async function disconnect() {
        if (!window.confirm("Disconnect Gmail and stop all FolderRocket email checks? This removes the saved access token from this computer.")) return;
        try {
            const response = await fetch(gmailAuthUrl("/disconnect"), {method: "POST", credentials: "include"});
            if (!response.ok) throw new Error("Gmail could not be disconnected. Access may still be active.");
            setConnected(false);
            setLiveReading(false);
            setAttachments([]);
            setSelectedIds([]);
            setWarningResults([]);
            setError("");
        }
        catch (disconnectError) {
            setError(disconnectError instanceof Error ? disconnectError.message : "Gmail could not be disconnected. Access may still be active.");
        }
    }

    function openMessage(event: React.MouseEvent<HTMLButtonElement>, messageId: string) {
        event.stopPropagation();
        window.open(`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`, "_blank", "noopener,noreferrer");
    }

    function dragAttachments(event: React.DragEvent<HTMLElement>, attachment: EmailAttachment) {
        const attachmentId = `${attachment.messageId}:${attachment.attachmentId}`;
        const dragged = selectedIds.includes(attachmentId)
            ? visibleAttachments.filter(item => selectedIds.includes(`${item.messageId}:${item.attachmentId}`))
            : [attachment];
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(EMAIL_ATTACHMENT_TYPE, JSON.stringify(dragged.map(item => ({...item, sourceBlockId: alertBlockId}))));
    }

    return (
        <section className={`${inboxItems.length ? "sourceCard emailSourceCard" : "sourceCard emailSourceCard isEmptySource"}${showWarnings || visibleWarningKind ? " warningsOpen" : ""}`}>
            <div className="sourceHeader">
                <Mail className="gmailPanelIcon" size={29} />
                <span className="sourceTitle">Gmail</span>
                {connected && <button type="button" className="gmailWarningToggle" onClick={toggleWarnings} title="Gmail alerts"><BellRing size={15} /></button>}
                {connected && visibleWarnings.length > 0 && <span className={warningLoading ? "gmailAnalysisStatus analyzing" : "gmailAnalysisStatus"}>{warningLoading ? "Analyzing…" : analysisCompletedAt ? `Completed ${analysisCompletedAt.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}` : "Ready to analyze"}</span>}
                {connected && visibleWarnings.filter(rule => rule.enabled).map(rule => {
                    const result = warningResults.find(item => item.ruleId === rule.id);
                    return result ? <button key={`ready-${rule.id}`} type="button" className={`gmailAlertCount alertColor-${rule.color}`} title={`Show ${rule.label} emails`} onClick={() => toggleWarningPreview(rule.kind)}>{result.total}</button> : <span key={`ready-${rule.id}`} className={`emailAlertReadyDot alertColor-${rule.color}`} title={`${rule.label} is active`} />;
                })}
            </div>

            <div className={`emailConnectionSummary ${connected ? "connected" : "disconnected"}`}>
                <span className="emailConnectionPrimary"><i />{connected ? "CONNECTED" : "DISCONNECTED"}</span>
                <span>{connected ? "FolderRocket can read Gmail" : "FolderRocket cannot read Gmail"}</span>
                {connected && <span className={`emailPollingState ${liveReading ? "live" : "manual"}`}>{liveReading ? "Virtual reading: ON (every minute)" : "Virtual reading: OFF"}</span>}
                {connected && aiEnabled && warnings.some(rule => rule.kind === "ai") && <span className="emailCostState">AI alerts enabled</span>}
                {connected && <button type="button" className="emailDisconnectButton" title="Remove Gmail access and stop every check" onClick={() => void disconnect()}><Unplug size={13} />Disconnect</button>}
            </div>

            {!connected ? (
                <div className="emailConnectArea">
                    <p>No Gmail access is active. Connecting authorizes read-only access.</p>
                    <button type="button" className="emailConnectButton" onClick={() => { window.location.href = gmailAuthUrl("/start"); }}>
                        Connect Gmail
                    </button>
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
                    <div className="emailToolbar">
                        <button type="button" onClick={() => setShowSettings(current => !current)} title="Attachment period"><Settings2 size={16} /></button>
                        <button type="button" className={`emailReadAttachmentsButton${attachmentReader.enabled ? " active" : ""}`} onClick={() => { const enabled = !attachmentReader.enabled; setAttachmentReader(current => ({...current, enabled})); if (!enabled) { setShowSettings(false); setAttachments([]); } }}>Read attachments</button>
                        {attachmentReader.enabled && <button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh attachments"><RefreshCw className={loading ? "spin" : ""} size={16} /></button>}
                        <label className="liveReadingLabel"><input type="checkbox" checked={liveReading} onChange={event => setLiveReading(event.target.checked)} /> Virtual reading</label>
                    </div>

                    {showSettings && attachmentReader.enabled && (
                        <div className="emailSettings">
                            <strong>Attachment period</strong>
                            <select value={mode} onChange={event => { const nextMode = event.target.value as FilterMode; setMode(nextMode); setAttachmentReader(current => ({...current, filter: {...current.filter, mode: nextMode}})); }}>
                                <option value="relative">Last days</option>
                                <option value="range">Date range</option>
                            </select>
                            {mode === "relative" ? <label>Days back<input type="number" min="1" value={days} onChange={event => { const value = Number(event.target.value); setDays(value); setAttachmentReader(current => ({...current, filter: {...current.filter, days: value}})); }} aria-label="Days back" /></label> : <div className="emailDateRange"><label>From<input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); setAttachmentReader(current => ({...current, filter: {...current.filter, startDate: event.target.value}})); }} /></label><label>To<input type="date" value={endDate} onChange={event => { setEndDate(event.target.value); setAttachmentReader(current => ({...current, filter: {...current.filter, endDate: event.target.value}})); }} /></label></div>}
                        </div>
                    )}

                    {visibleAttachments.length > 0 && <div className="gmailSelectionActions"><button type="button" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Deselect all</button><button type="button" disabled={!selectedIds.length} onClick={dismissSelected}>Hide selected</button><button type="button" disabled={!selectedIds.length} onClick={() => void openSelected()}>Open files</button><button type="button" onClick={() => { setAttachments([]); setSelectedIds([]); }}>Clear all</button></div>}

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
                            return <div key={id} className={`${selectedIds.includes(id) ? "emailAttachment selectedAttachment" : "emailAttachment"}${alertClass}`} draggable onClick={() => toggleSelection(id)} onDragStart={event => dragAttachments(event, attachment)}>
                                <div className="emailAttachmentPrimary"><span className="emailAttachmentName"><FileKindIcon name={attachment.name} />{attachment.name}</span><span>{formatSize(attachment.size)}</span></div>
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
