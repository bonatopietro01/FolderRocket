const fs = require("fs");
const path = require("path");

const readFileContent =
    require("../ai/reader");

const analyzeDeadline =
    require("../ai/deadlineAnalyzer");

const {
    getDeadlineArchiveData,
    updateDeadlineInfo,
    addManualDeadline
} = require(
    "../database/deadlineExcelManager"
);


/*
    Restituisce tutti i file reali
    presenti nella cartella.

    Esclude:
    - archivio.xlsx
    - scadenze.xlsx
    - eventuali sottocartelle
*/
function getFolderFiles(
    folderPath
) {

    return fs
        .readdirSync(
            folderPath
        )
        .filter(
            fileName => {

                const filePath =
                    path.join(
                        folderPath,
                        fileName
                    );


                if (
                    !fs.statSync(
                        filePath
                    ).isFile()
                ) {

                    return false;

                }


                const lowerName =
                    fileName.toLowerCase();


                if (
                    lowerName === "archivio.xlsx"
                    ||
                    lowerName === "scadenze.xlsx"
                ) {

                    return false;

                }


                return true;

            }
        );

}


/*
    Prova a leggere il contenuto del file.

    Se il formato non è supportato
    o il file è danneggiato,
    restituisce una stringa vuota.

    L'AI potrà comunque analizzare
    il nome del file.
*/
async function safelyReadFile(
    filePath,
    fileName
) {

    try {

        const content =
            await readFileContent(
                filePath
            );


        if (
            typeof content === "string"
        ) {

            return content;

        }


        return "";

    }

    catch (error) {

        console.log(
            "FILE NON LEGGIBILE PER SCADENZE:",
            fileName,
            error
        );


        return "";

    }

}


/*
    Converte una data nel formato YYYY-MM-DD.

    Restituisce null se il valore
    non rappresenta una data valida.
*/
function normalizeExpirationDate(
    expirationDate
) {

    if (!expirationDate) {

        return null;

    }


    /*
        Se arriva una vera Date.
    */
    if (
        expirationDate instanceof Date
    ) {

        if (
            Number.isNaN(
                expirationDate.getTime()
            )
        ) {

            return null;

        }


        return expirationDate
            .toISOString()
            .slice(
                0,
                10
            );

    }


    const dateText =
        String(
            expirationDate
        ).trim();


    if (!dateText) {

        return null;

    }


    /*
        Accetta direttamente YYYY-MM-DD.
    */
    if (
        /^\d{4}-\d{2}-\d{2}$/
        .test(
            dateText
        )
    ) {

        const parsedDate =
            new Date(
                `${dateText}T00:00:00`
            );


        if (
            Number.isNaN(
                parsedDate.getTime()
            )
        ) {

            return null;

        }


        return dateText;

    }


    /*
        Prova a interpretare altri formati
        eventualmente restituiti da Excel.
    */
    const parsedDate =
        new Date(
            dateText
        );


    if (
        Number.isNaN(
            parsedDate.getTime()
        )
    ) {

        return null;

    }


    return parsedDate
        .toISOString()
        .slice(
            0,
            10
        );

}

function normalizeDeadlineLevels(levels, watchDays, urgentDays) {
    const fallback = [
        {id: "urgent", label: "Urgentissimo", days: urgentDays, color: "#e53935"},
        {id: "watch", label: "Sotto controllo", days: watchDays, color: "#e6a700"}
    ];
    const source = Array.isArray(levels) && levels.length ? levels : fallback;
    const seen = new Set();
    const normalized = source.map((level, index) => ({
        id: String(level?.id || `level_${index}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48),
        label: String(level?.label || `Gravità ${index + 1}`).trim().slice(0, 80),
        days: Number(level?.days),
        color: /^#[0-9a-f]{6}$/i.test(String(level?.color)) ? String(level.color) : "#5b8def"
    })).filter(level => level.id && level.label && Number.isFinite(level.days) && level.days >= 0 && !seen.has(level.id) && (seen.add(level.id) || true));
    if (!normalized.length) throw new Error("Inserisci almeno un livello di gravità valido");
    return normalized.sort((first, second) => first.days - second.days);
}


/*
    Calcola i giorni mancanti
    e lo stato della scadenza.

    urgent:
    scaduto oppure entro urgentDays

    watch:
    oltre urgentDays ma entro watchDays

    ok:
    oltre watchDays

    missing:
    scadenza assente o non valida
*/
function calculateDeadlineStatus(
    expirationDate,
    levels
) {

    const normalizedDate =
        normalizeExpirationDate(
            expirationDate
        );


    if (!normalizedDate) {

        return {

            expirationDate: null,

            daysRemaining: null,

            status: "missing"

        };

    }


    const expiration =
        new Date(
            `${normalizedDate}T00:00:00`
        );


    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    const millisecondsPerDay =
        1000
        *
        60
        *
        60
        *
        24;


    const daysRemaining =
        Math.ceil(

            (
                expiration.getTime()
                -
                today.getTime()
            )
            /
            millisecondsPerDay

        );


    /*
        Comprende anche i documenti
        già scaduti, perché avranno
        daysRemaining negativo.
    */
    const matchingLevel = levels.find(level => daysRemaining <= level.days);
    if (matchingLevel) return {expirationDate: normalizedDate, daysRemaining, status: matchingLevel.id};


    return {

        expirationDate:
            normalizedDate,

        daysRemaining,

        status: "ok"

    };

}


/*
    Verifica che la cartella e le soglie
    siano valide.
*/
function validateDeadlineRequest(
    folderPath,
    watchDays,
    urgentDays,
    levels
) {

    if (!folderPath) {

        throw new Error(
            "Percorso cartella mancante"
        );

    }


    if (
        !fs.existsSync(
            folderPath
        )
    ) {

        throw new Error(
            "La cartella indicata non esiste"
        );

    }


    if (
        !fs.statSync(
            folderPath
        ).isDirectory()
    ) {

        throw new Error(
            "Il percorso indicato non è una cartella"
        );

    }


    if (
        !Number.isFinite(
            watchDays
        )
        ||
        !Number.isFinite(
            urgentDays
        )
    ) {

        throw new Error(
            "Le soglie inserite non sono valide"
        );

    }


    if (
        watchDays <= 0
    ) {

        throw new Error(
            "Sotto controllo deve essere maggiore di zero"
        );

    }


    if (
        urgentDays < 0
    ) {

        throw new Error(
            "Urgentissimo non può essere negativo"
        );

    }


    normalizeDeadlineLevels(levels, watchDays, urgentDays);

}


/*
    Analizza un singolo file
    soltanto se la scadenza non è
    già presente in scadenze.xlsx.
*/
async function getDeadlineForFile(
    fileName,
    filePath,
    existingInfo
) {

    let expirationDate =
        existingInfo
            ?.expirationDate
        ??
        null;


    let source =
        existingInfo
            ?.source
        ??
        null;


    let reason =
        existingInfo
            ?.reason
        ??
        "";


    /*
        Se la data è già presente,
        la conserva senza richiamare l'AI.
    */
    if (expirationDate) {

        return {

            expirationDate,

            source,

            reason

        };

    }


    const content =
        await safelyReadFile(
            filePath,
            fileName
        );


    try {

        const deadlineResult =
            await analyzeDeadline(
                fileName,
                content
            );


        expirationDate =
            deadlineResult
                ?.expirationDate
            ??
            null;


        source =
            deadlineResult
                ?.source
            ??
            null;


        reason =
            deadlineResult
                ?.reason
            ??
            "";

    }

    catch (error) {

        console.log(
            "ERRORE ANALISI SCADENZA:",
            fileName,
            error
        );


        expirationDate =
            null;


        source =
            null;


        reason =
            "Scadenza non determinata";

    }


    return {

        expirationDate,

        source,

        reason

    };

}


/*
    Controlla tutte le scadenze
    presenti nella cartella.

    Lavora esclusivamente con scadenze.xlsx.
    Non crea e non modifica archivio.xlsx.

    A ogni controllo:
    - recupera le date già salvate;
    - analizza con AI soltanto quelle mancanti;
    - ricalcola sempre giorni e stato;
    - aggiorna sempre Excel e colori.
*/
async function checkFolderDeadlines(
    folderPath,
    watchDays,
    urgentDays,
    levels
) {

    validateDeadlineRequest(
        folderPath,
        watchDays,
        urgentDays,
        levels
    );

    const deadlineLevels = normalizeDeadlineLevels(levels, watchDays, urgentDays);


    const fileNames =
        getFolderFiles(
            folderPath
        );


    /*
        Recupera le date già presenti
        dentro scadenze.xlsx.

        Se il file non esiste,
        riceve una Map vuota.
    */
    const deadlineArchive =
        await getDeadlineArchiveData(
            folderPath
        );


    const results =
        [];


    for (
        const fileName
        of fileNames
    ) {

        const filePath =
            path.join(
                folderPath,
                fileName
            );


        const existingInfo =
            deadlineArchive.get(
                fileName
            );


        /*
            Recupera la scadenza già salvata
            oppure analizza il documento.
        */
        const deadlineData =
            await getDeadlineForFile(
                fileName,
                filePath,
                existingInfo
            );


        /*
            Questo calcolo viene eseguito SEMPRE.

            Quindi se modifichi urgentDays
            o watchDays, lo stato cambia anche
            senza richiamare nuovamente l'AI.
        */
        const statusData =
            calculateDeadlineStatus(
                deadlineData.expirationDate,
                deadlineLevels
            );


        const result = {

            fileName,

            expirationDate:
                statusData.expirationDate,

            daysRemaining:
                statusData.daysRemaining,

            status:
                statusData.status,

            source:
                deadlineData.source,

            reason:
                deadlineData.reason

        };


        results.push(
            result
        );


        console.log(
            "SCADENZA RICALCOLATA:",
            {
                fileName:
                    result.fileName,

                expirationDate:
                    result.expirationDate,

                daysRemaining:
                    result.daysRemaining,

                status:
                    result.status,

                urgentDays,

                watchDays
            }
        );

    }


    /*
        Aggiorna sempre:
        - data;
        - giorni rimanenti;
        - stato;
        - colore;
        - origine;
        - motivazione.
    */
    await updateDeadlineInfo(
        folderPath,
        results,
        Object.fromEntries(deadlineLevels.map(level => [level.id, level.color]))
    );


    /*
        Contatori separati inviati
        al frontend.
    */
    const levelCounts = Object.fromEntries(deadlineLevels.map(level => [level.id, results.filter(result => result.status === level.id).length]));
    const urgentCount = levelCounts.urgent ?? 0;
    const watchCount = levelCounts.watch ?? 0;


    const missingCount =
        results.filter(
            result =>
                result.status === "missing"
        ).length;


    const okCount =
        results.filter(
            result =>
                result.status === "ok"
        ).length;


    console.log(
        "RIEPILOGO SCADENZE:",
        {
            urgentCount,
            watchCount,
            missingCount,
            okCount,
            urgentDays,
            watchDays
        }
    );


    return {

        message:
            `Controllo completato: ${urgentCount} urgenti, ${watchCount} sotto controllo`,

        urgentCount,

        watchCount,

        missingCount,

        okCount,

        totalFiles:
            results.length,

        levelCounts,
        levels: deadlineLevels,
        results

    };

}


module.exports = {

    checkFolderDeadlines,
    addManualDeadline

};
