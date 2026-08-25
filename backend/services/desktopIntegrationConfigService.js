const fs = require("fs");
const path = require("path");

const INTEGRATION_KEYS = [
    "OPENAI_API_KEY",
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "OUTLOOK_CLIENT_ID",
    "OUTLOOK_CLIENT_SECRET",
    "FOLDERROCKET_TOKEN_ENCRYPTION_KEY"
];

function configurationPath() {
    const configured = String(process.env.FOLDERROCKET_CONFIG_FILE ?? "").trim();
    return configured && path.isAbsolute(configured) ? configured : "";
}

function readConfiguration() {
    const target = configurationPath();
    if (!target || !fs.existsSync(target)) return {};

    const values = {};
    for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || !INTEGRATION_KEYS.includes(match[1])) continue;
        const rawValue = match[2].trim();
        values[match[1]] = rawValue.length >= 2 && ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'")))
            ? rawValue.slice(1, -1)
            : rawValue;
    }
    return values;
}

function configured(value) {
    return Boolean(String(value ?? "").trim());
}

function integrationStatus() {
    return {
        desktopConfigurationAvailable: Boolean(configurationPath()),
        aiConfigured: configured(process.env.OPENAI_API_KEY),
        gmailConfigured: configured(process.env.GMAIL_CLIENT_ID) && configured(process.env.GMAIL_CLIENT_SECRET),
        outlookConfigured: configured(process.env.OUTLOOK_CLIENT_ID) && configured(process.env.OUTLOOK_CLIENT_SECRET),
        tokenEncryptionConfigured: configured(process.env.FOLDERROCKET_TOKEN_ENCRYPTION_KEY)
    };
}

function saveIntegrationConfiguration(input) {
    const target = configurationPath();
    if (!target) throw new Error("Local desktop configuration is not available in this server mode.");
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid integration settings.");

    const next = {...readConfiguration()};
    for (const key of INTEGRATION_KEYS) {
        if (typeof input[key] !== "string") continue;
        const value = input[key].trim();
        if (!value) continue;
        if (value.length > 4_096 || /[\r\n]/.test(value)) throw new Error(`Invalid ${key} value.`);
        next[key] = value;
        process.env[key] = value;
    }

    fs.mkdirSync(path.dirname(target), {recursive: true});
    const content = [
        "# FolderRocket private local configuration.",
        "# This file is not bundled or uploaded to GitHub.",
        ...INTEGRATION_KEYS.filter(key => configured(next[key])).map(key => `${key}=${next[key]}`),
        ""
    ].join("\n");
    fs.writeFileSync(target, content, {encoding: "utf8", mode: 0o600});
    return integrationStatus();
}

module.exports = {integrationStatus, saveIntegrationConfiguration};
