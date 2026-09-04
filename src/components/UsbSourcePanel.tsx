import {additionalFileIcon} from './AdditionalFileIcons';
import {Archive, ChevronDown, ChevronRight, ExternalLink, File, FileSpreadsheet, FileText, Film, Flame, FolderClosed, FolderOpen, Image, Music, RefreshCw, Usb} from "lucide-react";
import {useEffect, useEffectEvent, useRef, useState} from "react";
import {API_BASE_URL} from "../api";
import {SEARCH_RESULT_TYPE} from "./SearchWorkspace";

export interface UsbDrive { id: string; path: string; label: string; size: number; freeSpace: number; }
interface UsbFile { name: string; path: string; size: number; createdAt: string; }
interface UsbFolder { name: string; path: string; }
interface UsbSourcePanelProps { onUseDrive?: (drive: UsbDrive) => void; driveStatus?: {drives:UsbDrive[] | null; error:string; refresh:() => Promise<UsbDrive[] | undefined>}; }

function formatSize(size: number) { return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }
export function UsbFileIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, 14);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={14}/></span>;
    if (["doc", "docx", "odt", "txt", "rtf", "md"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14}/></span>;
    if (["xls", "xlsx", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={14}/></span>;
    if (extension === "csv") return <span className="fileKindIcon csv"><FileSpreadsheet size={14}/></span>;
    if (["mp3","wav","m4a","flac","aac","ogg"].includes(extension)) return <span className="fileKindIcon audio"><Music size={14}/></span>;
    if (["mp4","mov","avi","mkv","webm","wmv","m4v"].includes(extension)) return <span className="fileKindIcon video"><Film size={14}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={14}/></span>;
    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14}/></span>;
    return <span className="fileKindIcon generic"><File size={14}/></span>;
}
export default function UsbSourcePanel({onUseDrive, driveStatus}: UsbSourcePanelProps) {
    const readVersion = useRef(0);
    const [drives, setDrives] = useState<UsbDrive[]>([]);
    const [selectedPath, setSelectedPath] = useState("");
    const [files, setFiles] = useState<UsbFile[]>([]);
    const [folders, setFolders] = useState<UsbFolder[]>([]);
    const [currentPath, setCurrentPath] = useState("");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
    const [folderContents, setFolderContents] = useState<Record<string, {files: UsbFile[]; folders: UsbFolder[]}>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fileType, setFileType] = useState("all");
    const [typeCounts, setTypeCounts] = useState<Array<[string,number]>>([]);
    const [selectedFiles,setSelectedFiles]=useState<string[]>([]);
    const knownFileCount = typeCounts.reduce((sum,[,count])=>sum+count,0);
    const visible = (file:UsbFile) => fileType === "all" || file.name.split(".").pop()?.toLowerCase() === fileType;

    async function readDrive(path: string) {
        const version = ++readVersion.current;
        setFiles([]); setFolders([]); setCurrentPath(""); setExpandedFolders(new Set()); setFolderContents({}); setTypeCounts([]); setFileType("all");
        if (!path) { setLoading(false); setError(""); return; }
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable/files`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({drive: path})});
            const data = await response.json().catch(() => ({})) as {currentPath?: string; files?: UsbFile[]; folders?: UsbFolder[]; message?: string};
            if (version !== readVersion.current) return;
            if (!response.ok) throw new Error(data.message || "Unable to read this USB drive.");
            setCurrentPath(data.currentPath || path);
            setFiles(Array.isArray(data.files) ? data.files : []);
            setFolders(Array.isArray(data.folders) ? data.folders : []);
            const inventoryResponse=await fetch(`${API_BASE_URL}/file-types/inventory`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({folders:[path]})});
            const inventory=await inventoryResponse.json().catch(()=>({})) as {types?:Array<{type:string;count:number}>}; if(version === readVersion.current && inventoryResponse.ok)setTypeCounts((inventory.types||[]).map(item=>[item.type,item.count]));
        } catch (reason) { if (version === readVersion.current) setError(reason instanceof Error ? reason.message : "Unable to read this USB drive."); }
        finally { if (version === readVersion.current) setLoading(false); }
    }

    async function toggleFolder(folder: UsbFolder) {
        const version = readVersion.current;
        if (expandedFolders.has(folder.path)) { setExpandedFolders(current => { const next = new Set(current); next.delete(folder.path); return next; }); return; }
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable/files`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({drive: folder.path})});
            const data = await response.json().catch(() => ({})) as {files?: UsbFile[]; folders?: UsbFolder[]; message?: string};
            if (version !== readVersion.current) return;
            if (!response.ok) throw new Error(data.message || "Unable to open this USB folder.");
            setFolderContents(current => ({...current, [folder.path]: {files: data.files ?? [], folders: data.folders ?? []}}));
            setExpandedFolders(current => new Set(current).add(folder.path));
        } catch (reason) { if (version === readVersion.current) setError(reason instanceof Error ? reason.message : "Unable to open this USB folder."); }
        finally { if (version === readVersion.current) setLoading(false); }
    }

    function renderFolder(folder: UsbFolder, depth = 0): React.ReactNode {
        const expanded = expandedFolders.has(folder.path);
        const contents = folderContents[folder.path];
        return <div className="folderTreeBranch usbTreeBranch" key={folder.path} style={{"--folder-depth": depth} as React.CSSProperties}>
            <div className="folderTreeDirectory usbTreeDirectory">
                <button type="button" className="directoryToggle" onClick={() => void toggleFolder(folder)} title={`${expanded ? "Close" : "Open"} ${folder.name}`}>{expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
                <span className="directoryDestinationToggle usbDirectoryIcon">{expanded ? <FolderOpen size={15}/> : <FolderClosed size={15}/>}</span>
                <button type="button" className="directoryDestinationName" onClick={() => void toggleFolder(folder)}>{folder.name}</button>
            </div>
            {expanded && <div className="folderTreeChildren usbTreeChildren">
                {contents?.files.filter(visible).map(file => renderFile(file))}
                {contents?.folders.map(child => renderFolder(child, depth + 1))}
                {contents && !contents.files.some(visible) && !contents.folders.length && <p>This folder has no matching files.</p>}
            </div>}
        </div>;
    }

    async function applyDrives(next: UsbDrive[], reloadFiles = false) {
        setDrives(next);
        const nextPath = next.some(item => item.path === selectedPath) ? selectedPath : next[0]?.path || "";
        setSelectedPath(nextPath);
        if (reloadFiles || nextPath !== selectedPath) {
            const selectedDrive = next.find(item => item.path === nextPath);
            if (selectedDrive) onUseDrive?.(selectedDrive);
            await readDrive(nextPath);
        }
    }

    async function refresh() {
        if (driveStatus) {
            const next = await driveStatus.refresh();
            if (next) await applyDrives(next, true);
            return;
        }
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable`, {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {drives?: UsbDrive[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to check USB drives.");
            if (!Array.isArray(data.drives)) throw new Error("Invalid USB drive list.");
            await applyDrives(data.drives, true);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to check USB drives."); }
        finally { setLoading(false); }
    }

    const synchronizeDrives = useEffectEvent((next: UsbDrive[]) => { void applyDrives(next); });
    useEffect(() => {
        let active = true;
        queueMicrotask(() => { if (active && driveStatus?.drives) synchronizeDrives(driveStatus.drives); });
        return () => { active = false; };
    }, [driveStatus?.drives]);
    const refreshStandalone = useEffectEvent(() => { if (!driveStatus) void refresh(); });
    useEffect(() => {
        let active = true;
        const versionRef = readVersion;
        queueMicrotask(() => { if (active) refreshStandalone(); });
        return () => { active = false; versionRef.current++; };
    }, []);

    function dragFile(event: React.DragEvent<HTMLElement>, file: UsbFile) {
        event.dataTransfer.effectAllowed = "copy";
        const all=[...files,...Object.values(folderContents).flatMap(entry=>entry.files)];
        const value=JSON.stringify(selectedFiles.includes(file.path)?all.filter(item=>selectedFiles.includes(item.path)):[file]);
        event.dataTransfer.setData("application/x-folderrocket-daily-source", "usb");
        event.dataTransfer.setData(SEARCH_RESULT_TYPE, value);
        event.dataTransfer.setData("text/plain", `folderrocket-search:${value}`);
    }

    function renderFile(file: UsbFile) {
        return <div className={selectedFiles.includes(file.path)?"inspectorFile usbInspectorFile selectedAttachment":"inspectorFile usbInspectorFile"} draggable onClick={()=>setSelectedFiles(current=>current.includes(file.path)?current.filter(path=>path!==file.path):[...current,file.path])} onDragStart={event => dragFile(event, file)} key={file.path} title="Select or drag this file">
            <button className="recentFileFire" title="Add to Fire Mountain" onClick={event=>{event.stopPropagation();window.dispatchEvent(new CustomEvent('folderrocket-add-to-fire',{detail:[file]}));}}><Flame size={14}/></button>
            <span className="inspectorFileName"><UsbFileIcon name={file.name}/><strong>{file.name}</strong></span>
            <small>{formatSize(file.size)}</small>
            <button className="recentFileOpen" title="Open file" onClick={event=>{event.stopPropagation();void fetch(`${API_BASE_URL}/search-files/open`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:file.path})});}}><ExternalLink size={14}/></button>
        </div>;
    }

    return <section className="sourceCard usbSourceCard">
        <div className="sourceHeader usbSourceHeader"><Usb className="usbPanelIcon" size={27}/><span className="sourceTitle">USB drives</span><button type="button" className="usbRefresh" onClick={() => void refresh()} disabled={loading} title="Refresh USB drives"><RefreshCw className={loading ? "spin" : ""} size={14}/></button><select className="usbTypeSelect" value={fileType} onChange={event=>setFileType(event.target.value)} aria-label="Filter USB files by type"><option value="all">All ({knownFileCount})</option>{typeCounts.map(([type,count])=><option key={type} value={type}>{type.toUpperCase()} ({count})</option>)}</select><select className="usbHeaderSelect" value={selectedPath} onChange={event => { const next = event.target.value; setSelectedPath(next); setFileType("all"); const selectedDrive = drives.find(drive => drive.path === next); if (selectedDrive) onUseDrive?.(selectedDrive); void readDrive(next); }} disabled={!drives.length} aria-label="Connected USB drive"><option value="">{drives.length ? "Choose a USB drive" : "No USB drive connected"}</option>{drives.map(drive => <option key={drive.path} value={drive.path}>{drive.id} · {drive.label}</option>)}</select></div>
        {(error || driveStatus?.error) && <p className="usbError">{error || driveStatus?.error}</p>}
        {!!selectedFiles.length&&<div className="emailToolbar recentSelectionToolbar"><button onClick={()=>setSelectedFiles([])}>Deselect all</button><button onClick={()=>void Promise.all([...files,...Object.values(folderContents).flatMap(entry=>entry.files)].filter(file=>selectedFiles.includes(file.path)).map(file=>fetch(`${API_BASE_URL}/search-files/open`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:file.path})})))}>Open files</button><button className="recentBatchFire" onClick={()=>window.dispatchEvent(new CustomEvent('folderrocket-add-to-fire',{detail:[...files,...Object.values(folderContents).flatMap(entry=>entry.files)].filter(file=>selectedFiles.includes(file.path))}))}><Flame size={12}/>Fire Mountain</button></div>}<div className="usbFileList folderTreeRoot">{currentPath && <div className="usbPathBar"><span title={currentPath}>{currentPath}</span></div>}{files.filter(visible).map(file => renderFile(file))}{folders.map(folder => renderFolder(folder))}{!loading && selectedPath && !files.some(visible) && !folders.length && <p>No matching files.</p>}{!selectedPath && !loading && <p>Connect a USB drive, then refresh.</p>}</div>
        <small className="usbNote">Only removable USB drives are shown. Drag a listed file into a FolderRocket folder or CargoRocket.</small>
    </section>;
}
