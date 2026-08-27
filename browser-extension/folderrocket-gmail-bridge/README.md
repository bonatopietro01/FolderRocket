# FolderRocket Gmail Bridge

This is a local Chrome/Edge extension for dragging an attachment from the Gmail website into FolderRocket.

## Install it locally

1. In FolderRocket, open **AI / connected services** and generate a **Browser bridge code**.
2. In Chrome or Edge open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this `folderrocket-gmail-bridge` folder.
5. Open the extension **Options**, paste the Browser bridge code, then save.

## Use it

1. Keep FolderRocket open and signed in on the same computer.
2. Open Gmail in Chrome/Edge.
3. Drag an attachment to a FolderRocket destination folder or to Cargo Ship.

The extension only prepares an attachment after you start dragging it. The browser code is personal, can be replaced from FolderRocket settings at any time, and is accepted only by the local backend on the same PC.

## Current limitation

Gmail’s page markup and drag payloads are controlled by Google. The bridge handles Gmail's native `DownloadURL` payload where available. If Gmail changes that payload, the extension will need an update; the FolderRocket Gmail block remains the dependable fallback.
