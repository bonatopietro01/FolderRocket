import {Notice, Plugin, TFile} from "obsidian";

interface FolderRocketVaultMarker {
    version: number;
    ownerId: string;
    worldId: string;
    worldName?: string;
}

export default class FolderRocketCompanion extends Plugin {
    private marker: FolderRocketVaultMarker | null = null;

    async onload(): Promise<void> {
        this.marker = await this.readMarker();
        this.addStatusBarItem().setText(this.marker ? `FolderRocket · ${this.marker.worldName || this.marker.worldId}` : "FolderRocket vault");
        this.addCommand({
            id: "open-folderrocket-planet-overview",
            name: "Open FolderRocket planet overview",
            callback: () => void this.openOverview()
        });
        this.addCommand({
            id: "request-folderrocket-sync",
            name: "Request sync from FolderRocket",
            callback: () => this.requestSync()
        });
        this.addCommand({
            id: "open-folderrocket-planet-in-app",
            name: "Open this planet in FolderRocket",
            callback: () => this.openFolderRocket()
        });
    }

    private async readMarker(): Promise<FolderRocketVaultMarker | null> {
        try {
            const raw = await this.app.vault.adapter.read(".folderrocket/vault.json");
            const value = JSON.parse(raw) as Partial<FolderRocketVaultMarker>;
            if (value.version !== 1 || typeof value.ownerId !== "string" || typeof value.worldId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.worldId)) return null;
            return value as FolderRocketVaultMarker;
        } catch {
            return null;
        }
    }

    private async openOverview(): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath("FolderRocket/README.md");
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(true).openFile(file);
            return;
        }
        new Notice("This vault has not been synced by FolderRocket yet.");
    }

    private requestSync(): void {
        if (!this.marker) {
            new Notice("This is not a FolderRocket-managed vault.");
            return;
        }
        const url = new URL("folderrocket://obsidian/sync");
        url.searchParams.set("worldId", this.marker.worldId);
        window.open(url.toString());
        new Notice("FolderRocket was asked to sync this planet. Complete or review the sync in FolderRocket.");
    }

    private openFolderRocket(): void {
        if (!this.marker) {
            new Notice("This is not a FolderRocket-managed vault.");
            return;
        }
        const url = new URL("folderrocket://obsidian/open");
        url.searchParams.set("worldId", this.marker.worldId);
        window.open(url.toString());
    }
}
