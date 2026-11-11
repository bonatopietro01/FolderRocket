import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Manual legacy utility: running it MOVES files out of the project input folder.
const projectDirectory = path.resolve(__dirname, "../..");

const inputFolder = path.join(projectDirectory, "input");
const outputFolder = path.join(projectDirectory, "output");

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
