import {additionalFileIcon} from './AdditionalFileIcons';
import { useEffect, useState } from "react";
import { Archive, File, FileSpreadsheet, FileText, Flame, Image, Send, Search, ExternalLink, ListChecks, X } from "lucide-react";
import { API_BASE_URL } from "../api";

interface FolderSource { name: string; path: string; }
interface Props { folders: FolderSource[]; selectedFolderCount: number; onToggleFolders?: () => void; automaticFolders?: boolean; aiEnabled: boolean; compact?: boolean; onResultsChange?: (hasResults: boolean) => void; }
interface Result { name: string; path: string; matches: string[]; size?: number; }
export const SEARCH_RESULT_TYPE = "application/x-folderrocket-search-results";

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, 14);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={14} /></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={14} /></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={14} /></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt"><FileText size={14} /></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={14} /></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={14} /></span>;
    return <span className="fileKindIcon generic"><File size={14} /></span>;
}

function formatSize(bytes?: number) {
    if (bytes === undefined) return "";
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SearchWorkspace({folders, selectedFolderCount, onToggleFolders, automaticFolders = false, aiEnabled, compact = false, onResultsChange}: Props) {
    const [query, setQuery] = useState("");
    const [messages, setMessages] = useState<string[]>([]);
    const [results, setResults] = useState<Result[]>([]);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [firePaths, setFirePaths] = useState<string[]>([]);

    useEffect(() => {
        const dismissWhenOutside = (event: MouseEvent) => {
            if (!(event.target as Element).closest(".searchResultsCard")) setSelectedPaths([]);
        };
        document.addEventListener("pointerdown", dismissWhenOutside);
        return () => document.removeEventListener("pointerdown", dismissWhenOutside);
    }, []);

    useEffect(() => {
        const updateFirePaths = (event: Event) => setFirePaths((event as CustomEvent<string[]>).detail ?? []);
        window.addEventListener("folderrocket-fire-paths", updateFirePaths);
        return () => window.removeEventListener("folderrocket-fire-paths", updateFirePaths);
    }, []);

    useEffect(() => {
        onResultsChange?.(results.length > 0);
        // The parent only needs to know when the result set itself changes;
        // its inline callback intentionally must not re-run this effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results.length]);

    useEffect(() => {
        const updateMovedPaths = (event: Event) => {
            const detail = (event as CustomEvent<{sourcePaths?: string[]; moved?: Array<{path: string}>}>).detail;
            const sourcePaths = detail?.sourcePaths ?? [];
            const moved = detail?.moved ?? [];
            if (!sourcePaths.length || !moved.length) return;
            setResults(current => current.map(result => {
                const index = sourcePaths.indexOf(result.path);
                return index >= 0 && moved[index]?.path ? {...result, path: moved[index].path} : result;
            }));
            setSelectedPaths(current => current.map(selected => {
                const index = sourcePaths.indexOf(selected);
                return index >= 0 && moved[index]?.path ? moved[index].path : selected;
            }));
        };
        window.addEventListener("folderrocket-files-moved", updateMovedPaths);
        return () => window.removeEventListener("folderrocket-files-moved", updateMovedPaths);
    }, []);

    async function search() {
        const text = query.trim();
        if (!text) return;
        if (!folders.length) {
            setResults([]);
            setMessages(["Select at least one folder by pressing its dashed border."]);
            return;
        }
        setLoading(true);
        setMessages([text]);
        try {
            const response = await fetch(`${API_BASE_URL}/search-files`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({query: text, folders: folders.map(folder => folder.path), ai: aiEnabled})});
            const data = await response.json() as {results?: Result[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? "Ricerca non riuscita");
            const found = data.results ?? [];
            setResults(found);
            setMessages([`"${text.charAt(0).toUpperCase()}${text.slice(1)}": ${found.length} file`]);
        } catch (error) {
            setMessages([`${text.charAt(0).toUpperCase()}${text.slice(1)}: ${error instanceof Error ? error.message : "errore di ricerca"}`]);
        } finally { setLoading(false); setQuery(""); }
    }

    async function openSelectedFiles() {
        await Promise.all(selectedPaths.map(path => fetch(`${API_BASE_URL}/search-files/open`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path})})));
    }

    function toggleResultSelection(path: string) {
        const willSelect = !selectedPaths.includes(path);
        if (willSelect) window.dispatchEvent(new CustomEvent("folderrocket-remove-from-fire", {detail: [path]}));
        setSelectedPaths(current => current.includes(path) ? current.filter(item => item !== path) : [...current, path]);
    }

    function selectOrOpenResult(result: Result) { toggleResultSelection(result.path); }

    const searchHeader = <>
            <div className="resultsHeader"><Search size={compact ? 15 : 20} /><span>{compact ? aiEnabled ? "AI search" : "Search" : aiEnabled ? "AI Search Assistant" : "Search Assistant"}</span>{!automaticFolders && <button type="button" className={selectedFolderCount ? "searchFolderToggle selected" : "searchFolderToggle"} onClick={onToggleFolders} title={selectedFolderCount ? "Deselect all folders" : "Select all folders"}><ListChecks size={compact ? 14 : 17} /></button>}</div>
            <div className="searchMessages">{messages.length ? messages.map((message, index) => <p key={`${message}-${index}`}>{message}</p>) : <p>{selectedFolderCount ? aiEnabled ? `${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"} selected. AI mode is active.` : `${selectedFolderCount} folder${selectedFolderCount === 1 ? "" : "s"} selected for search.` : "Select one or more folder blocks to search."}</p>}</div>
            <div className="searchComposer"><span className="searchInputWrap"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void search(); }} placeholder={aiEnabled ? "Describe a file or its contents" : "Search names and file text"} /><button type="button" className="searchClearButton" title="Clear search" aria-label="Clear search" onClick={() => { setQuery(""); setResults([]); setMessages([]); setSelectedPaths([]); }}><X size={13} /></button></span><button type="button" className="searchSubmitButton" onClick={() => void search()} disabled={loading || !folders.length} title={folders.length ? "Search selected folders" : "Select a folder first"}><Send size={16} /></button></div>
    </>;

    return <section className={compact ? "searchResultsCard compactSearchWorkspace" : "searchResultsCard"}>
        {compact
            ? <header className="sourceHeader searchCompactHeader">{searchHeader}</header>
            : <section className="searchCard searchWorkspace">{searchHeader}</section>}
        <section className={results.length ? "resultsCard" : "resultsCard isEmptyResults"}>
            <div className="resultsBody">{results.length > 0 && <div className="searchSelectionActions"><button className="clearSelectionButton" type="button" disabled={!selectedPaths.length} onClick={() => setSelectedPaths([])}>Deselect all</button><button className="clearSelectionButton" type="button" disabled={!selectedPaths.length} onClick={() => { setResults(current => current.filter(result => !selectedPaths.includes(result.path))); setSelectedPaths([]); }}>Hide selected</button><button className="clearSelectionButton" type="button" disabled={!selectedPaths.length} onClick={() => void openSelectedFiles()}>Open files</button></div>}{results.length ? results.map(result => { const source = folders.find(folder => result.path.startsWith(folder.path)); const inFireMountain = firePaths.includes(result.path); const selected = selectedPaths.includes(result.path); return <div className={`${selected ? "searchResult selectedAttachment" : "searchResult"}${inFireMountain ? " inFireMountain" : ""}`} key={result.path} draggable onClick={() => void selectOrOpenResult(result)} onDragStart={event => { const dragged = selected ? results.filter(item => selectedPaths.includes(item.path)) : [result]; event.dataTransfer.effectAllowed = "copy"; const value = JSON.stringify(dragged); event.dataTransfer.setData(SEARCH_RESULT_TYPE, value); event.dataTransfer.setData("text/plain", `folderrocket-search:${value}`); }}><span className="searchResultName"><FileKindIcon name={result.name} /><strong>{result.name}</strong><em>{formatSize(result.size)}</em></span><span className="searchResultMeta"><small>{source?.name ?? "Unconfigured folder"}</small><button type="button" title="Open file" className={selected ? "resultOpenButton visible" : "resultOpenButton"} onClick={event => { event.stopPropagation(); void openSelectedFiles(); }}><ExternalLink size={13}/></button><button type="button" title={inFireMountain ? "Remove from Fire Mountain" : "Send to Fire Mountain"} onClick={event => { event.stopPropagation(); if (inFireMountain) window.dispatchEvent(new CustomEvent("folderrocket-remove-from-fire", {detail: [result.path]})); else window.dispatchEvent(new CustomEvent("folderrocket-add-to-fire", {detail: selected ? results.filter(item => selectedPaths.includes(item.path)) : [result]})); }}><Flame size={13} /></button></span></div>; }) : <p className="sourcePlaceholder">Files found will appear here.</p>}</div>
        </section>
    </section>;
}
