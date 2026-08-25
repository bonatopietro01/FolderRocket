const fs = require("fs");
const path = require("path");

const readFileContent =
    require("../ai/reader");

const analyzeDocument =
    require("../ai/analyzer");

const {
    saveMultipleFileInfo
} = require("../database/excelManager");


/*
    Restituisce tutti i file reali presenti
    nella cartella.

    Esclude:
    - archivio.xlsx
    - scadenze.xlsx
    - eventuali sottocartelle
*/
function getFolderFiles(folderPath) {

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
    oppure il file è danneggiato,
    restituisce una stringa vuota.
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
            "FILE NON LEGGIBILE PER ARCHIVIO:",
            fileName,
            error
        );


        return "";

    }

}


/*
    Crea o aggiorna archivio.xlsx
    analizzando tutti i file della cartella.

    Il file Excel viene scritto una sola volta,
    dopo aver analizzato tutti i documenti.
*/
async function syncArchive(
    folderPath,
    archiveConfig
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


    const fileNames =
        getFolderFiles(
            folderPath
        );


    const records =
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


        console.log(
            "ANALISI ARCHIVIO:",
            fileName
        );


        const content =
            await safelyReadFile(
                filePath,
                fileName
            );


        let analysis = {

            azienda: "",

            posizione: "",

            tipoDocumento: "",

            competenze: [],

            esperienza: "",

            aiStatus: "Success"

        };


        if (!content || content === "Formato non supportato") {
            analysis.aiStatus = content === "Formato non supportato"
                ? "Warning: unsupported file format"
                : "Warning: no readable text extracted";
        }

        else try {

            const result =
                await analyzeDocument(
                    content,
                    archiveConfig
                );


            if (
                result
                &&
                typeof result === "object"
            ) {

                analysis = {

                    azienda:
                        result.azienda ?? "",

                    posizione:
                        result.posizione ?? "",

                    tipoDocumento:
                        result.tipoDocumento ?? "",

                    competenze:
                        Array.isArray(
                            result.competenze
                        )
                            ? result.competenze
                            : [],

                    esperienza:
                        result.esperienza ?? "",

                    custom:
                        result.custom ?? {},

                    aiStatus:
                        "Success"

                };

            }

        }

        catch (error) {

            console.log(
                "ERRORE ANALISI ARCHIVIO:",
                fileName,
                error
            );
            analysis.aiStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
        }


        records.push({

            fileName,

            analysis

        });

    }


    /*
        Salva tutti i file insieme.

        Questa funzione ricrea archivio.xlsx
        con una riga per ogni record.
    */
    await saveMultipleFileInfo(
        folderPath,
        records,
        archiveConfig
    );


    const errorCount = records.filter(record => String(record.analysis.aiStatus).startsWith("Error:")).length;
    const warningCount = records.filter(record => String(record.analysis.aiStatus).startsWith("Warning:")).length;

    return {

        message:
            `Archive updated: ${records.length} files · ${errorCount} errors · ${warningCount} warnings`,

        fileCount:
            records.length

    };

}


module.exports = {

    syncArchive

};
