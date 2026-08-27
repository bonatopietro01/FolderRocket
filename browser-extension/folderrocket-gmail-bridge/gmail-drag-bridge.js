const BRIDGE_PREFIX = "folderrocket-browser-bridge:";

function parseDownloadUrl(value) {
    const match = String(value || "").match(/^([^:]*):([^:]*):(https?:\/\/.*)$/i);
    if (!match) return null;
    return {mimeType: match[1] || "application/octet-stream", name: match[2] || "Gmail attachment", downloadUrl: match[3]};
}

function findAttachmentDownload(event) {
    const fromDataTransfer = parseDownloadUrl(event.dataTransfer?.getData("DownloadURL"));
    if (fromDataTransfer) return fromDataTransfer;
    let node = event.target instanceof Element ? event.target : null;
    while (node) {
        const fromAttribute = parseDownloadUrl(node.getAttribute("download_url") || node.getAttribute("data-download-url"));
        if (fromAttribute) return fromAttribute;
        node = node.parentElement;
    }
    return null;
}

document.addEventListener("dragstart", event => {
    const attachment = findAttachmentDownload(event);
    if (!attachment || !event.dataTransfer) return;
    const bridgeId = crypto.randomUUID().replaceAll("-", "");
    // FolderRocket receives this lightweight reference on drop while the service
    // worker reads the actual attachment through the signed-in Gmail session.
    event.dataTransfer.setData("text/plain", `${BRIDGE_PREFIX}${bridgeId}`);
    event.dataTransfer.effectAllowed = "copy";
    chrome.runtime.sendMessage({type: "folderrocket-stage-gmail-attachment", bridgeId, ...attachment}, response => {
        if (chrome.runtime.lastError) console.warn("FolderRocket Gmail Bridge:", chrome.runtime.lastError.message);
        else if (!response?.ok) console.warn("FolderRocket Gmail Bridge:", response?.message || "Attachment staging failed.");
    });
}, false);
