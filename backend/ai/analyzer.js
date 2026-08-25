require("dotenv").config();

const OpenAI = require("openai");

function getClient() {
    const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
    return apiKey ? new OpenAI({apiKey}) : null;
}

const STANDARD_COLUMNS = {
    company: "Company or organisation named in the document",
    position: "Job title, role, course, or position",
    documentType: "Document type, for example CV, cover letter, certificate, or contract",
    skills: "Up to 5 short skills, separated by commas",
    experience: "Up to 5 short experience points, separated by |",
    date: "Relevant document date; leave blank when no date is available"
};

function getRequestedColumns(columns) {
    const configured = Array.isArray(columns) && columns.length ? columns : Object.keys(STANDARD_COLUMNS).map(key => ({key, enabled: true}));

    return configured
        .filter(column => column && column.enabled !== false && typeof column.key === "string")
        .map(column => {
            const header = typeof column.header === "string" && column.header.trim() ? column.header.trim() : column.key;
            if (STANDARD_COLUMNS[column.key]) {
                return {
                    key: column.key,
                    header,
                    description: typeof column.instruction === "string" && column.instruction.trim()
                        ? column.instruction.trim()
                        : STANDARD_COLUMNS[column.key]
                };
            }
            if (column.key.startsWith("custom_") && typeof column.instruction === "string" && column.instruction.trim()) {
                return {key: column.key, header, description: column.instruction.trim()};
            }
            return null;
        })
        .filter(Boolean);
}

function emptyAnalysis(requestedColumns = []) {
    return {
        azienda: "",
        posizione: "",
        tipoDocumento: "",
        competenze: [],
        esperienza: "",
        custom: Object.fromEntries(requestedColumns.filter(column => column.key.startsWith("custom_")).map(column => [column.key, ""]))
    };
}

function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function cleanSkills(value) {
    const items = Array.isArray(value) ? value : cleanText(value).split(/,|\||\n|;/);
    return items.map(cleanText).filter(Boolean).slice(0, 5);
}

async function analyzeDocument(text, archiveColumns) {
    const requestedColumns = getRequestedColumns(archiveColumns);

    const client = getClient();
    if (!client) {
        throw new Error("OpenAI AI integration is not configured yet.");
    }

    const documentText = cleanText(text);
    if (!documentText || documentText === "Formato non supportato") {
        console.log("ARCHIVE AI: no readable text was extracted from this file");
        return emptyAnalysis(requestedColumns);
    }

    try {
        const response = await client.chat.completions.create({
            model: "gpt-4.1-mini",
            response_format: {type: "json_object"},
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: [
                        "You extract information from one document for an Excel archive.",
                        "Return one valid JSON object only. Use exactly the requested keys, with no additional keys.",
                        "Every value must be a concise string. If the document does not contain a value, use an empty string.",
                        "For skills return at most 5 short skills separated by commas. For experience return at most 5 short points separated by |.",
                        "For every requested key, use its description to decide what to extract.",
                        `Requested columns (key, visible Excel header, description): ${JSON.stringify(requestedColumns)}`
                    ].join("\n")
                },
                {role: "user", content: documentText.slice(0, 30000)}
            ]
        });

        const raw = response.choices[0]?.message?.content;
        const parsed = JSON.parse(raw || "{}");
        const value = key => cleanText(parsed[key]);
        const custom = Object.fromEntries(requestedColumns
            .filter(column => column.key.startsWith("custom_"))
            .map(column => [column.key, value(column.key)]));

        return {
            azienda: value("company"),
            posizione: value("position"),
            tipoDocumento: value("documentType"),
            competenze: cleanSkills(parsed.skills),
            esperienza: cleanText(parsed.experience).split(/\||\n|;/).map(cleanText).filter(Boolean).slice(0, 5).join(" | "),
            custom
        };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log("ARCHIVE AI ERROR:", reason);
        throw new Error(`OpenAI archive analysis failed: ${reason}`);
    }
}

module.exports = analyzeDocument;
