import {Archive, ChevronRight, File, FileSpreadsheet, FileText, FolderClosed, Image, RefreshCw, Usb} from "lucide-react";
import {useEffect, useState} from "react";
import {API_BASE_URL} from "../api";
import {SEARCH_RESULT_TYPE} from "./SearchWorkspace";

export interface UsbDrive { id: string; path: string; label: string; size: number; freeSpace: number; }
interface UsbFile { name: string; path: string; size: number; createdAt: string; }
interface UsbFolder { name: string; path: string; }
interface UsbSourcePanelProps { onUseDrive?: (drive: UsbDrive) => void; }

function formatSize(size: number) { return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }
function UsbFileIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={14}/></span>;
    if (["doc", "docx", "odt", "txt", "rtf", "md"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14}/></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={14}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={14}/></span>;
    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14}/></span>;
    return <span className="fileKindIcon generic"><File size={14}/></span>;
}
export default function UsbSourcePanel({onUseDrive}: UsbSourcePanelProps) {
    const [drives, setDrives] = useState<UsbDrive[]>([]);
    const [selectedPath, setSelectedPath] = useState("");
    const [files, setFiles] = useState<UsbFile[]>([]);
    const [folders, setFolders] = useState<UsbFolder[]>([]);
    const [currentPath, setCurrentPath] = useState("");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
    const [folderContents, setFolderContents] = useState<Record<string, {files: UsbFile[]; folders: UsbFolder[]}>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function readDrive(path: string) {
        if (!path) { setFiles([]); setFolders([]); return; }
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable/files`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({drive: path})});
            const data = await response.json().catch(() => ({})) as {currentPath?: string; files?: UsbFile[]; folders?: UsbFolder[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to read this USB drive.");
            setCurrentPath(data.currentPath || path);
            setFiles(Array.isArray(data.files) ? data.files : []);
            setFolders(Array.isArray(data.folders) ? data.folders : []);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to read this USB drive."); }
        finally { setLoading(false); }
    }

    async function toggleFolder(folder: UsbFolder) {
        if (expandedFolders.has(folder.path)) { setExpandedFolders(current => { const next = new Set(current); next.delete(folder.path); return next; }); return; }
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable/files`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({drive: folder.path})});
            const data = await response.json().catch(() => ({})) as {files?: UsbFile[]; folders?: UsbFolder[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to open this USB folder.");
            setFolderContents(current => ({...current, [folder.path]: {files: data.files ?? [], folders: data.folders ?? []}}));
            setExpandedFolders(current => new Set(current).add(folder.path));
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to open this USB folder."); }
        finally { setLoading(false); }
    }

    function renderFolder(folder: UsbFolder, depth = 0): React.ReactNode {
        const expanded = expandedFolders.has(folder.path);
        const contents = folderContents[folder.path];
        return <div className="usbTreeBranch" key={folder.path} style={{"--usb-depth": depth} as React.CSSProperties}><button type="button" className={expanded ? "usbFolder expanded" : "usbFolder"} onClick={() => void toggleFolder(folder)} title={`${expanded ? "Close" : "Open"} ${folder.name}`}><span className="usbFolderIcon"><FolderClosed size={16}/></span><span>{folder.name}</span><ChevronRight className="usbFolderChevron" size={14}/></button>{expanded && <div className="usbTreeChildren">{contents?.folders.map(child => renderFolder(child, depth + 1))}{contents?.files.map(file => <div className="usbFile" draggable onDragStart={event => dragFile(event, file)} key={file.path}><UsbFileIcon name={file.name}/><span>{file.name}</span><small>{formatSize(file.size)}</small></div>)}{contents && !contents.files.length && !contents.folders.length && <p>This folder is empty.</p>}</div>}</div>;
    }

    async function refresh() {
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable`, {credentials: "include"});
            const data = await response.json().catch(() => ({})) as {drives?: UsbDrive[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to check USB drives.");
            const next = Array.isArray(data.drives) ? data.drives : [];
            setDrives(next);
            const nextPath = next.some(item => item.path === selectedPath) ? selectedPath : next[0]?.path || "";
            setSelectedPath(nextPath);
            const selectedDrive = next.find(item => item.path === nextPath);
            if (selectedDrive) onUseDrive?.(selectedDrive);
            await readDrive(nextPath);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to check USB drives."); setDrives([]); setFiles([]); setFolders([]); }
        finally { setLoading(false); }
    }

    useEffect(() => { void refresh(); }, []);

    function dragFile(event: React.DragEvent<HTMLElement>, file: UsbFile) {
        event.dataTransfer.effectAllowed = "copy";
        const value = JSON.stringify([file]);
        event.dataTransfer.setData(SEARCH_RESULT_TYPE, value);
        event.dataTransfer.setData("text/plain", `folderrocket-search:${value}`);
    }

    return <section className="sourceCard usbSourceCard">
        <div className="sourceHeader usbSourceHeader"><Usb className="usbPanelIcon" size={27}/><span className="sourceTitle">USB drives</span><button type="button" className="usbRefresh" onClick={() => void refresh()} disabled={loading} title="Refresh USB drives"><RefreshCw className={loading ? "spin" : ""} size={14}/></button><select className="usbHeaderSelect" value={selectedPath} onChange={event => { const next = event.target.value; setSelectedPath(next); const selectedDrive = drives.find(drive => drive.path === next); if (selectedDrive) onUseDrive?.(selectedDrive); void readDrive(next); }} disabled={!drives.length} aria-label="Connected USB drive"><option value="">{drives.length ? "Choose a USB drive" : "No USB drive connected"}</option>{drives.map(drive => <option key={drive.path} value={drive.path}>{drive.id} · {drive.label}</option>)}</select></div>
        {error && <p className="usbError">{error}</p>}
        <div className="usbFileList">{currentPath && <div className="usbPathBar"><span title={currentPath}>{currentPath}</span></div>}{folders.map(folder => renderFolder(folder))}{files.map(file => <div className="usbFile" draggable onDragStart={event => dragFile(event, file)} key={file.path} title="Drag this file to a FolderRocket folder or Cargo Ship"><UsbFileIcon name={file.name}/><span>{file.name}</span><small>{formatSize(file.size)}</small></div>)}{!loading && selectedPath && !files.length && !folders.length && <p>This USB drive is empty.</p>}{!selectedPath && !loading && <p>Connect a USB drive, then refresh.</p>}</div>
        <small className="usbNote">Only removable USB drives are shown. Drag a listed file into a FolderRocket folder or Cargo Ship.</small>
    </section>;
}
