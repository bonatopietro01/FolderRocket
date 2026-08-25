import {useEffect, useState, type DragEvent} from "react";
import {FilePlus2, FileText, MailPlus, Rocket, RotateCw, Send, SlidersHorizontal, Trash2, X} from "lucide-react";
import {API_BASE_URL} from "../api";
import {EMAIL_ATTACHMENT_TYPE} from "./GmailSourcePanel";
import {OUTLOOK_ATTACHMENT_TYPE} from "./OutlookSourcePanel";
import {SEARCH_RESULT_TYPE} from "./SearchWorkspace";

type CargoFile = {id: string; kind: "file"; file: File; name: string; size: number};
type CargoPath = {id: string; kind: "path"; name: string; path: string; size?: number};
type CargoAttachment = {id: string; kind: "attachment"; provider: "gmail" | "outlook"; name: string; size?: number; attachmentId: string; messageId: string; mimeType: string; sourceBlockId?: string};
type CargoItem = CargoFile | CargoPath | CargoAttachment;
type CargoMode = "transport" | "text" | "email" | "convert";

interface RemoteAttachment { attachmentId: string; messageId: string; mimeType: string; name: string; size?: number; sourceBlockId?: string; }
interface PathItem {name: string; path: string; size?: number}
interface EmailSource {provider: "gmail" | "outlook"; blockId: string; email: string; label: string}

function cargoId() { return crypto.randomUUID(); }
function formatSize(bytes?: number) { return !bytes ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function readPayload<T>(value: string): T[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }

export default function CargoShip({onOpenFileStudio, standalone = false}: {onOpenFileStudio: () => void; standalone?: boolean}) {
    const [mode, setMode] = useState<CargoMode>("transport");
    const [items, setItems] = useState<CargoItem[]>([]);
    const [dropActive, setDropActive] = useState(false);
    const [text, setText] = useState("");
    const [fileName, setFileName] = useState("FolderRocket note");
    const [textFormat, setTextFormat] = useState<"txt" | "pdf" | "docx">("txt");
    const [recipient, setRecipient] = useState("");
    const [emailSubject, setEmailSubject] = useState("FolderRocket note");
    const [emailSources, setEmailSources] = useState<EmailSource[]>([]);
    const [emailSourceKey, setEmailSourceKey] = useState("");
    const [convertFormat, setConvertFormat] = useState("pdf");
    const [working, setWorking] = useState(false);
    const [message, setMessage] = useState("");
    const [popupBlocked, setPopupBlocked] = useState(false);

    useEffect(() => {
        if (!standalone) return;
        let active = true;
        fetch(`${API_BASE_URL}/cargo-ship/email-sources`, {credentials: "include"})
            .then(response => response.ok ? response.json() : {sources: []})
            .then((data: {sources?: EmailSource[]}) => {
                if (!active) return;
                const sources = Array.isArray(data.sources) ? data.sources : [];
                setEmailSources(sources);
                setEmailSourceKey(current => current || (sources[0] ? `${sources[0].provider}:${sources[0].blockId}` : ""));
            })
            .catch(() => { if (active) setEmailSources([]); });
        return () => { active = false; };
    }, [standalone]);

    function launchPopup() {
        const url = new URL(window.location.href);
        url.searchParams.set("cargoShip", "1");
        const popup = window.open(url.toString(), "folderrocket-cargo-ship", "popup=yes,width=350,height=470,resizable=yes,scrollbars=yes");
        if (!popup) setPopupBlocked(true);
        else { popup.focus(); setPopupBlocked(false); }
    }

    function addItems(incoming: CargoItem[]) {
        if (!incoming.length) return;
        setItems(current => [...current, ...incoming.filter(item => !current.some(existing => {
            if (existing.kind === "path" && item.kind === "path") return existing.path === item.path;
            if (existing.kind === "attachment" && item.kind === "attachment") return existing.provider === item.provider && existing.messageId === item.messageId && existing.attachmentId === item.attachmentId;
            if (existing.kind === "file" && item.kind === "file") return existing.file.name === item.file.name && existing.file.size === item.file.size && existing.file.lastModified === item.file.lastModified;
            return false;
        }))]);
        setMessage(`${incoming.length} item${incoming.length === 1 ? "" : "s"} loaded aboard.`);
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        event.stopPropagation();
        setDropActive(false);
        const gmail = event.dataTransfer.getData(EMAIL_ATTACHMENT_TYPE);
        const outlook = event.dataTransfer.getData(OUTLOOK_ATTACHMENT_TYPE);
        const search = event.dataTransfer.getData(SEARCH_RESULT_TYPE);
        if (gmail || outlook) {
            const provider = gmail ? "gmail" : "outlook";
            const attachments = readPayload<RemoteAttachment>(gmail || outlook).filter(item => item && item.name && item.attachmentId && item.messageId);
            addItems(attachments.map(item => ({...item, id: cargoId(), kind: "attachment" as const, provider})));
            return;
        }
        if (search) {
            const paths = readPayload<PathItem>(search).filter(item => item && item.name && item.path);
            addItems(paths.map(item => ({...item, id: cargoId(), kind: "path" as const})));
            return;
        }
        const files = Array.from(event.dataTransfer.files);
        if (files.length) {
            addItems(files.map(file => ({id: cargoId(), kind: "file" as const, file, name: file.name, size: file.size})));
            return;
        }
        const droppedText = event.dataTransfer.getData("text/plain").trim();
        if (droppedText) {
            setMode("text");
            setText(current => current ? `${current}\n${droppedText}` : droppedText);
            setMessage("Text loaded aboard. Choose a file type below.");
        }
    }

    function handleItemDrag(event: DragEvent<HTMLDivElement>, item: CargoItem) {
        event.dataTransfer.effectAllowed = "copy";
        if (item.kind === "file") { event.dataTransfer.items.add(item.file); return; }
        if (item.kind === "path") {
            const value = JSON.stringify([{name: item.name, path: item.path, size: item.size}]);
            event.dataTransfer.setData(SEARCH_RESULT_TYPE, value);
            event.dataTransfer.setData("text/plain", `folderrocket-search:${value}`);
            return;
        }
        event.dataTransfer.setData(item.provider === "gmail" ? EMAIL_ATTACHMENT_TYPE : OUTLOOK_ATTACHMENT_TYPE, JSON.stringify([{attachmentId: item.attachmentId, messageId: item.messageId, mimeType: item.mimeType, name: item.name, size: item.size, sourceBlockId: item.sourceBlockId}]));
    }

    async function createTextFile() {
        if (!text.trim() || working) return;
        setWorking(true); setMessage("");
        try {
            const response = await fetch(`${API_BASE_URL}/cargo-ship/text-file`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({name: fileName, text, format: textFormat})});
            const data = await response.json() as {file?: PathItem; message?: string};
            if (!response.ok || !data.file) throw new Error(data.message ?? "Unable to create the file.");
            addItems([{...data.file, id: cargoId(), kind: "path"}]);
            setText("");
            setMessage(`${data.file.name} is ready in Cargo Ship.`);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create the file."); }
        finally { setWorking(false); }
    }

    async function createEmailDraft() {
        const source = emailSources.find(item => `${item.provider}:${item.blockId}` === emailSourceKey);
        if (!source || !recipient.trim() || !text.trim() || working) { setMessage("Choose a connected mailbox, add a recipient, and write the email."); return; }
        setWorking(true); setMessage("");
        try {
            const response = await fetch(`${API_BASE_URL}/cargo-ship/email-draft`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({provider: source.provider, blockId: source.blockId, to: recipient, subject: emailSubject, text})});
            const data = await response.json() as {message?: string};
            if (!response.ok) throw new Error(data.message ?? "Unable to save the draft.");
            setMessage(data.message ?? "Draft saved in the selected mailbox.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the draft."); }
        finally { setWorking(false); }
    }

    async function stageLocalFiles(localItems: CargoFile[]) {
        if (!localItems.length) return [] as PathItem[];
        const formData = new FormData();
        localItems.forEach(item => formData.append("files", item.file));
        const response = await fetch(`${API_BASE_URL}/cargo-ship/stage-files`, {method: "POST", credentials: "include", body: formData});
        const data = await response.json() as {files?: PathItem[]; message?: string};
        if (!response.ok) throw new Error(data.message ?? "Unable to stage local files.");
        return data.files ?? [];
    }

    async function convertItems() {
        if (working) return;
        const pathItems = items.filter((item): item is CargoPath => item.kind === "path");
        const localItems = items.filter((item): item is CargoFile => item.kind === "file");
        if (!pathItems.length && !localItems.length) { setMessage("Add a local file or a search result before converting."); return; }
        setWorking(true); setMessage("Preparing conversion…");
        try {
            const staged = await stageLocalFiles(localItems);
            const allPaths = [...pathItems.map(item => ({name: item.name, path: item.path, size: item.size})), ...staged];
            const response = await fetch(`${API_BASE_URL}/convert-files`, {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "include", body: JSON.stringify({paths: allPaths.map(item => item.path), files: allPaths, format: convertFormat})});
            const data = await response.json() as {converted?: PathItem[]; message?: string};
            if (!response.ok) throw new Error(data.message ?? "Conversion failed.");
            const converted = data.converted ?? [];
            addItems(converted.map(item => ({...item, id: cargoId(), kind: "path"})));
            setMessage(`Converted ${converted.length}/${allPaths.length} file${allPaths.length === 1 ? "" : "s"}.`);
        } catch (error) { setMessage(error instanceof Error ? error.message : "Conversion failed."); }
        finally { setWorking(false); }
    }

    function openFileStudio() {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({type: "folderrocket-open-file-studio"}, window.location.origin);
            window.opener.focus();
            return;
        }
        onOpenFileStudio();
    }

    if (!standalone) return <div className="cargoShipLauncherWrap">
        <button type="button" className="cargoShipLauncher" onClick={launchPopup} title="Open Cargo Ship in a separate window"><Rocket size={17} />Cargo Ship</button>
        {popupBlocked && <small className="cargoPopupBlocked">Allow pop-ups for FolderRocket to launch Cargo Ship.</small>}
    </div>;

    return <main className="cargoShipStandaloneWindow"><section className="cargoShip cargoShipStandalone">
        <header className="cargoShipHeader"><span><Rocket size={18} />Cargo Ship <small>{items.length} on board</small></span><button type="button" title="Close Cargo Ship" onClick={() => window.close()}><X size={16} /></button></header>
        <div className="cargoShipModes" role="tablist"><button type="button" className={mode === "transport" ? "active" : ""} onClick={() => setMode("transport")}>Files</button><button type="button" className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><FilePlus2 size={13} />Text</button><button type="button" className={mode === "email" ? "active" : ""} onClick={() => setMode("email")}><MailPlus size={13} />Email</button><button type="button" className={mode === "convert" ? "active" : ""} onClick={() => setMode("convert")}><RotateCw size={13} />Convert</button></div>
        {mode === "transport" && <div className={dropActive ? "cargoDropArea active" : "cargoDropArea"} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={handleDrop}><p>Drop files, email attachments, search results, or text here.</p><div className="cargoItemList">{items.length ? items.map(item => <div className="cargoItem" draggable key={item.id} onDragStart={event => handleItemDrag(event, item)}><FileText size={14} /><span title={item.name}>{item.name}</span><small>{formatSize(item.size)}</small><button type="button" title="Remove from Cargo Ship" onClick={() => setItems(current => current.filter(currentItem => currentItem.id !== item.id))}><Trash2 size={13} /></button></div>) : <em>Your Cargo Ship is empty.</em>}</div>{items.length > 0 && <button type="button" className="cargoClear" onClick={() => setItems([])}>Clear cargo</button>}</div>}
        {mode === "text" && <div className="cargoForm"><input value={fileName} onChange={event => setFileName(event.target.value)} placeholder="File name" /><textarea value={text} onChange={event => setText(event.target.value)} placeholder="Paste or write text here…" /><div><select value={textFormat} onChange={event => setTextFormat(event.target.value as "txt" | "pdf" | "docx")}><option value="txt">TXT file</option><option value="pdf">PDF file</option><option value="docx">Word document</option></select><button type="button" onClick={() => void createTextFile()} disabled={!text.trim() || working}><FilePlus2 size={14} />Create</button></div></div>}
        {mode === "email" && <div className="cargoForm"><select value={emailSourceKey} onChange={event => setEmailSourceKey(event.target.value)} disabled={!emailSources.length}><option value="">{emailSources.length ? "Choose connected mailbox" : "No connected mailbox"}</option>{emailSources.map(source => <option key={`${source.provider}:${source.blockId}`} value={`${source.provider}:${source.blockId}`}>{source.label}</option>)}</select><input value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="To: name@example.com" /><input value={emailSubject} onChange={event => setEmailSubject(event.target.value)} placeholder="Email subject" /><textarea value={text} onChange={event => setText(event.target.value)} placeholder="Write the email text here…" /><button type="button" onClick={() => void createEmailDraft()} disabled={!emailSources.length || !text.trim() || working}><Send size={14} />{working ? "Saving draft…" : "Save draft in mailbox"}</button><small className="cargoEmailNote">The draft is not sent automatically. Review and send it in Gmail or Outlook.</small></div>}
        {mode === "convert" && <div className="cargoConvert"><p>Converts local files and search results. Email attachments must first be dropped into a folder.</p><select value={convertFormat} onChange={event => setConvertFormat(event.target.value)}><option value="pdf">PDF</option><option value="txt">TXT</option><option value="xlsx">XLSX</option><option value="csv">CSV</option></select><button type="button" onClick={() => void convertItems()} disabled={working}><RotateCw className={working ? "cargoSpin" : ""} size={15} />{working ? "Converting…" : "Convert cargo"}</button><button type="button" className="cargoStudioLink" onClick={openFileStudio}><SlidersHorizontal size={14} />Open File Studio</button></div>}
        {message && <p className="cargoMessage">{message}</p>}
    </section></main>;
}
