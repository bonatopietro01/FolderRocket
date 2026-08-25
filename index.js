import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFolder = path.join(__dirname, "input");
const outputFolder = path.join(__dirname, "output");

// Crea input se non esiste
if (!fs.existsSync(inputFolder)) {
    fs.mkdirSync(inputFolder);
    console.log("Cartella 'input' creata.");
}

// Crea output se non esiste
if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
    console.log("Cartella 'output' creata.");
}

const files = fs.readdirSync(inputFolder);

if (files.length === 0) {
    console.log("La cartella input è vuota.");
    process.exit();
}

files.forEach(file => {
    const source = path.join(inputFolder, file);
    const destination = path.join(outputFolder, file);

    fs.renameSync(source, destination);

    console.log(`${file} spostato.`);
});

console.log("Operazione completata.");
