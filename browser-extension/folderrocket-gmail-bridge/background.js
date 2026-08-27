const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";

function normaliseBackendUrl(value) {
    try {
        const url = new URL(value || DEFAULT_BACKEND_URL);
        if (!/^https?:$/.test(url.protocol)) return DEFAULT_BACKEND_URL;
        url.pathname = "";
        url.search = "";
        url.hash = "";
        return url.href.replace(/\/$/, "");
    } catch {
        return DEFAULT_BACKEND_URL;
    }
}

async function settings() {
    const stored = await chrome.storage.sync.get({backendUrl: DEFAULT_BACKEND_URL, bridgeToken: ""});
    return {backendUrl: normaliseBackendUrl(stored.backendUrl), bridgeToken: String(stored.bridgeToken || "").trim()};
}

async function stageAttachment(message) {
    const config = await settings();
    if (!config.bridgeToken) throw new Error("Open FolderRocket Gmail Bridge options and paste the personal Browser bridge code.");
    const attachment = await fetch(message.downloadUrl, {credentials: "include", redirect: "follow"});
    if (!attachment.ok) throw new Error("Gmail did not allow the extension to read this attachment. Refresh Gmail and try again.");
    const content = await attachment.blob();
    const form = new FormData();
    form.append("bridgeToken", config.bridgeToken);
    form.append("bridgeId", message.bridgeId);
    form.append("files", content, message.name || "Gmail attachment");
    const response = await fetch(`${config.backendUrl}/browser-bridge/stage`, {method: "POST", body: form});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "FolderRocket could not prepare this Gmail attachment.");
    return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "folderrocket-stage-gmail-attachment") return undefined;
    void stageAttachment(message)
        .then(() => sendResponse({ok: true}))
        .catch(error => sendResponse({ok: false, message: error instanceof Error ? error.message : "Unable to prepare the Gmail attachment."}));
    return true;
});
