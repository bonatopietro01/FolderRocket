import {useCallback, useEffect, useMemo, useState} from "react";
import {Archive, BellRing, ExternalLink, File, FileSpreadsheet, FileText, Image, Mail, MessageSquareText, RefreshCw, Settings2, Unplug} from "lucide-react";
import {API_BASE_URL} from "../api";
import EmailAlertBuilder, {type EmailAlertRule, type EmailAttachmentReader} from "./EmailAlertBuilder";

interface OutlookAttachment { attachmentId: string; messageId: string; mimeType: string; name: string; receivedAt: string; sender: string; size: number; subject: string; webLink?: string; }
interface OutlookAlertMessage { id: string; sender: string; subject: string; receivedAt: string; webLink?: string; }
interface OutlookWarningResult { ruleId: string; total: number; newCount: number; messageIds: string[]; messages?: OutlookAlertMessage[]; error?: string; }
type InboxItem = {type: "attachment"; attachment: OutlookAttachment; alertColor?: string} | {type: "alert"; alert: OutlookAlertMessage; alertColor?: string};

const DISMISSED_KEY = "folderrocket-dismissed-outlook";
const SEEN_KEY = "folderrocket-outlook-warning-seen";
const RESULTS_KEY = "folderrocket-outlook-warning-results";
const OUTLOOK_ATTACHMENT_TYPE = "application/x-folderrocket-outlook-attachments";
const emptyReader: EmailAttachmentReader = {enabled: true, filter: {mode: "relative", days: 7, startDate: "", endDate: ""}};

function storageKey(key: string, scope: string) { return `${key}-${scope}`; }
function readArray(key: string, scope: string): string[] { try { const value = JSON.parse(localStorage.getItem(storageKey(key, scope)) ?? "[]"); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
function readSeen(scope: string): Record<string, string[]> { try { const value = JSON.parse(localStorage.getItem(storageKey(SEEN_KEY, scope)) ?? "{}"); return value && typeof value === "object" ? value as Record<string, string[]> : {}; } catch { return {}; } }
function readResults(scope: string): OutlookWarningResult[] { try { const value = JSON.parse(localStorage.getItem(storageKey(RESULTS_KEY, scope)) ?? "[]"); return Array.isArray(value) ? value.filter((item): item is OutlookWarningResult => item && typeof item.ruleId === "string" && Array.isArray(item.messageIds)) : []; } catch { return []; } }
function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function mergeAttachments(current: OutlookAttachment[], incoming: OutlookAttachment[]) { const merged = new Map(current.map(item => [`${item.messageId}:${item.attachmentId}`, item])); for (const item of incoming) merged.set(`${item.messageId}:${item.attachmentId}`, item); return [...merged.values()].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()); }
function FileKindIcon({name}: {name: string}) { const extension = name.split(".").pop()?.toLowerCase() ?? ""; if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={14} /></span>; if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14} /></span>; if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={14} /></span>; if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt"><FileText size={14} /></span>; if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={14} /></span>; if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14} /></span>; return <span className="fileKindIcon generic"><File size={14} /></span>; }

function OutlookSourcePanel({storageScope, alertBlockId}: {storageScope: string; alertBlockId: string}) {
    const alertSettingsUrl = `${API_BASE_URL}/email/alerts/settings/outlook?blockId=${encodeURIComponent(alertBlockId)}`;
    const outlookUrl = (endpoint: string) => `${API_BASE_URL}/email/outlook${endpoint}${endpoint.includes("?") ? "&" : "?"}blockId=${encodeURIComponent(alertBlockId)}`;
    const outlookAuthUrl = (endpoint: string) => `${API_BASE_URL}/auth/outlook${endpoint}?blockId=${encodeURIComponent(alertBlockId)}`;
    const [connected, setConnected] = useState(false);
    const [attachments, setAttachments] = useState<OutlookAttachment[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [dismissedIds, setDismissedIds] = useState<string[]>(() => readArray(DISMISSED_KEY, storageScope));
    const [attachmentReader, setAttachmentReader] = useState<EmailAttachmentReader>(emptyReader);
    const [rules, setRules] = useState<EmailAlertRule[]>([]);
    const [favorites, setFavorites] = useState<EmailAlertRule[]>([]);
    const [results, setResults] = useState<OutlookWarningResult[]>(() => readResults(storageScope));
    const [showSettings, setShowSettings] = useState(false);
    const [showAlerts, setShowAlerts] = useState(false);
    const [previewRuleId, setPreviewRuleId] = useState<string | null>(null);
    const [liveReading, setLiveReading] = useState(false);
    const [settingsReady, setSettingsReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [completedAt, setCompletedAt] = useState<Date | null>(null);
    const [error, setError] = useState("");

    const visibleAttachments = useMemo(() => attachments.filter(item => !dismissedIds.includes(`${item.messageId}:${item.attachmentId}`)), [attachments, dismissedIds]);
    const rulesById = useMemo(() => new Map(rules.map(rule => [rule.id, rule])), [rules]);
    const colorByMessage = useMemo(() => {
        const map = new Map<string, string>();
        for (const result of results) {
            const rule = rulesById.get(result.ruleId);
            if (!rule || !rule.enabled) continue;
            for (const message of result.messages ?? []) map.set(message.id, rule.color);
        }
        return map;
    }, [results, rulesById]);
    const inboxItems = useMemo<InboxItem[]>(() => {
        const withAttachments = new Set(visibleAttachments.map(item => item.messageId));
        const alertMessages = new Map<string, OutlookAlertMessage>();
        for (const result of results) {
            if (!rulesById.get(result.ruleId)?.enabled) continue;
            for (const message of result.messages ?? []) alertMessages.set(message.id, message);
        }
        return [
            ...visibleAttachments.map(attachment => ({type: "attachment" as const, attachment, alertColor: colorByMessage.get(attachment.messageId)})),
            ...[...alertMessages.values()].filter(item => !withAttachments.has(item.id)).map(alert => ({type: "alert" as const, alert, alertColor: colorByMessage.get(alert.id)}))
        ].sort((a, b) => new Date(b.type === "attachment" ? b.attachment.receivedAt : b.alert.receivedAt).getTime() - new Date(a.type === "attachment" ? a.attachment.receivedAt : a.alert.receivedAt).getTime());
    }, [colorByMessage, results, visibleAttachments]);
    const previewRule = rulesById.get(previewRuleId ?? "");
    const previewMessages = results.find(result => result.ruleId === previewRuleId)?.messages ?? [];

    const loadAlertSettings = useCallback(async (withEditableValues = false) => {
        const response = await fetch(alertSettingsUrl, {credentials: "include"});
        if (!response.ok) return;
        const data = await response.json() as {providerSettings?: {attachmentReader?: EmailAttachmentReader; rules?: EmailAlertRule[]; runtime?: {rules?: Record<string, {result?: OutlookWarningResult; attachments?: OutlookAttachment[]}>}}; favorites?: EmailAlertRule[]};
        if (withEditableValues && data.providerSettings?.attachmentReader) setAttachmentReader(data.providerSettings.attachmentReader);
        if (withEditableValues && Array.isArray(data.providerSettings?.rules) && data.providerSettings.rules.length) setRules(data.providerSettings.rules);
        if (Array.isArray(data.favorites)) setFavorites(data.favorites);
        const scheduled = Object.values(data.providerSettings?.runtime?.rules ?? {}).map(item => item?.result).filter((item): item is OutlookWarningResult => Boolean(item));
        if (scheduled.length) { setResults(scheduled); localStorage.setItem(storageKey(RESULTS_KEY, storageScope), JSON.stringify(scheduled)); }
        const scheduledAttachments = Object.values(data.providerSettings?.runtime?.rules ?? {}).flatMap(item => item?.attachments ?? []);
        if (scheduledAttachments.length) setAttachments(current => mergeAttachments(current, scheduledAttachments));
    }, [alertSettingsUrl, storageScope]);

    const checkRules = useCallback(async (rulesToCheck = rules) => {
        const activeRules = rulesToCheck.filter(rule => rule.enabled !== false);
        if (!connected || !activeRules.length) return;
        setChecking(true); setError("");
        try {
            const seenByRule = readSeen(storageScope);
            const response = await fetch(outlookUrl("/warnings/check"), {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({rules: activeRules, seenByRule})});
            const data = await response.json() as {results?: OutlookWarningResult[]; attachments?: OutlookAttachment[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? "Unable to check Outlook alerts");
            const next = Array.isArray(data.results) ? data.results : [];
            setResults(next); localStorage.setItem(storageKey(RESULTS_KEY, storageScope), JSON.stringify(next)); setCompletedAt(new Date());
            if (Array.isArray(data.attachments) && data.attachments.length) setAttachments(current => mergeAttachments(current, data.attachments ?? []));
            const nextSeen = {...seenByRule};
            for (const result of next) nextSeen[result.ruleId] = [...new Set([...(nextSeen[result.ruleId] ?? []), ...result.messageIds])].slice(-500);
            localStorage.setItem(storageKey(SEEN_KEY, storageScope), JSON.stringify(nextSeen));
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to check Outlook alerts"); }
        finally { setChecking(false); }
    }, [connected, rules, storageScope]);

    const refresh = useCallback(async () => {
        if (!connected) return;
        setLoading(true); setError("");
        try {
            if (attachmentReader.enabled) {
                const response = await fetch(outlookUrl("/attachments"), {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify(attachmentReader.filter)});
                const data = await response.json() as {attachments?: OutlookAttachment[]; message?: string};
                if (!response.ok) throw new Error(data.message ?? "Unable to refresh Outlook");
                setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
            } else setAttachments([]);
            void checkRules();
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to refresh Outlook"); }
        finally { setLoading(false); }
    }, [attachmentReader, checkRules, connected]);

    useEffect(() => { void fetch(outlookUrl("/status"), {credentials: "include"}).then(response => response.json()).then((data: {connected?: boolean}) => setConnected(Boolean(data.connected))).catch(() => setConnected(false)); }, [alertBlockId]);
    useEffect(() => { let active = true; void loadAlertSettings(true).finally(() => { if (active) setSettingsReady(true); }); return () => { active = false; }; }, [loadAlertSettings]);
    useEffect(() => { if (!settingsReady) return; const timer = window.setTimeout(() => { void fetch(alertSettingsUrl, {method: "PUT", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({providerSettings: {attachmentReader, rules}, favorites})}); }, 350); return () => window.clearTimeout(timer); }, [alertSettingsUrl, attachmentReader, favorites, rules, settingsReady]);
    useEffect(() => { if (!liveReading || !connected) return; void refresh(); const timer = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(timer); }, [connected, liveReading, refresh]);
    useEffect(() => { if (!connected) return; const timer = window.setInterval(() => void loadAlertSettings(false), 60_000); return () => window.clearInterval(timer); }, [connected, loadAlertSettings]);
    useEffect(() => { const onOutside = (event: MouseEvent) => { const target = event.target as Element; if (!target.closest(".outlookSourceCard")) setSelectedIds([]); if (!target.closest(".gmailWarningsMenu") && !target.closest(".gmailWarningToggle")) setShowAlerts(false); }; document.addEventListener("pointerdown", onOutside); return () => document.removeEventListener("pointerdown", onOutside); }, []);
    useEffect(() => { const syncFavorites = (event: Event) => { const favorites = (event as CustomEvent<EmailAlertRule[]>).detail; if (Array.isArray(favorites)) setFavorites(favorites); }; window.addEventListener("folderrocket-email-alert-favorites", syncFavorites); return () => window.removeEventListener("folderrocket-email-alert-favorites", syncFavorites); }, []);

    function toggleSelection(id: string) { setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
    function persistAlertSettings(nextRules: EmailAlertRule[], nextFavorites: EmailAlertRule[]) {
        void fetch(alertSettingsUrl, {method: "PUT", headers: {"Content-Type": "application/json"}, credentials: "include", keepalive: true, body: JSON.stringify({providerSettings: {attachmentReader, rules: nextRules}, favorites: nextFavorites})});
    }
    function dismissSelected() { setDismissedIds(current => { const next = [...new Set([...current, ...selectedIds])]; localStorage.setItem(storageKey(DISMISSED_KEY, storageScope), JSON.stringify(next)); return next; }); setSelectedIds([]); }
    async function openSelected() { await Promise.all(attachments.filter(item => selectedIds.includes(`${item.messageId}:${item.attachmentId}`)).map(item => fetch(outlookUrl("/attachments/open"), {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({messageId: item.messageId, attachmentId: item.attachmentId, name: item.name})}))); }
    function openMessage(event: React.MouseEvent<HTMLButtonElement>, messageId: string, webLink?: string) { event.stopPropagation(); window.open(webLink || `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(messageId)}`, "_blank", "noopener,noreferrer"); }
    function dragAttachment(event: React.DragEvent<HTMLElement>, attachment: OutlookAttachment) { const id = `${attachment.messageId}:${attachment.attachmentId}`; const dragged = selectedIds.includes(id) ? visibleAttachments.filter(item => selectedIds.includes(`${item.messageId}:${item.attachmentId}`)) : [attachment]; event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(OUTLOOK_ATTACHMENT_TYPE, JSON.stringify(dragged.map(item => ({...item, sourceBlockId: alertBlockId})))); }
    async function disconnect() { if (!window.confirm("Disconnect Outlook and stop all FolderRocket email checks?")) return; const response = await fetch(outlookAuthUrl("/disconnect"), {method: "POST", credentials: "include"}); if (response.ok) { setConnected(false); setAttachments([]); setResults([]); setLiveReading(false); } else setError("Outlook could not be disconnected."); }

    return <section className={`${inboxItems.length ? "sourceCard emailSourceCard outlookSourceCard" : "sourceCard emailSourceCard outlookSourceCard isEmptySource"}${showAlerts || previewRule ? " warningsOpen" : ""}`}>
        <div className="sourceHeader"><Mail className="outlookPanelIcon" size={29} /><span className="sourceTitle">Outlook</span>{connected && <button type="button" className="gmailWarningToggle" onClick={() => { setPreviewRuleId(null); setShowAlerts(current => !current); }} title="Outlook alert settings"><BellRing size={15} /></button>}{connected && rules.length > 0 && <span className={checking ? "gmailAnalysisStatus analyzing" : "gmailAnalysisStatus"}>{checking ? "Analyzing…" : completedAt ? `Completed ${completedAt.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}` : "Ready to analyze"}</span>}{connected && rules.filter(rule => rule.enabled).map(rule => { const result = results.find(item => item.ruleId === rule.id); return result ? <button key={`ready-${rule.id}`} type="button" className={`gmailAlertCount alertColor-${rule.color}`} title={`Show ${rule.label}`} onClick={() => setPreviewRuleId(rule.id)}>{result.total}</button> : <span key={`ready-${rule.id}`} className={`emailAlertReadyDot alertColor-${rule.color}`} title={`${rule.label} is active`} />; })}</div>
        <div className={`emailConnectionSummary ${connected ? "connected" : "disconnected"}`}><span className="emailConnectionPrimary"><i />{connected ? "CONNECTED" : "DISCONNECTED"}</span><span>{connected ? "FolderRocket can read Outlook" : "FolderRocket cannot read Outlook"}</span>{connected && <span className={`emailPollingState ${liveReading ? "live" : "manual"}`}>{liveReading ? "Virtual reading: ON" : "Virtual reading: OFF"}</span>}{connected && rules.some(rule => rule.kind === "ai") && <span className="emailCostState">AI alerts enabled</span>}{connected && <button type="button" className="emailDisconnectButton" onClick={() => void disconnect()}><Unplug size={13} />Disconnect</button>}</div>
        {!connected ? <div className="emailConnectArea"><p>Read Outlook attachments in read-only mode.</p><button type="button" className="emailConnectButton" onClick={() => { window.location.href = outlookAuthUrl("/start"); }}>Connect Outlook</button></div> : <>
            {previewRule && <div className={`gmailWarningPreview alertColor-${previewRule.color}`}><strong>{previewRule.label}</strong><div>{previewMessages.map(message => <article key={message.id}><div><span>{message.subject || "No subject"}</span><small>{message.sender || "Unknown sender"}</small></div><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Outlook" onClick={event => openMessage(event, message.id, message.webLink)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={() => window.open(outlookUrl(`/messages/view?messageId=${encodeURIComponent(message.id)}`), "_blank", "noopener,noreferrer")}><MessageSquareText size={14} /></button></span></article>)}</div></div>}
            {showAlerts && <div className="gmailWarningsMenu"><EmailAlertBuilder providerLabel="Outlook" rules={rules} favorites={favorites} onChange={({rules: nextRules, favorites: nextFavorites}) => { setRules(nextRules); setFavorites(nextFavorites); persistAlertSettings(nextRules, nextFavorites); window.dispatchEvent(new CustomEvent("folderrocket-email-alert-favorites", {detail: nextFavorites})); }} onCheckNow={nextRules => void checkRules(nextRules)} />{error && <p className="emailError">{error}</p>}</div>}
            <div className="emailToolbar"><button type="button" onClick={() => setShowSettings(current => !current)} title="Attachment period"><Settings2 size={16} /></button><button type="button" onClick={() => void refresh()} disabled={loading} title="Refresh"><RefreshCw className={loading ? "spin" : ""} size={16} /></button><button type="button" className={`emailReadAttachmentsButton${attachmentReader.enabled ? " active" : ""}`} onClick={() => { const enabled = !attachmentReader.enabled; setAttachmentReader(current => ({...current, enabled})); if (!enabled) { setShowSettings(false); setAttachments([]); } }}>Read attachments</button><label className="liveReadingLabel"><input type="checkbox" checked={liveReading} onChange={event => setLiveReading(event.target.checked)} /> Virtual reading</label></div>
            {showSettings && attachmentReader.enabled && <div className="emailSettings"><strong>Attachment period</strong><select value={attachmentReader.filter.mode} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, mode: event.target.value as "relative" | "range"}}))}><option value="relative">Last days</option><option value="range">Date range</option></select>{attachmentReader.filter.mode === "relative" ? <label>Days back<input type="number" min="1" value={attachmentReader.filter.days} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, days: Math.max(1, Number(event.target.value) || 1)}}))} aria-label="Days back" /></label> : <div className="emailDateRange"><label>From<input type="date" value={attachmentReader.filter.startDate} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, startDate: event.target.value}}))} /></label><label>To<input type="date" value={attachmentReader.filter.endDate} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, endDate: event.target.value}}))} /></label></div>}</div>}
            {visibleAttachments.length > 0 && <div className="gmailSelectionActions"><button type="button" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Deselect all</button><button type="button" disabled={!selectedIds.length} onClick={dismissSelected}>Hide selected</button><button type="button" disabled={!selectedIds.length} onClick={() => void openSelected()}>Open files</button><button type="button" onClick={() => { setAttachments([]); setSelectedIds([]); }}>Clear all</button></div>}
            {error && !showAlerts && <p className="emailError">{error}</p>}
            <div className="emailAttachmentList">{inboxItems.length === 0 ? <p className="sourcePlaceholder">No attachments or alerts found. Press refresh.</p> : inboxItems.map(item => item.type === "alert" ? <div key={`alert-${item.alert.id}`} className={`emailAttachment emailAlertItem ${item.alertColor ? `alertColor-${item.alertColor}` : ""}`}><div className="emailAttachmentPrimary"><span className="emailAttachmentName"><Mail size={14} />{item.alert.subject || "Matching email"}</span></div><div className="emailAttachmentSecondary"><small>{item.alert.sender || "Unknown sender"}</small><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Outlook" onClick={event => openMessage(event, item.alert.id, item.alert.webLink)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={() => window.open(outlookUrl(`/messages/view?messageId=${encodeURIComponent(item.alert.id)}`), "_blank", "noopener,noreferrer")}><MessageSquareText size={14} /></button></span></div></div> : (() => { const attachment = item.attachment; const id = `${attachment.messageId}:${attachment.attachmentId}`; return <div key={id} className={`${selectedIds.includes(id) ? "emailAttachment selectedAttachment" : "emailAttachment"}${item.alertColor ? ` alertColor-${item.alertColor}` : ""}`} draggable onClick={() => toggleSelection(id)} onDragStart={event => dragAttachment(event, attachment)}><div className="emailAttachmentPrimary"><span className="emailAttachmentName"><FileKindIcon name={attachment.name} />{attachment.name}</span><span>{formatSize(attachment.size)}</span></div><div className="emailAttachmentSecondary"><small>{attachment.sender || attachment.subject}</small><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Outlook" onClick={event => openMessage(event, attachment.messageId, attachment.webLink)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={event => { event.stopPropagation(); window.open(outlookUrl(`/messages/view?messageId=${encodeURIComponent(attachment.messageId)}`), "_blank", "noopener,noreferrer"); }}><MessageSquareText size={14} /></button></span></div></div>; })())}</div>
        </>}
    </section>;
}

export {OUTLOOK_ATTACHMENT_TYPE};
export default OutlookSourcePanel;
