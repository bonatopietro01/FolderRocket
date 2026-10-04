# FolderRocket Companion for Obsidian

This desktop plugin recognizes a FolderRocket-managed vault by its `.folderrocket/vault.json` marker. It adds commands to open the generated overview, focus the associated planet in FolderRocket, and request a sync from the authenticated FolderRocket desktop app.

## Build

From this directory, install the isolated plugin dependencies and build:

```powershell
npm install
npm run build
```

The build writes `main.js` beside `manifest.json`. Install the three plugin files `main.js`, `manifest.json`, and `styles.css` (if present) into `<Vault>/.obsidian/plugins/folderrocket-companion/`, then enable **FolderRocket Companion** under Obsidian Settings → Community plugins.

FolderRocket creates vaults under the authenticated user's protected workspace at `.folderrocket/obsidian/<worldId>`. The companion does not store OAuth tokens or call FolderRocket's HTTP API. Its sync command opens the registered `folderrocket://obsidian/sync` protocol; the running desktop app receives the planet ID and must complete the sync through its authenticated UI session. In a browser-only FolderRocket session, syncing remains available from FolderRocket itself; Obsidian cannot access that login session.

If FolderRocket is not installed or its desktop protocol is not registered, the Obsidian URI command cannot focus the app. The vault notes remain readable offline.
