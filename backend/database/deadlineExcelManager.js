const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");


const SHEET_NAME = "Deadlines";


/*
    Le uniche colonne ammesse
    dentro scadenze.xlsx.
*/
const DEADLINE_COLUMNS = [

    {
        header: "Nome file",
        key: "fileName",
        width: 40
    },

    {
        header: "Scadenza",
        key: "expirationDate",
        width: 18
    },

    {
        header: "Giorni rimanenti",
        key: "daysRemaining",
        width: 20
    },

    {
        header: "Stato",
        key: "status",
        width: 22
    },

    {
        header: "Origine",
        key: "source",
        width: 18
    },

    {
        header: "Motivazione",
        key: "reason",
        width: 70
    }

];


/*
    Percorso completo di scadenze.xlsx.
*/
function getDeadlineExcelPath(folderPath) {

    return path.join(
        folderPath,
        "scadenze.xlsx"
    );

}


/*
    Applica lo stile all'intestazione.
*/
function styleHeader(sheet) {

    const headerRow =
        sheet.getRow(1);


    headerRow.font = {

        bold: true,

        color: {
            argb: "FFFFFFFF"
        }

    };


    headerRow.fill = {

        type: "pattern",

        pattern: "solid",

        fgColor: {
            argb: "FF1F4E78"
        }

    };


    headerRow.alignment = {

        vertical: "middle",

        horizontal: "center",

        wrapText: true

    };


    headerRow.height = 28;

}


/*
    Recupera i dati utili dal vecchio foglio.

    Cerca le colonne attraverso il nome
    dell'intestazione, non attraverso
    la posizione numerica.
*/
function extractExistingDeadlineData(sheet) {

    const rows =
        [];


    const headerMap =
        new Map();


    const headerRow =
        sheet.getRow(1);


    headerRow.eachCell(
        (cell, columnNumber) => {

            const headerName =
                String(
                    cell.value ?? ""
                ).trim();


            if (headerName) {

                headerMap.set(
                    headerName,
                    columnNumber
                );

            }

        }
    );


    const fileNameColumn =
        headerMap.get(
            "Nome file"
        );


    if (!fileNameColumn) {

        return rows;

    }


    const expirationColumn =
        headerMap.get(
            "Scadenza"
        );


    const daysColumn =
        headerMap.get(
            "Giorni rimanenti"
        );


    const statusColumn =
        headerMap.get(
            "Stato"
        );


    const sourceColumn =
        headerMap.get(
            "Origine"
        );


    const reasonColumn =
        headerMap.get(
            "Motivazione"
        );


    sheet.eachRow(
        (row, rowNumber) => {

            if (rowNumber === 1) {

                return;

            }


            const fileName =
                String(
                    row.getCell(
                        fileNameColumn
                    ).value ?? ""
                ).trim();


            if (!fileName) {

                return;

            }


            rows.push({

                fileName,

                expirationDate:
                    expirationColumn
                        ? row.getCell(
                            expirationColumn
                        ).value ?? ""
                        : "",

                daysRemaining:
                    daysColumn
                        ? row.getCell(
                            daysColumn
                        ).value ?? ""
                        : "",

                status:
                    statusColumn
                        ? row.getCell(
                            statusColumn
                        ).value ?? ""
                        : "",

                source:
                    sourceColumn
                        ? row.getCell(
                            sourceColumn
                        ).value ?? ""
                        : "",

                reason:
                    reasonColumn
                        ? row.getCell(
                            reasonColumn
                        ).value ?? ""
                        : ""

            });

        }
    );


    return rows;

}


/*
    Apre scadenze.xlsx.

    Se esiste già:
    - legge i dati utili;
    - elimina il vecchio foglio;
    - ricrea il foglio con sole sei colonne;
    - reinserisce i dati validi.

    In questo modo eventuali colonne come
    Azienda, Posizione, Competenze, ecc.
    vengono eliminate.
*/
async function loadDeadlineWorkbook(folderPath) {

    const excelPath =
        getDeadlineExcelPath(
            folderPath
        );


    const workbook =
        new ExcelJS.Workbook();


    let existingData =
        [];


    if (
        fs.existsSync(
            excelPath
        )
    ) {

        await workbook.xlsx.readFile(
            excelPath
        );


        const existingSheet =
            workbook.getWorksheet(
                SHEET_NAME
            )
            ??
            workbook.worksheets[0];


        if (existingSheet) {

            existingData =
                extractExistingDeadlineData(
                    existingSheet
                );

        }


        /*
            Rimuove tutti i vecchi fogli
            per evitare colonne residue.
        */
        const sheetIds =
            workbook.worksheets.map(
                sheet => sheet.id
            );


        for (
            const sheetId
            of sheetIds
        ) {

            workbook.removeWorksheet(
                sheetId
            );

        }

    }


    /*
        Crea sempre un foglio pulito.
    */
    const sheet =
        workbook.addWorksheet(
            SHEET_NAME
        );


    sheet.columns =
        DEADLINE_COLUMNS;


    styleHeader(
        sheet
    );


    /*
        Reinserisce esclusivamente
        i dati relativi alle scadenze.
    */
    for (
        const item
        of existingData
    ) {

        sheet.addRow({

            fileName:
                item.fileName,

            expirationDate:
                item.expirationDate,

            daysRemaining:
                item.daysRemaining,

            status:
                item.status,

            source:
                item.source,

            reason:
                item.reason

        });

    }


    return {

        workbook,

        sheet,

        excelPath

    };

}

async function addManualDeadline(folderPath, {label, expirationDate, watchDays, urgentDays, levels}) {
    const {workbook, sheet, excelPath} = await loadDeadlineWorkbook(folderPath);
    let row = findRowByFileName(sheet, label);
    if (!row) row = sheet.addRow([]);
    const due = new Date(`${expirationDate}T12:00:00`);
    if (Number.isNaN(due.getTime())) throw new Error("Enter a valid deadline date.");
    const daysRemaining = Math.ceil((due.getTime() - Date.now()) / 86400000);
    const deadlineLevels = (Array.isArray(levels) && levels.length ? levels : [
        {id: "urgent", days: urgentDays, color: "#e53935"},
        {id: "watch", days: watchDays, color: "#e6a700"}
    ]).map(level => ({id: String(level.id), days: Number(level.days), color: String(level.color || "#5b8def")})).filter(level => level.id && Number.isFinite(level.days) && level.days >= 0).sort((first, second) => first.days - second.days);
    const status = deadlineLevels.find(level => daysRemaining <= level.days)?.id ?? "ok";
    const statusColors = Object.fromEntries(deadlineLevels.map(level => [level.id, level.color]));
    row.getCell(1).value = label;
    row.getCell(2).value = expirationDate;
    row.getCell(3).value = daysRemaining;
    row.getCell(4).value = status;
    row.getCell(5).value = "Manual";
    row.getCell(6).value = "Created from FolderRocket deadline input.";
    row.alignment = {vertical:"top", wrapText:true};
    for (let columnNumber = 1; columnNumber <= 6; columnNumber++) row.getCell(columnNumber).fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFFFFFFF"}};
    applyDeadlineColor(row, status, statusColors);
    styleHeader(sheet);
    await workbook.xlsx.writeFile(excelPath);
    return {fileName:label, expirationDate, daysRemaining, status, source:"Manual", reason:"Created from FolderRocket deadline input."};
}


/*
    Cerca una riga attraverso
    il nome esatto del file.
*/
function findRowByFileName(
    sheet,
    fileName
) {

    let foundRow =
        null;


    sheet.eachRow(
        (row, rowNumber) => {

            if (rowNumber === 1) {

                return;

            }


            const currentFileName =
                String(
                    row.getCell(1).value ?? ""
                ).trim();


            if (
                currentFileName ===
                fileName
            ) {

                foundRow =
                    row;

            }

        }
    );


    return foundRow;

}


/*
    Converte una data Excel o una stringa
    nel formato YYYY-MM-DD.
*/
function normalizeExpirationDate(value) {

    if (!value) {

        return null;

    }


    if (value instanceof Date) {

        return value
            .toISOString()
            .slice(
                0,
                10
            );

    }


    const stringValue =
        String(value)
        .trim();


    return stringValue || null;

}


/*
    Legge i dati delle scadenze
    già presenti in scadenze.xlsx.

    Se il file non esiste,
    restituisce una Map vuota.
*/
async function getDeadlineArchiveData(
    folderPath
) {

    const excelPath =
        getDeadlineExcelPath(
            folderPath
        );


    if (
        !fs.existsSync(
            excelPath
        )
    ) {

        return new Map();

    }


    const {
        sheet
    } =
        await loadDeadlineWorkbook(
            folderPath
        );


    const archive =
        new Map();


    sheet.eachRow(
        (row, rowNumber) => {

            if (rowNumber === 1) {

                return;

            }


            const fileName =
                String(
                    row.getCell(1).value ?? ""
                ).trim();


            if (!fileName) {

                return;

            }


            archive.set(
                fileName,
                {

                    expirationDate:
                        normalizeExpirationDate(
                            row.getCell(2).value
                        ),

                    daysRemaining:
                        row.getCell(3).value ?? null,

                    status:
                        String(
                            row.getCell(4).value ?? ""
                        ).trim(),

                    source:
                        String(
                            row.getCell(5).value ?? ""
                        ).trim()
                        ||
                        null,

                    reason:
                        String(
                            row.getCell(6).value ?? ""
                        ).trim()

                }
            );

        }
    );


    return archive;

}


/*
    Colora tutta la riga:

    watch   -> giallo
    urgent  -> rosso chiaro
    missing -> azzurro
    ok      -> bianco
*/
function applyDeadlineColor(
    row,
    status,
    statusColors = {}
) {

    let color =
        "FFFFFFFF";


    const configuredColor = statusColors[status];
    if (typeof configuredColor === "string" && /^#[0-9a-f]{6}$/i.test(configuredColor)) {
        color = `FF${configuredColor.slice(1).toUpperCase()}`;
    }
    else if (status === "watch") {

        color =
            "FFFFE699";

    }

    else if (
        status === "urgent"
    ) {

        color =
            "FFF4CCCC";

    }

    else if (
        status === "missing"
    ) {

        color =
            "FFCFE2F3";

    }


    /*
        Colora esattamente le sei colonne.
    */
    for (
        let columnNumber = 1;
        columnNumber <= 6;
        columnNumber++
    ) {

        const cell =
            row.getCell(
                columnNumber
            );


        cell.fill = {

            type: "pattern",

            pattern: "solid",

            fgColor: {
                argb: color
            }

        };

    }

}


/*
    Aggiorna o crea scadenze.xlsx.
*/
/*
    Aggiorna completamente scadenze.xlsx.

    A ogni controllo riscrive:
    - data di scadenza;
    - giorni rimanenti;
    - stato;
    - origine;
    - motivazione;
    - colore della riga.

    Questo permette di cambiare le soglie
    urgentDays e watchDays senza dover
    rianalizzare il documento con l'AI.
*/
async function updateDeadlineInfo(
    folderPath,
    results,
    statusColors = {}
) {

    const {
        workbook,
        sheet,
        excelPath
    } =
        await loadDeadlineWorkbook(
            folderPath
        );


    /*
        Crea l'elenco dei file realmente
        presenti nella cartella.
    */
    const currentFileNames =
        new Set(
            results.map(
                result =>
                    result.fileName
            )
        );


    /*
        Elimina da scadenze.xlsx le righe
        dei file che non esistono più.
    */
    for (
        let rowNumber = sheet.rowCount;
        rowNumber >= 2;
        rowNumber--
    ) {

        const row =
            sheet.getRow(
                rowNumber
            );


        const fileName =
            String(
                row.getCell(1).value ?? ""
            ).trim();

        const source =
            String(
                row.getCell(5).value ?? ""
            ).trim();


        if (
            fileName
            &&
            source !== "Manual"
            &&
            !currentFileNames.has(
                fileName
            )
        ) {

            sheet.spliceRows(
                rowNumber,
                1
            );

        }

    }


    /*
        Aggiorna ogni file analizzato.
    */
    for (
        const result
        of results
    ) {

        let row =
            findRowByFileName(
                sheet,
                result.fileName
            );


        /*
            Se il file non è ancora presente,
            crea una nuova riga.
        */
        if (!row) {

            row =
                sheet.addRow([]);

        }


        /*
            Riscrive sempre tutti i valori.

            In particolare, Stato e Giorni rimanenti
            vengono aggiornati anche quando la data
            era già presente nell'Excel.
        */
        row.getCell(1).value =
            result.fileName;

        row.getCell(2).value =
            result.expirationDate ?? "";

        row.getCell(3).value =
            result.daysRemaining ?? "";

        row.getCell(4).value =
            result.status ?? "";

        row.getCell(5).value =
            result.source ?? "";

        row.getCell(6).value =
            result.reason ?? "";


        row.alignment = {

            vertical: "top",

            wrapText: true

        };


        /*
            Ripulisce prima tutti i colori
            presenti nella riga.
        */
        for (
            let columnNumber = 1;
            columnNumber <= 6;
            columnNumber++
        ) {

            row.getCell(
                columnNumber
            ).fill = {

                type: "pattern",

                pattern: "solid",

                fgColor: {
                    argb: "FFFFFFFF"
                }

            };

        }


        /*
            Applica il nuovo colore sulla base
            delle soglie appena selezionate.
        */
        applyDeadlineColor(
            row,
            result.status,
            statusColors
        );


        console.log(
            "SCADENZA AGGIORNATA:",
            result.fileName,
            result.daysRemaining,
            result.status
        );

    }


    /*
        Mantiene lo stile corretto
        dell'intestazione.
    */
    styleHeader(
        sheet
    );


    try {

        await workbook.xlsx.writeFile(
            excelPath
        );

    }

    catch (error) {

        if (
            error
            &&
            error.code === "EBUSY"
        ) {

            throw new Error(
                "scadenze.xlsx è aperto. Chiudilo e riprova."
            );

        }


        throw error;

    }


    console.log(
        "SCADENZE EXCEL AGGIORNATO:",
        excelPath
    );


    return {

        excelPath,

        updatedFiles:
            results.length

    };

}


module.exports = {

    getDeadlineArchiveData,

    updateDeadlineInfo,
    addManualDeadline

};
