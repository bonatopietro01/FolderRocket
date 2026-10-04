const {contextBridge, ipcRenderer, webUtils} = require("electron");

contextBridge.exposeInMainWorld("folderRocketDesktop", {
    getPathForFile: file => webUtils.getPathForFile(file),
    openExternal: url => ipcRenderer.invoke("folderrocket:open-external", url),
    openObsidianVault: payload => ipcRenderer.invoke("folderrocket:open-obsidian-vault", payload),
    saveDownload: payload => ipcRenderer.invoke("folderrocket:save-download", payload),
    listDisplaySources: () => ipcRenderer.invoke("folderrocket:list-display-sources"),
    selectDisplaySource: sourceId => ipcRenderer.invoke("folderrocket:select-display-source", sourceId),
    capturePageRegion: region => ipcRenderer.invoke("folderrocket:capture-page-region", region),
    captureBehindCargoShip: options => ipcRenderer.invoke("folderrocket:capture-behind-cargo-ship", options),
    navigationState: () => ipcRenderer.invoke("folderrocket:navigation-state"),
    zoomFactor: () => ipcRenderer.invoke("folderrocket:zoom-factor"),
    setZoomFactor: factor => ipcRenderer.invoke("folderrocket:set-zoom-factor", factor),
    cargoShipState: () => ipcRenderer.invoke("folderrocket:cargo-ship-state"),
    toggleCargoShipWindow: () => ipcRenderer.invoke("folderrocket:toggle-cargo-ship-window"),
    openCargoShipWindow: () => ipcRenderer.invoke("folderrocket:open-cargo-ship-window"),
    closeCargoShipWindow: () => ipcRenderer.invoke("folderrocket:close-cargo-ship-window"),
    setCargoShipExpanded: expanded => ipcRenderer.invoke("folderrocket:set-cargo-ship-expanded", expanded),
    moveCargoShipWindow: position => ipcRenderer.invoke("folderrocket:move-cargo-ship-window", position),
    resizeCargoShipWindow: size => ipcRenderer.invoke("folderrocket:resize-cargo-ship-window", size),
    navigateHistory: direction => ipcRenderer.invoke("folderrocket:navigate-history", direction),
    onNavigationChanged: callback => {
        const listener = () => callback();
        ipcRenderer.on("folderrocket:navigation-changed", listener);
        return () => ipcRenderer.removeListener("folderrocket:navigation-changed", listener);
    },
    onZoomChanged: callback => {
        const listener = (_event, zoomFactor) => callback(Number(zoomFactor) || 1);
        ipcRenderer.on("folderrocket:zoom-changed", listener);
        return () => ipcRenderer.removeListener("folderrocket:zoom-changed", listener);
    },
    onCargoShipStateChanged: callback => {
        const listener = (_event, state) => callback({open: Boolean(state?.open), expanded: Boolean(state?.expanded)});
        ipcRenderer.on("folderrocket:cargo-ship-state", listener);
        return () => ipcRenderer.removeListener("folderrocket:cargo-ship-state", listener);
    },
    onOAuthComplete: callback => {
        const listener = (_event, provider) => callback(String(provider || ""));
        ipcRenderer.on("folderrocket:oauth-complete", listener);
        return () => ipcRenderer.removeListener("folderrocket:oauth-complete", listener);
    },
    onObsidianCommand: callback => {
        const listener=(_event,command)=>callback(command);
        ipcRenderer.on("folderrocket:obsidian-command",listener);
        return () => ipcRenderer.removeListener("folderrocket:obsidian-command",listener);
    },
    listElectronDiagnostics: () => ipcRenderer.invoke("folderrocket:diagnostics:list-electron"),
    clearElectronDiagnostics: () => ipcRenderer.invoke("folderrocket:diagnostics:clear-electron"),
    onElectronDiagnostic: callback => {
        const listener = (_event, diagnostic) => callback(diagnostic);
        ipcRenderer.on("folderrocket:electron-diagnostic", listener);
        return () => ipcRenderer.removeListener("folderrocket:electron-diagnostic", listener);
    }
});
