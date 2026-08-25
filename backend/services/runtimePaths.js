const path = require("path");

const BACKEND_DIRECTORY = path.join(__dirname, "..");

function configuredDirectory(variableName, fallback) {
    const configured = String(process.env[variableName] ?? "").trim();
    return configured ? path.resolve(configured) : fallback;
}

function getRuntimeDataDirectory() {
    return configuredDirectory("FOLDERROCKET_DATA_DIR", path.join(BACKEND_DIRECTORY, "data"));
}

function getRuntimeUploadsDirectory() {
    return configuredDirectory("FOLDERROCKET_UPLOADS_DIR", path.join(BACKEND_DIRECTORY, "uploads"));
}

function getRuntimeTokenDirectory() {
    return configuredDirectory("FOLDERROCKET_TOKEN_DIR", BACKEND_DIRECTORY);
}

module.exports = {getRuntimeDataDirectory, getRuntimeTokenDirectory, getRuntimeUploadsDirectory};
