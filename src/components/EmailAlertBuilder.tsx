import {useState} from "react";
import {BookmarkPlus, Clock3, Star, Trash2} from "lucide-react";

export type EmailAlertKind = "ai" | "sender";
export type EmailFilterMode = "relative" | "range";
export type EmailAlertFilterMode = "hours" | "range";
export type EmailAlertColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export interface EmailFilter { mode: EmailFilterMode; days: number; startDate: string; endDate: string; }
export interface EmailAlertFilter { mode: EmailAlertFilterMode; hours: number; startAt: string; endAt: string; }
export interface EmailAlertRule {
    id: string;
    kind: EmailAlertKind;
    query: string;
    label: string;
    color: EmailAlertColor;
    enabled: boolean;
    favoriteId?: string;
    // Each alert has its own message-reading window, independent from attachment reading.
    filter: EmailAlertFilter;
    schedule: {enabled: boolean; frequency: "manual" | "daily"; time: string; daysOfWeek: number[]};
}
export interface EmailAttachmentReader { enabled: boolean; filter: EmailFilter; }

interface AlertDraft { kind: EmailAlertKind; query: string; color: EmailAlertColor; filter: EmailAlertFilter; schedule: {enabled: boolean; frequency: "daily"; time: string; daysOfWeek: number[]}; }

const COLORS: Array<{value: EmailAlertColor; label: string}> = [
    {value: "red", label: "Red"}, {value: "orange", label: "Orange"}, {value: "yellow", label: "Yellow"},
    {value: "green", label: "Green"}, {value: "blue", label: "Blue"}, {value: "purple", label: "Purple"}
];
const WEEK_DAYS = [{value: 1, label: "Mon"}, {value: 2, label: "Tue"}, {value: 3, label: "Wed"}, {value: 4, label: "Thu"}, {value: 5, label: "Fri"}, {value: 6, label: "Sat"}, {value: 0, label: "Sun"}];
const EMPTY_ALERT_FILTER: EmailAlertFilter = {mode: "hours", hours: 24, startAt: "", endAt: ""};

function makeDraft(): AlertDraft { return {kind: "ai", query: "", color: "red", filter: {...EMPTY_ALERT_FILTER}, schedule: {enabled: true, frequency: "daily", time: "09:00", daysOfWeek: WEEK_DAYS.map(day => day.value)}}; }
function makeId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function titleFor(kind: EmailAlertKind) { return kind === "ai" ? "AI alert" : "Sender list"; }
function daySummary(days: number[]) { const selected = WEEK_DAYS.filter(day => days.includes(day.value)); return selected.length === 7 ? "Every day" : selected.map(day => day.label).join(" ") || "No day selected"; }
function filterSummary(filter: EmailAlertFilter) { return filter.mode === "hours" ? `Last ${filter.hours}h` : "Interval"; }

function DayPicker({days, onChange}: {days: number[]; onChange: (days: number[]) => void}) {
    function toggle(day: number) { onChange(days.includes(day) ? days.filter(value => value !== day) : [...days, day].sort((a, b) => a - b)); }
    const allSelected = days.length === 7;
    return <div className="emailAlertDayPicker"><span>Run on</span><div>{WEEK_DAYS.map(day => <button type="button" key={day.value} className={days.includes(day.value) ? "selected" : ""} onClick={() => toggle(day.value)}>{day.label}</button>)}</div><button type="button" className="emailAlertAllDays" onClick={() => onChange(allSelected ? [] : WEEK_DAYS.map(day => day.value))}>{allSelected ? "Clear days" : "All days"}</button></div>;
}

export default function EmailAlertBuilder({providerLabel, rules, favorites, onChange, onCheckNow}: {providerLabel: string; rules: EmailAlertRule[]; favorites: EmailAlertRule[]; onChange: (next: {rules: EmailAlertRule[]; favorites: EmailAlertRule[]}) => void; onCheckNow: (rules: EmailAlertRule[]) => void;}) {
    const [draft, setDraft] = useState<AlertDraft>(makeDraft);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [showSavedAlerts, setShowSavedAlerts] = useState(false);
    const hasValidWindow = draft.filter.mode === "hours"
        ? Number(draft.filter.hours) >= 1
        : Boolean(draft.filter.startAt && draft.filter.endAt && draft.filter.startAt <= draft.filter.endAt);
    const canSave = Boolean(draft.query.trim()) && hasValidWindow && (!draft.schedule.enabled || draft.schedule.daysOfWeek.length > 0);
    const activeRules = rules.filter(rule => rule.enabled);

    function emit(change: Partial<{rules: EmailAlertRule[]; favorites: EmailAlertRule[]}>) { onChange({rules, favorites, ...change}); }
    function resetDraft() { setDraft(makeDraft()); setEditingId(null); }
    function submitDraft() {
        if (!canSave) return;
        const existing = rules.find(rule => rule.id === editingId);
        const rule: EmailAlertRule = {
            id: editingId ?? makeId(), kind: draft.kind, query: draft.query.trim(), label: titleFor(draft.kind), color: draft.color,
            enabled: existing?.enabled ?? true, favoriteId: existing?.favoriteId, filter: {...draft.filter}, schedule: draft.schedule
        };
        emit({rules: editingId ? rules.map(item => item.id === editingId ? rule : item) : [...rules, rule]});
        resetDraft();
    }
    function beginEdit(rule: EmailAlertRule) { setEditingId(rule.id); setDraft({kind: rule.kind, query: rule.query, color: rule.color, filter: {...(rule.filter ?? EMPTY_ALERT_FILTER)}, schedule: {...rule.schedule, enabled: true, frequency: "daily", daysOfWeek: rule.schedule.daysOfWeek?.length ? rule.schedule.daysOfWeek : WEEK_DAYS.map(day => day.value)}}); }
    function saveFavorite(rule: EmailAlertRule) {
        if (rule.favoriteId || favorites.some(item => item.query === rule.query && item.kind === rule.kind)) return;
        const favoriteId = makeId();
        emit({favorites: [...favorites, {...rule, id: favoriteId, favoriteId: undefined, enabled: false}], rules: rules.map(item => item.id === rule.id ? {...item, favoriteId} : item)});
    }
    function toggleFavorite(favorite: EmailAlertRule) {
        const linked = rules.find(rule => rule.favoriteId === favorite.id);
        if (linked) emit({rules: rules.map(rule => rule.id === linked.id ? {...rule, enabled: !rule.enabled} : rule)});
        else emit({rules: [...rules, {...favorite, id: makeId(), favoriteId: favorite.id, enabled: true}]});
        setShowSavedAlerts(false);
    }
    function confirmDelete(key: string, action: () => void) { if (pendingDelete === key) { action(); setPendingDelete(null); } else setPendingDelete(key); }

    return <div className="emailAlertBuilder">
        <section className={`emailAlertCreate ${draft.kind === "ai" ? "aiAlertEditor" : "senderAlertEditor"}`}>
            <div className="emailAlertCreateHeading"><strong>{editingId ? "Edit alert" : "Create alert"}</strong><select value={draft.kind} onChange={event => setDraft(current => ({...current, kind: event.target.value as EmailAlertKind, color: event.target.value === "sender" ? "green" : current.color}))}><option value="ai">AI alert</option><option value="sender">Sender list</option></select></div>
            {draft.kind === "ai" ? <textarea value={draft.query} onChange={event => setDraft(current => ({...current, query: event.target.value}))} placeholder="Describe the emails to find, e.g. deadlines or messages from Geneva" aria-label="AI alert request" /> : <textarea value={draft.query} onChange={event => setDraft(current => ({...current, query: event.target.value}))} placeholder="Email addresses separated by ;" aria-label="Sender email addresses" />}
            <div className="emailAlertCreateGrid"><label><span>Alert color</span><select value={draft.color} onChange={event => setDraft(current => ({...current, color: event.target.value as EmailAlertColor}))}>{COLORS.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}</select></label><label><span><Clock3 size={13} />Time</span><input type="time" value={draft.schedule.time} onChange={event => setDraft(current => ({...current, schedule: {...current.schedule, time: event.target.value || "09:00"}}))} /></label></div>
            <div className="emailAlertWindow"><label><span>Search window</span><select value={draft.filter.mode} onChange={event => setDraft(current => ({...current, filter: {...current.filter, mode: event.target.value as EmailAlertFilterMode}}))}><option value="hours">Last hours</option><option value="range">Time interval</option></select></label>{draft.filter.mode === "hours" ? <label><span>Hours back</span><input type="number" min="1" max="8760" value={draft.filter.hours} onChange={event => setDraft(current => ({...current, filter: {...current.filter, hours: Math.min(8760, Math.max(1, Number(event.target.value) || 1))}}))} /></label> : <><label><span>From</span><input type="datetime-local" value={draft.filter.startAt} onChange={event => setDraft(current => ({...current, filter: {...current.filter, startAt: event.target.value}}))} /></label><label><span>To</span><input type="datetime-local" value={draft.filter.endAt} onChange={event => setDraft(current => ({...current, filter: {...current.filter, endAt: event.target.value}}))} /></label></>}</div>
            <DayPicker days={draft.schedule.daysOfWeek} onChange={daysOfWeek => setDraft(current => ({...current, schedule: {...current.schedule, daysOfWeek}}))} />
            <div className="emailAlertCreateActions"><button type="button" className="emailAlertSave" disabled={!canSave} onClick={submitDraft}>{editingId ? "Save changes" : "Create alert"}</button>{editingId && <button type="button" onClick={resetDraft}>New alert</button>}</div>
        </section>

        {favorites.length > 0 && <section className="emailAlertFavorites"><button type="button" className={`emailSavedAlertsToggle${showSavedAlerts ? " open" : ""}`} onClick={() => setShowSavedAlerts(current => !current)}><Star size={14} />Saved alerts <span>{favorites.length}</span></button>{showSavedAlerts && <div className="emailSavedAlertsMenu">{favorites.map(favorite => { const linked = rules.find(rule => rule.favoriteId === favorite.id); return <article key={favorite.id} className={`alertColor-${favorite.color}`}><span>{favorite.kind === "ai" ? favorite.query : favorite.query.split(";").map(item => item.trim()).filter(Boolean).join(" · ")}</span><button type="button" className={linked?.enabled ? "isActive" : ""} onClick={() => toggleFavorite(favorite)}>{linked?.enabled ? "Active" : linked ? "Activate" : `Use in ${providerLabel}`}</button><button type="button" className={pendingDelete === `favorite:${favorite.id}` ? "confirmDelete" : ""} title="Press twice to delete" onClick={() => confirmDelete(`favorite:${favorite.id}`, () => emit({favorites: favorites.filter(item => item.id !== favorite.id), rules: rules.filter(item => item.favoriteId !== favorite.id)}))}>{pendingDelete === `favorite:${favorite.id}` ? "Confirm" : <Trash2 size={13} />}</button></article>; })}</div>}</section>}

        <section className="emailAlertRules"><div><strong>Alerts in this {providerLabel} block</strong><button type="button" disabled={!activeRules.length} onClick={() => onCheckNow(activeRules)}>Check active</button></div>{rules.length === 0 ? <small>Create an alert above, then it remains active until you switch it off.</small> : rules.map(rule => <article key={rule.id} className={`alertColor-${rule.color}${rule.enabled ? " isEnabled" : " isDisabled"}`}><span className="emailAlertColorDot" /><div><strong>{rule.kind === "ai" ? "AI alert" : "Sender list"}<b>{rule.query}</b><em>{rule.enabled ? "ACTIVE" : "INACTIVE"}</em></strong><i>{filterSummary(rule.filter)} · {daySummary(rule.schedule.daysOfWeek ?? [])} at {rule.schedule.time}</i></div><span className="emailRuleActions"><button type="button" className={`emailRuleOn ${rule.enabled ? "isOn" : ""}`} title={rule.enabled ? "Turn alert off" : "Turn alert on"} onClick={() => emit({rules: rules.map(item => item.id === rule.id ? {...item, enabled: !item.enabled} : item)})}>On</button><button type="button" title="Edit alert" onClick={() => beginEdit(rule)}>Edit</button><button type="button" title="Save as reusable alert" onClick={() => saveFavorite(rule)} disabled={Boolean(rule.favoriteId)}><BookmarkPlus size={13} /></button><button type="button" className={pendingDelete === `rule:${rule.id}` ? "confirmDelete" : ""} title="Press twice to delete" onClick={() => confirmDelete(`rule:${rule.id}`, () => emit({rules: rules.filter(item => item.id !== rule.id)}))}>{pendingDelete === `rule:${rule.id}` ? "Confirm" : <Trash2 size={13} />}</button></span></article>)}</section>
    </div>;
}
