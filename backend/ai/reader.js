const fs = require("fs");
const path = require("path");

const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const XLSX = require("xlsx");



async function readFileContent(filePath){


    try{


        const extension =
            path.extname(filePath)
            .toLowerCase();



        console.log(
            "ESTENSIONE FILE:",
            extension
        );



        // DOCX

        if(extension === ".docx"){


            console.log(
                "LETTURA DOCX"
            );


            const result =
                await mammoth.extractRawText({
                    path:filePath
                });


            return result.value;


        }



        // PDF

        else if(extension === ".pdf"){


            console.log(
                "LETTURA PDF"
            );


            const buffer =
                fs.readFileSync(
                    filePath
                );


            const data =
                await pdfParse(
                    buffer
                );


            return data.text;


        }



        // TXT

        else if(extension === ".txt"){


            return fs.readFileSync(
                filePath,
                "utf8"
            );


        }


        // XLSX

        else if(extension === ".xlsx"){

            const workbook =
                XLSX.readFile(
                    filePath
                );


            return workbook.SheetNames
                .map(
                    sheetName =>
                        XLSX.utils.sheet_to_csv(
                            workbook.Sheets[
                                sheetName
                            ]
                        )
                )
                .join("\n");

        }



        else{


            return "Formato non supportato";


        }


    }


    catch(error){


        console.log(
            "ERRORE READER:",
            error.message
        );


        return "";

    }


}



module.exports = readFileContent;
