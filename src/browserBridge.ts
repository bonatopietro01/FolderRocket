import {API_BASE_URL} from "./api";

export interface BrowserBridgeFile {
    name: string;
    path: string;
    size?: number;
    createdAt?: string;
    downloadUrl: string;
}

const BRIDGE_PREFIX = "folderrocket-browser-bridge:";

export function browserBridgeDropId(value: string) {
    const id = value.trim().startsWith(BRIDGE_PREFIX) ? value.trim().slice(BRIDGE_PREFIX.length) : "";
    return /^[A-Za-z0-9_-]{8,120}$/.test(id) ? id : "";
}

function wait(milliseconds: number) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

export async function resolveBrowserBridgeDrop(id: string): Promise<BrowserBridgeFile[]> {
    let lastMessage = "The Gmail attachment is still being prepared. Keep dragging for a moment and try again.";
    for (let attempt = 0; attempt < 16; attempt += 1) {
        const response = await fetch(`${API_BASE_URL}/browser-bridge/resolve/${encodeURIComponent(id)}`, {credentials: "include"});
        const data = await response.json().catch(() => ({})) as {files?: BrowserBridgeFile[]; message?: string};
        if (response.ok && Array.isArray(data.files) && data.files.length) return data.files;
        lastMessage = data.message || lastMessage;
        if (attempt < 15 && /still being prepared/i.test(lastMessage)) await wait(350);
        else break;
    }
    throw new Error(lastMessage);
}
