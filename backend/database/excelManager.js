const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");


const SHEET_NAME = "Files";


const DEFAULT_ARCHIVE_COLUMNS = [

    {
        header: "File name",
        key: "fileName",
        width: 40
    },

    {
        header: "Company",
        key: "company",
        width: 28
    },

    {
        header: "Position",
        key: "position",
        width: 35
    },

    {
        header: "Document type",
        key: "documentType",
        width: 28
    },

    {
        header: "Skills",
        key: "skills",
        width: 60
    },

    {
        header: "Experience",
        key: "experience",
        width: 70
    },

    {
        header: "Date",
        key: "date",
        width: 18
    },

    {
        header: "AI status",
        key: "aiStatus",
        width: 70
    }

];

const ARCHIVE_KEYS = new Set(DEFAULT_ARCHIVE_COLUMNS.map(column => column.key));

function getArchiveColumns(config) {
    const requested = Array.isArray(config) ? config : [];
    const used = new Set(["fileName"]);
    const columns = [DEFAULT_ARCHIVE_COLUMNS[0]];
    for (const column of requested) {
        if (!column || column.enabled === false || typeof column.key !== "string" || column.key === "fileName" || column.key === "aiStatus" || used.has(column.key)) continue;
        const fallback = DEFAULT_ARCHIVE_COLUMNS.find(item => item.key === column.key);
        const isCustom = column.key.startsWith("custom_") && typeof column.instruction === "string" && column.instruction.trim();
        if (!fallback && !isCustom) continue;
        const header = typeof column.header === "string" && column.header.trim() ? column.header.trim() : (fallback?.header ?? "Custom value");
        columns.push(fallback ? {...fallback, header} : {key: column.key, header, width: 35, instruction: column.instruction.trim()});
        used.add(column.key);
    }
    if (columns.length <= 1) return DEFAULT_ARCHIVE_COLUMNS;
    columns.push(DEFAULT_ARCHIVE_COLUMNS.find(column => column.key === "aiStatus"));
    return columns;
}


function getArchivePath(folderPath) {

    return path.join(
        folderPath,
        "archivio.xlsx"
    );

}


function configureSheet(sheet, columns = DEFAULT_ARCHIVE_COLUMNS) {

    sheet.columns =
        columns;


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


function configureArchiveFilters(sheet, columns) {
    sheet.autoFilter = {
        from: {row: 1, column: 1},
        to: {row: Math.max(1, sheet.rowCount), column: columns.length}
    };
    sheet.views = [{state: "frozen", ySplit: 1}];
}

function normalizeAnalysis(
    fileName,
    analysis = {}
) {

    return {

        fileName,

        company:
            analysis.azienda ?? "",

        position:
            analysis.posizione ?? "",

        documentType:
            analysis.tipoDocumento ?? "",

        skills:
            Array.isArray(
                analysis.competenze
            )
                ? analysis.competenze
                    .filter(
                        skill =>
                            typeof skill === "string"
                    )
                    .slice(0, 5)
                    .join(", ")
                : (
                    analysis.competenze
                    ??
                    ""
                ),

        experience:
            String(
                analysis.esperienza ?? ""
            )
                .split(/\||\n|;|•/)
                .map(
                    item =>
                        item.trim()
                )
                .filter(Boolean)
                .slice(0, 5)
                .join(" | "),

        date:
            new Date()
                .toLocaleDateString(
                    "it-IT"
                ),

        aiStatus:
            String(
                analysis.aiStatus
                ??
                "Not analysed"
            )

    };

}

function buildArchiveItem(fileName, analysis, columns) {
    const base = normalizeAnalysis(fileName, analysis);
    return Object.fromEntries(columns.map(column => [
        column.key,
        column.key.startsWith("custom_") ? String(analysis?.custom?.[column.key] ?? "") : (base[column.key] ?? "")
    ]));
}


async function openArchive(folderPath, columns = DEFAULT_ARCHIVE_COLUMNS) {

    if (
        !fs.existsSync(
            folderPath
        )
    ) {

        fs.mkdirSync(
            folderPath,
            {
                recursive: true
            }
        );

    }


    const excelPath =
        getArchivePath(
            folderPath
        );


    const workbook =
        new ExcelJS.Workbook();


    if (
        fs.existsSync(
            excelPath
        )
    ) {

        await workbook.xlsx.readFile(
            excelPath
        );

    }


    let sheet =
        workbook.getWorksheet(
            SHEET_NAME
        );


    if (!sheet) {

        sheet =
            workbook.addWorksheet(
                SHEET_NAME
            );


        configureSheet(sheet, columns);

    }


    return {

        workbook,

        sheet,

        excelPath

    };

}


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


function writeArchiveRow(row, item, columns = DEFAULT_ARCHIVE_COLUMNS) {
    columns.forEach((column, index) => {
        row.getCell(index + 1).value = item[column.key] ?? "";
    });

    const statusIndex = columns.findIndex(column => column.key === "aiStatus");
    if (statusIndex >= 0) {
        const statusCell = row.getCell(statusIndex + 1);
        const status = String(item.aiStatus ?? "");
        statusCell.font = {bold: true, color: {argb: status.startsWith("Success") ? "FF218739" : status.startsWith("Warning") ? "FFC17B00" : "FFD12C3C"}};
    }


    row.alignment = {

        vertical: "top",

        wrapText: true

    };

}


async function saveWorkbook(
    workbook,
    excelPath
) {

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
                "archivio.xlsx è aperto. Chiudilo e riprova."
            );

        }


        throw error;

    }


    console.log(
        "ARCHIVIO EXCEL SALVATO:",
        excelPath
    );

}


/*
    Aggiornamento automatico dopo l'upload
    di un singolo file.
*/
async function saveFileInfo(
    folderPath,
    fileName,
    analysis = {},
    archiveConfig
) {
    const columns = getArchiveColumns(archiveConfig);

    const {
        workbook,
        sheet,
        excelPath
    } =
        await openArchive(folderPath, columns);


    const item =
        buildArchiveItem(
            fileName,
            analysis,
            columns
        );


    let row =
        findRowByFileName(
            sheet,
            fileName
        );


    if (!row) {

        row =
            sheet.addRow([]);

    }


    writeArchiveRow(
        row,
        item,
        columns
    );


    configureSheet(
        sheet,
        columns
    );

    configureArchiveFilters(
        sheet,
        columns
    );


    await saveWorkbook(
        workbook,
        excelPath
    );


    return {

        excelPath,

        updatedFiles: 1

    };

}


/*
    Aggiornamento completo eseguito
    quando premi il pulsante Archivio.

    Cancella le vecchie righe e ricrea
    una riga per ogni file trovato.
*/
async function saveMultipleFileInfo(
    folderPath,
    records,
    archiveConfig
) {
    const columns = getArchiveColumns(archiveConfig);

    const excelPath =
        getArchivePath(
            folderPath
        );


    /*
        Crea un workbook nuovo.

        In questo modo non rimangono righe,
        colonne o strutture errate.
    */
    const workbook =
        new ExcelJS.Workbook();


    const sheet =
        workbook.addWorksheet(
            SHEET_NAME
        );


    configureSheet(
        sheet,
        columns
    );


    for (
        const record
        of records
    ) {

        const item =
            buildArchiveItem(
                record.fileName,
                record.analysis,
                columns
            );


        const row =
            sheet.addRow([]);


        writeArchiveRow(
            row,
            item,
            columns
        );


        console.log(
            "RIGA ARCHIVIO CREATA:",
            record.fileName
        );

    }

    configureArchiveFilters(
        sheet,
        columns
    );


    if (fs.existsSync(excelPath)) {
        try {
            fs.unlinkSync(excelPath);
        } catch (error) {
            if (error && (error.code === "EBUSY" || error.code === "EPERM")) {
                throw new Error("archivio.xlsx is open or locked. Close it and try again.");
            }
            throw error;
        }
    }

    await saveWorkbook(
        workbook,
        excelPath
    );


    return {

        excelPath,

        updatedFiles:
            records.length

    };

}


module.exports =
    saveFileInfo;


module.exports.saveMultipleFileInfo =
    saveMultipleFileInfo;

module.exports.getArchiveColumns = getArchiveColumns;
module.exports.DEFAULT_ARCHIVE_COLUMNS = DEFAULT_ARCHIVE_COLUMNS;
