/*
 * Emergency local-only administrator password reset.
 *
 * Run this only on the Windows account that owns the FolderRocket data folder.
 * It never sends data over the network and does not print the new password.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function dataDirectory() {
    const configured = String(process.env.FOLDERROCKET_DATA_DIR || "").trim();
    if (configured) return path.resolve(configured);
    return path.join(process.env.APPDATA || os.homedir(), "FolderRocket", "data");
}

function readJson(filePath, fallback) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch { return fallback; }
}

function writeJsonAtomically(filePath, value) {
    const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), {encoding: "utf8", mode: 0o600});
    fs.renameSync(temporaryPath, filePath);
}

function passwordDigest(password, salt = crypto.randomBytes(16).toString("hex")) {
    return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function question(prompt) {
    return new Promise(resolve => {
        process.stdout.write(prompt);
        process.stdin.resume();
        process.stdin.setEncoding("utf8");
        process.stdin.once("data", data => resolve(String(data).trim()));
    });
}

function hiddenQuestion(prompt) {
    if (!process.stdin.isTTY) throw new Error("Run this command in an interactive PowerShell window.");
    return new Promise((resolve, reject) => {
        let value = "";
        const stdin = process.stdin;
        process.stdout.write(prompt);
        stdin.resume();
        stdin.setRawMode(true);
        stdin.setEncoding("utf8");
        const finish = () => {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener("data", onData);
            process.stdout.write("\n");
            resolve(value);
        };
        const onData = character => {
            if (character === "\u0003") {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener("data", onData);
                reject(new Error("Reset cancelled."));
            } else if (character === "\r" || character === "\n") {
                finish();
            } else if (character === "\u0008" || character === "\u007f") {
                if (value.length) {
                    value = value.slice(0, -1);
                    process.stdout.write("\b \b");
                }
            } else if (character >= " ") {
                value += character;
                process.stdout.write("•");
            }
        };
        stdin.on("data", onData);
    });
}

async function main() {
    const directory = dataDirectory();
    const usersPath = path.join(directory, "users.json");
    const sessionsPath = path.join(directory, "sessions.json");
    const users = readJson(usersPath, null);
    if (!Array.isArray(users) || !users.length) throw new Error(`No FolderRocket accounts were found in ${usersPath}.`);

    const administrators = users.filter(user => user?.role === "admin" && typeof user.email === "string");
    if (!administrators.length) throw new Error("No administrator account was found.");

    console.log("\nLocal FolderRocket administrator recovery");
    console.log(`Data folder: ${directory}`);
    console.log(`Administrator account${administrators.length === 1 ? "" : "s"}: ${administrators.map(user => user.email).join(", ")}`);
    const email = (await question("Administrator email: ")).toLowerCase();
    const administrator = administrators.find(user => user.email.toLowerCase() === email);
    if (!administrator) throw new Error("That email is not a local FolderRocket administrator.");

    const password = await hiddenQuestion("New password (at least 12 characters): ");
    const confirmation = await hiddenQuestion("Repeat new password: ");
    if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
    if (password !== confirmation) throw new Error("The two passwords do not match.");
    const approval = await question("Type RESET to change this local administrator password: ");
    if (approval !== "RESET") throw new Error("Reset cancelled.");

    const backupPath = `${usersPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(usersPath, backupPath);
    administrator.passwordDigest = passwordDigest(password);
    delete administrator.passwordReset;
    delete administrator.emergencyRecovery;
    writeJsonAtomically(usersPath, users);

    const sessions = readJson(sessionsPath, {});
    if (sessions && typeof sessions === "object") {
        for (const [digest, session] of Object.entries(sessions)) {
            if (session?.userId === administrator.id) delete sessions[digest];
        }
        writeJsonAtomically(sessionsPath, sessions);
    }

    console.log("\nPassword reset completed. Previous sessions for this administrator were closed.");
    console.log("Start FolderRocket and sign in with the new password.");
    console.log(`A backup was saved locally as ${path.basename(backupPath)}.`);
}

main().catch(error => {
    console.error(`\nReset not completed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
