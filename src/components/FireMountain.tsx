import {additionalFileIcon} from './AdditionalFileIcons';
import { useEffect, useState, useSyncExternalStore, type SetStateAction } from "react";

import {
    Flame,
    Trash2,
    X,
    File,
    FileSpreadsheet,
    FileText,
    Image,
    Archive
} from "lucide-react";

import { API_BASE_URL } from "../api";
import {recordDailyActivity} from "../dailyActivity";
import { SEARCH_RESULT_TYPE } from "./SearchWorkspace";


/*
    Tipi locali per le API del file system.

    Usiamo tipi definiti direttamente qui
    per evitare errori TypeScript con API
    ancora sperimentali.
*/
type PermissionMode =
    "read"
    |
    "readwrite";


interface LocalFileHandle {

    kind: "file";

    name: string;

    getFile:
        () => Promise<File>;

    remove?:
        () => Promise<void>;

    requestPermission?:
        (
            options?: {
                mode?: PermissionMode;
            }
        ) => Promise<
            "granted"
            |
            "denied"
            |
            "prompt"
        >;

}


interface LocalWritableFile {

    write:
        (
            data:
                File
                |
                Blob
        ) => Promise<void>;

    close:
        () => Promise<void>;

}


interface LocalDestinationFileHandle {

    createWritable:
        () => Promise<LocalWritableFile>;

}


interface LocalDirectoryHandle {

    name: string;

    getFileHandle:
        (
            name: string,
            options?: {
                create?: boolean;
            }
        ) => Promise<LocalDestinationFileHandle>;

}


interface LocalDataTransferItem
    extends DataTransferItem {

    getAsFileSystemHandle?:
        () => Promise<
            LocalFileHandle
            |
            null
        >;

}


interface LocalWindow
    extends Window {

    showDirectoryPicker?:
        (
            options?: {
                id?: string;
                mode?: PermissionMode;
                startIn?: string;
            }
        ) => Promise<LocalDirectoryHandle>;

}


/*
    File inserito temporaneamente
    dentro Fire Mountain.
*/
interface FireMountainItem {

    id: string;

    name: string;

    size: number;

    lastModified: number;

    handle?: LocalFileHandle;

    sourcePath?: string;

}

function FileKindIcon({name}: {name: string}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, 15);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
    if (extension === "pdf") return <span className="fileKindIcon pdf"><FileText size={15}/></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word"><FileText size={15}/></span>;
    if (["xls", "xlsx", "csv", "ods"].includes(extension)) return <span className="fileKindIcon excel"><FileSpreadsheet size={15}/></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt"><FileText size={15}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image"><Image size={15}/></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive"><Archive size={15}/></span>;
    return <span className="fileKindIcon generic"><File size={15}/></span>;
}

function formatSize(size: number) { return size ? `${Math.max(1, Math.round(size / 1024))} KB` : "Size unavailable"; }

let sharedQueue: FireMountainItem[] = [];
let sharedSendInProgress = false;
const sharedQueueListeners = new Set<() => void>();
const subscribeToQueue = (listener: () => void) => {
    sharedQueueListeners.add(listener);
    return () => { sharedQueueListeners.delete(listener); };
};
const readSharedQueue = () => sharedQueue;
const readSendingState = () => sharedSendInProgress;
function setSendingToFire(sending: boolean) {
    sharedSendInProgress = sending;
    sharedQueueListeners.forEach(listener => listener());
}

function updateSharedQueue(update: SetStateAction<FireMountainItem[]>) {
    sharedQueue = typeof update === "function"
        ? (update as (current: FireMountainItem[]) => FireMountainItem[])(sharedQueue)
        : update;
    sharedQueueListeners.forEach(listener => listener());
}

// Shared imperative entry point used by file lists that live outside this component.
// eslint-disable-next-line react-refresh/only-export-components
export function enqueueFireMountainFiles(files: Array<{name: string; path: string; size?: number; createdAt?: string}>) {
    updateSharedQueue(current => {
        const known = new Set(current.map(item => item.sourcePath).filter(Boolean));
        return [...current, ...files.filter(file => file.path && !known.has(file.path)).map(file => ({
            id: crypto.randomUUID(), name: file.name, size: file.size ?? 0,
            lastModified: file.createdAt ? new Date(file.createdAt).getTime() : Date.now(), sourcePath: file.path
        }))];
    });
}


function FireMountain() {

    // File attualmente presenti nella lista
    const queuedFiles = useSyncExternalStore(subscribeToQueue, readSharedQueue);
    const setQueuedFiles = (update: SetStateAction<FireMountainItem[]>) => updateSharedQueue(update);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent("folderrocket-fire-paths", {
            detail: queuedFiles.map(item => item.sourcePath).filter((path): path is string => Boolean(path))
        }));
    }, [queuedFiles]);

    useEffect(() => {
        const removeSearchResults = (event: Event) => {
            const paths = (event as CustomEvent<string[]>).detail ?? [];
            setQueuedFiles(current => current.filter(item => !item.sourcePath || !paths.includes(item.sourcePath)));
        };
        window.addEventListener("folderrocket-remove-from-fire", removeSearchResults);
        return () => window.removeEventListener("folderrocket-remove-from-fire", removeSearchResults);
    }, []);


    // Evidenzia l'area durante il trascinamento
    const [dragging, setDragging] =
        useState(false);


    // Cartella selezionata come cestino
    const [
        trashDirectory,
        setTrashDirectory
    ] =
        useState<LocalDirectoryHandle | null>(
            null
        );


    // Spostamento in corso
    const sendingToFire = useSyncExternalStore(subscribeToQueue, readSendingState);

    useEffect(() => {
        function addSearchResults(event: Event) {
            const results = (event as CustomEvent<Array<{name: string; path: string; size?: number}>>).detail;
            if (!Array.isArray(results)) return;
            setQueuedFiles(current => {
                const seen = new Set(current.map(item => item.sourcePath));
                return [
                ...current,
                ...results.filter(result => {
                    if (!result.path || seen.has(result.path)) return false;
                    seen.add(result.path);
                    return true;
                }).map(result => ({
                    id: `${result.path}-${crypto.randomUUID()}`,
                    name: result.name,
                    size: result.size ?? 0,
                    lastModified: Date.now(),
                    sourcePath: result.path
                }))
                ];
            });
        }
        window.addEventListener("folderrocket-add-to-fire", addSearchResults);
        return () => window.removeEventListener("folderrocket-add-to-fire", addSearchResults);
    }, []);


    /*
        Crea un identificativo per la lista.
    */
    function createItemId(
        file: File
    ): string {

        return [
            file.name,
            file.size,
            file.lastModified,
            crypto.randomUUID()
        ].join("-");

    }


    /*
        Verifica se il file è già stato
        inserito nella lista.
    */
    function isFileAlreadyQueued(
        file: File,
        items: FireMountainItem[]
    ): boolean {

        return items.some(
            item => {

                return (
                    item.name === file.name
                    &&
                    item.size === file.size
                    &&
                    item.lastModified ===
                        file.lastModified
                );

            }
        );

    }


    /*
        Gestisce il rilascio dei file
        dentro Fire Mountain.

        I file vengono solamente aggiunti
        alla lista. Non vengono ancora eliminati.
    */
    async function handleDrop(
        event: React.DragEvent<HTMLElement>
    ) {

        event.preventDefault();

        event.stopPropagation();

        setDragging(false);


        const searchResults =
            event.dataTransfer.getData(
                SEARCH_RESULT_TYPE
            )
            ||
            event.dataTransfer.getData("text/plain")
                .replace("folderrocket-search:", "");


        if (searchResults) {

            try {

                const results =
                    JSON.parse(
                        searchResults
                    ) as Array<{
                        name: string;
                        path: string;
                        size?: number;
                    }>;

                const newItems =
                    results.map(
                        result => ({
                            id: `${result.path}-${crypto.randomUUID()}`,
                            name: result.name,
                            size: result.size ?? 0,
                            lastModified: Date.now(),
                            sourcePath: result.path
                        })
                    );

                setQueuedFiles(
                    currentFiles => [
                        ...currentFiles,
                        ...newItems.filter(
                            newItem =>
                                !currentFiles.some(
                                    item =>
                                        item.sourcePath === newItem.sourcePath
                                )
                        )
                    ]
                );

            }

            catch (error) {

                console.error(
                    "Errore risultati ricerca:",
                    error
                );

            }

            return;

        }


        const droppedItems =
            Array.from(
                event.dataTransfer.items
            )
            .filter(
                item =>
                    item.kind === "file"
            );


        /*
            IMPORTANTE:
            getAsFileSystemHandle() viene chiamato subito
            per tutti gli elementi, prima di qualunque await.

            In questo modo il browser mantiene valido
            l'accesso a tutti i file del drop multiplo.
        */
        const handlePromises =
            droppedItems.map(
                droppedItem => {

                    const localItem =
                        droppedItem as LocalDataTransferItem;


                    if (
                        typeof localItem
                            .getAsFileSystemHandle
                        !==
                        "function"
                    ) {

                        return Promise.resolve(
                            null
                        );

                    }


                    return localItem
                        .getAsFileSystemHandle();

                }
            );


        const handles =
            await Promise.all(
                handlePromises
            );


        const newQueuedFiles:
            FireMountainItem[] =
            [];


        for (
            const handle
            of handles
        ) {

            if (
                !handle
                ||
                handle.kind !== "file"
            ) {

                continue;

            }


            let file: File;


            try {

                file =
                    await handle.getFile();

            }

            catch (error) {

                console.error(
                    "Errore lettura file:",
                    error
                );


                continue;

            }


            const comparisonList = [
                ...queuedFiles,
                ...newQueuedFiles
            ];


            if (
                isFileAlreadyQueued(
                    file,
                    comparisonList
                )
            ) {

                continue;

            }


            newQueuedFiles.push({

                id:
                    createItemId(
                        file
                    ),

                name:
                    file.name,

                size:
                    file.size,

                lastModified:
                    file.lastModified,

                handle

            });

        }


        if (
            newQueuedFiles.length === 0
        ) {

            alert(
                "Nessun nuovo file è stato aggiunto"
            );

            return;

        }


        setQueuedFiles(
            currentFiles => [
                ...currentFiles,
                ...newQueuedFiles
            ]
        );

    }


    /*
        Rimuove un file dalla lista.

        Il file originale non viene modificato.
    */
    function removeFromQueue(
        itemId: string
    ) {

        setQueuedFiles(
            currentFiles =>
                currentFiles.filter(
                    item =>
                        item.id !== itemId
                )
        );

    }


    /*
        Svuota la lista senza eliminare
        nessun file dal computer.
    */
    function clearQueue() {

        setQueuedFiles([]);

    }


    /*
        Apre il selettore di Windows
        per scegliere la cartella-cestino.
    */
    async function chooseTrashDirectory():
        Promise<LocalDirectoryHandle> {

        const localWindow =
            window as LocalWindow;


        if (
            typeof localWindow
                .showDirectoryPicker
            !==
            "function"
        ) {

            throw new Error(
                "La selezione della cartella non è supportata. Usa Chrome o Edge aggiornato."
            );

        }


        const selectedDirectory =
            await localWindow
                .showDirectoryPicker({

                    id:
                        "folderrocket-trash",

                    mode:
                        "readwrite",

                    startIn:
                        "documents"

                });


        setTrashDirectory(
            selectedDirectory
        );


        return selectedDirectory;

    }


    /*
        Controlla se un nome esiste
        nella cartella-cestino.
    */
    async function destinationFileExists(
        directory: LocalDirectoryHandle,
        fileName: string
    ): Promise<boolean> {

        try {

            await directory.getFileHandle(
                fileName
            );


            return true;

        }

        catch {

            return false;

        }

    }


    /*
        Genera un nome alternativo
        quando esiste già un file omonimo.
    */
    async function createUniqueName(
        directory: LocalDirectoryHandle,
        originalName: string
    ): Promise<string> {

        const originalExists =
            await destinationFileExists(
                directory,
                originalName
            );


        if (!originalExists) {

            return originalName;

        }


        const lastDotIndex =
            originalName.lastIndexOf(".");


        const hasExtension =
            lastDotIndex > 0;


        const baseName =
            hasExtension
                ? originalName.slice(
                    0,
                    lastDotIndex
                )
                : originalName;


        const extension =
            hasExtension
                ? originalName.slice(
                    lastDotIndex
                )
                : "";


        let counter =
            1;


        while (true) {

            const candidateName =
                `${baseName} (${counter})${extension}`;


            const candidateExists =
                await destinationFileExists(
                    directory,
                    candidateName
                );


            if (!candidateExists) {

                return candidateName;

            }


            counter++;

        }

    }


    /*
        Copia il file nella cartella-cestino.
    */
    async function copyFileToTrash(
        item: FireMountainItem,
        directory: LocalDirectoryHandle
    ): Promise<string> {

        if (!item.handle) {

            throw new Error(
                `Handle non disponibile per "${item.name}".`
            );

        }

        const originalFile =
            await item.handle.getFile();


        const destinationName =
            await createUniqueName(
                directory,
                originalFile.name
            );


        const destinationHandle =
            await directory.getFileHandle(
                destinationName,
                {
                    create: true
                }
            );


        const writable =
            await destinationHandle
                .createWritable();


        await writable.write(
            originalFile
        );


        await writable.close();


        return destinationName;

    }


    /*
        Richiede il permesso di modifica
        quando il browser lo permette.
    */
    async function requestWritePermission(
        item: FireMountainItem
    ) {

        if (!item.handle) {

            return;

        }

        if (
            typeof item.handle
                .requestPermission
            !==
            "function"
        ) {

            return;

        }


        const permission =
            await item.handle
                .requestPermission({

                    mode:
                        "readwrite"

                });


        if (
            permission !== "granted"
        ) {

            throw new Error(
                `Permesso negato per "${item.name}".`
            );

        }

    }


    /*
        Elimina il file dalla posizione originale.

        Questa operazione viene eseguita
        solo dopo aver completato la copia.
    */
    async function removeOriginalFile(
        item: FireMountainItem
    ) {

        if (!item.handle) {

            throw new Error(
                `Handle non disponibile per "${item.name}".`
            );

        }

        await requestWritePermission(
            item
        );


        if (
            typeof item.handle.remove
            !==
            "function"
        ) {

            throw new Error(
                `Il browser permette di leggere "${item.name}", ma non di eliminare il file originale.`
            );

        }


        await item.handle.remove();

    }


    /*
        Copia tutti i file nella cartella-cestino
        e successivamente elimina gli originali.
    */
    async function sendToFireMountain() {
        if (sharedSendInProgress) return;

        if (
            queuedFiles.length === 0
        ) {

            alert(
                "Trascina prima almeno un file dentro Fire Mountain"
            );

            return;

        }


        const confirmed =
            window.confirm(
                `Vuoi inviare ${queuedFiles.length} file a Fire Mountain?`
            );


        if (!confirmed) {

            return;

        }


        try {
            setSendingToFire(true);


            let selectedDirectory = trashDirectory;


            const completedIds:
                string[] =
                [];


            const errors:
                string[] =
                [];


            for (
                const item
                of queuedFiles
            ) {

                try {

                    if (item.sourcePath) {

                        const response =
                            await fetch(
                                `${API_BASE_URL}/trash-file`,
                                {
                                    method: "POST",
                                    credentials: "include",
                                    headers: {
                                        "Content-Type": "application/json"
                                    },
                                    body: JSON.stringify({
                                        path: item.sourcePath
                                    })
                                }
                            );

                        const data =
                            await response.json() as {
                                message?: string;
                            };

                        if (!response.ok) {

                            throw new Error(
                                data.message
                                ??
                                `Impossibile cestinare "${item.name}".`
                            );

                        }

                        completedIds.push(item.id);

                        continue;

                    }

                    selectedDirectory ??= await chooseTrashDirectory();
                    const destinationName =
                        await copyFileToTrash(
                            item,
                            selectedDirectory
                        );


                    console.log(
                        "COPIA COMPLETATA:",
                        item.name,
                        "→",
                        destinationName
                    );


                    await removeOriginalFile(
                        item
                    );


                    console.log(
                        "ORIGINALE ELIMINATO:",
                        item.name
                    );


                    completedIds.push(
                        item.id
                    );

                }

                catch (error) {

                    console.error(
                        "ERRORE FILE:",
                        item.name,
                        error
                    );


                    errors.push(

                        `${item.name}: ${
                            error instanceof Error
                                ? error.message
                                : "Errore sconosciuto"
                        }`

                    );

                }

            }


            setQueuedFiles(
                currentFiles =>
                    currentFiles.filter(
                        item =>
                            !completedIds.includes(
                                item.id
                            )
                    )
            );


            if (
                errors.length > 0
            ) {

                alert(
                    [
                        `${completedIds.length} file spostati correttamente.`,
                        "",
                        "Problemi riscontrati:",
                        ...errors
                    ].join("\n")
                );

                return;

            }


            alert(
                `${completedIds.length} file spostati nel cestino`
            );
            recordDailyActivity({kind:"fire",summary:`Deleted ${completedIds.length} file${completedIds.length===1?"":"s"}`,files:queuedFiles.filter(item=>completedIds.includes(item.id)).map(item=>item.name)});

        }

        catch (error) {

            console.error(
                "ERRORE FIRE MOUNTAIN:",
                error
            );


            alert(
                error instanceof Error
                    ? error.message
                    : "Errore durante lo spostamento dei file"
            );

        }

        finally {
            setSendingToFire(false);

        }

    }


    return (

        <section

            className={
                dragging
                    ? "fireMountainCard fireMountainCardDragging"
                    : queuedFiles.length === 0
                        ? "fireMountainCard isEmptyFireMountain"
                        : "fireMountainCard"
            }

            onDragEnter={(event) => {

                event.preventDefault();

                event.stopPropagation();

                setDragging(true);

            }}

            onDragOver={(event) => {

                event.preventDefault();

                event.stopPropagation();

                event.dataTransfer.dropEffect =
                    "move";

                setDragging(true);

            }}

            onDragLeave={(event) => {

                event.preventDefault();

                event.stopPropagation();


                const relatedTarget =
                    event.relatedTarget as Node | null;


                if (
                    relatedTarget
                    &&
                    event.currentTarget.contains(
                        relatedTarget
                    )
                ) {

                    return;

                }


                setDragging(false);

            }}

            onDrop={
                handleDrop
            }

        >

            <div className="fireMountainFiles">

                {queuedFiles.length === 0 && <div className="fireMountainIdentity">
                    <Flame size={17} strokeWidth={2} />
                    <span>Fire Mountain</span>
                </div>}

                {
                    queuedFiles.length === 0
                        ? null
                        : (

                            queuedFiles.map(
                                item => (

                                    <div

                                        key={
                                            item.id
                                        }

                                        className="fireMountainFile"

                                    >

                                        <div className="fireMountainFileInfo">

                                            <span className="fireMountainFileName">
                                                <FileKindIcon name={item.name} />
                                                {item.name}
                                            </span>


                                            <span className="fireMountainFileSize">
                                                {formatSize(item.size)} · Added {item.lastModified ? new Date(item.lastModified).toLocaleDateString("en-GB") : "now"}
                                            </span>

                                        </div>


                                        <button

                                            type="button"

                                            className="fireMountainRemoveButton"

                                            title="Rimuovi dalla lista"

                                            onClick={(event) => {

                                                event.stopPropagation();

                                                removeFromQueue(
                                                    item.id
                                                );

                                            }}

                                        >

                                            <X
                                                size={15}
                                                strokeWidth={2.5}
                                            />

                                        </button>

                                    </div>

                                )
                            )

                        )
                }

            </div>


                    <div className="fireMountainSummary">

                        <span>

                            {queuedFiles.length}

                            {
                                queuedFiles.length === 1
                                    ? " file pronto"
                                    : " file pronti"
                            }

                        </span>

                        <button type="button" className="fireMountainButton fireMountainSendButton" onClick={sendToFireMountain} disabled={sendingToFire}>
                            <Trash2 size={14} strokeWidth={2} />
                            {sendingToFire ? "Sending..." : "Send to Fire"}
                        </button>

                        <button

                            type="button"

                            className="fireMountainClearButton"

                            onClick={
                                clearQueue
                            }

                            disabled={queuedFiles.length === 0}

                        >
                            Svuota lista
                        </button>

                    </div>

        </section>

    );

}


export default FireMountain;
