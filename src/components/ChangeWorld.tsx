import {memo, useCallback, useState, type CSSProperties} from "react";
import {ArrowLeft, Check, CirclePlus, LoaderCircle, Orbit, Pencil, Plus, Send, Sparkles, Trash2, X} from "lucide-react";
import type {WorldAgentProfile, WorldAssistantCapability, WorldAssistantModel, WorkspaceWorld, WorldPlanetStyle, WorldSkillProfile} from "../worlds";
import "../worlds.css";

interface Props {
    worlds: WorkspaceWorld[];
    activeWorldId: string;
    storageScope: string;
    onSelect: (worldId: string) => Promise<void>;
    onInvokeAssistant: (worldId: string, profileId: string, kind: "agent" | "skill", name: string, instructions: string, prompt: string, model: WorldAssistantModel, capabilities: WorldAssistantCapability[]) => Promise<string>;
    switchError: string;
    onBack: () => void;
    onAdd: () => WorkspaceWorld;
    onUpdate: (world: WorkspaceWorld) => Promise<void>;
    onDelete: (worldId: string) => Promise<void>;
}

const PLANET_COLORS = ["#5dbdff", "#c28cff", "#ff967d", "#f4c95d", "#79d7a3", "#f17db2", "#8c9dff", "#72d6d1"];

export function Planet({world, large = false}: {world: WorkspaceWorld; large?: boolean}) {
    return <span className={`worldPlanet ${world.style}${large ? " large" : ""}${world.aiEnabled ? " aiEnabled" : ""}`} style={{"--planet-color": world.color} as CSSProperties} aria-hidden="true"><i/><b/><em/>{world.aiEnabled && <span className="worldAiSatelliteOrbit"><i/></span>}</span>;
}

interface WorldGridProps {
    worlds: WorkspaceWorld[];
    activeWorldId: string;
    switchingWorldId: string | null;
    onEditWorld: (world: WorkspaceWorld) => void;
    onSelectWorld: (worldId: string) => void;
}

const WorldGrid = memo(function WorldGrid({worlds, activeWorldId, switchingWorldId, onEditWorld, onSelectWorld}: WorldGridProps) {
    return <section className="worldGrid" aria-label="Pianeti disponibili">
        {worlds.map(world => {
            const active = world.id === activeWorldId;
            return <article key={world.id} className={`worldCard${active ? " selected" : ""}`} style={{"--planet-color": world.color} as CSSProperties}>
                <div className="worldCardTop"><span>{active ? "AMBIENTE ATTIVO" : "AMBIENTE"}</span><button type="button" onClick={() => onEditWorld(world)} title={`Modifica ${world.name}`} aria-label={`Modifica ${world.name}`}><Pencil size={14}/></button></div>
                <Planet world={world} large/>
                <h2>{world.name}</h2>
                <div className="worldCardMeta"><span><Sparkles size={12}/>{world.aiEnabled ? "AI disponibile" : "AI disattivata"}</span><span>{world.agents.filter(agent => agent.enabled).length + world.skills.filter(skill => skill.enabled).length} agenti/skill</span></div>
                <button type="button" className="worldSelectButton" onClick={() => onSelectWorld(world.id)} disabled={Boolean(switchingWorldId)}>{switchingWorldId === world.id ? <><LoaderCircle className="worldInlineSpinner" size={15}/>Preparazione…</> : active ? <><Check size={15}/>Sei qui</> : <>Entra nel pianeta <span>→</span></>}</button>
            </article>;
        })}
    </section>;
});

export default function ChangeWorld({worlds, activeWorldId, storageScope, onSelect, onInvokeAssistant, switchError, onBack, onAdd, onUpdate, onDelete}: Props) {
    const [editingWorld, setEditingWorld] = useState<WorkspaceWorld | null>(null);
    const [agentName, setAgentName] = useState("");
    const [skillName, setSkillName] = useState("");
    const [deletingWorld, setDeletingWorld] = useState(false);
    const [switchingWorldId, setSwitchingWorldId] = useState<string | null>(null);
    const [invoking, setInvoking] = useState<{worldId: string; profileId: string; kind: "agent" | "skill"; name: string; instructions: string; model: WorldAssistantModel; capabilities: WorldAssistantCapability[]} | null>(null);
    const [invokePrompt, setInvokePrompt] = useState("");
    const [invokeResult, setInvokeResult] = useState("");
    const [invokeError, setInvokeError] = useState("");
    const [invokeBusy, setInvokeBusy] = useState(false);
    const [postItSaved, setPostItSaved] = useState(false);
    const [saveError, setSaveError] = useState("");

    const beginEditWorld = useCallback((world: WorkspaceWorld) => setEditingWorld({...world}), []);

    async function saveWorld() {
        if (!editingWorld) return;
        const name = editingWorld.name.trim();
        if (!name) return;
        if (worlds.some(world => world.id !== editingWorld.id && world.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
            window.alert("Esiste già un pianeta con questo nome.");
            return;
        }
        setSaveError("");
        try {
            await onUpdate({...editingWorld, name});
            setEditingWorld(null);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Non è stato possibile salvare il pianeta.");
        }
    }

    function addAgent() {
        if (!editingWorld || !agentName.trim()) return;
        const agent: WorldAgentProfile = {id: crypto.randomUUID(), name: agentName.trim(), description: "", instructions: "", enabled: true, model: "gpt-4.1-mini", capabilities: ["search-files"]};
        setEditingWorld({...editingWorld, agents: [...editingWorld.agents, agent]});
        setAgentName("");
    }

    function addSkill() {
        if (!editingWorld || !skillName.trim()) return;
        const skill: WorldSkillProfile = {id: crypto.randomUUID(), name: skillName.trim(), description: "", instructions: "", enabled: true, model: "gpt-4.1-mini", capabilities: []};
        setEditingWorld({...editingWorld, skills: [...editingWorld.skills, skill]});
        setSkillName("");
    }

    function updateAgent(agentId: string, changes: Partial<WorldAgentProfile>) {
        if (!editingWorld) return;
        setEditingWorld({...editingWorld, agents: editingWorld.agents.map(agent => agent.id === agentId ? {...agent, ...changes} : agent)});
    }

    function updateSkill(skillId: string, changes: Partial<WorldSkillProfile>) {
        if (!editingWorld) return;
        setEditingWorld({...editingWorld, skills: editingWorld.skills.map(skill => skill.id === skillId ? {...skill, ...changes} : skill)});
    }

    const selectPlanet = useCallback(async (worldId: string) => {
        if (switchingWorldId) return;
        setSwitchingWorldId(worldId);
        try { await onSelect(worldId); }
        finally { setSwitchingWorldId(null); }
    }, [onSelect, switchingWorldId]);

    async function runAssistant() {
        if (!invoking || !invokePrompt.trim() || invokeBusy) return;
        setInvokeBusy(true);
        setInvokeError("");
        setInvokeResult("");
        setPostItSaved(false);
        try {
            setInvokeResult(await onInvokeAssistant(invoking.worldId, invoking.profileId, invoking.kind, invoking.name, invoking.instructions, invokePrompt.trim(), invoking.model, invoking.capabilities));
        } catch (error) {
            setInvokeError(error instanceof Error ? error.message : "Impossibile richiamare l’assistente AI.");
        } finally { setInvokeBusy(false); }
    }

    function canInvoke(worldId: string, enabled: boolean) {
        return enabled && worlds.find(world => world.id === worldId)?.aiEnabled === true && activeWorldId === worldId;
    }

    async function removeWorld(world: WorkspaceWorld) {
        if (worlds.length < 2) return;
        if (!window.confirm(`Eliminare “${world.name}” e le sue impostazioni di lavoro? I file nelle cartelle non verranno eliminati.`)) return;
        setDeletingWorld(true);
        try { await onDelete(world.id); setEditingWorld(null); }
        catch (error) { window.alert(error instanceof Error ? error.message : "Impossibile eliminare il pianeta."); }
        finally { setDeletingWorld(false); }
    }

    return <main className={editingWorld ? "changeWorldPage worldEditorOpen" : "changeWorldPage"}>
        <div className="changeWorldBackdrop" aria-hidden="true"/>
        <header className="changeWorldHeader">
            <button type="button" className="worldBackButton" onClick={onBack} disabled={Boolean(switchingWorldId)}><ArrowLeft size={16}/>Torna a FolderRocket</button>
            <div className="changeWorldTitle"><Orbit size={19}/><div><h1>Change World</h1><p>Scegli l’ambiente in cui vuoi lavorare</p></div></div>
            <button type="button" className="worldAddButton" onClick={() => {setEditingWorld(onAdd());setAgentName("");setSkillName("");}} disabled={Boolean(switchingWorldId)}><CirclePlus size={16}/>Aggiungi pianeta</button>
        </header>

        {switchError && <p className="worldSwitchError" role="alert">{switchError} Puoi riprovare selezionando di nuovo il pianeta.</p>}
        <WorldGrid worlds={worlds} activeWorldId={activeWorldId} switchingWorldId={switchingWorldId} onEditWorld={beginEditWorld} onSelectWorld={selectPlanet}/>
        <p className="worldPrivacyNote">Cartelle, preferenze email, impostazioni AI e profili vengono salvati separatamente. I token restano nel sistema di autenticazione esistente e non vengono copiati nelle impostazioni dei pianeti.</p>

        {editingWorld && <div className="worldEditorScrim" onMouseDown={event => {if (event.target === event.currentTarget) setEditingWorld(null);}}>
            <section className="worldEditor" role="dialog" aria-modal="true" aria-labelledby="worldEditorTitle">
                <header><div><Planet world={editingWorld}/><div><h2 id="worldEditorTitle">Personalizza il pianeta</h2><p>Le modifiche valgono solo in questo ambiente.</p></div></div><button type="button" className="worldEditorClose" onClick={() => setEditingWorld(null)} aria-label="Chiudi"><X size={17}/></button></header>
                <div className="worldEditorBody">
                    {saveError && <p className="worldInvokeError" role="alert">{saveError}</p>}
                    <label className="worldNameField">Nome del pianeta<input autoFocus maxLength={40} value={editingWorld.name} onChange={event => setEditingWorld({...editingWorld, name: event.target.value})}/></label>
                    <fieldset className="worldColorChoices"><legend>Colore</legend><div>{PLANET_COLORS.map(color => <button type="button" key={color} className={editingWorld.color === color ? "active" : ""} style={{"--swatch": color} as CSSProperties} onClick={() => setEditingWorld({...editingWorld, color})} aria-label={`Colore ${color}`} aria-pressed={editingWorld.color === color}/>)}</div><label>Personalizzato<input type="color" value={editingWorld.color} onChange={event => setEditingWorld({...editingWorld, color: event.target.value})}/></label></fieldset>
                    <fieldset className="worldStyleChoices"><legend>Stile del pianeta</legend><div>{(["rocky", "ringed", "glowing"] as WorldPlanetStyle[]).map(style => <button type="button" key={style} className={editingWorld.style === style ? "active" : ""} onClick={() => setEditingWorld({...editingWorld, style})}><Planet world={{...editingWorld, style}}/><span>{style === "rocky" ? "Roccioso" : style === "ringed" ? "Con anelli" : "Luminoso"}</span></button>)}</div></fieldset>
                    <p className="worldAiAccountNote"><Sparkles size={15}/>Per attivare o disattivare l’AI per questo pianeta, entra nell’ambiente e usa AI On/Off nel menu Account.</p>
                    <section className="worldAgentsEditor"><div className="worldAgentsHeading"><div><h3>Agenti del pianeta</h3><p>Profili richiamabili tramite la connessione AI condivisa.</p></div><span>{editingWorld.agents.length}</span></div>
                        <div className="worldAgentCreate"><input value={agentName} maxLength={60} onChange={event => setAgentName(event.target.value)} onKeyDown={event => {if(event.key === "Enter"){event.preventDefault();addAgent();}}} placeholder="Nome del nuovo agente"/><button type="button" onClick={addAgent} disabled={!agentName.trim()}><Plus size={14}/>Aggiungi</button></div>
                        <div className="worldAgentList">{editingWorld.agents.map(agent => <article key={agent.id}><div className="worldAgentTitle"><label><input type="checkbox" checked={agent.enabled} onChange={event => updateAgent(agent.id, {enabled: event.target.checked})}/><input aria-label="Nome agente" value={agent.name} onChange={event => updateAgent(agent.id, {name: event.target.value})}/></label><button type="button" title={`Rimuovi ${agent.name}`} aria-label={`Rimuovi ${agent.name}`} onClick={() => setEditingWorld({...editingWorld, agents: editingWorld.agents.filter(item => item.id !== agent.id)})}><Trash2 size={14}/></button></div><input className="worldProfileDescription" aria-label={`Descrizione agente ${agent.name}`} value={agent.description} maxLength={240} onChange={event => updateAgent(agent.id, {description: event.target.value})} placeholder="Descrizione breve"/><textarea value={agent.instructions} maxLength={2000} onChange={event => updateAgent(agent.id, {instructions: event.target.value})} placeholder="Descrivi ruolo, obiettivi e istruzioni dell’agente…"/><div className="worldAssistantOptions"><label>Modello condiviso<select value={agent.model||"gpt-4.1-mini"} onChange={event=>updateAgent(agent.id,{model:event.target.value as WorldAssistantModel})}><option value="gpt-4.1-mini">GPT-4.1 mini · rapido</option><option value="gpt-4.1">GPT-4.1 · avanzato</option></select></label><label><input type="checkbox" checked={(agent.capabilities||[]).includes("search-files")} onChange={event=>updateAgent(agent.id,{capabilities:event.target.checked?[...new Set([...(agent.capabilities||[]),"search-files" as const])]:agent.capabilities.filter(item=>item!=="search-files")})}/>Cerca nomi file nelle cartelle di questo pianeta</label><label><input type="checkbox" checked={(agent.capabilities||[]).includes("draft-post-it")} onChange={event=>updateAgent(agent.id,{capabilities:event.target.checked?[...new Set([...(agent.capabilities||[]),"draft-post-it" as const])]:agent.capabilities.filter(item=>item!=="draft-post-it")})}/>Consenti di salvare la risposta come post-it (con conferma)</label></div><button type="button" className="worldInvokeButton" disabled={!canInvoke(editingWorld.id, agent.enabled) || !editingWorld.aiEnabled} title={activeWorldId !== editingWorld.id ? "Entra in questo pianeta prima di richiamare l’agente" : undefined} onClick={() => {setInvoking({worldId:editingWorld.id,profileId:agent.id,kind:"agent",name:agent.name,instructions:agent.instructions,model:agent.model||"gpt-4.1-mini",capabilities:agent.capabilities||[]});setInvokePrompt("");setInvokeResult("");setInvokeError("");}}>Richiama con AI</button></article>)}{!editingWorld.agents.length && <p className="worldAgentsEmpty">Non hai ancora aggiunto agenti a questo pianeta.</p>}</div>
                    </section>
                    <section className="worldAgentsEditor"><div className="worldAgentsHeading"><div><h3>Skill del pianeta</h3><p>Competenze e istruzioni riutilizzabili solo qui.</p></div><span>{editingWorld.skills.length}</span></div>
                        <div className="worldAgentCreate"><input value={skillName} maxLength={60} onChange={event => setSkillName(event.target.value)} onKeyDown={event => {if(event.key === "Enter"){event.preventDefault();addSkill();}}} placeholder="Nome della skill"/><button type="button" onClick={addSkill} disabled={!skillName.trim()}><Plus size={14}/>Aggiungi</button></div>
                        <div className="worldAgentList">{editingWorld.skills.map(skill => <article key={skill.id}><div className="worldAgentTitle"><label><input type="checkbox" checked={skill.enabled} onChange={event => updateSkill(skill.id, {enabled: event.target.checked})}/><input aria-label="Nome skill" value={skill.name} onChange={event => updateSkill(skill.id, {name: event.target.value})}/></label><button type="button" title={`Rimuovi ${skill.name}`} aria-label={`Rimuovi ${skill.name}`} onClick={() => setEditingWorld({...editingWorld, skills: editingWorld.skills.filter(item => item.id !== skill.id)})}><Trash2 size={14}/></button></div><input className="worldProfileDescription" aria-label={`Descrizione skill ${skill.name}`} value={skill.description} maxLength={240} onChange={event => updateSkill(skill.id, {description: event.target.value})} placeholder="Descrizione breve"/><textarea value={skill.instructions} maxLength={2000} onChange={event => updateSkill(skill.id, {instructions: event.target.value})} placeholder="Istruzioni della skill…"/><div className="worldAssistantOptions"><label>Modello condiviso<select value={skill.model||"gpt-4.1-mini"} onChange={event=>updateSkill(skill.id,{model:event.target.value as WorldAssistantModel})}><option value="gpt-4.1-mini">GPT-4.1 mini · rapido</option><option value="gpt-4.1">GPT-4.1 · avanzato</option></select></label><label><input type="checkbox" checked={(skill.capabilities||[]).includes("search-files")} onChange={event=>updateSkill(skill.id,{capabilities:event.target.checked?[...new Set([...(skill.capabilities||[]),"search-files" as const])]:skill.capabilities.filter(item=>item!=="search-files")})}/>Cerca nomi file nelle cartelle di questo pianeta</label><label><input type="checkbox" checked={(skill.capabilities||[]).includes("draft-post-it")} onChange={event=>updateSkill(skill.id,{capabilities:event.target.checked?[...new Set([...(skill.capabilities||[]),"draft-post-it" as const])]:skill.capabilities.filter(item=>item!=="draft-post-it")})}/>Consenti di salvare la risposta come post-it (con conferma)</label></div><button type="button" className="worldInvokeButton" disabled={!canInvoke(editingWorld.id, skill.enabled) || !editingWorld.aiEnabled} title={activeWorldId !== editingWorld.id ? "Entra in questo pianeta prima di richiamare la skill" : undefined} onClick={() => {setInvoking({worldId:editingWorld.id,profileId:skill.id,kind:"skill",name:skill.name,instructions:skill.instructions,model:skill.model||"gpt-4.1-mini",capabilities:skill.capabilities||[]});setInvokePrompt("");setInvokeResult("");setInvokeError("");}}>Richiama con AI</button></article>)}{!editingWorld.skills.length && <p className="worldAgentsEmpty">Non hai ancora aggiunto skill a questo pianeta.</p>}</div>
                    </section>
                    <section className="worldPermissionFoundation"><strong>Permessi del pianeta</strong><span>Predisposizione futura. Ruoli e regole di accesso verranno definiti in una fase successiva; al momento non viene applicata alcuna restrizione.</span></section>
                </div>
                <footer><button type="button" className="worldDeleteButton" onClick={() => void removeWorld(editingWorld)} disabled={worlds.length < 2 || deletingWorld}><Trash2 size={14}/>{deletingWorld ? "Eliminazione…" : "Elimina pianeta"}</button><span/><button type="button" className="worldCancelButton" onClick={() => setEditingWorld(null)} disabled={deletingWorld}>Annulla</button><button type="button" className="worldSaveButton" onClick={() => void saveWorld()} disabled={deletingWorld}><Check size={15}/>Salva</button></footer>
            </section>
        </div>}

        {invoking && <div className="worldInvokeScrim" onMouseDown={event => {if (event.target === event.currentTarget && !invokeBusy) setInvoking(null);}}>
            <section className="worldInvokeDialog" role="dialog" aria-modal="true" aria-labelledby="worldInvokeTitle">
                <header><div><strong id="worldInvokeTitle">Richiama {invoking.kind === "agent" ? "agente" : "skill"}: {invoking.name}</strong><small>La richiesta userà solo le istruzioni selezionate e il testo che inserisci qui.</small></div><button type="button" onClick={() => setInvoking(null)} disabled={invokeBusy} aria-label="Chiudi"><X size={16}/></button></header>
                <label>Richiesta<textarea autoFocus maxLength={4000} value={invokePrompt} onChange={event => setInvokePrompt(event.target.value)} placeholder="Descrivi cosa vuoi chiedere a questo agente o skill…"/></label>
                {invokeError && <p className="worldInvokeError" role="alert">{invokeError}</p>}
                {invokeResult && <div className="worldInvokeResult" aria-live="polite">{invokeResult}</div>}
                <footer>{invokeResult && invoking.capabilities.includes("draft-post-it") && !postItSaved && <button type="button" className="worldCancelButton" onClick={() => {const detail={storageScope,text:invokeResult,color:"yellow"};window.dispatchEvent(new CustomEvent("folderrocket:create-sticky-note",{detail}));if("BroadcastChannel" in window){const channel=new BroadcastChannel("folderrocket-sticky-notes");channel.postMessage(detail);channel.close();}setPostItSaved(true);}} disabled={invokeBusy}>Crea post-it</button>}{postItSaved && <small>Post-it creato in questo pianeta.</small>}<button type="button" className="worldCancelButton" onClick={() => setInvoking(null)} disabled={invokeBusy}>Chiudi</button><button type="button" className="worldSaveButton" onClick={() => void runAssistant()} disabled={invokeBusy || !invokePrompt.trim()}>{invokeBusy ? <><LoaderCircle className="worldInlineSpinner" size={14}/>Sto chiedendo…</> : <><Send size={14}/>Richiama</>}</button></footer>
            </section>
        </div>}
    </main>;
}
