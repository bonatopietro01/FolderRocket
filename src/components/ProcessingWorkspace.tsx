import {useFilePreview} from '../useFilePreview';
import {additionalFileIcon} from './AdditionalFileIcons';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Archive, ArrowRight, ExternalLink, File, FileCog, FileSpreadsheet, FileText, Flame, FolderCheck, FolderOpen, Image, Pencil, RotateCw, Send, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import type {ManagedFolder} from "./FolderManagement";
import FireMountain from "./FireMountain";
import ChangeFormatPanel from "./ChangeFormatPanel";
import {recordDailyActivity} from "../dailyActivity";
import {folderColourMap} from "../folderProjects";

interface FileEntry { name: string; path: string; createdAt?: string; size?: number; sourceName?: string; }
interface Props { folders: ManagedFolder[]; onUpdate: (id: string, change: Partial<ManagedFolder>) => void; storageScope?: string; }
interface RenamePart { id: string; type: "original" | "converted" | "text" | "date"; value?: string; }

const extensionOf = (name: string) => name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "other" : "other";
const matchesType = (name: string, type: string) => type === "all" || extensionOf(name) === type;
const fileExtension = (name: string) => name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
const baseName = (name: string) => name.slice(0, Math.max(0, name.length - fileExtension(name).length));
const parentFolderPath = (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, "");
const sameFolderPath = (left: string, right: string) => left.trim().replace(/\//g, "\\").replace(/[\\/]+$/, "").toLowerCase() === right.trim().replace(/\//g, "\\").replace(/[\\/]+$/, "").toLowerCase();
const RENAME_TEMPLATE_KEY = "folderrocket-conversion-rename-template";
const RENAME_TEMPLATE_VERSION_KEY = "folderrocket-conversion-rename-template-version";
const emptyRenameParts = (): RenamePart[] => [];
function readRenameParts(storageScope: string): RenamePart[] {
    try {
        const templateKey = `${RENAME_TEMPLATE_KEY}-${storageScope}`;
        const versionKey = `${RENAME_TEMPLATE_VERSION_KEY}-${storageScope}`;
        if (localStorage.getItem(templateKey) === null && storageScope.endsWith("-world-work")) {
            const legacyTemplate = localStorage.getItem(RENAME_TEMPLATE_KEY);
            const legacyVersion = localStorage.getItem(RENAME_TEMPLATE_VERSION_KEY);
            if (legacyTemplate !== null) localStorage.setItem(templateKey, legacyTemplate);
            if (legacyVersion !== null) localStorage.setItem(versionKey, legacyVersion);
        }
        // Version 2 starts with a blank builder. Existing automatic conversion names stay untouched until the user adds parts.
        if (localStorage.getItem(versionKey) !== "2") {
            localStorage.setItem(versionKey, "2");
            return emptyRenameParts();
        }
        const stored = JSON.parse(localStorage.getItem(templateKey) || "[]");
        if (Array.isArray(stored) && stored.every(part => part && typeof part.id === "string" && ["original", "converted", "text", "date"].includes(part.type))) return stored;
    } catch { /* Use the safe default below. */ }
    return emptyRenameParts();
}

function FormatIcon({format}: {format: string}) {
    return format === "PDF" ? <FileText className="formatIcon pdf" size={18}/> : format === "XLSX" || format === "CSV" ? <FileSpreadsheet className="formatIcon excel" size={18}/> : <File className="formatIcon generic" size={18}/>;
}

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, 17);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
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

function hasInvalidWindowsNameCharacter(name: string) {
    return Array.from(name).some(character => {
        const code = character.charCodeAt(0);
        return code <= 31 || '<>:"/\\|?*'.includes(character);
    });
}

export default function ProcessingWorkspace({folders, onUpdate, storageScope = "default"}: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [type, setType] = useState("all");
    const [formatQueue,setFormatQueue] = useState<FileEntry[]>([]);
    const [queue, setQueue] = useState<FileEntry[]>([]);
    const [converted, setConverted] = useState<FileEntry[]>([]);
    const [convertedSources, setConvertedSources] = useState<FileEntry[]>([]);
    const [format, setFormat] = useState("PDF");
    const [status, setStatus] = useState("");
    const [converting, setConverting] = useState(false);
    const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
    const previewContent = useFilePreview(previewFile?.path);
    const renameParts = useMemo(() => readRenameParts(storageScope), [storageScope]);
    const [renameDraft, setRenameDraft] = useState<{path: string; name: string} | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const currentStorageScope = useRef(storageScope);
    useLayoutEffect(() => { currentStorageScope.current = storageScope; }, [storageScope]);
    const [deliveryFile, setDeliveryFile] = useState<FileEntry | null>(null);
    const [deliveryFolderIds, setDeliveryFolderIds] = useState<string[]>([]);
    const [deliveryBusy, setDeliveryBusy] = useState(false);
    const [keepingPaths, setKeepingPaths] = useState<string[]>([]);
    const selected = folders.find(folder => folder.id === selectedId);
    const folderColours = useMemo(() => folderColourMap(folders), [folders]);

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            await Promise.resolve();
            if (controller.signal.aborted) return;
            if (selected?.storage === "imaginary") { setFiles(selected.virtualFiles ?? []); return; }
            if (!selected?.path) { setFiles([]); return; }
            try {
                const response = await fetch(`${API_BASE_URL}/list-folder-files`, {method: "POST", signal: controller.signal, headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({folder: selected.path})});
                const data = await response.json().catch(() => ({})) as {files?: FileEntry[]};
                if (!controller.signal.aborted) setFiles(response.ok ? data.files ?? [] : []);
            } catch { if (!controller.signal.aborted) setFiles([]); }
        })();
        return () => controller.abort();
    }, [selected?.id, selected?.path, selected?.storage, selected?.virtualFiles]);

    const fileTypeCounts = useMemo(() => Object.entries(files.reduce<Record<string,number>>((counts,file)=>{const extension=extensionOf(file.name);counts[extension]=(counts[extension]||0)+1;return counts;},{})).sort(([left],[right])=>left.localeCompare(right)),[files]);
    const activeType = type === "all" || fileTypeCounts.some(([extension])=>extension===type) ? type : "all";
    const shown = files.filter(file => matchesType(file.name, activeType));
    const queuePaths = useMemo(() => new Set(queue.map(file => file.path)), [queue]);
    const choosePreview = (file: FileEntry) => setPreviewFile(file);
    const addToQueue = (file: FileEntry) => { setPreviewFile(file); setQueue(current => current.some(item => item.path === file.path) ? current : [...current, file]); };
    const openFile = async (file: FileEntry) => {
        try {
            const response = await fetch(`${API_BASE_URL}/search-files/open`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: file.path})});
            const data = await response.json().catch(() => ({})) as {message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to open this file.");
            setStatus(`${file.name} opened.`);
        } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to open this file."); }
    };

    async function keepConvertedFile(file: FileEntry) {
        if (keepingPaths.includes(file.path)) return;
        setKeepingPaths(current => [...current, file.path]);
        try {
            const response = await fetch(`${API_BASE_URL}/files/keep`, {method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body:JSON.stringify({path:file.path})});
            const data = await response.json().catch(() => ({})) as {folder?:string; message?:string};
            if (!response.ok) throw new Error(data.message || "Unable to keep this file.");
            const remaining=converted.filter(item => item.path !== file.path);
            setConverted(remaining);
            if(!remaining.length)setConvertedSources([]);
            setDeliveryFile(current => current?.path === file.path ? null : current);
            if (previewFile?.path === file.path) setPreviewFile(null);
            setStatus(`${file.name} kept in ${data.folder || parentFolderPath(file.path)}.`);
        } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to keep this file."); }
        finally { setKeepingPaths(current => current.filter(path => path !== file.path)); }
    }

    function openDelivery(file: FileEntry) {
        setDeliveryFile(current => current?.path === file.path ? null : file);
        setDeliveryFolderIds([]);
    }

    function toggleDeliveryFolder(id: string) {
        setDeliveryFolderIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    }

    async function sendConvertedCopies() {
        if (!deliveryFile || !deliveryFolderIds.length || deliveryBusy) return;
        setDeliveryBusy(true);
        const selectedDestinations = folders.filter(folder => deliveryFolderIds.includes(folder.id));
        const errors: string[] = [];
        let sent = 0;
        for (const destination of selectedDestinations) {
            if (destination.storage === "imaginary") {
                const currentFiles = destination.virtualFiles ?? [];
                if (!currentFiles.some(file => file.path === deliveryFile.path)) {
                    onUpdate(destination.id, {virtualFiles: [...currentFiles, deliveryFile]});
                    sent += 1;
                }
                continue;
            }
            if (!destination.path || sameFolderPath(parentFolderPath(deliveryFile.path), destination.path)) {
                setStatus(`${deliveryFile.name} is already in ${destination.name}.`);
                continue;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/files/copy`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({paths: [deliveryFile.path], destination: destination.path})});
                const data = await response.json().catch(() => ({})) as {copied?: FileEntry[]; message?: string};
                if (!response.ok) throw new Error(data.message || "Copy failed.");
                sent += (data.copied ?? []).length;
            } catch (error) { errors.push(`${destination.name}: ${error instanceof Error ? error.message : "copy failed"}`); }
        }
        if (sent) window.dispatchEvent(new CustomEvent("folderrocket-files-moved", {detail: {moved: [], destination: "converted-file-copy"}}));
        setStatus(sent ? `${deliveryFile.name} sent to ${sent} folder${sent === 1 ? "" : "s"}.${errors.length ? ` ${errors.length} destination(s) could not be completed.` : ""}` : errors.join(" · ") || "This file is already in the selected folder.");
        setDeliveryBusy(false);
        if (sent) { setDeliveryFile(null); setDeliveryFolderIds([]); }
    }

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

    async function renameConvertedFile(file: FileEntry) {
        const draft = renameDraft?.path === file.path ? renameDraft.name.trim() : "";
        if (!draft) { setStatus("Enter a file name."); return; }
        if (hasInvalidWindowsNameCharacter(draft) || /[ .]$/.test(draft) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(draft)) {
            setStatus("This file name contains characters or a name that Windows does not allow.");
            return;
        }
        const extension = fileExtension(file.name);
        const name = `${draft}${extension}`;
        if (name === file.name) { setRenameDraft(null); return; }
        const requestScope = storageScope;
        setRenamingPath(file.path);
        setStatus("");
        try {
            const response = await fetch(`${API_BASE_URL}/files/rename`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({path: file.path, name})});
            const data = await response.json().catch(() => ({})) as {path?: string; name?: string; message?: string};
            if (!response.ok || !data.path || !data.name) throw new Error(data.message || "Unable to rename converted file.");
            if (currentStorageScope.current !== requestScope) return;
            const renamed = {...file, path: data.path, name: data.name};
            setConverted(current => current.map(item => item.path === file.path ? {...item, path: data.path!, name: data.name!} : item));
            setPreviewFile(current => current?.path === file.path ? {...current, path: data.path!, name: data.name!} : current);
            setDeliveryFile(current => current?.path === file.path ? {...current, path: data.path!, name: data.name!} : current);
            for (const folder of folders) {
                if (folder.storage === "imaginary" && folder.virtualFiles?.some(item => item.path === file.path)) {
                    onUpdate(folder.id, {virtualFiles: folder.virtualFiles.map(item => item.path === file.path ? {...item, path: renamed.path, name: renamed.name} : item)});
                }
            }
            setRenameDraft(null);
            setStatus(`Renamed to ${data.name}.`);
        } catch (error) {
            if (currentStorageScope.current === requestScope) setStatus(error instanceof Error ? error.message : "Unable to rename converted file.");
        } finally {
            setRenamingPath(current => current === file.path ? null : current);
        }
    }

    async function convert() {
        if (!queue.length || converting) return;
        const sourceFiles = [...queue];
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
            setConvertedSources(sourceFiles);
            setQueue([]);
            if (selected?.storage === "imaginary") onUpdate(selected.id, {virtualFiles: [...(selected.virtualFiles ?? []), ...renamedFiles.filter(file => !(selected.virtualFiles ?? []).some(item => item.path === file.path))]});
            setStatus(`Converted ${renamedFiles.length}/${total} files.${failures.length ? ` ${failures.length} name${failures.length === 1 ? "" : "s"} could not be applied.` : ""}`);
            recordDailyActivity({kind:"studio",summary:`Converted ${renamedFiles.length}/${total} files to ${format}`,files:renamedFiles.map(file=>file.name),undo:renamedFiles.length?{type:"trash-created",paths:renamedFiles.map(file=>file.path)}:undefined});
        } catch (error) { setStatus(error instanceof Error ? error.message : "Conversion failed"); }
        finally { setConverting(false); }
    }

    return <main className="processingPage">
        <aside className="processingFolders">
            <div className="processingFoldersHead"><h2>Folders</h2></div>
            <div className="processingFolderList">{folders.map(folder => {const folderColour = folderColours.get(folder.id); return <button type="button" className={folder.id === selectedId ? "processingFolder selected" : "processingFolder"} style={folderColour ? {background: `color-mix(in srgb, ${folderColour} 13%, white)`, borderColor: folder.appearance?.borderColor && /^#[a-f\d]{6}$/i.test(folder.appearance.borderColor) ? `color-mix(in srgb, ${folder.appearance.borderColor} 42%, white)` : undefined} : undefined} onClick={() => setSelectedId(folder.id)} key={folder.id}><FolderOpen size={17}/><span><strong>{folder.name}</strong></span></button>;})}</div>
            <section className="processingQuickPreview">{previewFile ? <div className="processingPreviewContent">{previewContent?.kind === "loading" && <p>Loading file preview…</p>}{previewContent?.kind === "text" && <pre>{previewContent.text || "No readable text was found."}</pre>}{previewContent?.kind === "image" && previewContent.url && <img src={`${API_BASE_URL}${previewContent.url}`} alt={`Preview of ${previewFile.name}`}/>} {previewContent?.kind === "pdf" && previewContent.url && <iframe src={`${API_BASE_URL}${previewContent.url}`} title={`Preview of ${previewFile.name}`}/>} {previewContent?.kind === "unavailable" && <p>{previewContent.message || "A preview is not available for this file."}</p>}<div className="processingPreviewCaption"><FileKindIcon name={previewFile.name}/><strong title={previewFile.name}>{previewFile.name}</strong><em>{queuePaths.has(previewFile.path) ? "Ready" : "Selected"}</em></div></div> : <p>Select one file to preview it here.</p>}</section>
        </aside>
        <section className="processingFiles">
            <section className="processingFolderFiles"><h2><span>{selected?.name ?? "Folder files"}</span><select className="processingSmartFileFilter" aria-label="Filter folder files by format" value={activeType} onChange={event=>setType(event.target.value)}><option value="all">All files ({files.length})</option>{fileTypeCounts.map(([extension,count])=><option value={extension} key={extension}>{extension.toUpperCase()} ({count})</option>)}</select></h2><div className="processingFileList">{shown.map(file => <div className={`processingFile${previewFile?.path === file.path ? " selectedProcessingFile" : ""}`} onClick={() => choosePreview(file)} onDoubleClick={() => void openFile(file)} key={file.path}><button className="fileActionPulse" type="button" title="Send to Fire Mountain" onClick={event => { event.stopPropagation(); window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail: [file]})); }}><Flame size={16}/></button><span className="processingFileName"><FileKindIcon name={file.name}/>{file.name}</span><span className="processingFileActions"><button className="fileActionPulse" type="button" title="Open file" onClick={event => { event.stopPropagation(); void openFile(file); }}><ExternalLink size={15}/></button><button className="prepareConversion fileActionPulse" type="button" title="Prepare conversion" onClick={event => { event.stopPropagation(); addToQueue(file); }}><ArrowRight size={16}/></button><button className="prepareFormat fileActionPulse" type="button" title="Prepare Change format" onClick={event=>{event.stopPropagation();setFormatQueue(current=>current.some(item=>item.path===file.path)?current:[...current,file]);}}><ArrowRight size={16}/></button></span></div>)}{selected && !shown.length && <p>No files of the selected type.</p>}</div></section>
            <section className={converted.length ? "convertedFiles" : "convertedFiles emptyConvertedFiles"}><h2>Converted files<button type="button" className="clearConvertedFiles" title="Clear converted files list" aria-label="Clear converted files list" disabled={!converted.length || deliveryBusy || converting} onClick={() => { if (converted.some(file => file.path === previewFile?.path)) setPreviewFile(null); setConverted([]); setConvertedSources([]); setDeliveryFile(null); setDeliveryFolderIds([]); }}><X size={15}/></button></h2><div className="processingFileList">{converted.length ? converted.map(file => <div className="convertedFileWrap" key={file.path}><div className="processingFile convertedFile" onClick={() => setPreviewFile(file)}><span className="processingFileName"><FileKindIcon name={file.name}/>{file.name}</span><span className="processingFileActions convertedFileActions"><button type="button" title="Open converted file" onClick={event => { event.stopPropagation(); void openFile(file); }}><ExternalLink size={15}/></button><button type="button" title="Rename converted file" aria-label={`Rename ${file.name}`} disabled={deliveryBusy || keepingPaths.includes(file.path) || renamingPath === file.path} onClick={event => { event.stopPropagation(); setStatus(""); setRenameDraft({path: file.path, name: baseName(file.name)}); }}><Pencil size={14}/></button><button type="button" className="convertedKeepButton" title="Keep this file in its current folder" disabled={keepingPaths.includes(file.path) || renamingPath === file.path} onClick={event => { event.stopPropagation(); void keepConvertedFile(file); }}>{keepingPaths.includes(file.path) ? <RotateCw className="spin" size={15}/> : <FolderCheck size={15}/>}</button><button type="button" className={deliveryFile?.path === file.path ? "convertedSendButton active" : "convertedSendButton"} title="Send a copy to FolderRocket folders" disabled={renamingPath === file.path || keepingPaths.includes(file.path)} onClick={event => { event.stopPropagation(); openDelivery(file); }}><Send size={15}/></button></span></div>{renameDraft?.path === file.path && <form className="convertedFileRename" onSubmit={event => {event.preventDefault(); void renameConvertedFile(file);}}><label><span>New file name</span><input autoFocus value={renameDraft.name} disabled={renamingPath === file.path} onKeyDown={event => {if (event.key === "Escape" && renamingPath !== file.path) setRenameDraft(null);}} onChange={event => setRenameDraft({path: file.path, name: event.target.value})}/><small>Extension kept: {fileExtension(file.name) || "none"}</small></label><button type="submit" disabled={renamingPath === file.path}>{renamingPath === file.path ? "Saving…" : "Save"}</button><button type="button" disabled={renamingPath === file.path} onClick={() => setRenameDraft(null)}>Cancel</button></form>}{deliveryFile?.path === file.path && <div className="convertedDeliveryMenu"><strong>Send a copy to:</strong><div>{folders.map(folder => <label key={folder.id}><input type="checkbox" checked={deliveryFolderIds.includes(folder.id)} onChange={() => toggleDeliveryFolder(folder.id)}/><FolderOpen size={13}/><span>{folder.name}</span>{folder.storage === "imaginary" && <em>virtual</em>}</label>)}</div><footer><button type="button" onClick={() => { setDeliveryFile(null); setDeliveryFolderIds([]); }} disabled={deliveryBusy}>Cancel</button><button type="button" onClick={() => void sendConvertedCopies()} disabled={!deliveryFolderIds.length || deliveryBusy}>{deliveryBusy ? "Sending…" : "Send copies"}</button></footer></div>}</div>) : <p>Converted files will appear here.</p>}</div></section>
        </section>
        <aside className="conversionStack">
            <section className={`conversionPanel conversionToolCard ${queue.length ? "hasQueuedFiles" : "queueEmpty"}`}>
                <h2 className="localConversionHeading"><span className="conversionCardHeading"><FileCog size={17}/><span>Local conversion<small>Create a copy in another format</small></span></span><label className="formatChoiceField localFormatChoice"><span className="formatSelectShell"><FormatIcon format={format}/><select aria-label="Output format" value={format} onChange={event => setFormat(event.target.value)}><option>PDF</option><option>TXT</option><option>CSV</option><option>XLSX</option></select></span></label>{converting&&<RotateCw className="conversionHeaderSpinner local" size={14}/>}</h2>
                {queue.length > 0 && <div className="studioQueueHeading"><span>Files to convert</span><strong>{queue.length}</strong></div>}
                <div className="conversionQueue localConversionQueue" tabIndex={queue.length ? 0 : undefined} aria-label="Files waiting for local conversion">{queue.length ? queue.map(file => <div className="formatQueueRow" key={file.path} role="group" aria-label={`${file.name}, queued for conversion`} tabIndex={0} onKeyDown={event => {if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {event.preventDefault(); choosePreview(file);}}} onClick={() => choosePreview(file)}><span className="formatQueueName" title={file.name}>{file.name}</span><span className="fileFormatBadge">{extensionOf(file.name).toUpperCase()}</span><button type="button" title="Remove from conversion queue" onClick={event => { event.stopPropagation(); setQueue(current => current.filter(item => item.path !== file.path)); }} disabled={converting}><X size={13}/></button></div>) : null}</div>
                <button type="button" className={converting ? "convertButton converting" : "convertButton"} disabled={!queue.length || converting} onClick={() => void convert()} title="Convert"><RotateCw className={converting ? "spin" : ""} size={16}/>{converting ? "Converting…" : "Convert files"}</button>
                {converting && <p className="conversionProgress">Converting files…</p>}{queue.length > 0 && <p className="conversionCount">{`${queue.length} file${queue.length === 1 ? "" : "s"} ready to convert`}</p>}{status && <p className="conversionCount">{status}</p>}{converted.length > 0 && convertedSources.length > 0 && <button className="sendConvertedButton" type="button" onClick={() => window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail: convertedSources}))}>Send original files to Fire Mountain</button>}
            </section>
            <ChangeFormatPanel files={formatQueue} onRemove={path=>setFormatQueue(current=>current.filter(file=>file.path!==path))} onComplete={async (output,sourceFiles)=>{const result=await applyRenameTemplate(output);setConverted(result.renamedFiles);setConvertedSources(sourceFiles);recordDailyActivity({kind:"studio",summary:`Formatted ${result.renamedFiles.length} file${result.renamedFiles.length===1?"":"s"}`,files:result.renamedFiles.map(file=>file.name),undo:result.renamedFiles.length?{type:"trash-created",paths:result.renamedFiles.map(file=>file.path)}:undefined});if(result.failures.length)setStatus(`${result.failures.length} files could not be renamed.`);}}/>
            <FireMountain />
        </aside>
    </main>;
}
