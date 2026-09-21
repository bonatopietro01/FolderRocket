import {useEffect, useId, useState} from "react";
import {FileText, LoaderCircle, Palette, Settings, X} from "lucide-react";
import {API_BASE_URL} from "../api";

export interface FormatFile {name: string; path: string; size?: number; sourceName?: string;}
interface Props {files: FormatFile[]; onRemove: (path: string) => void; onComplete: (files: FormatFile[], sourceFiles: FormatFile[]) => Promise<void>;}

const formatLabel = (name: string) => {
    const dot = name.lastIndexOf(".");
    return dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : "FILE";
};

export default function ChangeFormatPanel({files, onRemove, onComplete}: Props) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsId = useId();
    const [motherPath, setMother] = useState("");
    const [headers, setHeaders] = useState(true);
    const [pictures, setPictures] = useState(true);
    const [quality, setQuality] = useState(90);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const mother = files.find(file => file.path === motherPath) || files[0];
    const children = files.filter(file => file.path !== mother?.path);
    const image = Boolean(mother && /\.(png|jpe?g|bmp|tiff?)$/i.test(mother.name));

    useEffect(() => {
        if (!settingsOpen) return;
        const closeSettingsOutside = (event: PointerEvent) => {
            if (!(event.target as Element).closest(".changeFormatSettingsToggle,.changeFormatSettings")) setSettingsOpen(false);
        };
        document.addEventListener("pointerdown", closeSettingsOutside);
        return () => document.removeEventListener("pointerdown", closeSettingsOutside);
    }, [settingsOpen]);

    async function apply() {
        if (!mother || !children.length || busy) return;
        setBusy(true);
        setMessage("Applying the source format locally…");
        try {
            const response = await fetch(`${API_BASE_URL}/files/change-format`, {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({mother: mother.path, children: children.map(file => file.path), options: {headers, pictures, quality}}),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Format change failed.");
            const output: FormatFile[] = data.converted || [];
            const analysis = data.motherAnalysis && Object.keys(data.motherAnalysis).length
                ? `Source analyzed: ${Object.entries(data.motherAnalysis).map(([role, count]) => `${role} ${count}`).join(" · ")}`
                : "";
            setMessage([
                `${output.length}/${children.length} copies created.`,
                analysis,
                ...(data.warnings || []),
                ...(data.failures || []).map((failure: {name: string; message: string}) => `${failure.name}: ${failure.message}`),
            ].filter(Boolean).join("\n"));
            if (output.length) await onComplete(output, children);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Format change failed.");
        } finally {
            setBusy(false);
        }
    }

    return <section className="changeFormatPanel conversionToolCard">
        <h2>
            <span className="conversionCardHeading"><Palette size={17}/><span>Change format<small>Copy typography and layout</small></span></span>
            {busy && <LoaderCircle className="conversionHeaderSpinner format" size={14}/>}
            {!image && <button type="button" className="changeFormatSettingsToggle" title="Change format settings" aria-label="Change format settings" aria-expanded={settingsOpen} aria-controls={settingsId} onClick={() => setSettingsOpen(open => !open)}><Settings size={15}/></button>}
        </h2>

        <label className="formatChoiceField">
            <span className="formatFieldCopy"><strong>Format source</strong><small>Fonts, spacing and structure come from this file</small></span>
            <span className="formatSelectShell"><FileText size={15}/><select aria-label="Format source file" value={mother?.path || ""} disabled={busy || !files.length} onChange={event => setMother(event.target.value)}><option value="" disabled>Choose a source file</option>{files.map(file => <option key={file.path} value={file.path}>{formatLabel(file.name)} · {file.name}</option>)}</select></span>
        </label>

        <div className="studioQueueHeading"><span>Files receiving the format</span><strong>{children.length}</strong></div>
        <div className="conversionQueue formatFileQueue">
            {files.length ? files.map(file => {
                const isSource = mother?.path === file.path;
                return <div className={`formatQueueRow ${isSource ? "source" : "recipient"}`} key={file.path}>
                    <span className="formatRoleBadge">{isSource ? "Source" : "Target"}</span>
                    <span className="formatQueueName" title={file.name}>{file.name}</span>
                    <span className="fileFormatBadge">{formatLabel(file.name)}</span>
                    <button type="button" title={`Remove ${file.name} from format queue`} disabled={busy} onClick={() => onRemove(file.path)}><X size={13}/></button>
                </div>;
            }) : <p className="conversionEmptyState">Add one source file and at least one target file.</p>}
        </div>

        {image ? <div className="formatOptionSummary">
            <p>Copies size and DPI without cropping. Each target keeps its original file type.</p>
            <label>JPEG quality <strong>{quality}</strong><input type="range" min="1" max="100" value={quality} onChange={event => setQuality(Number(event.target.value))}/></label>
        </div> : <fieldset id={settingsId} className="changeFormatSettings" hidden={!settingsOpen} disabled={busy}>
            <legend>Transfer options</legend>
            <label><input type="checkbox" checked={headers} onChange={event => setHeaders(event.target.checked)}/>Use source headers and footers</label>
            <label><input type="checkbox" checked={pictures} onChange={event => setPictures(event.target.checked)}/>Fit inline images to source image size</label>
        </fieldset>}

        <button type="button" className="applyMotherFormat" disabled={busy || !children.length} onClick={() => void apply()}>{busy ? "Formatting…" : "Apply source format"}</button>
        {message && <p className="formatReport" role="status">{message}</p>}
    </section>;
}
