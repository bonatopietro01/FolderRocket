import {File, FolderClosed, RefreshCw, Usb} from "lucide-react";
import {useEffect, useState} from "react";
import {API_BASE_URL} from "../api";
import {SEARCH_RESULT_TYPE} from "./SearchWorkspace";

interface UsbDrive { id: string; path: string; label: string; size: number; freeSpace: number; }
interface UsbFile { name: string; path: string; size: number; createdAt: string; }
interface UsbFolder { name: string; path: string; }

function formatSize(size: number) { return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`; }

export default function UsbSourcePanel() {
    const [drives, setDrives] = useState<UsbDrive[]>([]);
    const [selectedPath, setSelectedPath] = useState("");
    const [files, setFiles] = useState<UsbFile[]>([]);
    const [folders, setFolders] = useState<UsbFolder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function readDrive(path: string) {
        if (!path) { setFiles([]); setFolders([]); return; }
        setLoading(true); setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/devices/removable/files`, {method: "POST", credentials: "include", headers: {"Content-Type": "application/json"}, body: JSON.stringify({drive: path})});
            const data = await response.json().catch(() => ({})) as {files?: UsbFile[]; folders?: UsbFolder[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to read this USB drive.");
            setFiles(Array.isArray(data.files) ? data.files : []);
            setFolders(Array.isArray(data.folders) ? data.folders : []);
        } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to read this USB drive."); }
        finally { setLoading(false); }
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
        <div className="sourceHeader"><Usb className="usbPanelIcon" size={27}/><span className="sourceTitle">USB drives</span><button type="button" className="usbRefresh" onClick={() => void refresh()} disabled={loading} title="Refresh USB drives"><RefreshCw className={loading ? "spin" : ""} size={14}/></button></div>
        <div className="usbToolbar"><select value={selectedPath} onChange={event => { const next = event.target.value; setSelectedPath(next); void readDrive(next); }} disabled={!drives.length} aria-label="Connected USB drive"><option value="">{drives.length ? "Choose a USB drive" : "No USB drive connected"}</option>{drives.map(drive => <option key={drive.path} value={drive.path}>{drive.id} · {drive.label}</option>)}</select></div>
        {error && <p className="usbError">{error}</p>}
        <div className="usbFileList">{folders.map(folder => <div className="usbFolder" key={folder.path}><FolderClosed size={14}/><span>{folder.name}</span></div>)}{files.map(file => <div className="usbFile" draggable onDragStart={event => dragFile(event, file)} key={file.path} title="Drag this file to a FolderRocket folder or Cargo Ship"><File size={14}/><span>{file.name}</span><small>{formatSize(file.size)}</small></div>)}{!loading && selectedPath && !files.length && !folders.length && <p>This USB drive is empty.</p>}{!selectedPath && !loading && <p>Connect a USB drive, then refresh.</p>}</div>
        <small className="usbNote">Only removable USB drives are shown. Drag a listed file into a FolderRocket folder or Cargo Ship.</small>
    </section>;
}
