import {CalendarDays, Check, CircleAlert, Eye, EyeOff, KeyRound, Mail, Save, Sparkles, X} from "lucide-react";
import {useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject} from "react";
import {API_BASE_URL} from "../api";

interface IntegrationStatus {
    desktopConfigurationAvailable: boolean;
    aiConfigured: boolean;
    gmailConfigured: boolean;
    googleCalendarConfigured: boolean;
    outlookConfigured: boolean;
}

type IntegrationFields = {
    openAiKey: string;
    gmailClientId: string;
    gmailClientSecret: string;
    googleCalendarApiKey: string;
    outlookClientId: string;
    outlookClientSecret: string;
};

const EMPTY_FIELDS: IntegrationFields = {
    openAiKey: "",
    gmailClientId: "",
    gmailClientSecret: "",
    googleCalendarApiKey: "",
    outlookClientId: "",
    outlookClientSecret: ""
};

function savedValue(configured: boolean, description: string) {
    return configured ? `${description} is saved locally.` : `${description} still needs setup.`;
}

type IntegrationPanelPosition = {left: number; top: number; maxHeight: number};

export default function IntegrationSetup({isAdmin, onAIStatusChange, open, onOpenChange, position, triggerRef}: {isAdmin: boolean; onAIStatusChange?: (ready: boolean) => void; open: boolean; onOpenChange: (open: boolean) => void; position: IntegrationPanelPosition; triggerRef: RefObject<HTMLButtonElement | null>}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<IntegrationStatus | null>(null);
    const [fields, setFields] = useState<IntegrationFields>(EMPTY_FIELDS);
    const [showSecrets, setShowSecrets] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [browserBridgeCode, setBrowserBridgeCode] = useState("");

    const loadStatus = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(`${API_BASE_URL}/desktop/integrations/status`, {credentials: "include", signal:controller.signal});
            const data = await response.json().catch(() => ({})) as IntegrationStatus & {message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to read integration status.");
            setStatus(data);
            onAIStatusChange?.(Boolean(data.aiConfigured));
            setMessage("");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to read integration status.");
        } finally {
            window.clearTimeout(timeout);
            setLoading(false);
        }
    }, [isAdmin, onAIStatusChange]);

    useEffect(() => { if (!isAdmin) return; const timer=window.setTimeout(()=>void loadStatus(),0); return()=>window.clearTimeout(timer); }, [isAdmin, loadStatus]);
    useEffect(() => { if (!open) return; const timer=window.setTimeout(()=>void loadStatus(),0); return()=>window.clearTimeout(timer); }, [loadStatus, open]);

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) onOpenChange(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        return () => document.removeEventListener("pointerdown", closeOutside);
    }, [onOpenChange, open, triggerRef]);

    function updateField(key: keyof IntegrationFields, value: string) {
        setFields(current => ({...current, [key]: value}));
        setMessage("");
    }

    async function saveSettings() {
        if (!isAdmin || saving) return;
        const settings = {
            ...(fields.openAiKey.trim() ? {OPENAI_API_KEY: fields.openAiKey.trim()} : {}),
            ...(fields.gmailClientId.trim() ? {GMAIL_CLIENT_ID: fields.gmailClientId.trim()} : {}),
            ...(fields.gmailClientSecret.trim() ? {GMAIL_CLIENT_SECRET: fields.gmailClientSecret.trim()} : {}),
            ...(fields.googleCalendarApiKey.trim() ? {GOOGLE_CALENDAR_API_KEY: fields.googleCalendarApiKey.trim()} : {}),
            ...(fields.outlookClientId.trim() ? {OUTLOOK_CLIENT_ID: fields.outlookClientId.trim()} : {}),
            ...(fields.outlookClientSecret.trim() ? {OUTLOOK_CLIENT_SECRET: fields.outlookClientSecret.trim()} : {})
        };
        if (!Object.keys(settings).length) { setMessage("Paste at least one key or app credential to save it locally."); return; }

        setSaving(true);
        try {
            const response = await fetch(`${API_BASE_URL}/desktop/integrations/config`, {
                method: "PUT",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({settings})
            });
            const data = await response.json().catch(() => ({})) as IntegrationStatus & {message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to save integration settings.");
            setStatus(data);
            onAIStatusChange?.(Boolean(data.aiConfigured));
            setFields(EMPTY_FIELDS);
            setMessage("Saved locally. FolderRocket is ready to use the configured services.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to save integration settings.");
        } finally {
            setSaving(false);
        }
    }

    async function generateBrowserBridgeCode() {
        if (!isAdmin) return;
        try {
            const response = await fetch(`${API_BASE_URL}/browser-bridge/token`, {method: "POST", credentials: "include"});
            const data = await response.json().catch(() => ({})) as {token?: string; message?: string};
            if (!response.ok || !data.token) throw new Error(data.message || "Unable to generate the Browser bridge code.");
            setBrowserBridgeCode(data.token);
            setMessage("Browser bridge code generated. Paste it in the Chrome or Edge extension options.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to generate the Browser bridge code.");
        }
    }

    async function copyBrowserBridgeCode() {
        if (!browserBridgeCode) return;
        try { await navigator.clipboard.writeText(browserBridgeCode); setMessage("Browser bridge code copied."); }
        catch { setMessage("Copy the Browser bridge code manually."); }
    }

    const aiReady = Boolean(status?.aiConfigured);
    const panelStyle = {left: position.left, top: position.top, maxHeight: position.maxHeight} as CSSProperties;
    return <div className="integrationSetup" ref={wrapperRef}>
        {open && <section id="accountServicesPanel" className="integrationSetupPanel accountServicesPanel" style={panelStyle} role="dialog" aria-label="AI and connected services">
            <header><span><Sparkles size={17} />AI integrated FolderRocket</span><button type="button" onClick={() => onOpenChange(false)} aria-label="Close integration settings"><X size={16} /></button></header>
            {!isAdmin ? <p className="integrationNotice">Only the local administrator can configure paid AI and mailbox connections.</p> : <>
                <p className="integrationIntro">Keys are saved only in this Windows user’s private FolderRocket data folder. They are never included in the installer or GitHub.</p>
                {loading ? <p className="integrationNotice">Checking local setup…</p> : <>
                    <article className={aiReady ? "integrationCard ready" : "integrationCard"}>
                        <div><Sparkles size={16} /><strong>AI</strong><small>{savedValue(aiReady, "OpenAI connection")}</small></div>
                        <input type={showSecrets ? "text" : "password"} value={fields.openAiKey} onChange={event => updateField("openAiKey", event.target.value)} placeholder={aiReady ? "New OpenAI API key (optional)" : "OpenAI API key"} autoComplete="off" />
                    </article>
                    <article className={status?.gmailConfigured ? "integrationCard ready" : "integrationCard"}>
                        <div><Mail size={16} /><strong>Gmail</strong><small>{savedValue(Boolean(status?.gmailConfigured), "Gmail app credentials")}</small></div>
                        <input type="text" value={fields.gmailClientId} onChange={event => updateField("gmailClientId", event.target.value)} placeholder={status?.gmailConfigured ? "New Gmail client ID (optional)" : "Gmail client ID"} autoComplete="off" />
                        <input type={showSecrets ? "text" : "password"} value={fields.gmailClientSecret} onChange={event => updateField("gmailClientSecret", event.target.value)} placeholder={status?.gmailConfigured ? "New Gmail client secret (optional)" : "Gmail client secret"} autoComplete="off" />
                    </article>
                    <article className={status?.googleCalendarConfigured ? "integrationCard ready" : "integrationCard"}>
                        <div><CalendarDays size={16} /><strong>Public Calendar key (optional)</strong><small>Private calendars connect directly inside their Calendar block.</small></div>
                        <input type={showSecrets ? "text" : "password"} value={fields.googleCalendarApiKey} onChange={event => updateField("googleCalendarApiKey", event.target.value)} placeholder={status?.googleCalendarConfigured ? "New public-calendar API key (optional)" : "Public-calendar API key (optional)"} autoComplete="off" />
                    </article>
                    <article className="integrationCard browserBridgeCard">
                        <div><KeyRound size={16} /><strong>Gmail browser bridge</strong><small>Drag attachments from Gmail in Chrome or Edge into FolderRocket.</small></div>
                        <button type="button" onClick={() => void generateBrowserBridgeCode()}>Generate browser code</button>
                        {browserBridgeCode && <div className="browserBridgeCode"><code>{browserBridgeCode}</code><button type="button" onClick={() => void copyBrowserBridgeCode()}>Copy</button></div>}
                    </article>
                    <article className={status?.outlookConfigured ? "integrationCard ready" : "integrationCard"}>
                        <div><Mail size={16} /><strong>Outlook</strong><small>{savedValue(Boolean(status?.outlookConfigured), "Outlook app credentials")}</small></div>
                        <input type="text" value={fields.outlookClientId} onChange={event => updateField("outlookClientId", event.target.value)} placeholder={status?.outlookConfigured ? "New Outlook client ID (optional)" : "Outlook client ID"} autoComplete="off" />
                        <input type={showSecrets ? "text" : "password"} value={fields.outlookClientSecret} onChange={event => updateField("outlookClientSecret", event.target.value)} placeholder={status?.outlookConfigured ? "New Outlook client secret (optional)" : "Outlook client secret"} autoComplete="off" />
                    </article>
                    <div className="integrationActions"><button type="button" className="integrationReveal" onClick={() => setShowSecrets(current => !current)} title={showSecrets ? "Hide credentials" : "Show credentials"}>{showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}{showSecrets ? "Hide" : "Show"}</button><button type="button" className="integrationSave" onClick={() => void saveSettings()} disabled={saving}><Save size={14} />{saving ? "Saving…" : "Save locally"}</button></div>
                    <p className="integrationOAuthNote"><KeyRound size={13} />After Gmail or Outlook says “ready”, use Connect in that mailbox block and approve read-only access in the official Google or Microsoft page.</p>
                    {message && <p className={message.startsWith("Saved") ? "integrationMessage success" : "integrationMessage"}>{message.startsWith("Saved") ? <Check size={14} /> : <CircleAlert size={14} />}{message}</p>}
                </>}
            </>}
        </section>}
    </div>;
}
