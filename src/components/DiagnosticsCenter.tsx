import {useCallback, useEffect, useMemo, useState} from "react";
import {Activity, Check, ChevronDown, Clipboard, Download, RefreshCw, Trash2, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import {captureDiagnostic, clearLocalDiagnostics, hasDiagnosticStorageWarning, readLocalDiagnostics, saveLocalDiagnostics, type DiagnosticEvent} from "../diagnostics";
import "./DiagnosticsCenter.css";

interface DiagnosticGroup {key: string; events: DiagnosticEvent[]; latest: DiagnosticEvent; unresolved: number}

export default function DiagnosticsCenter({userId, worldNames, open, onOpenChange}: {userId: string; worldNames: Record<string, string>; open: boolean; onOpenChange: (open: boolean) => void}) {
    const [events, setEvents] = useState<DiagnosticEvent[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [showResolved, setShowResolved] = useState(false);
    const [days, setDays] = useState("30");
    const [filterNow] = useState(() => Date.now());
    const [severity, setSeverity] = useState("all");
    const [category, setCategory] = useState("all");
    const [screen, setScreen] = useState("all");
    const [world, setWorld] = useState("all");
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [notice, setNotice] = useState("");

    useEffect(() => { void readLocalDiagnostics(userId).then(setEvents); }, [userId]);

    const refresh = useCallback(async () => {
        setBusy(true); setError("");
        const local = await readLocalDiagnostics(userId);
        const electron = (await window.folderRocketDesktop?.listElectronDiagnostics().catch(() => []) || []).map(item => ({...item, resolved:false, reviewed:false}));
        try {
            const response = await fetch(`${API_BASE_URL}/diagnostics`, {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {events?: DiagnosticEvent[]; message?: string; storageWarning?:boolean};
            if (!response.ok) throw new Error(data.message || "Non riesco a leggere la diagnostica del backend.");
            const byId = new Map<string, DiagnosticEvent>();
            const remote = Array.isArray(data.events) ? data.events.map(item => ({...item, severity:item.severity || (item.type === "performance" ? "info" : item.status && item.status >= 500 ? "error" : "warning"), category:item.category || item.type || "backend", screen:item.screen || "", component:item.component || "", stack:item.stack || "", status:item.status ?? null, durationMs:item.durationMs ?? null, resolved:item.resolved ?? (item.severity === "info")})) : [];
            for (const item of [...local, ...remote, ...electron]) {
                const previous = byId.get(item.id);
                byId.set(item.id, {...previous, ...item, screen: previous?.screen && previous.screen !== "backend" ? previous.screen : item.screen || previous?.screen || "", component: previous?.component || item.component, stack: previous?.stack || item.stack, resolved: previous ? Boolean(previous.resolved) : Boolean(item.resolved), reviewed: Boolean(previous?.reviewed || item.reviewed)});
            }
            setEvents([...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 400));
            if (data.storageWarning) setError("Il registro diagnostico del backend non riesce a salvare; FolderRocket continua a funzionare.");
        } catch (reason) {
            const byId = new Map([...(await readLocalDiagnostics(userId)), ...electron].map(item => [item.id, item]));
            setEvents([...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 400));
            setError(reason instanceof Error ? reason.message : "Diagnostica backend non disponibile; mostro gli errori locali.");
        } finally { setBusy(false); }
    }, [userId]);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => { void refresh(); }, 0);
        return () => window.clearTimeout(timer);
    }, [open, refresh]);

    useEffect(() => {
        const refreshLocal = () => {
            void readLocalDiagnostics(userId).then(local => setEvents(current => {
                const byId = new Map<string, DiagnosticEvent>();
                for (const item of [...local, ...current]) {
                    const previous = byId.get(item.id);
                    byId.set(item.id, {...previous, ...item, screen: previous?.screen && previous.screen !== "backend" ? previous.screen : item.screen || previous?.screen || "", component: previous?.component || item.component, stack: previous?.stack || item.stack, resolved: previous ? Boolean(previous.resolved) : Boolean(item.resolved), reviewed: Boolean(previous?.reviewed || item.reviewed)});
                }
                return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 400);
            }));
        };
        window.addEventListener("folderrocket:diagnostics-updated", refreshLocal);
        const unsubscribeElectron = window.folderRocketDesktop?.onElectronDiagnostic(item => {
            captureDiagnostic(userId, {...item, resolved:false, reviewed:false});
            setEvents(current => [{...item, resolved:false, reviewed:false}, ...current.filter(entry => entry.id !== item.id)].slice(0, 400));
        });
        const recentNotices = new Map<string, number>();
        const showNotice = (event: Event) => {
            const item = (event as CustomEvent<DiagnosticEvent>).detail;
            if (!item || item.type === "performance" || item.resolved) return;
            const now = Date.now();
            for (const [key, expiresAt] of recentNotices) if (expiresAt <= now) recentNotices.delete(key);
            const signature = [item.type, item.category, item.route, item.message, item.worldId].join("|");
            if ((recentNotices.get(signature) || 0) > now) return;
            recentNotices.set(signature, now + 60_000);
            setNotice(item.severity === "warning" ? "FolderRocket ha registrato un avviso." : "FolderRocket ha registrato un errore. Apri Diagnostica per i dettagli.");
            window.setTimeout(() => setNotice(""), 5500);
        };
        const showStorageWarning = () => {
            setNotice("Archivio diagnostico non disponibile: gli eventi restano solo in memoria.");
            window.setTimeout(() => setNotice(""), 6500);
        };
        window.addEventListener("folderrocket:diagnostic-captured", showNotice);
        window.addEventListener("folderrocket:diagnostic-storage-unavailable", showStorageWarning);
        if (hasDiagnosticStorageWarning()) showStorageWarning();
        return () => {window.removeEventListener("folderrocket:diagnostics-updated", refreshLocal); window.removeEventListener("folderrocket:diagnostic-captured", showNotice); window.removeEventListener("folderrocket:diagnostic-storage-unavailable", showStorageWarning); unsubscribeElectron?.();};
    }, [userId]);

    const filteredEvents = useMemo(() => {
        const cutoff = days === "all" ? 0 : filterNow - Number(days) * 24 * 60 * 60 * 1000;
        return events.filter(item => (showResolved || !item.resolved)
            && (days === "all" || Date.parse(item.at) >= cutoff)
            && (severity === "all" || item.severity === severity)
            && (category === "all" || (item.category || item.type) === category)
            && (screen === "all" || (item.screen || "") === screen)
            && (world === "all" || item.worldId === world));
    }, [category, days, events, filterNow, screen, severity, showResolved, world]);

    const groups = useMemo(() => {
        const grouped = new Map<string, DiagnosticEvent[]>();
        for (const item of filteredEvents) {
            const key = [item.type, item.category, item.route, item.message, item.worldId].join("|");
            grouped.set(key, [...(grouped.get(key) || []), item]);
        }
        const result: DiagnosticGroup[] = [...grouped].map(([key, entries]) => {
            const sorted = entries.sort((a, b) => b.at.localeCompare(a.at));
            return {key, events: sorted, latest: sorted[0], unresolved: sorted.filter(item => !item.resolved && item.type !== "performance").length};
        }).filter(group => showResolved || group.unresolved > 0 || group.latest.type === "performance" && !group.latest.resolved)
            .sort((a, b) => b.latest.at.localeCompare(a.latest.at));
        return result;
    }, [filteredEvents, showResolved]);

    const categories = [...new Set(events.map(item => item.category || item.type))].sort();
    const screens = [...new Set(events.map(item => item.screen).filter(Boolean))].sort();
    const worldIds = [...new Set(events.map(item => item.worldId).filter(Boolean))].sort();
    const exportedItems = filteredEvents.map(({id, at, type, severity: level, category: group, message, route, screen: page, component, stack, method, status, worldId, requestId, durationMs}) => ({id, at, type, severity:level, category:group, message, route, screen:page, component, stack, method, status, world:worldNames[worldId] || worldId, requestId, durationMs}));

    function markResolved(group: DiagnosticGroup) {
        const resolve = group.unresolved > 0;
        const ids = new Set(group.events.map(item => item.id));
        const next = events.map(event => ids.has(event.id) ? {...event, resolved:resolve} : event);
        setEvents(next);
        saveLocalDiagnostics(userId, next);
    }

    function markReviewed(group: DiagnosticGroup) {
        const mark = !group.events.every(item => item.reviewed);
        const ids = new Set(group.events.map(item => item.id));
        const next = events.map(event => ids.has(event.id) ? {...event, reviewed:mark} : event);
        setEvents(next); saveLocalDiagnostics(userId, next);
    }

    async function copyDiagnostics() {
        try {
            await navigator.clipboard.writeText(JSON.stringify(exportedItems, null, 2));
            setCopied(true); window.setTimeout(() => setCopied(false), 1600);
        } catch { setError("Non posso copiare negli appunti. Puoi usare Esporta JSON."); }
    }

    function exportDiagnostics() {
        const blob = new Blob([JSON.stringify(exportedItems, null, 2)], {type: "application/json"});
        const href = URL.createObjectURL(blob); const anchor = document.createElement("a");
        anchor.href = href; anchor.download = `folderrocket-diagnostics-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(href);
    }

    async function clear() {
        if (!window.confirm("Svuotare la diagnostica salvata su questo dispositivo e sul backend?")) return;
        setBusy(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/diagnostics`, {method: "DELETE", credentials: "include"});
            if (!response.ok) throw new Error("Non è stato possibile svuotare la diagnostica del backend.");
            const electronCleared = await window.folderRocketDesktop?.clearElectronDiagnostics();
            if (electronCleared === false) throw new Error("Non è stato possibile svuotare il registro Electron locale.");
            await clearLocalDiagnostics(userId); setEvents([]);
        } catch (reason) {
            captureDiagnostic(userId, {type: "http", route: "/diagnostics", method: "DELETE", message: "Impossibile svuotare la diagnostica del backend."});
            setError(reason instanceof Error ? reason.message : "Errore durante la pulizia.");
        } finally { setBusy(false); }
    }

    return <>
        {open && <div className="diagnosticsScrim" onMouseDown={event => {if (event.target === event.currentTarget) onOpenChange(false);}}>
            <section className="diagnosticsPanel" role="dialog" aria-modal="true" aria-labelledby="diagnosticsTitle">
                <header><div><Activity size={19}/><div><h2 id="diagnosticsTitle">Diagnostica</h2><p>Errori recenti e rallentamenti, per capire dove intervenire.</p></div></div><button type="button" className="diagnosticsClose" onClick={() => onOpenChange(false)} aria-label="Chiudi"><X size={17}/></button></header>
                {error && <p className="diagnosticsError" role="alert">{error}</p>}
                <div className="diagnosticsFilters">
                    <label>Periodo<select value={days} onChange={event => setDays(event.target.value)}><option value="1">24 ore</option><option value="7">7 giorni</option><option value="30">30 giorni</option><option value="all">Sempre</option></select></label>
                    <label>Gravità<select value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">Tutte</option><option value="critical">Critica</option><option value="error">Errore</option><option value="warning">Avviso</option><option value="info">Informazione</option></select></label>
                    <label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Tutte</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
                    <label>Schermata<select value={screen} onChange={event => setScreen(event.target.value)}><option value="all">Tutte</option>{screens.map(value => <option key={value}>{value}</option>)}</select></label>
                    <label>Pianeta<select value={world} onChange={event => setWorld(event.target.value)}><option value="all">Tutti</option>{worldIds.map(value => <option key={value} value={value}>{worldNames[value] || value}</option>)}</select></label>
                </div>
                <div className="diagnosticsToolbar"><span>{groups.length} gruppi · {filteredEvents.length} occorrenze{busy ? " · aggiornamento…" : ""}</span><label><input type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)}/>Mostra risolti e informazioni</label><button type="button" onClick={() => void refresh()} disabled={busy} title="Aggiorna"><RefreshCw size={14}/></button><button type="button" onClick={() => void copyDiagnostics()} disabled={!filteredEvents.length} title="Copia rapporto"><Clipboard size={14}/>{copied ? "Copiato" : "Copia"}</button><button type="button" onClick={exportDiagnostics} disabled={!filteredEvents.length} title="Esporta JSON"><Download size={14}/></button><button type="button" onClick={() => void clear()} disabled={busy || !events.length} title="Svuota"><Trash2 size={14}/></button></div>
                <div className="diagnosticsList">{groups.map(group => <article key={group.key} className={`diagnosticItem ${group.latest.severity} ${group.latest.category}`}>
                    <div className="diagnosticItemTop"><strong>{group.latest.message}</strong><time>{new Date(group.latest.at).toLocaleString()}</time></div>
                    <div className="diagnosticMeta"><span>{group.latest.category || group.latest.type} · {group.latest.method && `${group.latest.method} `}{group.latest.route || "errore interfaccia"}{group.latest.status ? ` · HTTP ${group.latest.status}` : ""}</span><span>{group.events.length} {group.events.length === 1 ? "occorrenza" : "occorrenze"}</span>{group.latest.durationMs !== null && <span>{group.latest.durationMs} ms</span>}{group.latest.worldId && <span>{worldNames[group.latest.worldId] || group.latest.worldId}</span>}{group.latest.screen && <span>{group.latest.screen}</span>}</div>
                    <div className="diagnosticGroupActions"><button type="button" className="diagnosticResolve" onClick={() => markResolved(group)}><Check size={13}/>{group.unresolved ? "Segna risolto" : "Riapri"}</button><button type="button" className="diagnosticDetails" onClick={() => markReviewed(group)}>{group.events.every(item => item.reviewed) ? "Esaminato ✓" : "Segna esaminato"}</button><button type="button" className="diagnosticDetails" onClick={() => setExpandedGroups(current => ({...current, [group.key]:!current[group.key]}))}><ChevronDown size={13}/>{expandedGroups[group.key] ? "Nascondi dettagli" : "Dettagli"}</button></div>
                    {expandedGroups[group.key] && <div className="diagnosticDetailsBody">{group.events.map(item => <section key={item.id}><div><strong>{item.severity.toUpperCase()}</strong><time>{new Date(item.at).toLocaleString()}</time></div><p>{item.message}{item.component ? ` · ${item.component}` : ""}</p>{item.requestId && <code>Riferimento: {item.requestId}</code>}{item.stack && <pre>{item.stack}</pre>}</section>)}</div>}
                </article>)}{!groups.length && <p className="diagnosticsEmpty">Nessun elemento corrisponde ai filtri. I dati vengono raccolti senza contenuti di email o documenti.</p>}</div>
                <footer>Log browser locali in IndexedDB: massimo 120 eventi e 30 giorni; scrittura asincrona. Backend per account: limiti configurabili. Electron locale: massimo 200 eventi e 30 giorni. Tempi API campionati al massimo una volta al minuto per percorso. I rapporti esportati restano sul dispositivo.</footer>
            </section>
        </div>}
        {notice && <div className="diagnosticToast" role="status" aria-live="polite"><Activity size={15}/><span>{notice}</span><button type="button" onClick={() => onOpenChange(true)}>Apri</button></div>}
    </>;
}
