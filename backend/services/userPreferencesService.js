const fs = require("fs");
const path = require("path");

const PREFERENCES_DIRECTORY = path.join(__dirname, "..", "data", "preferences");

function preferencesPath(userId) {
    return path.join(PREFERENCES_DIRECTORY, `${userId}.json`);
}

function readDashboardPreferences(userId) {
    try {
        const value = JSON.parse(fs.readFileSync(preferencesPath(userId), "utf8"));
        return value && typeof value === "object" ? value : null;
    } catch { return null; }
}

function writeDashboardPreferences(userId, preferences) {
    fs.mkdirSync(PREFERENCES_DIRECTORY, {recursive: true});
    fs.writeFileSync(preferencesPath(userId), JSON.stringify(preferences, null, 2), {encoding: "utf8", mode: 0o600});
}

function listDashboardPreferences() {
    try {
        if (!fs.existsSync(PREFERENCES_DIRECTORY)) return [];
        return fs.readdirSync(PREFERENCES_DIRECTORY, {withFileTypes: true})
            .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
            .map(entry => {
                const userId = path.basename(entry.name, ".json");
                return {userId, settings: readDashboardPreferences(userId)};
            })
            .filter(record => record.settings);
    } catch {
        return [];
    }
}

module.exports = {readDashboardPreferences, writeDashboardPreferences, listDashboardPreferences};
