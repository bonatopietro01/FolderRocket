const {contextBridge, ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld("folderRocketDesktop", {
    listDisplaySources: () => ipcRenderer.invoke("folderrocket:list-display-sources"),
    selectDisplaySource: sourceId => ipcRenderer.invoke("folderrocket:select-display-source", sourceId),
    capturePageRegion: region => ipcRenderer.invoke("folderrocket:capture-page-region", region),
    navigationState: () => ipcRenderer.invoke("folderrocket:navigation-state"),
    zoomFactor: () => ipcRenderer.invoke("folderrocket:zoom-factor"),
    setZoomFactor: factor => ipcRenderer.invoke("folderrocket:set-zoom-factor", factor),
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
    }
});
