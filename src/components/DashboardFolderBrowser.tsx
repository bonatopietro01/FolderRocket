import {ChevronLeft, ChevronRight, Home} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {API_BASE_URL} from "../api";
import FileDropZone from "./FileDropZone";

interface Entry {
    name: string;
    path: string;
}

interface Contents {
    files: Entry[];
    folders: Entry[];
}

interface Props {
    initialPath: string;
    initialName: string;
    onHome: () => void;
    sourceFolderPaths?: string[];
    storageScope?: string;
    aiEnabled?: boolean;
}

async function readFolder(path: string): Promise<Contents | null> {
    const response = await fetch(`${API_BASE_URL}/list-folder-files`, {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({folder: path})
    });
    const data = await response.json().catch(() => ({})) as Partial<Contents>;
    if (!response.ok) return null;
    return {
        files: Array.isArray(data.files) ? data.files : [],
        folders: Array.isArray(data.folders) ? data.folders : []
    };
}

export default function DashboardFolderBrowser({
    initialPath,
    initialName,
    onHome,
    sourceFolderPaths = [],
    storageScope = "",
    aiEnabled = false
}: Props) {
    const [history, setHistory] = useState([{path: initialPath, name: initialName}]);
    const [index, setIndex] = useState(0);
    const [contents, setContents] = useState<Contents>({files: [], folders: []});
    const [loading, setLoading] = useState(true);
    const [verified, setVerified] = useState(false);
    const hoverTimer = useRef<number | null>(null);
    const onHomeRef = useRef(onHome);
    const current = history[index];
    const availableSourceFolderPaths = sourceFolderPaths.length ? sourceFolderPaths : [initialPath];

    useEffect(() => { onHomeRef.current = onHome; }, [onHome]);

    useEffect(() => {
        let active = true;
        void readFolder(current.path).then(data => {
            if (!active) return;
            if (data) {
                setContents(data);
                if (index === 0 && data.folders.length === 0) onHomeRef.current();
                else setVerified(true);
            }
            setLoading(false);
        });
        return () => { active = false; };
    }, [current.path, index]);

    function cancelHover() {
        if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
    }

    async function openIfNested(entry: Entry) {
        cancelHover();
        const data = await readFolder(entry.path);
        if (!data?.folders.length) return;
        setHistory(previous => [...previous.slice(0, index + 1), {path: entry.path, name: entry.name}]);
        setIndex(value => value + 1);
        setContents(data);
    }

    function startHover(entry: Entry, event: React.DragEvent) {
        event.preventDefault();
        if (hoverTimer.current !== null) return;
        hoverTimer.current = window.setTimeout(() => {
            hoverTimer.current = null;
            void openIfNested(entry);
        }, 2000);
    }

    if (!verified) return null;

    return <div className="dashboardFolderBrowser">
        <header>
            <button type="button" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={index === 0} title="Previous folder"><ChevronLeft/></button>
            <button type="button" onClick={() => setIndex(value => Math.min(history.length - 1, value + 1))} disabled={index === history.length - 1} title="Next folder"><ChevronRight/></button>
            <button type="button" onClick={onHome} title="Dashboard folders"><Home/></button>
            <div><strong>{current.name}</strong><small>{current.path}</small></div>
        </header>
        <section className="dashboardFolderGrid">
            {contents.folders.map(folder => <div
                className="dashboardSubfolderBlock"
                key={folder.path}
                onDragEnterCapture={event => startHover(folder, event)}
                onDragOverCapture={event => event.preventDefault()}
                onDragLeave={event => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) cancelHover();
                }}
                onDropCapture={cancelHover}
            >
                <FileDropZone
                    id={`dashboard-subfolder:${folder.path}`}
                    name={folder.name}
                    pathValue={folder.path}
                    hidePath
                    onClick={() => void openIfNested(folder)}
                    sourceFolderPaths={availableSourceFolderPaths}
                    storageScope={storageScope || "dashboard-browser"}
                    aiEnabled={aiEnabled}
                />
            </div>)}
            {loading ? <p className="dashboardFolderStatus">Loading subfolders…</p> : null}
        </section>
    </div>;
}
