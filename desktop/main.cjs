const {app, BrowserWindow, desktopCapturer, dialog, ipcMain, screen, shell, session} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const {spawn} = require("node:child_process");

const FOLDERROCKET_PROTOCOL = "folderrocket";

// FolderRocket does not need GPU rendering. Software rendering avoids blank windows
// on Windows installations where Electron's GPU cache/process cannot initialise.
app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) app.quit();

let PORT = Number(process.env.FOLDERROCKET_PORT) || 3000;
let APP_ORIGIN = `http://localhost:${PORT}`;
const CARGO_SHIP_DOCK_SIZE = {width: 70, height: 70};
const CARGO_SHIP_DEFAULT_PANEL_SIZE = {width: 250, height: 230};
const CARGO_SHIP_MINIMUM_PANEL_SIZE = {width: 250, height: 230};
const CARGO_SHIP_MAXIMUM_PANEL_SIZE = {width: 880, height: 760};
let backendProcess = null;
let mainWindow = null;
let cargoWindow = null;
let cargoShipExpanded = false;
let cargoShipPanelSize = {...CARGO_SHIP_DEFAULT_PANEL_SIZE};
let cargoShipLastBounds = null;
let selectedDisplaySourceId = "";

function focusFolderRocket() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}

function handleFolderRocketProtocol(url) {
    try {
        const target = new URL(url);
        if (target.protocol !== `${FOLDERROCKET_PROTOCOL}:`) return;
        focusFolderRocket();
        mainWindow?.webContents.send("folderrocket:oauth-complete", target.searchParams.get("provider") || "");
    } catch { /* Ignore malformed external protocol calls. */ }
}

app.on("second-instance", (_event, commandLine) => {
    const protocolUrl = commandLine.find(value => value.startsWith(`${FOLDERROCKET_PROTOCOL}://`));
    if (protocolUrl) handleFolderRocketProtocol(protocolUrl);
    else focusFolderRocket();
});
app.on("open-url", (event, url) => { event.preventDefault(); handleFolderRocketProtocol(url); });

function cargoShipState() {
    return {open: Boolean(cargoWindow && !cargoWindow.isDestroyed()), expanded: cargoShipExpanded};
}

function notifyCargoShipState() {
    if (!mainWindow?.isDestroyed()) mainWindow.webContents.send("folderrocket:cargo-ship-state", cargoShipState());
}

const desktopConfigKeys = new Set([
    "OPENAI_API_KEY",
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GOOGLE_CALENDAR_API_KEY",
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

function readBackendHealth() {
    return new Promise(resolve => {
        const request = http.get(`${APP_ORIGIN}/health`, response => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", chunk => { body += chunk; });
            response.on("end", () => {
                if (response.statusCode !== 200) {
                    resolve({ready: false, desktop: false});
                    return;
                }
                try {
                    const health = JSON.parse(body);
                    resolve({
                        ready: health?.status === "ok",
                        desktop: health?.runtime === "desktop"
                    });
                }
                catch {
                    // A server with the old text health check, or an unrelated
                    // app on port 3000, must never be reused by FolderRocket.
                    resolve({ready: false, desktop: false});
                }
            });
        });
        request.setTimeout(1000, () => {
            request.destroy();
            resolve({ready: false, desktop: false});
        });
        request.on("error", () => resolve({ready: false, desktop: false}));
    });
}

function useBackendPort(port) {
    PORT = port;
    APP_ORIGIN = `http://localhost:${PORT}`;
}

function portIsAvailable(port) {
    return new Promise(resolve => {
        const probe = net.createServer();
        const finish = available => {
            probe.removeAllListeners();
            resolve(available);
        };

        probe.once("error", () => finish(false));
        probe.listen({port, host: "127.0.0.1", exclusive: true}, () => {
            probe.close(() => finish(true));
        });
    });
}

async function selectAvailableBackendPort() {
    for (let candidate = PORT + 1; candidate <= PORT + 20; candidate += 1) {
        if (await portIsAvailable(candidate)) {
            useBackendPort(candidate);
            return true;
        }
    }
    return false;
}

async function prepareBackendEndpoint() {
    const currentHealth = await readBackendHealth();
    if (currentHealth.ready && currentHealth.desktop) return currentHealth;

    // A manually launched Node server, an older FolderRocket build, or another
    // local app must never prevent the desktop app from starting. In that case
    // FolderRocket simply uses a free private loopback port instead of port 3000.
    if (!await portIsAvailable(PORT)) {
        if (!await selectAvailableBackendPort()) {
            throw new Error("FolderRocket could not reserve a local backend port.");
        }
    }

    return {ready: false, desktop: false};
}

async function backendIsReady() {
    const health = await readBackendHealth();
    return health.ready && health.desktop;
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
    const previousBounds = cargoShipLastBounds
        ? clampCargoShipBounds({
            x: cargoShipLastBounds.x + (cargoShipLastBounds.width - CARGO_SHIP_DOCK_SIZE.width) / 2,
            y: cargoShipLastBounds.y + (cargoShipLastBounds.height - CARGO_SHIP_DOCK_SIZE.height) / 2,
            ...CARGO_SHIP_DOCK_SIZE
        })
        : null;
    cargoWindow = new BrowserWindow({
        width: CARGO_SHIP_DOCK_SIZE.width,
        height: CARGO_SHIP_DOCK_SIZE.height,
        ...(previousBounds ? {x: previousBounds.x, y: previousBounds.y} : {}),
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
    cargoWindow.once("ready-to-show", () => {
        if (!cargoWindow?.isDestroyed()) {
            cargoShipLastBounds = clampCargoShipBounds(cargoWindow.getBounds());
            cargoWindow.setBounds(cargoShipLastBounds);
            cargoWindow.show();
        }
    });
    cargoWindow.on("move", () => {
        if (!cargoWindow?.isDestroyed()) cargoShipLastBounds = cargoWindow.getBounds();
    });
    cargoWindow.on("resize", () => {
        if (!cargoWindow?.isDestroyed()) cargoShipLastBounds = cargoWindow.getBounds();
    });
    cargoWindow.on("closed", () => {
        cargoWindow = null;
        cargoShipExpanded = false;
        notifyCargoShipState();
    });
    void cargoWindow.loadURL(`${APP_ORIGIN}/?folderrocketCargoShip=1`);
    notifyCargoShipState();
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

function clampCargoShipBounds(bounds) {
    const minimum = cargoShipExpanded ? CARGO_SHIP_MINIMUM_PANEL_SIZE : CARGO_SHIP_DOCK_SIZE;
    const display = screen.getDisplayNearestPoint({
        x: Math.round(Number(bounds.x) + Number(bounds.width) / 2),
        y: Math.round(Number(bounds.y) + Number(bounds.height) / 2)
    });
    const workArea = display.workArea;
    const margin = 8;
    const width = Math.min(Math.max(minimum.width, Math.round(Number(bounds.width) || minimum.width)), Math.max(minimum.width, workArea.width - margin * 2));
    const height = Math.min(Math.max(minimum.height, Math.round(Number(bounds.height) || minimum.height)), Math.max(minimum.height, workArea.height - margin * 2));
    const maxX = workArea.x + workArea.width - width - margin;
    const maxY = workArea.y + workArea.height - height - margin;
    return {
        x: Math.max(workArea.x + margin, Math.min(maxX, Math.round(Number(bounds.x) || workArea.x + margin))),
        y: Math.max(workArea.y + margin, Math.min(maxY, Math.round(Number(bounds.y) || workArea.y + margin))),
        width,
        height
    };
}

function prepareCargoShipPanelWindow(size, position = null) {
    const current = cargoWindow.getBounds();
    const bounds = clampCargoShipBounds({
        x: position?.x ?? current.x,
        y: position?.y ?? current.y,
        width: size.width,
        height: size.height
    });
    cargoWindow.setResizable(true);
    cargoWindow.setMinimumSize(CARGO_SHIP_MINIMUM_PANEL_SIZE.width, CARGO_SHIP_MINIMUM_PANEL_SIZE.height);
    cargoWindow.setMaximumSize(CARGO_SHIP_MAXIMUM_PANEL_SIZE.width, CARGO_SHIP_MAXIMUM_PANEL_SIZE.height);
    cargoWindow.setBounds(bounds);
    cargoShipLastBounds = bounds;
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
        const current = cargoWindow.getBounds();
        const dockBounds = clampCargoShipBounds({
            x: current.x + (current.width - CARGO_SHIP_DOCK_SIZE.width) / 2,
            y: current.y + (current.height - CARGO_SHIP_DOCK_SIZE.height) / 2,
            ...CARGO_SHIP_DOCK_SIZE
        });
        cargoWindow.setResizable(true);
        cargoWindow.setMinimumSize(1, 1);
        cargoWindow.setMaximumSize(10000, 10000);
        cargoWindow.setBounds(dockBounds);
        cargoWindow.setMinimumSize(CARGO_SHIP_DOCK_SIZE.width, CARGO_SHIP_DOCK_SIZE.height);
        cargoWindow.setMaximumSize(CARGO_SHIP_DOCK_SIZE.width, CARGO_SHIP_DOCK_SIZE.height);
        cargoWindow.setResizable(false);
        cargoShipLastBounds = dockBounds;
    }
    cargoWindow.show();
    notifyCargoShipState();
    return true;
}

app.whenReady().then(async () => {
    if (process.defaultApp) app.setAsDefaultProtocolClient(FOLDERROCKET_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    else app.setAsDefaultProtocolClient(FOLDERROCKET_PROTOCOL);
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
    ipcMain.handle("folderrocket:capture-behind-cargo-ship", async (event, options) => {
        const requestingWindow = BrowserWindow.fromWebContents(event.sender);
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || !requestingWindow || requestingWindow !== cargoWindow || !mainWindow || mainWindow.isDestroyed() || !cargoWindow || cargoWindow.isDestroyed()) {
            throw new Error("Cargo Ship must be open over the FolderRocket window to use Lens.");
        }
        const cargoBounds = cargoWindow.getBounds();
        const mainBounds = mainWindow.getContentBounds();
        const topInset = Math.max(0, Math.min(cargoBounds.height - 1, Math.round(Number(options?.topInset) || 39)));
        const sourceX = cargoBounds.x - mainBounds.x;
        const sourceY = cargoBounds.y - mainBounds.y + topInset;
        const sourceRight = sourceX + cargoBounds.width;
        const sourceBottom = sourceY + cargoBounds.height - topInset;
        const left = Math.max(0, sourceX);
        const top = Math.max(0, sourceY);
        const right = Math.min(mainBounds.width, sourceRight);
        const bottom = Math.min(mainBounds.height, sourceBottom);
        if (right <= left || bottom <= top) throw new Error("Move Cargo Ship over FolderRocket before using Lens.");
        const image = await mainWindow.webContents.capturePage({x: left, y: top, width: right - left, height: bottom - top});
        if (image.isEmpty()) throw new Error("FolderRocket could not capture the area behind Cargo Ship.");
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
        // Only the main window controls the workspace zoom. A secondary
        // Cargo Ship renderer must never alter it through the shared origin.
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || event.sender.id !== mainWindow?.webContents.id) return 1;
        const requested = Number(factor);
        const next = Number.isFinite(requested) ? Math.max(.75, Math.min(1.5, requested)) : 1;
        event.sender.setZoomFactor(next);
        return next;
    });
    ipcMain.handle("folderrocket:cargo-ship-state", event => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false) return {open: false, expanded: false};
        return cargoShipState();
    });
    ipcMain.handle("folderrocket:toggle-cargo-ship-window", event => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false) return {open: false, expanded: false};
        if (cargoWindow && !cargoWindow.isDestroyed()) {
            cargoWindow.close();
            return {open: false, expanded: false};
        }
        createCargoShipWindow();
        return cargoShipState();
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
        const current = cargoWindow.getBounds();
        const next = clampCargoShipBounds({...current, x, y});
        cargoWindow.setPosition(next.x, next.y, true);
        cargoShipLastBounds = {...current, x: next.x, y: next.y};
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
    ipcMain.handle("folderrocket:open-external", (event, url) => {
        if (event.sender.getURL().startsWith(APP_ORIGIN) === false || typeof url !== "string") return false;
        try {
            const target = new URL(url);
            const supportedOAuthHosts = new Set([
                "accounts.google.com",
                "login.microsoftonline.com",
                "login.live.com"
            ]);
            if (target.protocol !== "https:" || !supportedOAuthHosts.has(target.hostname)) return false;
            void shell.openExternal(target.toString());
            return true;
        }
        catch {
            return false;
        }
    });
    let existingBackend;
    try {
        existingBackend = await prepareBackendEndpoint();
    }
    catch (error) {
        await dialog.showMessageBox({
            type: "error",
            title: "FolderRocket could not start",
            message: "FolderRocket could not reserve a local connection.",
            detail: error instanceof Error ? error.message : "No local backend port is available."
        });
        app.quit();
        return;
    }
    if (!existingBackend.ready) startBackend();
    if (!await waitForBackend()) {
        await dialog.showMessageBox({
            type: "error",
            title: "FolderRocket could not start",
            message: "The local FolderRocket backend did not respond.",
            detail: "Restart FolderRocket. It automatically chooses a free local connection when port 3000 is unavailable."
        });
        app.quit();
        return;
    }
    createWindow();
    const initialProtocolUrl = process.argv.find(value => value.startsWith(`${FOLDERROCKET_PROTOCOL}://`));
    if (initialProtocolUrl) handleFolderRocketProtocol(initialProtocolUrl);
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
