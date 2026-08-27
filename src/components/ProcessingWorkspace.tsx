import {useEffect, useMemo, useState} from "react";
import {Archive, ArrowRight, ExternalLink, File, FileSpreadsheet, FileText, Flame, FolderOpen, Image, Pencil, RotateCw, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import type {ManagedFolder} from "./FolderManagement";
import FireMountain from "./FireMountain";

interface FileEntry { name: string; path: string; createdAt?: string; size?: number; sourceName?: string; }
interface Props { folders: ManagedFolder[]; onUpdate: (id: string, change: Partial<ManagedFolder>) => void; }
interface RenamePart { id: string; type: "original" | "converted" | "text" | "date"; value?: string; }
interface PreviewContent { kind: "loading" | "text" | "image" | "pdf" | "unavailable"; text?: string; url?: string; message?: string; }

const types = ["All", "Excel", "Word", "PDF", "PNG", "JPG"];
const matchesType = (name: string, type: string) => type === "All" || ({Excel:["xls", "xlsx", "csv", "ods"], Word:["doc", "docx", "odt"], PDF:["pdf"], PNG:["png"], JPG:["jpg", "jpeg"]}[type] ?? []).includes(name.split(".").pop()?.toLowerCase() ?? "");
const fileExtension = (name: string) => name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
const baseName = (name: string) => name.slice(0, Math.max(0, name.length - fileExtension(name).length));
const RENAME_TEMPLATE_KEY = "folderrocket-conversion-rename-template";
const RENAME_TEMPLATE_VERSION_KEY = "folderrocket-conversion-rename-template-version";
const emptyRenameParts = (): RenamePart[] => [];
function readRenameParts(): RenamePart[] {
    try {
        // Version 2 starts with a blank builder. Existing automatic conversion names stay untouched until the user adds parts.
        if (localStorage.getItem(RENAME_TEMPLATE_VERSION_KEY) !== "2") {
            localStorage.setItem(RENAME_TEMPLATE_VERSION_KEY, "2");
            return emptyRenameParts();
        }
        const stored = JSON.parse(localStorage.getItem(RENAME_TEMPLATE_KEY) || "[]");
        if (Array.isArray(stored) && stored.every(part => part && typeof part.id === "string" && ["original", "converted", "text", "date"].includes(part.type))) return stored;
    } catch { /* Use the safe default below. */ }
    return emptyRenameParts();
}

function FormatIcon({format}: {format: string}) {
    return format === "PDF" ? <FileText className="formatIcon pdf" size={18}/> : format === "XLSX" || format === "CSV" ? <FileSpreadsheet className="formatIcon excel" size={18}/> : <File className="formatIcon generic" size={18}/>;
}

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf") return <span className="fileKindIcon pdf" title="PDF"><FileText size={17}/></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word" title="Word document"><FileText size={17}/></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel" title="Spreadsheet"><FileSpreadsheet size={17}/></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt" title="Text file"><FileText size={17}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image" title="Image"><Image size={17}/></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive" title="Archive"><Archive size={17}/></span>;
    return <span className="fileKindIcon generic" title="File"><File size={17}/></span>;
}

function buildRename(file: FileEntry, parts: RenamePart[]) {
    if (!parts.length) return null;
    const originalName = file.sourceName || file.name;
    const pieces = parts.map(part => part.type === "original" ? baseName(originalName) : part.type === "converted" ? "_converted" : part.type === "date" ? new Date().toLocaleDateString("en-GB").replaceAll("/", "-") : part.value ?? "").filter(Boolean);
    return `${pieces.join("") || baseName(originalName)}${fileExtension(file.name)}`;
}

export default function ProcessingWorkspace({folders, onUpdate}: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [type, setType] = useState("All");
    const [queue, setQueue] = useState<FileEntry[]>([]);
    const [converted, setConverted] = useState<FileEntry[]>([]);
    const [format, setFormat] = useState("PDF");
    const [status, setStatus] = useState("");
    const [converting, setConverting] = useState(false);
    const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
    const [previewContent, setPreviewContent] = useState<PreviewContent | null>(null);
    const [renameParts, setRenameParts] = useState<RenamePart[]>(readRenameParts);
    const selected = folders.find(folder => folder.id === selectedId);

    useEffect(() => {
        if (selected?.storage === "imaginary") { void Promise.resolve().then(() => setFiles(selected.virtualFiles ?? [])); return; }
        if (!selected?.path) { void Promise.resolve().then(() => setFiles([])); return; }
        void (async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/list-folder-files`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({folder: selected.path})});
                const data = await response.json().catch(() => ({})) as {files?: FileEntry[]};
                setFiles(response.ok ? data.files ?? [] : []);
            } catch { setFiles([]); }
        })();
    }, [selected?.id, selected?.path, selected?.storage, selected?.virtualFiles]);

    useEffect(() => {
        if (!previewFile?.path) { setPreviewContent(null); return; }
        let disposed = false;
        setPreviewContent({kind: "loading"});
        void (async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/files/preview`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: previewFile.path})});
                const data = await response.json().catch(() => ({})) as PreviewContent;
                if (disposed) return;
                setPreviewContent(response.ok && data.kind ? data : {kind: "unavailable", message: data.message || "A preview is not available for this file."});
            } catch {
                if (!disposed) setPreviewContent({kind: "unavailable", message: "Unable to load this preview."});
            }
        })();
        return () => { disposed = true; };
    }, [previewFile?.path]);

    useEffect(() => { localStorage.setItem(RENAME_TEMPLATE_KEY, JSON.stringify(renameParts)); }, [renameParts]);

    const shown = files.filter(file => matchesType(file.name, type));
    const renamePreview = buildRename({name: `original.${format.toLowerCase()}`, path: "", sourceName: "original"}, renameParts) ?? `Automatic name (_converted.${format.toLowerCase()})`;
    const queuePaths = useMemo(() => new Set(queue.map(file => file.path)), [queue]);
    const choosePreview = (file: FileEntry) => setPreviewFile(file);
    const addToQueue = (file: FileEntry) => { setPreviewFile(file); setQueue(current => current.some(item => item.path === file.path) ? current : [...current, file]); };
    const addRenamePart = (partType: RenamePart["type"]) => setRenameParts(current => [...current, {id: crypto.randomUUID(), type: partType, value: partType === "text" ? "_" : undefined}]);
    const updateRenamePart = (id: string, value: string) => setRenameParts(current => current.map(part => part.id === id ? {...part, value} : part));
    const openFile = (file: FileEntry) => { void fetch(`${API_BASE_URL}/search-files/open`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: file.path})}); };

    async function applyRenameTemplate(filesToRename: FileEntry[]) {
        const renamedFiles: FileEntry[] = [];
        const failures: string[] = [];
        for (const file of filesToRename) {
            const name = buildRename(file, renameParts);
            if (!name || name === file.name) { renamedFiles.push(file); continue; }
            try {
                const response = await fetch(`${API_BASE_URL}/files/rename`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: file.path, name})});
                const data = await response.json().catch(() => ({})) as {path?: string; name?: string; message?: string};
                if (!response.ok || !data.path || !data.name) throw new Error(data.message || "Unable to apply the converted-file name.");
                renamedFiles.push({...file, path: data.path, name: data.name});
            } catch (error) {
                renamedFiles.push(file);
                failures.push(error instanceof Error ? error.message : `Unable to rename ${file.name}.`);
            }
        }
        return {renamedFiles, failures};
    }

    async function convert() {
        if (!queue.length || converting) return;
        setStatus("");
        setConverting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/convert-files`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({paths: queue.map(file => file.path), files: queue.map(file => ({path: file.path, name: file.name})), format: format.toLowerCase()})});
            const data = await response.json().catch(() => ({})) as {converted?: FileEntry[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? "Conversion failed");
            const total = queue.length;
            const newFiles = (data.converted ?? []).map((file, index) => ({...file, sourceName: queue[index]?.name ?? file.name}));
            const {renamedFiles, failures} = await applyRenameTemplate(newFiles);
            setConverted(renamedFiles);
            setQueue([]);
            if (selected?.storage === "imaginary") onUpdate(selected.id, {virtualFiles: [...(selected.virtualFiles ?? []), ...renamedFiles.filter(file => !(selected.virtualFiles ?? []).some(item => item.path === file.path))]});
            setStatus(`Converted ${renamedFiles.length}/${total} files.${failures.length ? ` ${failures.length} name${failures.length === 1 ? "" : "s"} could not be applied.` : ""}`);
        } catch (error) { setStatus(error instanceof Error ? error.message : "Conversion failed"); }
        finally { setConverting(false); }
    }

    return <main className="processingPage">
        <aside className="processingFolders">
            <div className="processingFoldersHead"><h2>Folders</h2><label>File type<select value={type} onChange={event => setType(event.target.value)}>{types.map(item => <option key={item}>{item}</option>)}</select></label></div>
            <div className="processingFolderList">{folders.map(folder => <button type="button" className={folder.id === selectedId ? "processingFolder selected" : "processingFolder"} onClick={() => setSelectedId(folder.id)} key={folder.id}><FolderOpen size={17}/><span><strong>{folder.name}</strong></span></button>)}</div>
            <section className="processingQuickPreview"><h3>Quick preview</h3>{previewFile ? <div className="processingPreviewContent">{previewContent?.kind === "loading" && <p>Loading file preview…</p>}{previewContent?.kind === "text" && <pre>{previewContent.text || "No readable text was found."}</pre>}{previewContent?.kind === "image" && previewContent.url && <img src={`${API_BASE_URL}${previewContent.url}`} alt={`Preview of ${previewFile.name}`}/>} {previewContent?.kind === "pdf" && previewContent.url && <iframe src={`${API_BASE_URL}${previewContent.url}`} title={`Preview of ${previewFile.name}`}/>} {previewContent?.kind === "unavailable" && <p>{previewContent.message || "A preview is not available for this file."}</p>}<div className="processingPreviewCaption"><FileKindIcon name={previewFile.name}/><strong title={previewFile.name}>{previewFile.name}</strong><em>{queuePaths.has(previewFile.path) ? "Ready" : "Selected"}</em></div></div> : <p>Select one file to preview it here.</p>}</section>
        </aside>
        <section className="processingFiles">
            <section className="processingFolderFiles"><h2>{selected?.name ?? "Folder files"}</h2><div className="processingFileList">{shown.map(file => <div className={`processingFile${previewFile?.path === file.path ? " selectedProcessingFile" : ""}`} onClick={() => choosePreview(file)} key={file.path}><button type="button" title="Send to Fire Mountain" onClick={event => { event.stopPropagation(); window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail: [file]})); }}><Flame size={16}/></button><span className="processingFileName"><FileKindIcon name={file.name}/>{file.name}</span><span className="processingFileActions"><button type="button" title="Open file" onClick={event => { event.stopPropagation(); openFile(file); }}><ExternalLink size={15}/></button><button type="button" title="Prepare conversion" onClick={event => { event.stopPropagation(); addToQueue(file); }}><ArrowRight size={16}/></button></span></div>)}{selected && !shown.length && <p>No files of the selected type.</p>}</div></section>
            <section className="convertedFiles"><h2>Converted files</h2><div className="processingFileList">{converted.length ? converted.map(file => <div className="processingFile convertedFile" onClick={() => setPreviewFile(file)} key={file.path}><span className="processingFileName"><FileKindIcon name={file.name}/>{file.name}</span><button type="button" title="Open converted file" onClick={event => { event.stopPropagation(); openFile(file); }}><ExternalLink size={15}/></button></div>) : <p>Converted files will appear here.</p>}</div></section>
        </section>
        <aside className="conversionStack"><section className="conversionPanel"><h2>Local conversion</h2><p className="localConversionNote">Runs on this PC. No AI or file upload is used.</p><label className="formatSelect"><FormatIcon format={format}/><select value={format} onChange={event => setFormat(event.target.value)}><option>PDF</option><option>TXT</option><option>CSV</option><option>XLSX</option></select></label><div className="conversionQueue">{queue.length ? queue.map(file => <div key={file.path} onClick={() => choosePreview(file)}><span>{file.name}</span><button type="button" title="Remove from conversion queue" onClick={event => { event.stopPropagation(); setQueue(current => current.filter(item => item.path !== file.path)); }} disabled={converting}><X size={13}/></button></div>) : <p>Use the green arrow beside a file.</p>}</div>{queue.length > 0 && <button className="clearConversionQueue" type="button" onClick={() => setQueue([])} disabled={converting}>Clear list</button>}<section className="convertedRenamePanel"><div><Pencil size={13}/><strong>Converted-name template</strong></div><small>{renameParts.length ? "Applied to every file in the next conversion." : "Automatic \"_converted\" added."}</small><div className="conversionRenameBuilder">{renameParts.map(part => <span key={part.id} className={`conversionRenamePart ${part.type}`}>{part.type === "original" ? "Original name" : part.type === "converted" ? "_converted" : part.type === "date" ? new Date().toLocaleDateString("en-GB") : <input value={part.value ?? ""} onChange={event => updateRenamePart(part.id, event.target.value)} aria-label="Rename text" />}</span>)}<select value="" onChange={event => { const next = event.target.value as RenamePart["type"] | ""; if (next) addRenamePart(next); }} aria-label="Add rename item"><option value="">Add rename</option><option value="original">Original name</option><option value="converted">_converted</option><option value="text">Text</option><option value="date">Date</option></select></div><span className="conversionRenamePreview" title={renamePreview}>Example: {renamePreview}</span><div className="conversionRenameActions"><button type="button" onClick={() => setRenameParts(emptyRenameParts())} disabled={!renameParts.length}>Reset template</button><button type="button" onClick={() => setRenameParts(current => current.slice(0, -1))} disabled={!renameParts.length}>Delete last</button></div></section><button type="button" className={converting ? "convertButton converting" : "convertButton"} disabled={!queue.length || converting} onClick={() => void convert()} title="Convert"><RotateCw className={converting ? "spin" : ""} size={23}/></button>{converting && <p className="conversionProgress">Converting files…</p>}<p className="conversionCount">{queue.length ? `${queue.length} file${queue.length === 1 ? "" : "s"} ready to convert` : "No files waiting for conversion"}</p>{status && <p className="conversionCount">{status}</p>}{converted.length > 0 && <button className="sendConvertedButton" type="button" onClick={() => window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail: converted}))}>Send converted files to Fire Mountain</button>}</section><FireMountain /></aside>
    </main>;
}
