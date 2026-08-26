import { useEffect, useState } from "react";
import { ArrowRight, Archive, Flame, FolderOpen, Image, RotateCw, FileText, FileSpreadsheet, File, X, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "../api";
import type { ManagedFolder } from "./FolderManagement";
import FireMountain from "./FireMountain";

interface FileEntry { name: string; path: string; createdAt?: string; }
interface Props { folders: ManagedFolder[]; onUpdate: (id: string, change: Partial<ManagedFolder>) => void; }
const types = ["Tutti", "Excel", "Word", "PDF", "PNG", "JPG"];
const matchesType = (name: string, type: string) => type === "Tutti" || ({Excel:["xls","xlsx","csv","ods"], Word:["doc","docx","odt"], PDF:["pdf"], PNG:["png"], JPG:["jpg","jpeg"]}[type] ?? []).includes(name.split(".").pop()?.toLowerCase() ?? "");
function FormatIcon({format}: {format: string}) { return format === "PDF" ? <FileText className="formatIcon pdf" size={18}/> : format === "XLSX" || format === "CSV" ? <FileSpreadsheet className="formatIcon excel" size={18}/> : <File className="formatIcon generic" size={18}/>; }
function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf") return <span className="fileKindIcon pdf" title="PDF"><FileText size={17} /></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word" title="Word document"><FileText size={17} /></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel" title="Spreadsheet"><FileSpreadsheet size={17} /></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt" title="Text file"><FileText size={17} /></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image" title="Image"><Image size={17} /></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive" title="Archive"><Archive size={17} /></span>;
    return <span className="fileKindIcon generic" title="File"><File size={17} /></span>;
}

export default function ProcessingWorkspace({folders, onUpdate}: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [type, setType] = useState("Tutti");
    const [queue, setQueue] = useState<FileEntry[]>([]);
    const [converted, setConverted] = useState<FileEntry[]>([]);
    const [format, setFormat] = useState("PDF");
    const [status, setStatus] = useState("");
    const [converting, setConverting] = useState(false);
    const selected = folders.find(folder => folder.id === selectedId);

    useEffect(() => {
        if (selected?.storage === "imaginary") { void Promise.resolve().then(() => setFiles(selected.virtualFiles ?? [])); return; }
        if (!selected?.path) { void Promise.resolve().then(() => setFiles([])); return; }
        void (async () => {
            const response = await fetch(`${API_BASE_URL}/list-folder-files`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({folder:selected.path})});
            const data = await response.json() as {files?:FileEntry[]};
            setFiles(data.files ?? []);
        })();
    }, [selected?.id, selected?.path, selected?.storage, selected?.virtualFiles]);

    const shown = files.filter(file => matchesType(file.name, type));
    function addToQueue(file: FileEntry) { setQueue(current => current.some(item => item.path === file.path) ? current : [...current, file]); }
    async function convert() {
        if (!queue.length || converting) return;
        setStatus("");
        setConverting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/convert-files`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({paths:queue.map(file => file.path), files:queue.map(file => ({path:file.path, name:file.name})), format:format.toLowerCase()})});
            const data = await response.json() as {converted?:FileEntry[]; message?:string};
            if (response.ok) {
                const total = queue.length;
                const newFiles = data.converted ?? [];
                setConverted(newFiles); setQueue([]);
                if (selected?.storage === "imaginary") {
                    onUpdate(selected.id, {virtualFiles: [...(selected.virtualFiles ?? []), ...newFiles.filter(file => !(selected.virtualFiles ?? []).some(item => item.path === file.path))]});
                }
                setStatus(`Converted ${newFiles.length}/${total} files.`);
            }
            else setStatus(data.message ?? "Conversion failed");
        }
        catch (conversionError) { setStatus(conversionError instanceof Error ? conversionError.message : "Conversion failed"); }
        finally { setConverting(false); }
    }

    return <main className="processingPage">
        <aside className="processingFolders"><h2>Folders</h2>{folders.map(folder => <button type="button" className={folder.id === selectedId ? "processingFolder selected" : "processingFolder"} onClick={() => setSelectedId(folder.id)} key={folder.id}><FolderOpen size={17}/><span><strong>{folder.name}</strong></span></button>)}<label>File type<select value={type} onChange={event => setType(event.target.value)}>{types.map(item => <option key={item}>{item}</option>)}</select></label></aside>
        <section className="processingFiles"><section className="processingFolderFiles"><h2>{selected?.name ?? "Folder files"}</h2><div className="processingFileList">{shown.map(file => <div className="processingFile" key={file.path}><button type="button" title="Send to Fire Mountain" onClick={() => window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail:[file]}))}><Flame size={16}/></button><span className="processingFileName"><FileKindIcon name={file.name}/>{file.name}</span><span className="processingFileActions"><button type="button" title="Open file" onClick={() => void fetch(`${API_BASE_URL}/search-files/open`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({path:file.path})})}><ExternalLink size={15}/></button><button type="button" title="Prepare conversion" onClick={() => addToQueue(file)}><ArrowRight size={16}/></button></span></div>)}{selected && !shown.length && <p>No files of the selected type.</p>}</div></section><section className="convertedFiles"><h2>Converted files</h2><div className="processingFileList">{converted.length ? converted.map(file => <div className="processingFile convertedFile" key={file.path}><span className="processingFileName"><FileKindIcon name={file.name}/>{file.name}</span><button type="button" title="Open converted file" onClick={() => void fetch(`${API_BASE_URL}/search-files/open`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({path:file.path})})}><ExternalLink size={15}/></button></div>) : <p>Converted files will appear here.</p>}</div></section></section>
        <aside className="conversionStack"><section className="conversionPanel"><h2>Local conversion</h2><p className="localConversionNote">Runs on this PC. No AI or file upload is used.</p><label className="formatSelect"><FormatIcon format={format}/><select value={format} onChange={event => setFormat(event.target.value)}><option>PDF</option><option>TXT</option><option>CSV</option><option>XLSX</option></select></label><div className="conversionQueue">{queue.length ? queue.map(file => <div key={file.path}><span>{file.name}</span><button type="button" title="Remove from conversion queue" onClick={() => setQueue(current => current.filter(item => item.path !== file.path))} disabled={converting}><X size={13}/></button></div>) : <p>Use the arrow beside a file.</p>}</div>{queue.length > 0 && <button className="clearConversionQueue" type="button" onClick={() => setQueue([])} disabled={converting}>Clear list</button>}<button type="button" className={converting ? "convertButton converting" : "convertButton"} disabled={!queue.length || converting} onClick={() => void convert()} title="Convert"><RotateCw className={converting ? "spin" : ""} size={23}/></button>{converting && <p className="conversionProgress">Converting files…</p>}<p className="conversionCount">{queue.length ? `${queue.length} file${queue.length === 1 ? "" : "s"} ready to convert` : "No files waiting for conversion"}</p>{status && <p className="conversionCount">{status}</p>}{converted.length > 0 && <button className="sendConvertedButton" type="button" onClick={() => window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail: converted}))}>Send converted files to Fire Mountain</button>}</section><FireMountain /></aside>
    </main>;
}
