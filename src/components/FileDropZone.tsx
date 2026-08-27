import {
    useEffect,
    useRef,
    useState
} from "react";

import type {
    DragEvent,
    MouseEvent
} from "react";

import {
    Archive,
    LoaderCircle,
    MoreHorizontal,
    Pencil,
    X
} from "lucide-react";

import { API_BASE_URL } from "../api";
import {browserBridgeDropId, resolveBrowserBridgeDrop} from "../browserBridge";
import { EMAIL_ATTACHMENT_TYPE } from "./GmailSourcePanel";
import { OUTLOOK_ATTACHMENT_TYPE } from "./OutlookSourcePanel";
import { SEARCH_RESULT_TYPE } from "./SearchWorkspace";
import { CALENDAR_ATTACHMENT_TYPE } from "./GoogleCalendarSourcePanel";


interface Props {

    // Nome mostrato nel blocco
    name: string;

    // Identificativo della cartella
    id?: string;

    // Seleziona il blocco cartella
    onClick?: (event: MouseEvent<HTMLDivElement>) => void;
    onPathChange?: (path: string) => void;
    pathValue?: string;
    hidePath?: boolean;
    imaginary?: boolean;
    onVirtualFilesAdd?: (files: Array<{name: string; path: string; size?: number}>) => void;
    sourceFolderPaths?: string[];
    storageScope?: string;
    aiEnabled?: boolean;

    // Indica se il blocco è selezionato
    selected?: boolean;

}


interface RenamePart {

    type:
        | "fixed"
        | "date"
        | "company"
        | "originalName";

    value?: string;

}


interface DeadlineFileResult {

    fileName: string;

    expirationDate:
        string
        |
        null;

    daysRemaining:
        number
        |
        null;

    status:
        | "urgent"
        | "watch"
        | "ok"
        | "missing";

    source:
        string
        |
        null;

    reason:
        string;

}


interface DeadlineResponse {

    message?: string;

    urgentCount?: number;

    watchCount?: number;

    missingCount?: number;

    results?: DeadlineFileResult[];

}


interface BasicResponse {

    message?: string;

}

interface ArchiveColumn { key: string; header: string; enabled: boolean; instruction?: string; }
const DEFAULT_ARCHIVE_CONFIG: ArchiveColumn[] = [
    {key: "company", header: "Company", enabled: true, instruction: "Extract the company or organisation named in the document."},
    {key: "position", header: "Position", enabled: true, instruction: "Extract the job title, role, course, or position."},
    {key: "documentType", header: "Document type", enabled: true, instruction: "Identify the document type, for example CV, cover letter, certificate, or contract."},
    {key: "skills", header: "Skills", enabled: true, instruction: "Extract at most 5 short skills, separated by commas."},
    {key: "experience", header: "Experience", enabled: true, instruction: "Summarise at most 5 short experience points, separated by |."},
    {key: "date", header: "Date", enabled: true, instruction: "Extract the relevant document date, if present."}
];


function FileDropZone({
    name,
    id,
    onClick,
    onPathChange,
    pathValue,
    hidePath = false,
    imaginary = false,
    onVirtualFilesAdd,
    sourceFolderPaths = [],
    storageScope = "default",
    selected = false,
    aiEnabled = false
}: Props) {

    // ==================================================
    // STATI GENERALI
    // ==================================================

    // Percorso della cartella di destinazione
    const [path, setPath] =
        useState(pathValue ?? "");

    useEffect(
        () => {
            setPath(pathValue ?? "");
        },
        [pathValue]
    );


    // File trascinati e pronti per l'upload
    const [files, setFiles] =
        useState<File[]>([]);
    const [pendingVirtualFiles, setPendingVirtualFiles] =
        useState<Array<{name: string; path: string; size?: number}>>([]);

    // Risultati della ricerca: hanno un percorso reale sul computer e possono
    // essere spostati (non scaricati e caricati di nuovo) nella cartella scelta.
    const [pendingMoveFiles, setPendingMoveFiles] =
        useState<Array<{name: string; path: string; size?: number}>>([]);


    // Ultimo file inviato correttamente
    const [
        lastUploadedFile,
        setLastUploadedFile
    ] =
        useState("");


    // Aspetto visivo durante il drag
    const [dragging, setDragging] =
        useState(false);


    // Upload multiplo in corso
    const [uploadingFiles, setUploadingFiles] =
        useState(false);


    // Parti utilizzate per rinominare i file
    const [renameParts, setRenameParts] =
        useState<RenamePart[]>([]);


    // ==================================================
    // ARCHIVIO
    // ==================================================

    const [archiveEnabled, setArchiveEnabled] =
        useState<boolean>(() => {

            return localStorage.getItem(
                `folderrocket-archive-${storageScope}-${name}`
            ) === "true";

        });


    const [syncingArchive, setSyncingArchive] =
        useState(false);
    const [archiveMenuOpen, setArchiveMenuOpen] = useState(false);
    const [renameMenuOpen, setRenameMenuOpen] = useState(false);
    const [archiveColumnPendingRemoval, setArchiveColumnPendingRemoval] = useState<string | null>(null);
    const [archiveColumns, setArchiveColumns] = useState<ArchiveColumn[]>(() => {
        try { return JSON.parse(localStorage.getItem(`folderrocket-archive-columns-${storageScope}-${name}`) ?? "null") ?? DEFAULT_ARCHIVE_CONFIG; }
        catch { return DEFAULT_ARCHIVE_CONFIG; }
    });


    // ==================================================
    // SCADENZE
    // ==================================================

    const deadlineAreaRef =
        useRef<HTMLDivElement | null>(
            null
        );


    const [deadlineMenuOpen, setDeadlineMenuOpen] =
        useState(false);


    const [
        deadlineCheckEnabled,
        setDeadlineCheckEnabled
    ] =
        useState(false);


    const [watchDays, setWatchDays] =
        useState(30);


    const [urgentDays, setUrgentDays] =
        useState(7);


    const [urgentCount, setUrgentCount] =
        useState(0);


    const [watchCount, setWatchCount] =
        useState(0);


    const [missingCount, setMissingCount] =
        useState(0);


    const [
        checkingDeadlines,
        setCheckingDeadlines
    ] =
        useState(false);


    const [
        deadlineResults,
        setDeadlineResults
    ] =
        useState<DeadlineFileResult[]>([]);


    const [
        visibleDeadlineStatus,
        setVisibleDeadlineStatus
    ] =
        useState<
            "urgent"
            |
            "watch"
            |
            null
        >(null);


    // ==================================================
    // EFFETTI
    // ==================================================

    /*
        Salva nel browser lo stato
        dell'Archivio per questo blocco.
    */
    useEffect(
        () => {

            localStorage.setItem(
                `folderrocket-archive-${storageScope}-${name}`,
                String(
                    archiveEnabled
                )
            );

        },
        [
            archiveEnabled,
            name,
            storageScope
        ]
    );

    useEffect(() => {
        localStorage.setItem(`folderrocket-archive-columns-${storageScope}-${name}`, JSON.stringify(archiveColumns));
    }, [archiveColumns, name, storageScope]);

    useEffect(() => {
        function closeArchiveMenu(event: globalThis.MouseEvent) {
            const target = event.target;
            if (target instanceof Element && !target.closest(".archiveControlArea")) {
                setArchiveMenuOpen(false);
                setRenameMenuOpen(false);
                setArchiveColumnPendingRemoval(null);
            }
        }
        document.addEventListener("mousedown", closeArchiveMenu);
        return () => document.removeEventListener("mousedown", closeArchiveMenu);
    }, []);


    /*
        Chiude menu e liste delle scadenze
        quando si clicca fuori dall'area.
    */
    useEffect(
        () => {

            function handleOutsideClick(
                event: globalThis.MouseEvent
            ) {

                const clickedNode =
                    event.target as Node;


                if (
                    deadlineAreaRef.current
                    &&
                    deadlineAreaRef.current.contains(
                        clickedNode
                    )
                ) {

                    return;

                }


                setDeadlineMenuOpen(false);

                setVisibleDeadlineStatus(null);

            }


            document.addEventListener(
                "mousedown",
                handleOutsideClick
            );


            return () => {

                document.removeEventListener(
                    "mousedown",
                    handleOutsideClick
                );

            };

        },
        []
    );


    // ==================================================
    // FUNZIONE DI SUPPORTO PER LE RISPOSTE JSON
    // ==================================================

    async function readJsonResponse<T>(
        response: Response
    ): Promise<T> {

        const responseText =
            await response.text();


        try {

            return JSON.parse(
                responseText
            ) as T;

        }

        catch {

            console.error(
                "Risposta backend non JSON:",
                responseText
            );


            throw new Error(
                "Il backend non ha restituito una risposta JSON valida"
            );

        }

    }


    // ==================================================
    // ARCHIVIO
    // ==================================================

    /*
        Attiva Archivio e sincronizza
        tutti i file già presenti.

        Se è già attivo, lo disattiva.
    */
    async function toggleArchive(
        event: MouseEvent<HTMLButtonElement>
    ) {

        event.stopPropagation();

        if (imaginary) return;


        if (archiveEnabled) {

            setArchiveEnabled(false);

            return;

        }


        if (!path.trim()) {

            alert(
                "Inserisci prima il percorso della cartella"
            );

            return;

        }


        try {

            setSyncingArchive(true);


            const response =
                await fetch(
                    `${API_BASE_URL}/sync-archive`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            path: path.trim(),
                            archiveColumns

                        })

                    }
                );


            const data =
                await readJsonResponse<BasicResponse>(
                    response
                );


            if (!response.ok) {

                throw new Error(
                    data.message
                    ??
                    "Errore durante l'aggiornamento dell'archivio"
                );

            }


            setArchiveEnabled(true);


            alert(
                data.message
                ??
                "Archivio aggiornato"
            );

        }

        catch (error) {

            console.error(
                "Errore Archivio:",
                error
            );


            alert(
                error instanceof Error
                    ? error.message
                    : "Errore durante l'aggiornamento dell'archivio"
            );

        }

        finally {

            setSyncingArchive(false);

        }

    }


    // ==================================================
    // SCADENZE
    // ==================================================

    async function checkFolderDeadlines(
        event: MouseEvent<HTMLButtonElement>
    ) {

        event.stopPropagation();

        if (imaginary) return;


        if (!deadlineCheckEnabled) {

            alert(
                "Prima attiva il controllo delle scadenze"
            );

            return;

        }


        if (!path.trim()) {

            alert(
                "Inserisci prima il percorso della cartella"
            );

            return;

        }


        if (
            !Number.isFinite(watchDays)
            ||
            !Number.isFinite(urgentDays)
            ||
            watchDays <= 0
            ||
            urgentDays < 0
        ) {

            alert(
                "Inserisci soglie valide"
            );

            return;

        }


        if (urgentDays >= watchDays) {

            alert(
                "Urgentissimo deve avere meno giorni di Sotto controllo"
            );

            return;

        }


        try {

            setCheckingDeadlines(true);


            const response =
                await fetch(
                    `${API_BASE_URL}/check-deadlines`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({

                            path:
                                path.trim(),

                            watchDays,

                            urgentDays

                        })

                    }
                );


            const data =
                await readJsonResponse<DeadlineResponse>(
                    response
                );


            if (!response.ok) {

                throw new Error(
                    data.message
                    ??
                    "Errore durante il controllo delle scadenze"
                );

            }


            setUrgentCount(
                data.urgentCount
                ??
                0
            );


            setWatchCount(
                data.watchCount
                ??
                0
            );


            setMissingCount(
                data.missingCount
                ??
                0
            );


            setDeadlineResults(
                Array.isArray(
                    data.results
                )
                    ? data.results
                    : []
            );


            setVisibleDeadlineStatus(null);

            setDeadlineMenuOpen(false);


            alert(
                data.message
                ??
                "Controllo completato"
            );

        }

        catch (error) {

            console.error(
                "Errore controllo scadenze:",
                error
            );


            alert(
                error instanceof Error
                    ? error.message
                    : "Errore durante il controllo delle scadenze"
            );

        }

        finally {

            setCheckingDeadlines(false);

        }

    }


    // ==================================================
    // DRAG AND DROP MULTIPLO
    // ==================================================

    function handleDragOver(
        event: DragEvent<HTMLDivElement>
    ) {

        event.preventDefault();

        event.stopPropagation();

        event.dataTransfer.dropEffect = "copy";

        setDragging(true);

    }


    function handleDragLeave(
        event: DragEvent<HTMLDivElement>
    ) {

        event.preventDefault();

        event.stopPropagation();

        setDragging(false);

    }


    /*
        Aggiunge tutti i file trascinati.

        I file già nella lista non vengono duplicati.
    */
    async function handleDrop(
        event: DragEvent<HTMLDivElement>
    ) {

        event.preventDefault();

        event.stopPropagation();

        setDragging(false);

        const bridgeId = browserBridgeDropId(event.dataTransfer.getData("text/plain"));
        if (bridgeId) {
            try {
                const stagedFiles = await resolveBrowserBridgeDrop(bridgeId);
                if (imaginary) {
                    setPendingVirtualFiles(current => [...current, ...stagedFiles.filter(file => !current.some(item => item.path === file.path))]);
                    setLastUploadedFile(`${stagedFiles.length} Gmail file(s) ready for this imaginary folder`);
                    return;
                }
                const visibleFiles = await Promise.all(stagedFiles.map(async file => {
                    const response = await fetch(`${API_BASE_URL}${file.downloadUrl}`, {credentials: "include"});
                    if (!response.ok) throw new Error(`Unable to prepare ${file.name}.`);
                    const content = await response.blob();
                    return new File([content], file.name, {type: content.type, lastModified: file.createdAt ? new Date(file.createdAt).getTime() : Date.now()});
                }));
                setPendingMoveFiles(current => [...current, ...stagedFiles.filter(file => !current.some(item => item.path === file.path))]);
                setFiles(current => [...current, ...visibleFiles.filter(file => !current.some(item => item.name === file.name && item.size === file.size))]);
                setLastUploadedFile(`${stagedFiles.length} Gmail file(s) ready to send`);
            } catch (error) {
                alert(error instanceof Error ? error.message : "Unable to prepare the Gmail attachment.");
            }
            return;
        }


        let gmailAttachments =
            event.dataTransfer.getData(
                EMAIL_ATTACHMENT_TYPE
            );

        let outlookAttachments = event.dataTransfer.getData(OUTLOOK_ATTACHMENT_TYPE);
        if (!gmailAttachments && !outlookAttachments) {
            const fallback = event.dataTransfer.getData("text/plain");
            if (fallback.startsWith("folderrocket-email:")) {
                try {
                    const parsed = JSON.parse(fallback.slice("folderrocket-email:".length)) as {provider?: string; attachments?: unknown[]};
                    const serialized = JSON.stringify(parsed.attachments ?? []);
                    if (parsed.provider === "gmail") gmailAttachments = serialized;
                    if (parsed.provider === "outlook") outlookAttachments = serialized;
                } catch { /* Ignore unrelated plain text. */ }
            }
        }
        const emailAttachments = gmailAttachments || outlookAttachments;
        const emailProvider = gmailAttachments ? "gmail" : "outlook";


        if (emailAttachments) {

            try {

                const remoteAttachments =
                    JSON.parse(
                        emailAttachments
                    ) as Array<{
                        attachmentId: string;
                        messageId: string;
                        mimeType: string;
                        name: string;
                        sourceBlockId?: string;
                    }>;

                if (imaginary) {
                    const references = await Promise.all(remoteAttachments.map(async attachment => {
                        const sourceBlockQuery = attachment.sourceBlockId ? `?blockId=${encodeURIComponent(attachment.sourceBlockId)}` : "";
                        const response = await fetch(`${API_BASE_URL}/email/${emailProvider}/attachments/save-reference${sourceBlockQuery}`, {method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body:JSON.stringify(attachment)});
                        const data = await response.json() as {name: string; path: string; size?: number; message?: string};
                        if (!response.ok) throw new Error(data.message ?? "Unable to save Gmail attachment");
                        return data;
                    }));
                    setPendingVirtualFiles(current => [...current, ...references.filter(file => !current.some(item => item.path === file.path))]);
                    setLastUploadedFile(`${references.length} file(s) ready to send to this imaginary folder`);
                    return;
                }

                const downloadedFiles =
                    await Promise.all(
                        remoteAttachments.map(
                            async attachment => {

                                const parameters =
                                    new URLSearchParams({
                                        messageId:
                                            attachment.messageId,
                                        attachmentId:
                                            attachment.attachmentId,
                                        name:
                                            attachment.name,
                                        mimeType:
                                            attachment.mimeType
                                    });
                                if (attachment.sourceBlockId) parameters.set("blockId", attachment.sourceBlockId);

                                const response =
                                    await fetch(
                                        `${API_BASE_URL}/email/${emailProvider}/attachments/download?${parameters}`,
                                        {credentials:"include"}
                                    );

                                if (!response.ok) {

                                    const data =
                                        await response.json() as {
                                            message?: string;
                                        };

                                    throw new Error(
                                        data.message
                                        ??
                                        `Impossibile scaricare ${attachment.name}`
                                    );

                                }

                                const content =
                                    await response.blob();

                                return new File(
                                    [content],
                                    attachment.name,
                                    {
                                        type:
                                            attachment.mimeType
                                    }
                                );

                            }
                        )
                    );

                setFiles(
                    currentFiles => [
                        ...currentFiles,
                        ...downloadedFiles.filter(
                            droppedFile =>
                                !currentFiles.some(
                                    existingFile =>
                                        existingFile.name === droppedFile.name
                                        &&
                                        existingFile.size === droppedFile.size
                                )
                        )
                    ]
                );

            }

            catch (error) {

                console.error(
                    "Email attachment error:",
                    error
                );

                alert(
                    error instanceof Error
                        ? error.message
                        : "Unable to download the email attachment"
                );

            }

            return;

        }

        let calendarAttachments = event.dataTransfer.getData(CALENDAR_ATTACHMENT_TYPE);
        if (!calendarAttachments) {
            const fallback = event.dataTransfer.getData("text/plain");
            if (fallback.startsWith("folderrocket-calendar:")) calendarAttachments = fallback.slice("folderrocket-calendar:".length);
        }
        if (calendarAttachments) {
            try {
                const attachments = JSON.parse(calendarAttachments) as Array<{fileId: string; name: string; mimeType?: string}>;
                if (!attachments.length) return;
                const downloadedFiles = await Promise.all(attachments.map(async attachment => {
                    const parameters = new URLSearchParams({fileId: attachment.fileId, name: attachment.name, mimeType: attachment.mimeType ?? ""});
                    const response = await fetch(`${API_BASE_URL}/calendar/google/attachments/download?${parameters}`, {credentials: "include"});
                    if (!response.ok) {
                        const data = await readJsonResponse<{message?: string}>(response);
                        throw new Error(data.message ?? `Unable to download ${attachment.name}.`);
                    }
                    const content = await response.blob();
                    return new File([content], attachment.name, {type: attachment.mimeType || content.type});
                }));
                setFiles(current => [...current, ...downloadedFiles.filter(file => !current.some(item => item.name === file.name && item.size === file.size))]);
                setLastUploadedFile(`${downloadedFiles.length} calendar file(s) ready to send`);
            } catch (error) {
                alert(error instanceof Error ? error.message : "Unable to download the calendar attachment.");
            }
            return;
        }

        const searchResults = event.dataTransfer.getData(SEARCH_RESULT_TYPE);
        if (searchResults) {
            try {
                const remoteFiles = JSON.parse(searchResults) as Array<{name: string; path: string; size?: number}>;
                if (imaginary) {
                    setPendingVirtualFiles(current => [...current, ...remoteFiles.filter(file => !current.some(item => item.path === file.path))]);
                    setLastUploadedFile(`${remoteFiles.length} file(s) ready to send to this imaginary folder`);
                    return;
                }
                setPendingMoveFiles(current => [
                    ...current,
                    ...remoteFiles.filter(file => !current.some(item => item.path === file.path))
                ]);
                // Search results already have a real path, so they are shown
                // as lightweight queue entries without downloading a copy.
                setFiles(current => [
                    ...current,
                    ...remoteFiles
                        .filter(file => !current.some(item => item.name === file.name))
                        .map(file => new File([], file.name))
                ]);
                setLastUploadedFile(`${remoteFiles.length} file(s) ready to move`);
            } catch (error) {
                alert(error instanceof Error ? error.message : "Errore ricerca");
            }
            return;
        }

        const droppedFiles =
            Array.from(
                event.dataTransfer.files
            );


        if (
            droppedFiles.length === 0
        ) {

            return;

        }

        // I browser non espongono il percorso del file trascinato. Se però
        // proviene da una cartella già configurata in Dashboard, il backend lo
        // ritrova con nome e dimensione e lo mette nella coda di trasferimento.
        // Update the visible queue immediately; source matching happens after.
        setFiles(currentFiles => [
            ...currentFiles,
            ...droppedFiles.filter(droppedFile => !currentFiles.some(existingFile =>
                existingFile.name === droppedFile.name
                && existingFile.size === droppedFile.size
                && existingFile.lastModified === droppedFile.lastModified
            ))
        ]);
        setLastUploadedFile(`${droppedFiles.length} file(s) added to the queue`);

        if (!imaginary && sourceFolderPaths.length > 0) {
            try {
                const response = await fetch(`${API_BASE_URL}/files/locate-configured`, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folders: sourceFolderPaths.filter(folder => folder !== path.trim()),
                        files: droppedFiles.map(file => ({name: file.name, size: file.size}) )
                    })
                });
                const data = await readJsonResponse<{matches?: Array<{name: string; path: string; size?: number}>}>(response);
                if (response.ok && data.matches?.length) {
                    setPendingMoveFiles(current => {
                        const additions = data.matches!.filter(file => !current.some(item => item.path === file.path));
                        return [...current, ...additions];
                    });
                    const unmatched = droppedFiles.filter(file => !data.matches!.some(match => match.name === file.name && match.size === file.size));
                    setLastUploadedFile(unmatched.length === 0 ? `${data.matches.length} file(s) ready to cut and paste` : `${data.matches.length} file(s) ready to cut and paste; ${unmatched.length} will be copied`);
                }
            } catch {
                // Fall back to normal browser upload when a source cannot be identified.
            }
        }


        setFiles(
            currentFiles => {

                const updatedFiles = [
                    ...currentFiles
                ];


                for (
                    const droppedFile
                    of droppedFiles
                ) {

                    const alreadyPresent =
                        updatedFiles.some(
                            existingFile => {

                                return (
                                    existingFile.name
                                    ===
                                    droppedFile.name
                                    &&
                                    existingFile.size
                                    ===
                                    droppedFile.size
                                    &&
                                    existingFile.lastModified
                                    ===
                                    droppedFile.lastModified
                                );

                            }
                        );


                    if (!alreadyPresent) {

                        updatedFiles.push(
                            droppedFile
                        );

                    }

                }


                return updatedFiles;

            }
        );

    }


    /*
        Rimuove un solo file dalla lista,
        senza modificare il file originale.
    */
    function removeFileFromQueue(
        indexToRemove: number
    ) {

        setFiles(
            currentFiles =>
                currentFiles.filter(
                    (_currentFile, index) =>
                        index !== indexToRemove
                )
        );

    }


    function clearFileQueue() {

        setFiles([]);
        setPendingVirtualFiles([]);
        setPendingMoveFiles([]);

    }


    // ==================================================
    // RINOMINA
    // ==================================================

    function addRenamePart(
        type: string
    ) {

        if (type === "fixed") {

            const text =
                prompt(
                    "Inserisci testo fisso"
                );


            if (
                text
                &&
                text.trim()
            ) {

                setRenameParts(
                    currentParts => [
                        ...currentParts,
                        {
                            type: "fixed",
                            value: text.trim()
                        }
                    ]
                );

            }

        }


        if (type === "date") {

            setRenameParts(
                currentParts => [
                    ...currentParts,
                    {
                        type: "date"
                    }
                ]
            );

        }


        if (type === "company") {

            setRenameParts(
                currentParts => [
                    ...currentParts,
                    {
                        type: "company",
                        value: "Nome Azienda"
                    }
                ]
            );

        }


        if (type === "originalName") {
            setRenameParts(currentParts => [
                ...currentParts,
                {type: "originalName"}
            ]);
        }

        if (type === "delete") {

            setRenameParts(
                currentParts =>
                    currentParts.slice(
                        0,
                        -1
                    )
            );

        }

    }


    function updateRenamePart(
        index: number,
        value: string
    ) {

        setRenameParts(
            currentParts =>
                currentParts.map(
                    (part, currentIndex) => {

                        if (
                            currentIndex !== index
                        ) {

                            return part;

                        }


                        return {
                            ...part,
                            value
                        };

                    }
                )
        );

    }


    function generateFileName(
        originalName: string
    ) {

        if (
            renameParts.length === 0
        ) {

            return originalName;

        }


        const lastDotIndex =
            originalName.lastIndexOf(".");


        const extension =
            lastDotIndex > 0
                ? originalName.substring(
                    lastDotIndex
                )
                : "";


        const generatedParts:
            string[] =
            [];


        for (
            const part
            of renameParts
        ) {

            if (
                part.type === "fixed"
                ||
                part.type === "company"
            ) {

                const value =
                    part.value
                        ?.trim();


                if (value) {

                    generatedParts.push(
                        value
                    );

                }

            }


            if (
                part.type === "date"
            ) {

                const today =
                    new Date();


                const formattedDate =
                    [
                        String(
                            today.getDate()
                        ).padStart(
                            2,
                            "0"
                        ),

                        String(
                            today.getMonth() + 1
                        ).padStart(
                            2,
                            "0"
                        ),

                        today.getFullYear()
                    ].join("-");


                generatedParts.push(
                    formattedDate
                );

            }

            if (part.type === "originalName") {
                const baseName = lastDotIndex > 0
                    ? originalName.substring(0, lastDotIndex)
                    : originalName;
                if (baseName) generatedParts.push(baseName);
            }

        }


        if (
            generatedParts.length === 0
        ) {

            return originalName;

        }


        return (
            generatedParts.join(" ")
            +
            extension
        );

    }

    function addArchiveColumn() {
        setArchiveColumns(current => [
            ...current,
            {
                key: `custom_${Date.now()}`,
                header: "New column",
                enabled: true,
                instruction: "What should AI extract from this document?"
            }
        ]);
    }

    function updateArchiveColumn(key: string, update: Partial<ArchiveColumn>) {
        setArchiveColumns(current => current.map(column => column.key === key ? {...column, ...update} : column));
    }

    function removeArchiveColumn(key: string) {
        if (archiveColumnPendingRemoval !== key) {
            setArchiveColumnPendingRemoval(key);
            return;
        }
        setArchiveColumns(current => current.filter(column => column.key !== key));
        setArchiveColumnPendingRemoval(null);
    }

    async function saveArchiveColumns(event: MouseEvent<HTMLButtonElement>) {
        event.stopPropagation();
        if (!path.trim()) { alert("Enter the folder path first"); return; }
        try {
            setSyncingArchive(true);
            const response = await fetch(`${API_BASE_URL}/sync-archive`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: path.trim(), archiveColumns})});
            const data = await readJsonResponse<BasicResponse>(response);
            if (!response.ok) throw new Error(data.message ?? "Unable to update archive.xlsx");
            setArchiveEnabled(true); setArchiveMenuOpen(false); alert(data.message ?? "Archive updated");
        } catch (error) { alert(error instanceof Error ? error.message : "Unable to update archive.xlsx"); }
        finally { setSyncingArchive(false); }
    }

    // The naming builder remains available for the compact rename UI. Uploads
    // intentionally retain the original filename until the user renames it.
    void generateFileName;


    // ==================================================
    // UPLOAD MULTIPLO
    // ==================================================

    async function uploadFiles() {

        if (
            files.length === 0
            &&
            pendingVirtualFiles.length === 0
            &&
            pendingMoveFiles.length === 0
        ) {

            alert(
                "Prima trascina uno o più file"
            );

            return;

        }


        if (!path.trim() && !imaginary) {

            alert(
                "Inserisci il percorso della cartella"
            );

            return;

        }

        if (imaginary) {
            let virtualFiles = pendingVirtualFiles;

            if (files.length > 0) {
                const formData = new FormData();
                files.forEach(file => formData.append("files", file));
                const response = await fetch(`${API_BASE_URL}/virtual-files/upload`, {method: "POST", body: formData});
                const data = await readJsonResponse<{files?: Array<{name: string; path: string; size?: number}>; message?: string}>(response);
                if (!response.ok) throw new Error(data.message ?? "Unable to add files to the imaginary folder");
                virtualFiles = [
                    ...virtualFiles,
                    ...(data.files ?? []).filter(file => !virtualFiles.some(item => item.path === file.path))
                ];
            }

            onVirtualFilesAdd?.(virtualFiles);
            setLastUploadedFile(`${virtualFiles.length} file(s) kept in this imaginary folder`);
            setFiles([]);
            setPendingVirtualFiles([]);
            return;
        }


        const uploadedIdentifiers:
            string[] =
            [];


        const uploadedNames:
            string[] =
            [];


        const failedFiles:
            string[] =
            [];


        try {

            setUploadingFiles(true);

            const filesToUpload = files.filter(file => !pendingMoveFiles.some(move => move.name === file.name && (move.size === undefined || move.size === file.size)));

            if (pendingMoveFiles.length > 0) {
                const response = await fetch(`${API_BASE_URL}/files/move`, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({destination: path.trim(), paths: pendingMoveFiles.map(file => file.path)})
                });
                const data = await readJsonResponse<{moved?: Array<{name: string}>; message?: string}>(response);
                if (!response.ok) throw new Error(data.message ?? "Unable to move the selected files");
                const movedNames = (data.moved ?? []).map(file => file.name);
                window.dispatchEvent(new CustomEvent("folderrocket-files-moved", {
                    detail: {sourcePaths: pendingMoveFiles.map(file => file.path), moved: data.moved ?? [], destination: path.trim()}
                }));
                setPendingMoveFiles([]);
                if (movedNames.length > 0) setLastUploadedFile(movedNames[movedNames.length - 1]);
                setFiles(current => current.filter(file => !pendingMoveFiles.some(move => move.name === file.name && (move.size === undefined || move.size === file.size))));
                if (filesToUpload.length === 0) {
                    alert(`${movedNames.length} file(s) moved successfully`);
                    return;
                }
            }


            for (
                const currentFile
                of filesToUpload
            ) {

                const fileIdentifier =
                    [
                        currentFile.name,
                        currentFile.size,
                        currentFile.lastModified
                    ].join("|");


                try {

                    // Il nome scelto dall'utente deve arrivare nella cartella
                    // senza un rinomina automatica.
                    const newFileName = generateFileName(currentFile.name);


                    const renamedFile =
                        new File(
                            [currentFile],
                            newFileName,
                            {
                                type:
                                    currentFile.type,

                                lastModified:
                                    currentFile.lastModified
                            }
                        );


                    const formData =
                        new FormData();


                    formData.append(
                        "file",
                        renamedFile
                    );


                    formData.append(
                        "path",
                        path.trim()
                    );


                    formData.append(
                        "archiveEnabled",
                        String(
                            archiveEnabled
                        )
                    );
                    formData.append("archiveColumns", JSON.stringify(archiveColumns));


                    const response =
                        await fetch(
                            `${API_BASE_URL}/upload`,
                            {
                                method: "POST",
                                body: formData
                            }
                        );


                    const data =
                        await readJsonResponse<BasicResponse>(
                            response
                        );


                    if (!response.ok) {

                        throw new Error(
                            data.message
                            ??
                            "Errore durante l'upload"
                        );

                    }


                    uploadedIdentifiers.push(
                        fileIdentifier
                    );


                    uploadedNames.push(
                        newFileName
                    );

                }

                catch (error) {

                    console.error(
                        "Errore upload file:",
                        currentFile.name,
                        error
                    );


                    failedFiles.push(
                        currentFile.name
                    );

                }

            }


            /*
                Rimuove dalla lista solo
                i file caricati correttamente.
            */
            setFiles(
                currentFiles =>
                    currentFiles.filter(
                        currentFile => {

                            const identifier =
                                [
                                    currentFile.name,
                                    currentFile.size,
                                    currentFile.lastModified
                                ].join("|");


                            return !uploadedIdentifiers.includes(
                                identifier
                            );

                        }
                    )
            );


            if (
                uploadedNames.length > 0
            ) {

                setLastUploadedFile(
                    uploadedNames[
                        uploadedNames.length - 1
                    ]
                );

            }


            if (
                failedFiles.length > 0
            ) {

                alert(
                    [
                        `${uploadedNames.length} file inviati correttamente.`,
                        "",
                        "File non inviati:",
                        ...failedFiles
                    ].join("\n")
                );

                return;

            }


            alert(
                `${uploadedNames.length} ${
                    uploadedNames.length === 1
                        ? "file inviato"
                        : "file inviati"
                } correttamente`
            );

        }

        catch (error) {
            const message = error instanceof Error ? error.message : "Unable to send the selected files";
            setLastUploadedFile(message);
            alert(message);
        }

        finally {

            setUploadingFiles(false);

        }

    }


    // ==================================================
    // RISULTATI SCADENZE VISIBILI
    // ==================================================

    const visibleDeadlineFiles =
        visibleDeadlineStatus
            ? deadlineResults.filter(
                result =>
                    result.status
                    ===
                    visibleDeadlineStatus
            )
            : [];

    // I file da spostare sono già presenti nella lista visibile `files`.
    // Non contarli una seconda volta solo perché hanno anche un percorso reale.
    const queuedFileCount = files.length + pendingVirtualFiles.length;


    // ==================================================
    // INTERFACCIA
    // ==================================================

    return (

        <div

            className={aiEnabled ? "folderDropZone aiEnabled" : "folderDropZone"}

            onClick={
                onClick
            }

            onDragOver={
                handleDragOver
            }

            onDragLeave={
                handleDragLeave
            }

            onDrop={
                handleDrop
            }

            style={{

                position: "relative",

                width: "100%",

                height: "330px",

                margin: "0",

                padding: "18px 32px",

                border:
                    selected
                        ? imaginary ? "2px solid #2f9d61" : "2px solid #2278d4"
                        : imaginary ? "2px dashed #2f9d61" : "2px dashed #8ca0b5",

                boxSizing: "border-box",

                display: "flex",

                flexDirection: "column",

                justifyContent: "flex-start",

                alignItems: "center",

                gap: "4px",

                overflow: "visible",

                backgroundColor:
                    dragging
                        ? "#eef6ff"
                        : "white",

                cursor: "pointer"

            }}

        >

            {/* ==========================================
                SCADENZE — ALTO A SINISTRA
            ========================================== */}

            <div

                className="deadlineControls"

                ref={
                    deadlineAreaRef
                }

                style={{

                    position: "absolute",

                    top: "8px",

                    left: "10px",

                    zIndex:
                        deadlineMenuOpen
                        ||
                        visibleDeadlineStatus
                            ? 220
                            : 20,

                    display: imaginary ? "none" : "flex",

                    alignItems: "center",

                    gap: "4px"

                }}

            >

                <button

                    type="button"

                    className="deadlineButton deadlineCompact"

                    title="Impostazioni scadenze"

                    onClick={(event) => {

                        event.stopPropagation();

                        setVisibleDeadlineStatus(null);

                        setDeadlineMenuOpen(
                            currentValue =>
                                !currentValue
                        );

                    }}

                    style={{

                        border:
                            urgentCount > 0
                            ||
                            watchCount > 0
                                ? "2px solid #e0a000"
                                : "1px solid #aab4c0",

                        borderRadius: "10px",

                        background:
                            urgentCount > 0
                            ||
                            watchCount > 0
                                ? "#fff8d7"
                                : "white",

                        color: "#102341",

                        cursor: "pointer"

                    }}

                >
                    ⚠️
                </button>


                {
                    urgentCount > 0 && (

                        <button

                            type="button"

                            title="Mostra file urgentissimi"

                            onClick={(event) => {

                                event.stopPropagation();

                                setDeadlineMenuOpen(false);

                                setVisibleDeadlineStatus(
                                    currentStatus =>
                                        currentStatus === "urgent"
                                            ? null
                                            : "urgent"
                                );

                            }}

                            style={{

                                minWidth: "27px",

                                height: "27px",

                                padding: "0 7px",

                                border: "none",

                                borderRadius: "8px",

                                background: "#e53935",

                                color: "white",

                                fontSize: "12px",

                                fontWeight: "700",

                                cursor: "pointer"

                            }}

                        >
                            {urgentCount}
                        </button>

                    )
                }


                {
                    watchCount > 0 && (

                        <button

                            type="button"

                            title="Mostra file sotto controllo"

                            onClick={(event) => {

                                event.stopPropagation();

                                setDeadlineMenuOpen(false);

                                setVisibleDeadlineStatus(
                                    currentStatus =>
                                        currentStatus === "watch"
                                            ? null
                                            : "watch"
                                );

                            }}

                            style={{

                                minWidth: "27px",

                                height: "27px",

                                padding: "0 7px",

                                border: "none",

                                borderRadius: "8px",

                                background: "#e6a700",

                                color: "white",

                                fontSize: "12px",

                                fontWeight: "700",

                                cursor: "pointer"

                            }}

                        >
                            {watchCount}
                        </button>

                    )
                }


                {
                    deadlineMenuOpen && (

                        <div

                            onClick={(event) =>
                                event.stopPropagation()
                            }

                            style={{

                                position: "absolute",

                                top: "48px",

                                left: "0",

                                width: "285px",

                                padding: "15px",

                                border:
                                    "1px solid #c6cfda",

                                borderRadius: "10px",

                                background: "white",

                                boxShadow:
                                    "0 8px 24px rgba(20, 50, 90, 0.18)",

                                zIndex: 221,

                                textAlign: "left"

                            }}

                        >

                            <div
                                className="renamePart"

                                style={{

                                    marginBottom: "13px",

                                    fontSize: "15px",

                                    fontWeight: "700"

                                }}

                            >
                                Controllo scadenze
                            </div>


                            <label

                                style={{

                                    display: "flex",

                                    alignItems: "center",

                                    gap: "8px",

                                    marginBottom: "15px",

                                    fontSize: "13px"

                                }}

                            >

                                <input

                                    type="checkbox"

                                    checked={
                                        deadlineCheckEnabled
                                    }

                                    onChange={(event) =>
                                        setDeadlineCheckEnabled(
                                            event.target.checked
                                        )
                                    }

                                />

                                Controlla scadenze

                            </label>


                            <label

                                style={{

                                    display: "grid",

                                    gridTemplateColumns:
                                        "1fr 70px",

                                    alignItems: "center",

                                    gap: "10px",

                                    marginBottom: "12px",

                                    fontSize: "13px"

                                }}

                            >

                                <span>
                                    🟡 Sotto controllo
                                </span>


                                <input

                                    type="number"

                                    min="1"

                                    value={
                                        watchDays
                                    }

                                    onChange={(event) =>
                                        setWatchDays(
                                            Number(
                                                event.target.value
                                            )
                                        )
                                    }

                                    style={{

                                        width: "70px",

                                        padding: "5px"

                                    }}

                                />

                            </label>


                            <label

                                style={{

                                    display: "grid",

                                    gridTemplateColumns:
                                        "1fr 70px",

                                    alignItems: "center",

                                    gap: "10px",

                                    marginBottom: "12px",

                                    fontSize: "13px"

                                }}

                            >

                                <span>
                                    🔴 Urgentissimo
                                </span>


                                <input

                                    type="number"

                                    min="0"

                                    value={
                                        urgentDays
                                    }

                                    onChange={(event) =>
                                        setUrgentDays(
                                            Number(
                                                event.target.value
                                            )
                                        )
                                    }

                                    style={{

                                        width: "70px",

                                        padding: "5px"

                                    }}

                                />

                            </label>


                            {
                                missingCount > 0 && (

                                    <p

                                        style={{

                                            margin:
                                                "0 0 12px",

                                            color:
                                                "#2474a6",

                                            fontSize:
                                                "12px"

                                        }}

                                    >
                                        Date non trovate:
                                        {" "}
                                        {missingCount}
                                    </p>

                                )
                            }


                            <button

                                type="button"

                                className="deadlineCheckButton"

                                onClick={
                                    checkFolderDeadlines
                                }

                                disabled={
                                    checkingDeadlines
                                }

                                style={{

                                    width: "100%",

                                    minHeight: "36px",

                                    border: "none",

                                    borderRadius: "6px",

                                    background: "#1479d1",

                                    color: "white",

                                    fontWeight: "700",

                                    cursor:
                                        checkingDeadlines
                                            ? "wait"
                                            : "pointer"

                                }}

                            >

                                {
                                    checkingDeadlines
                                        ? "Analisi..."
                                        : "Controlla ora"
                                }

                            </button>

                        </div>

                    )
                }


                {
                    visibleDeadlineStatus && (

                        <div

                            onClick={(event) =>
                                event.stopPropagation()
                            }

                            style={{

                                position: "absolute",

                                top: "48px",

                                left: "0",

                                width: "330px",

                                maxHeight: "260px",

                                padding: "12px",

                                border:
                                    visibleDeadlineStatus
                                    ===
                                    "urgent"
                                        ? "1px solid #e53935"
                                        : "1px solid #e6a700",

                                borderRadius: "10px",

                                overflowY: "auto",

                                background: "white",

                                zIndex: 221,

                                boxShadow:
                                    "0 8px 24px rgba(20, 50, 90, 0.18)",

                                textAlign: "left"

                            }}

                        >

                            <div

                                style={{

                                    marginBottom: "10px",

                                    color:
                                        visibleDeadlineStatus
                                        ===
                                        "urgent"
                                            ? "#c62828"
                                            : "#9b7100",

                                    fontSize: "14px",

                                    fontWeight: "700"

                                }}

                            >

                                {
                                    visibleDeadlineStatus
                                    ===
                                    "urgent"
                                        ? "Scadenze urgentissime"
                                        : "Scadenze sotto controllo"
                                }

                            </div>


                            {
                                visibleDeadlineFiles.map(
                                    result => (

                                        <div

                                            key={
                                                result.fileName
                                            }

                                            style={{

                                                padding: "8px 4px",

                                                borderBottom:
                                                    "1px solid #edf0f4",

                                                fontSize: "12px"

                                            }}

                                        >

                                            <div

                                                style={{

                                                    fontWeight: "700",

                                                    overflowWrap:
                                                        "anywhere"

                                                }}

                                            >
                                                {result.fileName}
                                            </div>


                                            <div

                                                style={{

                                                    marginTop: "3px",

                                                    color: "#667085"

                                                }}

                                            >
                                                Scadenza:
                                                {" "}
                                                {
                                                    result.expirationDate
                                                    ??
                                                    "non trovata"
                                                }

                                                {
                                                    result.daysRemaining
                                                    !==
                                                    null
                                                    &&
                                                    (
                                                        <>
                                                            {" — "}
                                                            {
                                                                result.daysRemaining
                                                            }
                                                            {" giorni"}
                                                        </>
                                                    )
                                                }
                                            </div>

                                        </div>

                                    )
                                )
                            }

                        </div>

                    )
                }

            </div>


            {/* ==========================================
                ARCHIVIO — ALTO A DESTRA
            ========================================== */}

            <button

                type="button"

                className="archiveButton archiveCompact archiveControlArea"

                onClick={
                    toggleArchive
                }

                disabled={
                    syncingArchive
                }

                title={
                    archiveEnabled
                        ? "Archivio attivo"
                        : "Crea o aggiorna archivio.xlsx"
                }

                style={{

                    position: "absolute",

                    top: "7px",

                    right: "7px",

                    zIndex: 10,

                    border:
                        archiveEnabled
                            ? "2px solid #1684e8"
                            : "1px solid #aab4c0",

                    borderRadius: "10px",

                    display: imaginary ? "none" : "flex",

                    justifyContent: "center",

                    alignItems: "center",

                    background:
                        archiveEnabled
                            ? "#dceeff"
                            : "white",

                    color:
                        archiveEnabled
                            ? "#1684e8"
                            : "#5c6570",

                    cursor:
                        syncingArchive
                            ? "wait"
                            : "pointer"

                }}

            >

                {
                    syncingArchive
                        ? (
                            <LoaderCircle

                                size={18}

                                strokeWidth={2}

                                className="spin"

                            />
                        )
                        : (
                            <Archive

                                size={18}

                                strokeWidth={2}

                            />
                        )
                }

            </button>

            {!imaginary && archiveEnabled && (
                <button
                    type="button"
                    className="archiveControlArea"
                    title="Edit archive columns and rename"
                    onClick={event => { event.stopPropagation(); setArchiveMenuOpen(current => !current); }}
                    style={{position: "absolute", top: "43px", right: "7px", zIndex: 11, width: "34px", height: "13px", border: "1px solid #b9d6ed", borderRadius: "5px", background: "#f4faff", color: "#1684e8", cursor: "pointer", padding: 0, lineHeight: 0}}
                >
                    <MoreHorizontal size={13}/>
                </button>
            )}

            <>
                    <button type="button" className="archiveButton archiveCompact archiveControlArea" title="Add rename" onClick={event => { event.stopPropagation(); setRenameMenuOpen(current => !current); }} style={{position: "absolute", top: "58px", right: "7px", zIndex: 11, border: renameMenuOpen ? "2px solid #1684e8" : "1px solid #aab4c0", borderRadius: "10px", background: renameMenuOpen ? "#dceeff" : "white", color: renameMenuOpen ? "#1684e8" : "#5c6570", cursor: "pointer"}}>
                        <Pencil size={15}/>
                    </button>
                    {renameMenuOpen && <select className="renameMenu archiveControlArea" aria-label="Add a rename part" autoFocus onClick={event => event.stopPropagation()} onChange={event => { addRenamePart(event.target.value); event.target.value = ""; setRenameMenuOpen(false); }} style={{position: "absolute", top: "99px", right: "7px", zIndex: 14, width: "126px", height: "25px", fontSize: "10px", border: "1px solid #b9d6ed", borderRadius: "5px", background: "white", color: "#1684e8", cursor: "pointer"}}><option value="">Choose an item</option><option value="originalName">Original file name</option><option value="fixed">Fixed text</option><option value="date">Current date</option><option value="company">Company</option><option value="delete">Delete last item</option></select>}
            </>

            {!imaginary && archiveMenuOpen && (
                <section className="archiveControlArea" onClick={event => event.stopPropagation()} style={{position: "absolute", top: "99px", right: "7px", zIndex: 12, width: "270px", maxHeight: "360px", overflowY: "auto", padding: "10px", border: "1px solid #bfd3e8", borderRadius: "9px", background: "white", boxShadow: "0 7px 18px #18314a2b", textAlign: "left"}}>
                    <strong style={{fontSize: "12px"}}>Archive columns</strong>
                    <p style={{margin: "3px 0 7px", fontSize: "10px"}}>File name is always included.</p>
                    {archiveColumns.map(column => (
                        <div key={column.key} style={{display: "grid", gridTemplateColumns: "1fr 24px", gap: "5px", alignItems: "start", marginBottom: "7px"}}>
                            <div style={{display: "grid", gap: "4px"}}>
                                <input value={column.header} onChange={event => updateArchiveColumn(column.key, {header: event.target.value})} placeholder="Column name" aria-label={`${column.key} column title`} />
                                <input value={column.instruction ?? DEFAULT_ARCHIVE_CONFIG.find(item => item.key === column.key)?.instruction ?? ""} onChange={event => updateArchiveColumn(column.key, {instruction: event.target.value})} placeholder="Describe what AI should extract" aria-label="AI instruction for this column" style={{fontSize: "10px"}} />
                            </div>
                            <button type="button" title={archiveColumnPendingRemoval === column.key ? "Press again to remove" : "Remove column"} onClick={() => removeArchiveColumn(column.key)} style={{height: "25px", border: "none", borderRadius: "5px", background: archiveColumnPendingRemoval === column.key ? "#8d2030" : "#e9eef4", color: archiveColumnPendingRemoval === column.key ? "white" : "#526171", cursor: "pointer"}}>−</button>
                        </div>
                    ))}
                    <button type="button" onClick={addArchiveColumn} style={{width: "100%", border: "1px dashed #1684e8", borderRadius: "5px", background: "#f4faff", color: "#1684e8", padding: "4px", cursor: "pointer"}}>+ Add column</button>
                    <button type="button" onClick={saveArchiveColumns} disabled={syncingArchive} style={{width: "100%", border: "none", borderRadius: "5px", background: "#1684e8", color: "white", padding: "5px", cursor: "pointer"}}>Save and rebuild Excel</button>
                </section>
            )}


            {/* ==========================================
                CONTENUTO PRINCIPALE
            ========================================== */}

            <div className="folderTitleRow">
                <h3>{name}</h3>
            </div>


            {!hidePath && <p

                style={{

                    margin: "2px",

                    fontSize: "14px"

                }}

            >
                Path to:
                {" "}
                {id ?? "Not selected"}
            </p>}


            {!hidePath && <input

                type="text"

                placeholder="Insert path to folder"

                value={
                    path
                }

                onClick={(event) =>
                    event.stopPropagation()
                }

                onChange={(event) => {
                    const value = event.target.value.trim();
                    const normalizedPath = value.length >= 2 && value.startsWith('"') && value.endsWith('"')
                        ? value.slice(1, -1).trim()
                        : event.target.value;
                    setPath(normalizedPath);
                    onPathChange?.(normalizedPath);
                }}

                style={{

                    width: "90%"

                }}

            />}

            {/* Anteprima parti del nuovo nome */}
            {renameParts.length > 0 && <div
                className="renameBuilder"

                onClick={(event) =>
                    event.stopPropagation()
                }

                style={{

                    display: "flex",

                    flexWrap: "wrap",

                    gap: "3px",

                    width: "95%",

                    minHeight: "20px",

                    justifyContent: "center",

                    alignItems: "center",

                    marginTop: "5px"

                }}

            >

                {
                    renameParts.map(
                        (part, index) => (

                            <div

                                key={
                                    `${part.type}-${index}`
                                }

                                style={{

                                    minHeight: "20px",

                                    padding: "1px 4px",

                                    border:
                                        "1px solid gray",

                                    borderRadius: "4px",

                                    display: "flex",

                                    alignItems: "center",

                                    justifyContent: "center"

                                }}

                            >

                                {
                                    part.type === "date"
                                        ? (
                                            <span

                                                style={{

                                                    fontSize: "11px"

                                                }}

                                            >
                                                {
                                                    new Date()
                                                        .toLocaleDateString(
                                                            "it-IT"
                                                        )
                                                }
                                            </span>
                                        )
                                        : part.type === "originalName"
                                            ? <span style={{fontSize: "10px"}}>Original file name</span>
                                        : (
                                            <input
                                                className="renamePartInput"

                                                value={
                                                    part.value
                                                    ??
                                                    ""
                                                }

                                                onChange={(event) =>
                                                    updateRenamePart(
                                                        index,
                                                        event.target.value
                                                    )
                                                }

                                                style={{

                                                    width:
                                                        `${Math.max(
                                                            (
                                                                part.value
                                                                ??
                                                                ""
                                                            ).length,
                                                            1
                                                        )}ch`,

                                                    border: "none",

                                                    outline: "none",

                                                    background:
                                                        "transparent",

                                                    textAlign:
                                                        "center",

                                                    fontSize:
                                                        "10px"

                                                }}

                                            />
                                        )
                                }

                            </div>

                        )
                    )
                }

            </div>}


            <p
                className="dropHint"

                style={{

                    margin: "3px",

                    fontSize: "13px"

                }}

            >
                Drop it like it's HOT
            </p>


            {/* Lista dei file pronti */}

            {
                files.length > 0 && (

                    <div

                        onClick={(event) =>
                            event.stopPropagation()
                        }

                        style={{

                            width: "90%",

                            maxHeight: "72px",

                            padding: "4px",

                            border:
                                "1px solid #d8e0ea",

                            borderRadius: "6px",

                            overflowY: "auto",

                            background: "#f8fbff"

                        }}

                    >

                        {
                            files.map(
                                (
                                    currentFile,
                                    index
                                ) => (

                                    <div

                                        key={
                                            [
                                                currentFile.name,
                                                currentFile.size,
                                                currentFile.lastModified,
                                                index
                                            ].join("-")
                                        }

                                        style={{

                                            minHeight: "25px",

                                            padding: "2px 4px",

                                            display: "flex",

                                            justifyContent:
                                                "space-between",

                                            alignItems:
                                                "center",

                                            gap: "6px",

                                            fontSize: "11px"

                                        }}

                                    >

                                        <span

                                            title={
                                                currentFile.name
                                            }

                                            style={{

                                                minWidth: 0,

                                                overflow: "hidden",

                                                textOverflow:
                                                    "ellipsis",

                                                whiteSpace:
                                                    "nowrap"

                                            }}

                                        >
                                            {currentFile.name}
                                        </span>


                                        <button

                                            type="button"

                                            title="Rimuovi dalla lista"

                                            onClick={(event) => {

                                                event.stopPropagation();

                                                removeFileFromQueue(
                                                    index
                                                );

                                            }}

                                            style={{

                                                width: "22px",

                                                minWidth: "22px",

                                                height: "22px",

                                                padding: "0",

                                                border:
                                                    "1px solid #efb3aa",

                                                borderRadius: "5px",

                                                display: "flex",

                                                justifyContent:
                                                    "center",

                                                alignItems:
                                                    "center",

                                                background:
                                                    "#fff5f3",

                                                color:
                                                    "#d33b25",

                                                cursor:
                                                    "pointer"

                                            }}

                                        >

                                            <X

                                                size={13}

                                                strokeWidth={2.5}

                                            />

                                        </button>

                                    </div>

                                )
                            )
                        }


                        {
                            files.length > 1 && (

                                <button

                                    type="button"

                                    onClick={(event) => {

                                        event.stopPropagation();

                                        clearFileQueue();

                                    }}

                                    style={{

                                        marginTop: "3px",

                                        padding: "2px 5px",

                                        border: "none",

                                        background:
                                            "transparent",

                                        color:
                                            "#c53a27",

                                        fontSize:
                                            "10px",

                                        cursor:
                                            "pointer"

                                    }}

                                >
                                    Svuota lista
                                </button>

                            )
                        }

                    </div>

                )
            }


            <button

                type="button"

                className="uploadFileButton"

                onClick={(event) => {

                    event.stopPropagation();

                    uploadFiles();

                }}

                disabled={
                    uploadingFiles
                }

            >

                {
                    uploadingFiles
                        ? "Sending..."
                        : queuedFileCount > 1
                            ? `Send ${queuedFileCount} files to Sauron`
                            : "Send file to Sauron"
                }

            </button>


            {
                lastUploadedFile && (

                    <p

                        style={{

                            margin: "3px",

                            fontSize: "12px"

                        }}

                    >
                        Queue:
                        {" "}
                        {lastUploadedFile}
                    </p>

                )
            }

        </div>

    );

}


export default FileDropZone;
