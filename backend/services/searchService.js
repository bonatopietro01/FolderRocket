const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const readFileContent = require("../ai/reader");

function termsFromQuery(query) {
    return String(query ?? "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(term => term.length >= 3)
        .slice(0, 12);
}

async function expandTermsWithAi(query, baseTerms) {
    const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) throw new Error("OpenAI AI integration is not configured yet.");
    const client = new OpenAI({apiKey});
    try {
        const response = await client.chat.completions.create({
            model: "gpt-4.1-mini",
            response_format: {type: "json_object"},
            temperature: 0,
            messages: [
                {role: "system", content: "Turn a request for a local file into up to 12 short search terms. Include the important original terms and likely document/content synonyms. Return JSON only: {\"terms\":[\"term\"]}. Do not invent people, companies, or facts."},
                {role: "user", content: String(query ?? "").slice(0, 1200)}
            ]
        });
        const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
        const aiTerms = Array.isArray(parsed.terms) ? parsed.terms : [];
        const normalized = aiTerms
            .filter(term => typeof term === "string")
            .flatMap(term => termsFromQuery(term))
            .slice(0, 12);
        return [...new Set([...baseTerms, ...normalized])].slice(0, 16);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`AI Search Assistant failed: ${reason}`);
    }
}

async function searchFiles(folders, query, options = {}) {
    const baseTerms = termsFromQuery(query);
    const terms = options.ai ? await expandTermsWithAi(query, baseTerms) : baseTerms;
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
