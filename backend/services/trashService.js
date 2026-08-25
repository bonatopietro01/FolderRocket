const fs = require("fs");
const path = require("path");


/*
    Controlla che il percorso non rappresenti
    una posizione pericolosa, come la radice C:\.
*/
function validateTrashPath(targetPath) {

    if (
        typeof targetPath !== "string"
        ||
        targetPath.trim() === ""
    ) {

        throw new Error(
            "Percorso del file mancante"
        );

    }


    const normalizedPath =
        path.resolve(
            targetPath.trim()
        );


    /*
        Impedisce di cestinare direttamente
        la radice di un disco, per esempio C:\.
    */
    const parsedPath =
        path.parse(
            normalizedPath
        );


    if (
        normalizedPath === parsedPath.root
    ) {

        throw new Error(
            "Non è possibile spostare nel cestino la radice del disco"
        );

    }


    if (
        !fs.existsSync(
            normalizedPath
        )
    ) {

        throw new Error(
            "Il file o la cartella indicata non esiste"
        );

    }


    return normalizedPath;

}


/*
    Sposta un file o una cartella
    nel Cestino del sistema operativo.

    Usiamo import() perché il pacchetto trash
    è distribuito come modulo ESM, mentre
    questo backend usa CommonJS.
*/
async function moveToTrash(
    targetPath
) {

    const normalizedPath =
        validateTrashPath(
            targetPath
        );


    const trashModule =
        await import(
            "trash"
        );


    const trash =
        trashModule.default;


    await trash([
        normalizedPath
    ]);


    console.log(
        "SPOSTATO NEL CESTINO:",
        normalizedPath
    );


    return {

        message:
            "File spostato nel Cestino",

        trashedPath:
            normalizedPath

    };

}


module.exports = {

    moveToTrash

};