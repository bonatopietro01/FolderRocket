import {Download, ExternalLink, FileDown, Globe2, LoaderCircle, RefreshCw, Search, X} from "lucide-react";
import {useEffect, useState} from "react";
import {API_BASE_URL} from "../api";
import {recordDailyActivity} from "../dailyActivity";

function normalizeHttpUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
        const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
        return "";
    }
}

interface DomainSourcePanelProps {
    title?: string;
    url?: string;
    onUrlChange: (url: string) => void;
    aiEnabled?: boolean;
}

interface DomainDownload {
    url: string;
    name: string;
    label: string;
}

export default function DomainSourcePanel({title = "Domain", url = "", onUrlChange, aiEnabled = false}: DomainSourcePanelProps) {
    const [draft, setDraft] = useState(url);
    const [loadedUrl, setLoadedUrl] = useState(url);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [analysis, setAnalysis] = useState("");
    const [analysisError, setAnalysisError] = useState("");
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [downloads, setDownloads] = useState<DomainDownload[]>([]);
    const [downloadsUrl, setDownloadsUrl] = useState("");
    const [showDownloads, setShowDownloads] = useState(false);
    const [downloadsLoading, setDownloadsLoading] = useState(false);
    const [downloadsError, setDownloadsError] = useState("");
    const [savingDownloadUrl, setSavingDownloadUrl] = useState("");
    const [preview,setPreview]=useState<{title:string;text:string}|null>(null);
    const [previewLoading,setPreviewLoading]=useState(false),[previewError,setPreviewError]=useState("");

    useEffect(() => {
        const closeDownloads = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest(".domainDownloadsWrap")) setShowDownloads(false);
        };
        document.addEventListener("pointerdown", closeDownloads);
        return () => document.removeEventListener("pointerdown", closeDownloads);
    }, []);

    async function loadPreview(address:string) {
        setPreviewLoading(true);setPreviewError("");setPreview(null);
        try {const response=await fetch(`${API_BASE_URL}/domain/preview`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:address})});const data=await response.json().catch(()=>({})) as {title?:string;text?:string;message?:string};if(!response.ok)throw new Error(data.message||"Unable to read this page.");setPreview({title:data.title||new URL(address).hostname,text:data.text||""});}
        catch(reason){setPreviewError(reason instanceof Error?reason.message:"Unable to read this page.");}
        finally{setPreviewLoading(false);}
    }

    useEffect(()=>{let active=true;queueMicrotask(()=>{if(active&&loadedUrl)void loadPreview(loadedUrl);});return()=>{active=false;};},[loadedUrl]);

    function loadDomain() {
        const normalized = normalizeHttpUrl(draft);
        if (!normalized) {
            setError("Enter a valid http or https address.");
            return;
        }
        setError("");
        setDraft(normalized);
        setLoadedUrl(normalized);
        setAnalysis("");
        setAnalysisError("");
        setDownloads([]);
        setDownloadsUrl("");
        setShowDownloads(false);
        setDownloadsError("");
        onUrlChange(normalized);
        recordDailyActivity({kind:"domain",summary:`Viewed ${new URL(normalized).hostname}`,destination:normalized});
    }

    function openOutside() {
        const normalized = normalizeHttpUrl(draft || loadedUrl);
        if (!normalized) { setError("Enter a valid address first."); return; }
        onUrlChange(normalized);
        window.open(normalized, "_blank", "noopener,noreferrer");
    }

    async function analyseDomain() {
        if (!loadedUrl) return;
        setAnalysisError("");
        const confirmed = window.confirm("FolderRocket will retrieve the readable public text of this page and send that text to OpenAI for this analysis. It may use API credit. Continue?");
        if (!confirmed) return;

        setIsAnalysing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/domain/analyze`, {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({url: loadedUrl, query})
            });
            const data = await response.json().catch(() => ({})) as {analysis?: string; message?: string};
            if (!response.ok) throw new Error(data.message || "Domain analysis failed.");
            setAnalysis(data.analysis || "No readable text was found in this domain.");
        } catch (analysisFailure) {
            setAnalysisError(analysisFailure instanceof Error ? analysisFailure.message : "Domain analysis failed.");
        } finally {
            setIsAnalysing(false);
        }
    }

    function clearAnalysis() {
        if (isAnalysing) return;
        setQuery("");
        setAnalysis("");
        setAnalysisError("");
    }

    async function showDomainDownloads() {
        if (!loadedUrl) return;
        const willOpen = !showDownloads;
        setShowDownloads(willOpen);
        if (!willOpen || (downloadsUrl === loadedUrl && !downloadsError)) return;

        setDownloadsLoading(true);
        setDownloadsError("");
        try {
            const response = await fetch(`${API_BASE_URL}/domain/downloads`, {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({url: loadedUrl})
            });
            const data = await response.json().catch(() => ({})) as {downloads?: DomainDownload[]; message?: string};
            if (!response.ok) throw new Error(data.message || "Unable to inspect downloadable files.");
            setDownloads(Array.isArray(data.downloads) ? data.downloads : []);
            setDownloadsUrl(loadedUrl);
        } catch (downloadFailure) {
            setDownloads([]);
            setDownloadsError(downloadFailure instanceof Error ? downloadFailure.message : "Unable to inspect downloadable files.");
        } finally {
            setDownloadsLoading(false);
        }
    }

    async function saveDomainDownload(item: DomainDownload) {
        if (!loadedUrl) return;
        setDownloadsError("");
        setSavingDownloadUrl(item.url);
        try {
            const response = await fetch(`${API_BASE_URL}/domain/download`, {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({pageUrl: loadedUrl, fileUrl: item.url})
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({})) as {message?: string};
                throw new Error(data.message || `Unable to download ${item.name}.`);
            }
            const headerName = response.headers.get("X-FolderRocket-Filename");
            const suggestedName = headerName ? decodeURIComponent(headerName) : item.name;
            const content = await response.blob();
            if (window.folderRocketDesktop?.saveDownload) {
                const result = await window.folderRocketDesktop.saveDownload({suggestedName, bytes: new Uint8Array(await content.arrayBuffer())});
                if (!result.saved && !result.canceled) throw new Error(result.message || "Unable to save this file.");
                if(result.saved)recordDailyActivity({kind:"domain",summary:`Downloaded ${suggestedName}`,files:[suggestedName],destination:result.path});
            } else {
                const temporaryUrl = URL.createObjectURL(content);
                const link = document.createElement("a");
                link.href = temporaryUrl;
                link.download = suggestedName;
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(temporaryUrl), 1_000);
            }
        } catch (downloadFailure) {
            setDownloadsError(downloadFailure instanceof Error ? downloadFailure.message : `Unable to download ${item.name}.`);
        } finally {
            setSavingDownloadUrl("");
        }
    }

    function downloadAnalysis() {
        if (!analysis) return;
        const file = new Blob([analysis], {type: "text/plain;charset=utf-8"});
        const downloadUrl = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "folderrocket-domain-analysis.txt";
        link.click();
        URL.revokeObjectURL(downloadUrl);
    }

    return <section className="sourceCard domainSourceCard">
        <div className="sourceHeader domainCompactHeader">
            <span className="domainHeading"><Globe2 className="domainPanelIcon" size={15} /><span className="sourceTitle">{title}</span></span>
            <div className="domainHeaderControls">
                <span className="domainAddressInput"><input value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") loadDomain(); }} placeholder="https://example.com" aria-label="Domain address" /><button type="button" onClick={loadDomain} title="Refresh this block" aria-label="Refresh this block"><RefreshCw size={13} /></button></span>
                <button type="button" className="domainOpenButton" onClick={openOutside} title="Open in a new tab"><ExternalLink size={15} /></button>
            </div>
        </div>
        {error && <p className="domainError">{error}</p>}
        {loadedUrl ? <>
            <div className="domainFrameWrap"><div className="domainZoomViewport"><iframe key={loadedUrl} src={loadedUrl} title={`Embedded ${title}`} />{(previewLoading||preview||previewError)&&<aside className="domainReadablePreview"><header><strong>{previewLoading?"Reading public page…":preview?.title||"Page preview"}</strong>{previewLoading&&<LoaderCircle className="spinning" size={13}/>}</header>{preview&&<p>{preview.text}</p>}{previewError&&<p className="error">{previewError}</p>}</aside>}</div><p className="domainEmbedHelp">If the website blocks embedded pages, use the readable preview or ↗ to open it externally.</p></div>
            <div className="domainAiPanel domainUtilityPanel">
                <div className="domainAiControls">
                    <span className="domainDownloadsWrap">
                        <button type="button" className={showDownloads ? "domainDownloadsToggle active" : "domainDownloadsToggle"} onClick={() => void showDomainDownloads()} disabled={downloadsLoading} title="Find direct files and installable packages on this public page" aria-label="Find direct files and installable packages"><span>{downloadsLoading ? <LoaderCircle className="spinning" size={14} /> : <FileDown size={14} />}</span></button>
                        {showDownloads && <div className="domainDownloadsMenu">
                            <header><strong>Direct files &amp; packages</strong><button type="button" onClick={() => setShowDownloads(false)} title="Close"><X size={13} /></button></header>
                            {downloadsLoading ? <p>Checking direct file links…</p> : downloadsError ? <p className="error">{downloadsError}</p> : downloads.length ? <div>{downloads.map(item => <button type="button" key={item.url} className="domainDownloadItem" onClick={() => void saveDomainDownload(item)} disabled={Boolean(savingDownloadUrl)} title={`Save ${item.name}`}><FileDown size={13} /><span><strong>{item.name}</strong>{item.label !== item.name && <small>{item.label}</small>}</span>{savingDownloadUrl === item.url && <LoaderCircle className="spinning" size={13} />}</button>)}</div> : <p>No direct file, folder package, or archive link was found on this page.</p>}
                        </div>}
                    </span>
                    {aiEnabled && <>
                        <input value={query} maxLength={360} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void analyseDomain(); }} placeholder="Ask AI about this page…" aria-label="Ask AI about this domain" />
                        <button type="button" onClick={() => void analyseDomain()} disabled={isAnalysing} title="Read public page text and analyse"><span>{isAnalysing ? <LoaderCircle className="spinning" size={14} /> : <Search size={14} />}</span>{isAnalysing ? "Analysing..." : "Analyse"}</button>
                        <button type="button" className="domainAiClear" onClick={clearAnalysis} disabled={isAnalysing || (!query && !analysis && !analysisError)} title="Clear question and result" aria-label="Clear question and result"><X size={14} /></button>
                    </>}
                </div>
                {(analysis || analysisError) && <div className={analysisError ? "domainAiResult error" : "domainAiResult"}>{analysisError || analysis}{analysis && <button type="button" onClick={downloadAnalysis} title="Download result as text file"><Download size={14} />Download .txt</button>}</div>}
            </div>
        </> : <div className="domainEmpty"><Globe2 size={24} /><p>Add a page address to open it inside this block.</p></div>}
    </section>;
}
