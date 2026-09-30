import {useEffect, useRef, useState, type FormEvent, type ReactNode} from "react";
import {Activity, ChevronDown, ChevronUp, Columns3, Copy, Eye, EyeOff, History, KeyRound, LayoutDashboard, LogOut, PanelsTopLeft, Plus, RefreshCw, Settings2, ShieldCheck, Sparkles, UserRound, ZoomIn} from "lucide-react";
import {API_BASE_URL} from "../api";
import IntegrationSetup from "./IntegrationSetup";
import folderRocketLoginLogo from "../assets/folderrocket-login-logo.png";

export interface FolderRocketUser {
    id: string;
    email: string;
    role: "admin" | "member";
    workspacePath: string;
    createdAt: string;
}

interface AuthGateProps {
    children: (session: {user: FolderRocketUser; logout: () => Promise<void>}) => ReactNode;
}

type RecoveryCodeResponse = {code: string; expiresAt: string};

interface AuditEvent {
    id: string;
    at: string;
    user: {id: string; email: string; role: "admin" | "member"};
    action: string;
    details?: {method?: string; fileName?: string; count?: number; destination?: string};
}

const auditActionLabels: Record<string, string> = {
    account_created: "Account created",
    signed_in: "Signed in",
    signed_out: "Signed out",
    password_reset_signed_in: "Password reset and signed in",
    file_uploaded: "Uploaded a file",
    virtual_files_uploaded: "Added virtual files",
    projection_analyzed: "Analyzed a screen projection",
    domain_analyzed: "Analyzed a public domain page"
};

function formatAuditTimestamp(value: string) {
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime())
        ? value
        : new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(timestamp);
}

async function readJson(response: Response) {
    const data = await response.json().catch(() => ({})) as {message?: string};
    if (!response.ok) throw new Error(data.message ?? "Something went wrong.");
    return data;
}

function PasswordField({
    autoComplete,
    onChange,
    value
}: {
    autoComplete: "current-password" | "new-password";
    onChange: (value: string) => void;
    value: string;
}) {
    const [visible, setVisible] = useState(false);
    return <label>Password
        <span className="passwordField">
            <input type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={12} value={value} onChange={event => onChange(event.target.value)} required />
            <button type="button" className="passwordVisibilityButton" onClick={() => setVisible(current => !current)} aria-label={visible ? "Hide password" : "Show password"} title={visible ? "Hide password" : "Show password"}>
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
        </span>
    </label>;
}

function AccountMenu({user, onLogout, onOpenDiagnostics, appZoom, onAppZoomChange, aiConfigured, aiMode, onAIModeChange, onAIStatusChange, dashboardLayout, onDashboardLayoutChange, floatingToolsScale, onFloatingToolsScaleChange, bookmarkScale, onBookmarkScaleChange, bookmarkWidth, onBookmarkWidthChange, bookmarkHeight, onBookmarkHeightChange}: {user: FolderRocketUser; onLogout: () => Promise<void>; onOpenDiagnostics: () => void; appZoom: number; onAppZoomChange: (value: number) => void; aiConfigured: boolean; aiMode: boolean; onAIModeChange: (enabled: boolean) => void; onAIStatusChange: (ready: boolean) => void; dashboardLayout: "three-column" | "folders-top"; onDashboardLayoutChange: (layout: "three-column" | "folders-top") => void; floatingToolsScale: number; onFloatingToolsScaleChange: (value: number) => void; bookmarkScale: number; onBookmarkScaleChange: (value: number) => void; bookmarkWidth: number; onBookmarkWidthChange: (value: number) => void; bookmarkHeight: number; onBookmarkHeightChange: (value: number) => void}) {
    const [open, setOpen] = useState(false);
    const [moreZoomsOpen, setMoreZoomsOpen] = useState(false);
    const [dashboardLayoutOpen, setDashboardLayoutOpen] = useState(false);
    const [servicesOpen, setServicesOpen] = useState(false);
    const [servicesStacked, setServicesStacked] = useState(false);
    const [servicesPosition, setServicesPosition] = useState({left: 12, top: 64, maxHeight: 620});
    const accountMenuRef = useRef<HTMLDivElement>(null);
    const servicesTriggerRef = useRef<HTMLButtonElement>(null);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteResult, setInviteResult] = useState<{email: string; code: string} | null>(null);
    const [resetEmail, setResetEmail] = useState("");
    const [resetResult, setResetResult] = useState("");
    const [recoveryResult, setRecoveryResult] = useState<RecoveryCodeResponse | null>(null);
    const [auditEvents, setAuditEvents] = useState<AuditEvent[] | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);
    const [error, setError] = useState("");

    function toggleMenu() {
        if (open) {
            setInviteResult(null);
            setResetResult("");
            setRecoveryResult(null);
            setAuditEvents(null);
            setError("");
            setMoreZoomsOpen(false);
            setServicesOpen(false);
        }
        setOpen(current => !current);
    }

    async function createInvitation() {
        setError("");
        setInviteResult(null);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/invitations`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({email: inviteEmail})
            });
            const data = await readJson(response) as {email: string; code: string};
            setInviteResult({email: data.email, code: data.code});
            setInviteEmail("");
        } catch (inviteError) {
            setError(inviteError instanceof Error ? inviteError.message : "Unable to create invitation.");
        }
    }

    async function generateRecoveryCode() {
        setError("");
        setRecoveryResult(null);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/recovery-code`, {
                method: "POST",
                credentials: "include"
            });
            setRecoveryResult(await readJson(response) as RecoveryCodeResponse);
        } catch (recoveryError) {
            setError(recoveryError instanceof Error ? recoveryError.message : "Unable to generate a recovery code.");
        }
    }

    async function generateResetCode() {
        setError("");
        setResetResult("");
        try {
            const response = await fetch(`${API_BASE_URL}/auth/admin-password-reset`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify({email: resetEmail})
            });
            const data = await readJson(response) as {email: string; code: string};
            setResetResult(`Temporary reset code for ${data.email}: ${data.code}`);
            setResetEmail("");
        } catch (resetError) {
            setError(resetError instanceof Error ? resetError.message : "Unable to generate a reset code.");
        }
    }

    async function loadAuditLog() {
        setError("");
        setAuditLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/auth/admin/audit-log?limit=100`, {credentials: "include"});
            const data = await readJson(response) as {events?: AuditEvent[]};
            setAuditEvents(Array.isArray(data.events) ? data.events : []);
        } catch (auditError) {
            setError(auditError instanceof Error ? auditError.message : "Unable to load access activity.");
        } finally {
            setAuditLoading(false);
        }
    }

    function adjustAppZoom(amount: number) { onAppZoomChange(Math.round(Math.max(.75, Math.min(1.5, appZoom + amount)) * 100) / 100); }
    function adjustFloatingToolsScale(amount: number) { onFloatingToolsScaleChange(Math.round(Math.max(.8, Math.min(1.3, floatingToolsScale + amount)) * 100) / 100); }
    function adjustBookmarkScale(amount: number) { onBookmarkScaleChange(Math.round(Math.max(.8, Math.min(1.3, bookmarkScale + amount)) * 100) / 100); }
    function adjustBookmarkWidth(amount: number) { onBookmarkWidthChange(Math.max(64, Math.min(220, bookmarkWidth + amount))); }
    function adjustBookmarkHeight(amount: number) { onBookmarkHeightChange(Math.max(22, Math.min(72, bookmarkHeight + amount))); }

    function toggleServices() {
        if (servicesOpen) { setServicesOpen(false); return; }
        const menuRect = accountMenuRef.current?.getBoundingClientRect();
        if (!menuRect) return;
        const panelWidth = Math.min(500, window.innerWidth - 24);
        const maxHeight = Math.min(620, window.innerHeight - 24);
        if (menuRect.left >= panelWidth + 20) {
            setServicesStacked(false);
            setServicesPosition({
                left: Math.max(12, menuRect.left - panelWidth - 8),
                top: Math.max(12, Math.min(menuRect.top, window.innerHeight - maxHeight - 12)),
                maxHeight
            });
            setServicesOpen(true);
            return;
        }

        setServicesStacked(true);
        setServicesOpen(true);
        window.requestAnimationFrame(() => {
            const compactMenuRect = accountMenuRef.current?.getBoundingClientRect();
            if (!compactMenuRect) return;
            const top = Math.min(compactMenuRect.bottom + 8, window.innerHeight - 180);
            setServicesPosition({left: 12, top: Math.max(12, top), maxHeight: Math.max(160, window.innerHeight - top - 12)});
        });
    }

    return <div className="accountMenuWrap">
        <button type="button" className="accountMenuButton" onClick={toggleMenu} aria-expanded={open}>
            <UserRound size={15} />{user.email}
        </button>
        {open && <div ref={accountMenuRef} className={`accountMenu${servicesStacked && servicesOpen ? " servicesStacked" : ""}`}>
            <div className="accountMenuHeading"><div><strong><ShieldCheck size={14} />{user.role === "admin" ? "Administrator" : "Personal account"}</strong><small>Private workspace active</small></div></div>
            <section className="accountWorkspaceControls" aria-label="Workspace controls">
                <strong><Settings2 size={14} />Workspace controls</strong>
                <div className="accountDashboardLayoutControl"><button type="button" className="accountDashboardLayoutToggle" onClick={() => setDashboardLayoutOpen(current => !current)} aria-expanded={dashboardLayoutOpen}><LayoutDashboard size={14}/><span>Dashboard layout</span><small>{dashboardLayout === "three-column" ? "3 columns" : "Folders on top"}</small>{dashboardLayoutOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</button>{dashboardLayoutOpen && <div className="accountDashboardLayoutOptions" role="group" aria-label="Choose dashboard layout"><button type="button" className={dashboardLayout === "three-column" ? "active" : ""} aria-pressed={dashboardLayout === "three-column"} onClick={() => onDashboardLayoutChange("three-column")}><Columns3 size={14}/><span>Three columns<small>Sources left and right</small></span></button><button type="button" className={dashboardLayout === "folders-top" ? "active" : ""} aria-pressed={dashboardLayout === "folders-top"} onClick={() => onDashboardLayoutChange("folders-top")}><PanelsTopLeft size={14}/><span>Folders on top<small>Sources below</small></span></button></div>}</div>
                <div className="accountPageZoomRow"><div className="accountScaleControl"><span><ZoomIn size={13}/>Page zoom</span><output aria-live="polite">{Math.round(appZoom * 100)}%</output><button type="button" onClick={() => adjustAppZoom(-.05)} disabled={appZoom <= .75} aria-label="Zoom out">−</button><button type="button" onClick={() => adjustAppZoom(.05)} disabled={appZoom >= 1.5} aria-label="Zoom in">+</button></div><button type="button" className="accountMoreZoomButton" onClick={() => setMoreZoomsOpen(current => !current)} aria-expanded={moreZoomsOpen}>{moreZoomsOpen ? "Meno zoom" : "Altri zoom"}{moreZoomsOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}</button></div>
                {moreZoomsOpen && <section className="accountDisplaySettings" aria-label="Other zoom controls"><strong>Altri zoom</strong><div className="accountScaleControl"><span>Post-its {Math.round(floatingToolsScale * 100)}%</span><button type="button" onClick={() => adjustFloatingToolsScale(-.05)} disabled={floatingToolsScale <= .8} aria-label="Make notes smaller">−</button><button type="button" onClick={() => adjustFloatingToolsScale(.05)} disabled={floatingToolsScale >= 1.3} aria-label="Make notes larger">+</button></div><div className="accountBookmarkSettings"><div className="accountScaleControl"><span>Side post-its {Math.round(bookmarkScale * 100)}%</span><button type="button" onClick={() => adjustBookmarkScale(-.05)} disabled={bookmarkScale <= .8} aria-label="Reduce side post-it scale">−</button><button type="button" onClick={() => adjustBookmarkScale(.05)} disabled={bookmarkScale >= 1.3} aria-label="Increase side post-it scale">+</button></div><div className="accountScaleControl"><span>Width {bookmarkWidth}px</span><button type="button" onClick={() => adjustBookmarkWidth(-8)} disabled={bookmarkWidth <= 64} aria-label="Make side post-its narrower">−</button><button type="button" onClick={() => adjustBookmarkWidth(8)} disabled={bookmarkWidth >= 220} aria-label="Make side post-its wider">+</button></div><div className="accountScaleControl"><span>Height {bookmarkHeight}px</span><button type="button" onClick={() => adjustBookmarkHeight(-4)} disabled={bookmarkHeight <= 22} aria-label="Make side post-its shorter">−</button><button type="button" onClick={() => adjustBookmarkHeight(4)} disabled={bookmarkHeight >= 72} aria-label="Make side post-its taller">+</button></div><small>Final size: {Math.round(bookmarkWidth * bookmarkScale)} × {Math.round(bookmarkHeight * bookmarkScale)} px</small></div></section>}
                <div className="accountAiModeControls"><div className="accountAiModeRow"><button type="button" className={aiMode ? "accountAiMode enabled" : "accountAiMode"} disabled={!aiConfigured} onClick={() => onAIModeChange(!aiMode)} aria-pressed={aiMode} title={aiConfigured ? `Turn AI ${aiMode ? "off" : "on"} for this planet` : "Configure the shared AI connection in Services first"}><Sparkles size={15}/><span className="accountAiModeCopy"><strong>Bonato Pietro Services</strong><small>AI integrate FolderRocket · AI Mode {aiMode ? "ON" : "OFF"}{!aiConfigured ? " · Not configured" : ""}</small></span></button><button ref={servicesTriggerRef} type="button" className="accountServicesButton" onClick={toggleServices} aria-expanded={servicesOpen} aria-controls="accountServicesPanel"><Settings2 size={14}/>Services</button></div></div>
            </section>
            <button type="button" className="accountDiagnosticsButton" onClick={() => {setOpen(false); onOpenDiagnostics();}}><Activity size={15}/><span>Diagnostica</span><small>Errori recenti e stato dell’app</small></button>
            <div className="recoveryBox">
                <label>Personal password recovery</label>
                <p>Generate one code and save it somewhere safe. It is shown once and can be used once within one year.</p>
                <button type="button" className="accountActionButton" onClick={() => void generateRecoveryCode()}><KeyRound size={14} />Generate recovery code</button>
                {recoveryResult && <p className="inviteResult">Save this code now: <code>{recoveryResult.code}</code></p>}
            </div>
            {user.role === "admin" && <>
                <div className="inviteBox">
                    <label htmlFor="invite-email">Invite a user</label>
                    <div><input id="invite-email" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="email@example.com" /><button type="button" onClick={() => void createInvitation()} title="Create invitation"><Plus size={14} /></button></div>
                    {inviteResult && <div className="inviteResult"><span>Use this code only for <strong>{inviteResult.email}</strong>:</span><div><code>{inviteResult.code}</code><button type="button" className="copyInviteCode" title="Copy invitation code" onClick={() => void navigator.clipboard?.writeText(inviteResult.code)}><Copy size={13} /></button></div></div>}
                </div>
                <div className="inviteBox">
                    <label htmlFor="reset-email">Reset another user's password</label>
                    <div><input id="reset-email" type="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} placeholder="email@example.com" /><button type="button" onClick={() => void generateResetCode()} title="Create temporary reset code"><KeyRound size={14} /></button></div>
                    {resetResult && <p className="inviteResult">Give this privately to the user: <code>{resetResult}</code></p>}
                </div>
                <div className="auditBox">
                    <div className="auditHeader"><label>Access activity</label><button type="button" className="auditRefreshButton" onClick={() => void loadAuditLog()} disabled={auditLoading} title="Refresh access activity"><RefreshCw size={13} className={auditLoading ? "spinningIcon" : ""} />{auditLoading ? "Loading" : auditEvents ? "Refresh" : "View"}</button></div>
                    <p>Only you can view successful sign-ins and recent uploads. Recording starts now.</p>
                    {auditEvents && (auditEvents.length ? <ul className="auditList">{auditEvents.map(event => <li key={event.id}><strong>{event.user.email}</strong><span>{auditActionLabels[event.action] ?? event.action} · {formatAuditTimestamp(event.at)}</span>{event.details?.fileName && <small>{event.details.fileName}</small>}{typeof event.details?.count === "number" && <small>{event.details.count} file{event.details.count === 1 ? "" : "s"}</small>}</li>)}</ul> : <p className="auditEmpty"><History size={13} />No activity has been recorded yet.</p>)}
                </div>
            </>}
            {error && <p className="authError">{error}</p>}
            <button type="button" className="logoutButton" onClick={() => void onLogout()}><LogOut size={14} />Sign out</button>
        </div>}
        <IntegrationSetup isAdmin={user.role === "admin"} onAIStatusChange={onAIStatusChange} open={open && servicesOpen} onOpenChange={setServicesOpen} position={servicesPosition} triggerRef={servicesTriggerRef}/>
    </div>;
}

function AuthScreen({setupRequired, onAuthenticated}: {setupRequired: boolean; onAuthenticated: (user: FolderRocketUser) => void}) {
    const [mode, setMode] = useState<"login" | "register" | "reset">(setupRequired ? "register" : "login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [recoveryCode, setRecoveryCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    function changeMode(nextMode: "login" | "register" | "reset") {
        setError("");
        setMode(nextMode);
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const endpoint = mode === "reset" ? "password-reset" : mode === "login" ? "login" : "register";
            const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                credentials: "include",
                body: JSON.stringify(mode === "reset" ? {email, code: recoveryCode, password} : {email, password, inviteCode})
            });
            const data = await readJson(response) as {user: FolderRocketUser};
            onAuthenticated(data.user);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Unable to continue.");
        } finally { setBusy(false); }
    }

    const creatingAdmin = setupRequired && mode === "register";
    const title = creatingAdmin ? "Create the FolderRocket administrator" : mode === "reset" ? "Reset your password" : mode === "login" ? "Welcome back" : "Create your personal workspace";
    const description = creatingAdmin
        ? "This first account owns the current installation and can invite other users."
        : mode === "reset"
            ? "Enter the recovery code you saved, or the temporary one generated by the administrator."
            : "Every account has a private workspace and separate email connections.";

    return <main className="authPage">
        <div className="authLoginShell">
            <img className="authPageLogo" src={folderRocketLoginLogo} alt="FolderRocket" />
            <section className="authCard">
                <div className="authHeading"><h1>{title}</h1><p>{description}</p></div>
                <form onSubmit={event => void submit(event)}>
                    <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
                    {mode === "reset" && <label>Recovery code<input type="text" autoComplete="one-time-code" value={recoveryCode} onChange={event => setRecoveryCode(event.target.value)} required /></label>}
                    <PasswordField autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={setPassword} />
                    {mode === "register" && !setupRequired && <label>Invitation code<input value={inviteCode} onChange={event => setInviteCode(event.target.value)} required /></label>}
                    {error && <p className="authError">{error}</p>}
                    <button type="submit" disabled={busy}>{busy ? "Please wait..." : creatingAdmin ? "Create administrator account" : mode === "reset" ? "Reset password" : mode === "login" ? "Sign in" : "Create account"}</button>
                </form>
                {!setupRequired && <div className="authLinks">
                    {mode === "login" && <><button type="button" className="authModeButton" onClick={() => changeMode("register")}>I have an invitation code</button><button type="button" className="authModeButton" onClick={() => changeMode("reset")}>Forgot password?</button></>}
                    {mode === "register" && <button type="button" className="authModeButton" onClick={() => changeMode("login")}>I already have an account</button>}
                    {mode === "reset" && <button type="button" className="authModeButton" onClick={() => changeMode("login")}>Back to sign in</button>}
                </div>}
            </section>
        </div>
    </main>;
}

function AuthGate({children}: AuthGateProps) {
    const [user, setUser] = useState<FolderRocketUser | null>(null);
    const [setupRequired, setSetupRequired] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        Promise.all([
            fetch(`${API_BASE_URL}/auth/me`, {credentials: "include"}),
            fetch(`${API_BASE_URL}/auth/bootstrap`, {credentials: "include"})
        ]).then(async ([sessionResponse, bootstrapResponse]) => {
            const bootstrap = await bootstrapResponse.json().catch(() => ({setupRequired: false})) as {setupRequired?: boolean};
            setSetupRequired(Boolean(bootstrap.setupRequired));
            if (sessionResponse.ok) {
                const session = await sessionResponse.json() as {user?: FolderRocketUser};
                setUser(session.user ?? null);
            }
        }).finally(() => setReady(true));
    }, []);

    async function logout() {
        await fetch(`${API_BASE_URL}/auth/logout`, {method: "POST", credentials: "include"});
        setUser(null);
        setSetupRequired(false);
    }

    if (!ready) return <main className="authPage"><p className="authLoading">Loading FolderRocket...</p></main>;
    if (!user) return <AuthScreen setupRequired={setupRequired} onAuthenticated={setUser} />;
    return <>{children({user, logout})}</>;
}

export {AccountMenu};
export default AuthGate;
