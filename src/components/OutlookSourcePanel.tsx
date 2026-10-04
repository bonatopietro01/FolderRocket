import {additionalFileIcon} from './AdditionalFileIcons';
import {useCallback, useEffect, useMemo, useState} from "react";
import {Archive, BellRing, ExternalLink, File, FileSpreadsheet, FileText, Image, Mail, MessageSquareText, RefreshCw} from "lucide-react";
import {API_BASE_URL} from "../api";
import {invalidateEmailAccounts, loadEmailAccounts, type EmailAccount} from "../emailAccounts";
import EmailAlertBuilder, {type EmailAlertRule, type EmailAttachmentReader} from "./EmailAlertBuilder";

interface OutlookAttachment { attachmentId: string; messageId: string; mimeType: string; name: string; receivedAt: string; sender: string; size: number; subject: string; webLink?: string; }
interface OutlookAlertMessage { id: string; sender: string; subject: string; receivedAt: string; webLink?: string; }
interface OutlookWarningResult { ruleId: string; total: number; newCount: number; messageIds: string[]; messages?: OutlookAlertMessage[]; error?: string; }
type InboxItem = {type: "attachment"; attachment: OutlookAttachment; alertColor?: string; messageGroup?: "start" | "middle" | "end"} | {type: "alert"; alert: OutlookAlertMessage; alertColor?: string};

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
function formatReceivedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", {day: "2-digit", month: "short"}); }
function mergeAttachments(current: OutlookAttachment[], incoming: OutlookAttachment[]) { const merged = new Map(current.map(item => [`${item.messageId}:${item.attachmentId}`, item])); for (const item of incoming) merged.set(`${item.messageId}:${item.attachmentId}`, item); return [...merged.values()].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()); }
function FileKindIcon({name}: {name: string}) { const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, 14);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>; if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={14} /></span>; if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14} /></span>; if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={14} /></span>; if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt"><FileText size={14} /></span>; if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={14} /></span>; if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14} /></span>; return <span className="fileKindIcon generic"><File size={14} /></span>; }

function OutlookSourcePanel({storageScope, alertBlockId, accountBlockId, onAccountBlockIdChange, accountCatalogKey = "", worldId = "work", aiEnabled = false, worldAccountLocked = false, worldAccountEmail = "", onManageWorldAccount}: {storageScope: string; alertBlockId: string; accountBlockId?: string | null; onAccountBlockIdChange?: (accountBlockId?: string) => void; accountCatalogKey?: string; worldId?: string; aiEnabled?: boolean; worldAccountLocked?: boolean; worldAccountEmail?: string; onManageWorldAccount?: () => void}) {
    const credentialBlockId = accountBlockId === null ? "" : accountBlockId || alertBlockId;
    const alertSettingsUrl = `${API_BASE_URL}/email/alerts/settings/outlook?blockId=${encodeURIComponent(alertBlockId)}&worldId=${encodeURIComponent(worldId)}`;
    const outlookUrl = useCallback((endpoint: string) => `${API_BASE_URL}/email/outlook${endpoint}${endpoint.includes("?") ? "&" : "?"}blockId=${encodeURIComponent(credentialBlockId)}`, [credentialBlockId]);
    const outlookAuthUrl = (endpoint: string) => `${API_BASE_URL}/auth/outlook${endpoint}?blockId=${encodeURIComponent(credentialBlockId)}`;
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
    const [error, setError] = useState("");
    const [showDisconnect, setShowDisconnect] = useState(false);
    const [disconnectArmed, setDisconnectArmed] = useState(false);
    const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);

    useEffect(() => {
        if (!accountCatalogKey) return;
        let active = true;
        const refreshAccounts = (force = false) => void loadEmailAccounts("outlook", accountCatalogKey, force)
            .then(accounts => { if (active) setEmailAccounts(accounts); })
            .catch(() => { if (active) setEmailAccounts([]); });
        refreshAccounts();
        const refreshOnFocus = () => refreshAccounts(true);
        window.addEventListener("focus", refreshOnFocus);
        return () => { active = false; window.removeEventListener("focus", refreshOnFocus); };
    }, [accountCatalogKey]);

    const visibleAttachments = useMemo(() => attachments.filter(item => !dismissedIds.includes(`${item.messageId}:${item.attachmentId}`)), [attachments, dismissedIds]);
    const visibleRules = useMemo(() => rules.filter(rule => aiEnabled || rule.kind !== "ai"), [aiEnabled, rules]);
    const rulesById = useMemo(() => new Map(visibleRules.map(rule => [rule.id, rule])), [visibleRules]);
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
        const ordered = [
            ...visibleAttachments.map(attachment => ({type: "attachment" as const, attachment, alertColor: colorByMessage.get(attachment.messageId)})),
            ...[...alertMessages.values()].filter(item => !withAttachments.has(item.id)).map(alert => ({type: "alert" as const, alert, alertColor: colorByMessage.get(alert.id)}))
        ].sort((a, b) => new Date(b.type === "attachment" ? b.attachment.receivedAt : b.alert.receivedAt).getTime() - new Date(a.type === "attachment" ? a.attachment.receivedAt : a.alert.receivedAt).getTime());
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
    }, [colorByMessage, results, visibleAttachments, rulesById]);
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
        const activeRules = rulesToCheck.filter(rule => rule.enabled !== false && (aiEnabled || rule.kind !== "ai"));
        if (!connected || !activeRules.length) return;
        setChecking(true); setError("");
        try {
            const seenByRule = readSeen(storageScope);
            const response = await fetch(outlookUrl("/warnings/check"), {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({rules: activeRules, seenByRule})});
            const data = await response.json() as {results?: OutlookWarningResult[]; attachments?: OutlookAttachment[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? "Unable to check Outlook alerts");
            const next = Array.isArray(data.results) ? data.results : [];
            setResults(next); localStorage.setItem(storageKey(RESULTS_KEY, storageScope), JSON.stringify(next));
            if (Array.isArray(data.attachments) && data.attachments.length) setAttachments(current => mergeAttachments(current, data.attachments ?? []));
            const nextSeen = {...seenByRule};
            for (const result of next) nextSeen[result.ruleId] = [...new Set([...(nextSeen[result.ruleId] ?? []), ...result.messageIds])].slice(-500);
            localStorage.setItem(storageKey(SEEN_KEY, storageScope), JSON.stringify(nextSeen));
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to check Outlook alerts"); }
        finally { setChecking(false); }
    }, [aiEnabled, connected, rules, storageScope, outlookUrl]);

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
    }, [attachmentReader, checkRules, connected, outlookUrl]);

    useEffect(() => {
        let active = true;
        const refreshConnection = () => {
            void fetch(outlookUrl("/status"), {credentials: "include"})
                .then(response => response.json())
                .then((data: {connected?: boolean}) => { if (active) setConnected(Boolean(data.connected)); })
                .catch(() => { if (active) setConnected(false); });
        };
        refreshConnection();
        window.addEventListener("focus", refreshConnection);
        return () => { active = false; window.removeEventListener("focus", refreshConnection); };
    }, [outlookUrl]);
    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            void loadAlertSettings(true).then(() => { if (active) setSettingsReady(true); }).catch(() => { if (active) setError("Unable to load Outlook alert settings."); });
        }, 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, [loadAlertSettings]);
    useEffect(() => { if (!settingsReady) return; const timer = window.setTimeout(() => { void fetch(alertSettingsUrl, {method: "PUT", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({providerSettings: {attachmentReader, rules, accountBlockId: credentialBlockId}, favorites})}).then(async response=>{if(!response.ok){const data=await response.json().catch(()=>({})) as {message?:string};throw new Error(data.message||"Unable to save Outlook settings.");}}).catch(reason=>setError(reason instanceof Error?reason.message:"Unable to save Outlook settings.")); }, 350); return () => window.clearTimeout(timer); }, [alertSettingsUrl, attachmentReader, credentialBlockId, favorites, rules, settingsReady]);
    useEffect(() => { if (!liveReading || !connected) return; const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(), 60_000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [connected, liveReading, refresh]);
    useEffect(() => { if (!connected) return; const timer = window.setInterval(() => void loadAlertSettings(false).catch(() => setError("Unable to refresh Outlook alert settings.")), 60_000); return () => window.clearInterval(timer); }, [connected, loadAlertSettings]);
    useEffect(() => { const onOutside = (event: MouseEvent) => { const target = event.target as Element; if (!target.closest(".outlookSourceCard")) setSelectedIds([]); if (!target.closest(".gmailWarningsMenu") && !target.closest(".gmailWarningToggle")) setShowAlerts(false); if (!target.closest(".emailReaderHeaderControl")) setShowSettings(false); if (!target.closest(".emailConnectionControls")) { setShowDisconnect(false); setDisconnectArmed(false); } }; document.addEventListener("pointerdown", onOutside); return () => document.removeEventListener("pointerdown", onOutside); }, []);
    useEffect(() => { const refreshFromSplitButton = (event: MouseEvent) => { if (!(event.target as Element).closest(".emailReaderHeaderButton svg")) return; event.preventDefault(); event.stopPropagation(); if (attachmentReader.enabled && !loading) void refresh(); }; document.addEventListener("click", refreshFromSplitButton, true); return () => document.removeEventListener("click", refreshFromSplitButton, true); }, [attachmentReader.enabled, loading, refresh]);
    useEffect(() => { const syncFavorites = (event: Event) => { const favorites = (event as CustomEvent<EmailAlertRule[]>).detail; if (Array.isArray(favorites)) setFavorites(favorites); }; window.addEventListener("folderrocket-email-alert-favorites", syncFavorites); return () => window.removeEventListener("folderrocket-email-alert-favorites", syncFavorites); }, []);

    function toggleSelection(id: string) { setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
    function persistAlertSettings(nextRules: EmailAlertRule[], nextFavorites: EmailAlertRule[]) {
        void fetch(alertSettingsUrl, {method: "PUT", headers: {"Content-Type": "application/json"}, credentials: "include", keepalive: true, body: JSON.stringify({providerSettings: {attachmentReader, rules: nextRules, accountBlockId: credentialBlockId}, favorites: nextFavorites})}).then(async response=>{if(!response.ok){const data=await response.json().catch(()=>({})) as {message?:string};throw new Error(data.message||"Unable to save Outlook settings.");}setError("");}).catch(reason=>setError(reason instanceof Error?reason.message:"Unable to save Outlook settings."));
    }
    function dismissSelected() { setDismissedIds(current => { const next = [...new Set([...current, ...selectedIds])]; localStorage.setItem(storageKey(DISMISSED_KEY, storageScope), JSON.stringify(next)); return next; }); setSelectedIds([]); }
    async function openSelected() { await Promise.all(attachments.filter(item => selectedIds.includes(`${item.messageId}:${item.attachmentId}`)).map(item => fetch(outlookUrl("/attachments/open"), {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({messageId: item.messageId, attachmentId: item.attachmentId, name: item.name})}))); }
    function openMessage(event: React.MouseEvent<HTMLButtonElement>, messageId: string, webLink?: string) { event.stopPropagation(); window.open(webLink || `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(messageId)}`, "_blank", "noopener,noreferrer"); }
    function dragAttachment(event: React.DragEvent<HTMLElement>, attachment: OutlookAttachment) { event.stopPropagation(); const id = `${attachment.messageId}:${attachment.attachmentId}`; const dragged = selectedIds.includes(id) ? visibleAttachments.filter(item => selectedIds.includes(`${item.messageId}:${item.attachmentId}`)) : [attachment]; const payload = dragged.map(item => ({...item, sourceBlockId: credentialBlockId})); event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.dropEffect = "copy"; event.dataTransfer.setData(OUTLOOK_ATTACHMENT_TYPE, JSON.stringify(payload)); event.dataTransfer.setData("text/plain", `folderrocket-email:${JSON.stringify({provider: "outlook", attachments: payload})}`); }
    async function disconnect() {
        if (credentialBlockId !== alertBlockId) {
            onAccountBlockIdChange?.(undefined);
            setConnected(false); setAttachments([]); setResults([]); setLiveReading(false); setShowDisconnect(false); setDisconnectArmed(false);
            return;
        }
        const response = await fetch(outlookAuthUrl("/disconnect"), {method: "POST", credentials: "include"});
        if (response.ok) {
            setConnected(false); setAttachments([]); setResults([]); setLiveReading(false); setShowDisconnect(false); setDisconnectArmed(false);
            if (accountCatalogKey) { invalidateEmailAccounts("outlook", accountCatalogKey); void loadEmailAccounts("outlook", accountCatalogKey, true).then(setEmailAccounts).catch(() => setEmailAccounts([])); }
        } else setError("Outlook could not be disconnected.");
    }
    async function connectOutlook() {
        setError("");
        try {
            const response = await fetch(`${outlookAuthUrl("/start")}&format=json`, {headers: {Accept: "application/json"}, credentials: "include"});
            const data = await response.json() as {authorizationUrl?: string; message?: string};
            if (!response.ok || !data.authorizationUrl) throw new Error(data.message ?? "Outlook could not start the authorization.");
            const openedByDesktop = window.folderRocketDesktop ? await window.folderRocketDesktop.openExternal(data.authorizationUrl) : false;
            if (!openedByDesktop) {
                const popup = window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
                if (!popup) window.location.assign(data.authorizationUrl);
            }
        } catch (connectionError) { setError(connectionError instanceof Error ? connectionError.message : "Outlook could not start the authorization."); }
    }

    return <section className={`${inboxItems.length ? "sourceCard emailSourceCard outlookSourceCard" : "sourceCard emailSourceCard outlookSourceCard isEmptySource"}${showAlerts || previewRule ? " warningsOpen" : ""}`}>
        <div className="sourceHeader"><Mail className="outlookPanelIcon" size={29} />{connected ? <span className="emailConnectionControls"><button type="button" className="sourceTitle emailConnectionTitle" onClick={() => { setShowDisconnect(current => !current); setDisconnectArmed(false); }} title="Outlook connection options">Outlook</button>{showDisconnect && <button type="button" className={disconnectArmed ? "emailDisconnectButton armed" : "emailDisconnectButton"} onClick={() => { if (disconnectArmed) void disconnect(); else setDisconnectArmed(true); }} title={disconnectArmed ? "Press again to disconnect Outlook" : "Disconnect Outlook"}>{disconnectArmed ? "Confirm" : "Disconnect"}</button>}</span> : <span className="sourceTitle">Outlook</span>}
            {worldAccountLocked&&worldAccountEmail&&<span className="emailWorldAccountBadge" title={`Selected for ${worldId}`}>{worldAccountEmail}</span>}
            <span className="emailReaderHeaderControl"><button type="button" className={`emailReaderHeaderButton${attachmentReader.enabled ? " active" : ""}`} onClick={() => setShowSettings(current => !current)} aria-expanded={showSettings} title="Read attachments and choose period"><RefreshCw className={loading ? "spin" : ""} size={13}/><span>Read attachments</span></button>{showSettings && <div className="emailReaderHeaderMenu" onClick={event => event.stopPropagation()}>
                <header><strong>Read attachments</strong><button type="button" onClick={() => void refresh()} disabled={loading || !connected || !attachmentReader.enabled} title="Refresh attachments"><RefreshCw className={loading ? "spin" : ""} size={14}/></button></header>
                {worldAccountLocked ? <div className="emailAccountPickerRow"><span>Account for this planet</span><strong>{worldAccountEmail||"No account selected"}</strong><button type="button" className="emailChooseAccountButton" onClick={onManageWorldAccount}>Planet settings</button></div> : (emailAccounts.length > 0 || accountBlockId) && <label className="emailAccountPickerRow"><span>Outlook account</span><select aria-label="Outlook account for this planet" title="Choose the Outlook account used by this planet" value={credentialBlockId} onChange={event => onAccountBlockIdChange?.(event.target.value === alertBlockId ? undefined : event.target.value)}>
                    <option value={credentialBlockId}>{emailAccounts.find(account => account.blockId === credentialBlockId)?.label || (accountBlockId ? "Selected account" : "Connect an account")}</option>
                    {emailAccounts.filter(account => account.blockId !== credentialBlockId).map(account => <option key={account.blockId} value={account.blockId}>{account.label}</option>)}
                </select></label>}
                <label className="emailReaderEnabled"><input type="checkbox" checked={attachmentReader.enabled} disabled={!connected} onChange={event => { const enabled = event.target.checked; setAttachmentReader(current => ({...current, enabled})); if (!enabled) setAttachments([]); }}/>Enable attachment reading</label>
                <select disabled={!connected} value={attachmentReader.filter.mode} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, mode: event.target.value as "relative" | "range"}}))}><option value="relative">Last days</option><option value="range">Date range</option></select>
                {attachmentReader.filter.mode === "relative" ? <label>Days back<input disabled={!connected} type="number" min="1" value={attachmentReader.filter.days} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, days: Math.max(1, Number(event.target.value) || 1)}}))}/></label> : <div className="emailDateRange"><label>From<input disabled={!connected} type="date" value={attachmentReader.filter.startDate} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, startDate: event.target.value}}))}/></label><label>To<input disabled={!connected} type="date" value={attachmentReader.filter.endDate} onChange={event => setAttachmentReader(current => ({...current, filter: {...current.filter, endDate: event.target.value}}))}/></label></div>}
                <button type="button" className="emailReaderApply" disabled={!connected} onClick={() => { setShowSettings(false); if (attachmentReader.enabled) void refresh(); }}>Apply & refresh</button>
            </div>}</span>
            {connected && <button type="button" className="gmailWarningToggle" onClick={() => { setPreviewRuleId(null); setShowAlerts(current => !current); }} title="Outlook alert settings"><BellRing size={15} /></button>}{connected && <span className={checking ? "emailAlertSlots analyzing" : "emailAlertSlots"}>{checking ? "Analyzing…" : visibleRules.filter(rule => rule.enabled).slice(0, 5).map(rule => { const result = results.find(item => item.ruleId === rule.id); return result ? <button key={`ready-${rule.id}`} type="button" className={`gmailAlertCount alertColor-${rule.color}`} title={`Show ${rule.label}`} onClick={() => setPreviewRuleId(rule.id)}>{result.total}</button> : <span key={`ready-${rule.id}`} className={`emailAlertReadyDot alertColor-${rule.color}`} title={`${rule.label} is active`} />; })}</span>}{connected && <span className="emailHeaderReading">Virtual: <button type="button" className={liveReading ? "emailVirtualReadingToggle active" : "emailVirtualReadingToggle"} onClick={() => setLiveReading(current => !current)} aria-pressed={liveReading} title={liveReading ? "Turn Virtual Reading off" : "Turn Virtual Reading on"}>{liveReading ? "ON" : "OFF"}</button></span>}</div>
        {!connected ? <div className="emailConnectArea"><p>{worldAccountLocked?worldAccountEmail?"The selected Outlook account is not connected.":"Choose a Gmail or Outlook account in planet settings.":"Read Outlook attachments in read-only mode."}</p>{!worldAccountLocked&&<button type="button" className="emailConnectButton" onClick={() => void connectOutlook()}>Connect Outlook</button>}{worldAccountLocked&&!worldAccountEmail&&<button type="button" className="emailConnectButton" onClick={onManageWorldAccount}>Planet settings</button>}</div> : <>
            {previewRule && <div className={`gmailWarningPreview alertColor-${previewRule.color}`}><strong>{previewRule.label}</strong><div>{previewMessages.map(message => <article key={message.id}><div><span>{message.subject || "No subject"}</span><small>{message.sender || "Unknown sender"}</small></div><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Outlook" onClick={event => openMessage(event, message.id, message.webLink)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={() => window.open(outlookUrl(`/messages/view?messageId=${encodeURIComponent(message.id)}`), "_blank", "noopener,noreferrer")}><MessageSquareText size={14} /></button></span></article>)}</div></div>}
            {showAlerts && <div className="gmailWarningsMenu"><EmailAlertBuilder providerLabel="Outlook" rules={rules} favorites={favorites} onChange={({rules: nextRules, favorites: nextFavorites}) => { setRules(nextRules); setFavorites(nextFavorites); persistAlertSettings(nextRules, nextFavorites); window.dispatchEvent(new CustomEvent("folderrocket-email-alert-favorites", {detail: nextFavorites})); }} onCheckNow={nextRules => void checkRules(nextRules)} allowAi={aiEnabled} />{error && <p className="emailError">{error}</p>}</div>}
            {visibleAttachments.length > 0 && <div className="emailToolbar emailSelectionToolbar"><div className="gmailSelectionActions emailInlineSelectionActions"><button type="button" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Deselect all</button><button type="button" disabled={!selectedIds.length} onClick={dismissSelected}>Hide selected</button><button type="button" disabled={!selectedIds.length} onClick={() => void openSelected()}>Open files</button><button type="button" onClick={() => { setAttachments([]); setSelectedIds([]); }}>Clear all</button></div></div>}
            {error && !showAlerts && <p className="emailError">{error}</p>}
            <div className="emailAttachmentList">{inboxItems.length === 0 ? <p className="sourcePlaceholder">No attachments or alerts found. Press refresh.</p> : inboxItems.map(item => item.type === "alert" ? <div key={`alert-${item.alert.id}`} className={`emailAttachment emailAlertItem ${item.alertColor ? `alertColor-${item.alertColor}` : ""}`}><div className="emailAttachmentPrimary"><span className="emailAttachmentName"><Mail size={14} />{item.alert.subject || "Matching email"}</span></div><div className="emailAttachmentSecondary"><small>{item.alert.sender || "Unknown sender"}</small><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Outlook" onClick={event => openMessage(event, item.alert.id, item.alert.webLink)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={() => window.open(outlookUrl(`/messages/view?messageId=${encodeURIComponent(item.alert.id)}`), "_blank", "noopener,noreferrer")}><MessageSquareText size={14} /></button></span></div></div> : (() => { const attachment = item.attachment; const id = `${attachment.messageId}:${attachment.attachmentId}`; return <div key={id} className={`${selectedIds.includes(id) ? "emailAttachment selectedAttachment" : "emailAttachment"}${item.alertColor ? ` alertColor-${item.alertColor}` : ""}${item.messageGroup ? ` emailMessageGroup messageGroup-${item.messageGroup}` : ""}`} draggable onClick={() => toggleSelection(id)} onDragStart={event => dragAttachment(event, attachment)}><div className="emailAttachmentPrimary"><span className="emailAttachmentName">{item.messageGroup === "start" && <span className="emailMessageGroupMarker" title="More attachments from this email"><Mail size={10}/></span>}<FileKindIcon name={attachment.name} />{attachment.name}</span><span>{formatSize(attachment.size)}{formatReceivedAt(attachment.receivedAt) ? ` · ${formatReceivedAt(attachment.receivedAt)}` : ""}</span></div><div className="emailAttachmentSecondary"><small>{attachment.sender || attachment.subject}</small><span className="emailAttachmentActions"><button type="button" className="openEmailMessage" title="Open in Outlook" onClick={event => openMessage(event, attachment.messageId, attachment.webLink)}><ExternalLink size={14} /></button><button type="button" className="openEmailMessage" title="Read email locally" onClick={event => { event.stopPropagation(); window.open(outlookUrl(`/messages/view?messageId=${encodeURIComponent(attachment.messageId)}`), "_blank", "noopener,noreferrer"); }}><MessageSquareText size={14} /></button></span></div></div>; })())}</div>
        </>}
    </section>;
}

export {OUTLOOK_ATTACHMENT_TYPE};
export default OutlookSourcePanel;
