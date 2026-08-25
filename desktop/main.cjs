const {app, BrowserWindow, dialog, shell} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {spawn} = require("node:child_process");

const PORT = Number(process.env.FOLDERROCKET_PORT) || 3000;
const APP_ORIGIN = `http://localhost:${PORT}`;
let backendProcess = null;
let mainWindow = null;

function backendDirectory() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "backend")
        : path.join(__dirname, "..", "backend");
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
    const environment = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        PORT: String(PORT),
        HOST: "127.0.0.1",
        APP_ORIGIN,
        FRONTEND_ORIGIN: APP_ORIGIN,
        FOLDERROCKET_DESKTOP: "1",
        FOLDERROCKET_DATA_DIR: path.join(applicationData, "data"),
        FOLDERROCKET_UPLOADS_DIR: path.join(applicationData, "uploads"),
        FOLDERROCKET_TOKEN_DIR: path.join(applicationData, "tokens")
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
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
        return {action: "deny"};
    });
    mainWindow.once("ready-to-show", () => mainWindow?.show());
    void mainWindow.loadURL(APP_ORIGIN);
}

app.whenReady().then(async () => {
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
