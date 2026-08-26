import {Download, ExternalLink, Globe2, LoaderCircle, RefreshCw, Search, X} from "lucide-react";
import {useEffect, useState} from "react";
import {API_BASE_URL} from "../api";

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

export default function DomainSourcePanel({title = "Domain", url = "", onUrlChange, aiEnabled = false}: DomainSourcePanelProps) {
    const [draft, setDraft] = useState(url);
    const [loadedUrl, setLoadedUrl] = useState(url);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [analysis, setAnalysis] = useState("");
    const [analysisError, setAnalysisError] = useState("");
    const [isAnalysing, setIsAnalysing] = useState(false);

    useEffect(() => { setDraft(url); setLoadedUrl(url); }, [url]);

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
        onUrlChange(normalized);
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
        <div className="sourceHeader">
            <Globe2 className="domainPanelIcon" size={27} />
            <span className="sourceTitle">{title}</span>
            {loadedUrl && <button type="button" className="domainOpenButton" onClick={openOutside} title="Open in a new tab"><ExternalLink size={15} /></button>}
        </div>
        <div className="domainToolbar">
            <input value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") loadDomain(); }} placeholder="https://example.com" aria-label="Domain address" />
            <button type="button" onClick={loadDomain} title="Open in this block"><RefreshCw size={15} />Open</button>
        </div>
        {error && <p className="domainError">{error}</p>}
        {loadedUrl ? <>
            <div className="domainFrameWrap"><div className="domainZoomViewport"><iframe key={loadedUrl} src={loadedUrl} title={`Embedded ${title}`} /></div><p className="domainEmbedHelp">If this area stays blank, the website blocks embedded pages. Use ↗ to open it externally.</p></div>
            {aiEnabled && <div className="domainAiPanel"><div className="domainAiControls"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void analyseDomain(); }} placeholder="Ask AI about this page..." aria-label="Ask AI about this domain" /><button type="button" onClick={() => void analyseDomain()} disabled={isAnalysing} title="Read public page text and analyse"><span>{isAnalysing ? <LoaderCircle className="spinning" size={14} /> : <Search size={14} />}</span>{isAnalysing ? "Analysing..." : "Analyse"}</button><button type="button" className="domainAiClear" onClick={clearAnalysis} disabled={isAnalysing || (!query && !analysis && !analysisError)} title="Clear question and result" aria-label="Clear question and result"><X size={14} /></button></div><p>Reads public page text directly; no screenshot is captured.</p>{(analysis || analysisError) && <div className={analysisError ? "domainAiResult error" : "domainAiResult"}>{analysisError || analysis}{analysis && <button type="button" onClick={downloadAnalysis} title="Download result as text file"><Download size={14} />Download .txt</button>}</div>}</div>}
        </> : <div className="domainEmpty"><Globe2 size={24} /><p>Add a page address to open it inside this block.</p></div>}
    </section>;
}
