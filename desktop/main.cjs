const {app, BrowserWindow, dialog, shell, session} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {spawn} = require("node:child_process");

const PORT = Number(process.env.FOLDERROCKET_PORT) || 3000;
const APP_ORIGIN = `http://localhost:${PORT}`;
let backendProcess = null;
let mainWindow = null;

const desktopConfigKeys = new Set([
    "OPENAI_API_KEY",
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "OUTLOOK_CLIENT_ID",
    "OUTLOOK_CLIENT_SECRET",
    "FOLDERROCKET_TOKEN_ENCRYPTION_KEY"
]);

function backendDirectory() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "backend")
        : path.join(__dirname, "..", "backend");
}

function applicationIconPath() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "app.asar", "build", "icon.ico")
        : path.join(__dirname, "..", "build", "icon.ico");
}

function unquoteEnvironmentValue(value) {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function readDesktopConfiguration(applicationData) {
    const configurationPath = path.join(applicationData, "config.env");
    if (!fs.existsSync(configurationPath)) return {};

    const values = {};
    for (const line of fs.readFileSync(configurationPath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || !desktopConfigKeys.has(match[1])) continue;
        values[match[1]] = unquoteEnvironmentValue(match[2]);
    }
    return values;
}

function backendIsReady() {
    return new Promise(resolve => {
        const request = http.get(`${APP_ORIGIN}/health`, response => {
            response.resume();
            resolve(response.statusCode === 200);
        });
        request.setTimeout(1000, () => {
            request.destroy();
            resolve(false);
        });
        request.on("error", () => resolve(false));
    });
}

async function waitForBackend() {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (await backendIsReady()) return true;
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return false;
}

function startBackend() {
    const directory = backendDirectory();
    const entry = path.join(directory, "server.js");
    if (!fs.existsSync(entry)) throw new Error("FolderRocket backend was not found in this installation.");

    const applicationData = app.getPath("userData");
    const desktopConfiguration = readDesktopConfiguration(applicationData);
    const environment = {
        ...process.env,
        ...desktopConfiguration,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        PORT: String(PORT),
        HOST: "127.0.0.1",
        APP_ORIGIN,
        FRONTEND_ORIGIN: APP_ORIGIN,
        FOLDERROCKET_DESKTOP: "1",
        FOLDERROCKET_DATA_DIR: path.join(applicationData, "data"),
        FOLDERROCKET_UPLOADS_DIR: path.join(applicationData, "uploads"),
        FOLDERROCKET_TOKEN_DIR: path.join(applicationData, "tokens"),
        FOLDERROCKET_CONFIG_FILE: path.join(applicationData, "config.env")
    };

    backendProcess = spawn(process.execPath, [entry], {
        cwd: directory,
        env: environment,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
    });

    backendProcess.stdout?.on("data", data => console.info(`[FolderRocket backend] ${data}`));
    backendProcess.stderr?.on("data", data => console.error(`[FolderRocket backend] ${data}`));
    backendProcess.once("exit", code => {
        if (!app.isQuitting && code && code !== 0) console.error(`FolderRocket backend stopped with code ${code}.`);
        backendProcess = null;
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: "#0e1424",
        title: "FolderRocket",
        icon: applicationIconPath(),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        try {
            const requested = new URL(url);
            if (requested.origin === APP_ORIGIN && requested.searchParams.get("cargoShip") === "1") {
                return {
                    action: "allow",
                    overrideBrowserWindowOptions: {
                        width: 390,
                        height: 560,
                        minWidth: 330,
                        minHeight: 430,
                        autoHideMenuBar: true,
                        backgroundColor: "#0e1424",
                        title: "FolderRocket Cargo Ship",
                        icon: applicationIconPath(),
                        webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true}
                    }
                };
            }
        } catch {
            return {action: "deny"};
        }
        if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
        return {action: "deny"};
    });
    mainWindow.once("ready-to-show", () => mainWindow?.show());
    void mainWindow.loadURL(APP_ORIGIN);
}

app.whenReady().then(async () => {
    session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        return requestingOrigin === APP_ORIGIN && (permission === "media" || permission === "fullscreen");
    });
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === "display-capture" || permission === "media");
    });
    if (!await backendIsReady()) startBackend();
    if (!await waitForBackend()) {
        await dialog.showMessageBox({
            type: "error",
            title: "FolderRocket could not start",
            message: "The local FolderRocket backend did not respond.",
            detail: "Close other FolderRocket or Node processes using port 3000, then try again."
        });
        app.quit();
        return;
    }
    createWindow();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
    app.isQuitting = true;
    if (backendProcess && !backendProcess.killed) backendProcess.kill();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
