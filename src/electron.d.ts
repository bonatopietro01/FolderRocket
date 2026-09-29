interface FolderRocketDisplaySource {
    id: string;
    name: string;
    thumbnail: string;
}

interface FolderRocketElectronDiagnostic {
    id: string;
    at: string;
    type: "electron";
    severity: "info" | "warning" | "error" | "critical";
    category: string;
    message: string;
    route: string;
    screen: string;
    component: string;
    stack: string;
    method: string;
    status: number | null;
    worldId: string;
    requestId: string;
    durationMs: number | null;
}

interface Window {
    folderRocketDesktop?: {
        getPathForFile: (file: File) => string;
        openExternal: (url: string) => Promise<boolean>;
        saveDownload: (payload: {suggestedName: string; bytes: Uint8Array}) => Promise<{saved: boolean; canceled?: boolean; path?: string; message?: string}>;
        listDisplaySources: () => Promise<FolderRocketDisplaySource[]>;
        selectDisplaySource: (sourceId: string) => Promise<boolean>;
        capturePageRegion: (region: {x: number; y: number; width: number; height: number}) => Promise<string>;
        captureBehindCargoShip: (options?: {topInset?: number}) => Promise<string>;
        navigationState: () => Promise<{canGoBack: boolean; canGoForward: boolean}>;
        zoomFactor: () => Promise<number>;
        setZoomFactor: (factor: number) => Promise<number>;
        cargoShipState: () => Promise<{open: boolean; expanded: boolean}>;
        toggleCargoShipWindow: () => Promise<{open: boolean; expanded: boolean}>;
        openCargoShipWindow: () => Promise<boolean>;
        closeCargoShipWindow: () => Promise<boolean>;
        setCargoShipExpanded: (expanded: boolean) => Promise<boolean>;
        moveCargoShipWindow: (position: {x: number; y: number}) => Promise<boolean>;
        resizeCargoShipWindow: (size: {width: number; height: number}) => Promise<boolean>;
        navigateHistory: (direction: "back" | "forward") => Promise<boolean>;
        onNavigationChanged: (callback: () => void) => () => void;
        onZoomChanged: (callback: (zoomFactor: number) => void) => () => void;
        onCargoShipStateChanged: (callback: (state: {open: boolean; expanded: boolean}) => void) => () => void;
        onOAuthComplete: (callback: (provider: string) => void) => () => void;
        listElectronDiagnostics: () => Promise<FolderRocketElectronDiagnostic[]>;
        clearElectronDiagnostics: () => Promise<boolean>;
        onElectronDiagnostic: (callback: (diagnostic: FolderRocketElectronDiagnostic) => void) => () => void;
    };
}
