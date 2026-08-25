const fs = require("fs");
const path = require("path");
const readFileContent = require("../ai/reader");

function termsFromQuery(query) {
    return String(query ?? "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(term => term.length >= 3)
        .slice(0, 12);
}

async function searchFiles(folders, query) {
    const terms = termsFromQuery(query);
    if (!terms.length) throw new Error("Scrivi una richiesta più specifica");
    const results = [];
    const visitedFolders = new Set();
    const maximumFilesToInspect = 1200;

    function listFilesRecursively(folder) {
        const pending = [folder];
        const discovered = [];
        while (pending.length && discovered.length < maximumFilesToInspect) {
            const current = pending.pop();
            const resolved = path.resolve(current);
            if (visitedFolders.has(resolved)) continue;
            visitedFolders.add(resolved);
            let entries;
            try { entries = fs.readdirSync(current, {withFileTypes: true}); }
            catch { continue; }
            for (const entry of entries) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) pending.push(fullPath);
                else if (entry.isFile()) discovered.push(fullPath);
                if (discovered.length >= maximumFilesToInspect) break;
            }
        }
        return discovered;
    }

    for (const folder of folders ?? []) {
        if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) continue;
        for (const fullPath of listFilesRecursively(folder)) {
            const name = path.basename(fullPath);
            if (["archivio.xlsx", "scadenze.xlsx"].includes(name.toLowerCase())) continue;
            const lowered = name.toLowerCase();
            const nameMatches = terms.filter(term => lowered.includes(term));
            let contentMatches = [];
            if (nameMatches.length < terms.length) {
                try {
                    const content = String(await readFileContent(fullPath) ?? "").toLowerCase();
                    contentMatches = terms.filter(term => content.includes(term));
                } catch { contentMatches = []; }
            }
            const matches = [...new Set([...nameMatches, ...contentMatches])];
            if (matches.length) results.push({name, path: fullPath, matches, size: fs.statSync(fullPath).size});
        }
    }
    return results.slice(0, 100);
}

module.exports = {searchFiles};
