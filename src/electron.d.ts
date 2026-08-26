interface FolderRocketDisplaySource {
    id: string;
    name: string;
    thumbnail: string;
}

interface Window {
    folderRocketDesktop?: {
        listDisplaySources: () => Promise<FolderRocketDisplaySource[]>;
        selectDisplaySource: (sourceId: string) => Promise<boolean>;
        capturePageRegion: (region: {x: number; y: number; width: number; height: number}) => Promise<string>;
        navigationState: () => Promise<{canGoBack: boolean; canGoForward: boolean}>;
        zoomFactor: () => Promise<number>;
        setZoomFactor: (factor: number) => Promise<number>;
        openCargoShipWindow: () => Promise<boolean>;
        closeCargoShipWindow: () => Promise<boolean>;
        setCargoShipExpanded: (expanded: boolean) => Promise<boolean>;
        moveCargoShipWindow: (position: {x: number; y: number}) => Promise<boolean>;
        resizeCargoShipWindow: (size: {width: number; height: number}) => Promise<boolean>;
        navigateHistory: (direction: "back" | "forward") => Promise<boolean>;
        onNavigationChanged: (callback: () => void) => () => void;
        onZoomChanged: (callback: (zoomFactor: number) => void) => () => void;
    };
}
