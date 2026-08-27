const backendUrl = document.querySelector("#backendUrl");
const bridgeToken = document.querySelector("#bridgeToken");
const status = document.querySelector("#status");

void chrome.storage.sync.get({backendUrl: "http://127.0.0.1:3000", bridgeToken: ""}).then(values => {
    backendUrl.value = values.backendUrl;
    bridgeToken.value = values.bridgeToken;
});

document.querySelector("#save").addEventListener("click", async () => {
    await chrome.storage.sync.set({backendUrl: backendUrl.value.trim() || "http://127.0.0.1:3000", bridgeToken: bridgeToken.value.trim()});
    status.textContent = "Saved. Open Gmail and drag an attachment into FolderRocket.";
});
