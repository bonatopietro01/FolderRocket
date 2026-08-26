const {app, BrowserWindow, desktopCapturer, dialog, ipcMain, shell, session} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {spawn} = require("node:child_process");

// FolderRocket does not need GPU rendering. Software rendering avoids blank windows
// on Windows installations where Electron's GPU cache/process cannot initialise.
app.disableHardwareAcceleration();

const PORT = Number(process.env.FOLDERROCKET_PORT) || 3000;
const APP_ORIGIN = `http://localhost:${PORT}`;
const CARGO_SHIP_DOCK_SIZE = {width: 70, height: 70};
const CARGO_SHIP_DEFAULT_PANEL_SIZE = {width: 250, height: 230};
const CARGO_SHIP_MINIMUM_PANEL_SIZE = {width: 250, height: 230};
const CARGO_SHIP_MAXIMUM_PANEL_SIZE = {width: 880, height: 760};
let backendProcess = null;
let mainWindow = null;
let cargoWindow = null;
let cargoShipExpanded = false;
let cargoShipPanelSize = {...CARGO_SHIP_DEFAULT_PANEL_SIZE};
let selectedDisplaySourceId = "";

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
        minWidth: 640,
        minHeight: 700,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: "#0e1424",
        title: "FolderRocket",
        icon: applicationIconPath(),
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
        return {action: "deny"};
    });
    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(APP_ORIGIN)) {
            event.preventDefault();
            if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
        }
    });
    const notifyNavigationState = () => {
        if (!mainWindow?.isDestroyed()) mainWindow.webContents.send("folderrocket:navigation-changed");
    };
    mainWindow.webContents.on("did-navigate", notifyNavigationState);
    mainWindow.webContents.on("did-navigate-in-page", notifyNavigationState);
    mainWindow.webContents.on("zoom-changed", () => {
        if (!mainWindow?.isDestroyed()) mainWindow.webContents.send("folderrocket:zoom-changed", mainWindow.webContents.getZoomFactor());
    });
    mainWindow.once("ready-to-show", () => mainWindow?.show());
    void mainWindow.loadURL(APP_ORIGIN);
}

function createCargoShipWindow() {
    if (cargoWindow && !cargoWindow.isDestroyed()) {
        cargoWindow.show();
        cargoWindow.focus();
        return cargoWindow;
    }
    cargoWindow = new BrowserWindow({
        width: CARGO_SHIP_DOCK_SIZE.width,
        height: CARGO_SHIP_DOCK_SIZE.height,
        minWidth: CARGO_SHIP_DOCK_SIZE.width,
        minHeight: CARGO_SHIP_DOCK_SIZE.height,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: "#00000000",
        title: "FolderRocket Cargo Ship",
        icon: applicationIconPath(),
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    cargoWindow.webContents.setWindowOpenHandler(({url}) => {
        if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
        return {action: "deny"};
    });
    cargoWindow.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(APP_ORIGIN)) {
            event.preventDefault();
            if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
        }
    });
    cargoWindow.once("ready-to-show", () => cargoWindow?.show());
    cargoWindow.on("closed", () => { cargoWindow = null; cargoShipExpanded = false; });
    void cargoWindow.loadURL(`${APP_ORIGIN}/?folderrocketCargoShip=1`);
    return cargoWindow;
}

function normaliseCargoShipPanelSize(size) {
    const width = Number(size?.width);
    const height = Number(size?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
        width: Math.max(CARGO_SHIP_MINIMUM_PANEL_SIZE.width, Math.min(CARGO_SHIP_MAXIMUM_PANEL_SIZE.width, Math.round(width))),
        height: Math.max(CARGO_SHIP_MINIMUM_PANEL_SIZE.height, Math.min(CARGO_SHIP_MAXIMUM_PANEL_SIZE.height, Math.round(height)))
    };
}

function prepareCargoShipPanelWindow(size, position = null) {
    cargoWindow.setResizable(true);
    cargoWindow.setMinimumSize(CARGO_SHIP_MINIMUM_PANEL_SIZE.width, CARGO_SHIP_MINIMUM_PANEL_SIZE.height);
    cargoWindow.setMaximumSize(CARGO_SHIP_MAXIMUM_PANEL_SIZE.width, CARGO_SHIP_MAXIMUM_PANEL_SIZE.height);
    cargoWindow.setBounds(position ? {...position, ...size} : size);
    // Native edge-resizing is disabled: the deliberate in-panel grip is the
    // only resize control, so a click on the corner cannot resize the window.
    cargoWindow.setResizable(false);
}

function setCargoShipWindowExpanded(expanded) {
    if (!cargoWindow || cargoWindow.isDestroyed()) return false;
    cargoShipExpanded = expanded;
    if (expanded) {
        const [x, y] = cargoWindow.getPosition();
        const [width, height] = cargoWindow.getSize();
        prepareCargoShipPanelWindow(cargoShipPanelSize, {
            x: Math.round(x + (width - cargoShipPanelSize.width) / 2),
            y: Math.round(y + (height - cargoShipPanelSize.height) / 2)
        });
    } else {
        cargoWindow.setResizable(true);
        cargoWindow.setMinimumSize(1, 1);
        cargoWindow.setMaximumSize(10000, 10000);
        cargoWindow.setBounds(CARGO_SHIP_DOCK_SIZE);
        cargoWindow.setMinimumSize(CARGO_SHIP_DOCK_SIZE.width, CARGO_SHIP_DOCK_SIZE.height);
        cargoWindow.setMaximumSize(CARGO_SHIP_DOCK_SIZE.width, CARGO_SHIP_DOCK_SIZE.height);
        cargoWindow.setResizable(false);
    }
    cargoWindow.show();
    return true;
}

app.whenReady().then(async () => {
    session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
        return requestingOrigin === APP_ORIGIN && (permission === "media" || permission === "fullscreen");
    });
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === "display-capture" || permission === "media");
    });
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        if (request.securityOrigin !== APP_ORIGIN) {
            callback({});
            return;
        }
        try {
            const sources = await desktopCapturer.getSources({types: ["screen", "window"], thumbnailSize: {width: 160, height: 90}});
            const source = sources.find(item => item.id === selectedDisplaySourceId);
            selectedDisplaySourceId = "";
            callback(source ? {video: source} : {});
        } catch (error) {
            console.error("FolderRocket display capture could not start.", error);
            selectedDisplaySourceId = "";
            callback({});
        }
    });
    ipcMain.handle("folderrocket:list-display-sources", async event => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false) return [];
        const sources = await desktopCapturer.getSources({types: ["screen", "window"], thumbnailSize: {width: 360, height: 220}, fetchWindowIcons: true});
        return sources.map(source => ({id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL()}));
    });
    ipcMain.handle("folderrocket:select-display-source", (event, sourceId) => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || typeof sourceId !== "string" || sourceId.length > 300) return false;
        selectedDisplaySourceId = sourceId;
        return true;
    });
    ipcMain.handle("folderrocket:capture-page-region", async (event, requestedRegion) => {
        const sourceWindow = BrowserWindow.fromWebContents(event.sender);
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || !sourceWindow || sourceWindow.isDestroyed()) {
            throw new Error("FolderRocket window is not available.");
        }
        const contentBounds = sourceWindow.getContentBounds();
        const raw = requestedRegion && typeof requestedRegion === "object" ? requestedRegion : {};
        const x = Math.max(0, Math.min(contentBounds.width - 1, Math.floor(Number(raw.x) || 0)));
        const y = Math.max(0, Math.min(contentBounds.height - 1, Math.floor(Number(raw.y) || 0)));
        const width = Math.max(1, Math.min(contentBounds.width - x, Math.floor(Number(raw.width) || 1)));
        const height = Math.max(1, Math.min(contentBounds.height - y, Math.floor(Number(raw.height) || 1)));
        const image = await sourceWindow.webContents.capturePage({x, y, width, height});
        return image.toDataURL();
    });
    ipcMain.handle("folderrocket:navigation-state", event => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false) return {canGoBack: false, canGoForward: false};
        const history = event.sender.navigationHistory;
        return {canGoBack: history.canGoBack(), canGoForward: history.canGoForward()};
    });
    ipcMain.handle("folderrocket:zoom-factor", event => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false) return 1;
        return event.sender.getZoomFactor();
    });
    ipcMain.handle("folderrocket:set-zoom-factor", (event, factor) => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false) return 1;
        const requested = Number(factor);
        const next = Number.isFinite(requested) ? Math.max(.75, Math.min(1.5, requested)) : 1;
        event.sender.setZoomFactor(next);
        return next;
    });
    ipcMain.handle("folderrocket:open-cargo-ship-window", event => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false) return false;
        createCargoShipWindow();
        return true;
    });
    ipcMain.handle("folderrocket:close-cargo-ship-window", event => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || !cargoWindow || cargoWindow.isDestroyed() || cargoWindow.webContents.id !== event.sender.id) return false;
        cargoWindow.close();
        return true;
    });
    ipcMain.handle("folderrocket:set-cargo-ship-expanded", (event, expanded) => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || !cargoWindow || cargoWindow.isDestroyed() || cargoWindow.webContents.id !== event.sender.id) return false;
        return setCargoShipWindowExpanded(Boolean(expanded));
    });
    ipcMain.handle("folderrocket:move-cargo-ship-window", (event, position) => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || !cargoWindow || cargoWindow.isDestroyed() || cargoWindow.webContents.id !== event.sender.id || !position || typeof position !== "object") return false;
        const x = Number(position.x);
        const y = Number(position.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        cargoWindow.setPosition(Math.round(x), Math.round(y), true);
        return true;
    });
    ipcMain.handle("folderrocket:resize-cargo-ship-window", (event, size) => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || !cargoWindow || cargoWindow.isDestroyed() || cargoWindow.webContents.id !== event.sender.id || !cargoShipExpanded) return false;
        const nextSize = normaliseCargoShipPanelSize(size);
        if (!nextSize) return false;
        cargoShipPanelSize = nextSize;
        prepareCargoShipPanelWindow(nextSize);
        return true;
    });
    ipcMain.handle("folderrocket:navigate-history", (event, direction) => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || !["back", "forward"].includes(direction)) return false;
        const history = event.sender.navigationHistory;
        if (direction === "back" && history.canGoBack()) { history.goBack(); return true; }
        if (direction === "forward" && history.canGoForward()) { history.goForward(); return true; }
        return false;
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
