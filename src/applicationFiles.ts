export interface ApplicationFileEntry {
    name: string;
    path: string;
    size?: number;
    createdAt?: string;
    sensitivity?: ApplicationFileSensitivity;
}

export type ApplicationFileSensitivity = "installation" | "shared" | "synced" | "system" | "";

export function extensionOf(name: string) {
    return name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
}

export function applicationFileSensitivity(file: ApplicationFileEntry): ApplicationFileSensitivity {
    if (file.sensitivity) return file.sensitivity;
    const normalized = file.path.replaceAll("/", "\\").toLowerCase();
    if (/\\windows\\/.test(normalized)) return "system";
    if (/\\(?:shared drives|shared with me|team drives|github|repositories|repos)\\/.test(normalized)) return "shared";
    if (/\\(?:onedrive(?: - [^\\]+)?|dropbox|icloud drive|google drive|drivefs)\\/.test(normalized)) return "synced";
    const installedLocation = /\\(?:program files(?: \(x86\))?|programdata)\\/.test(normalized) || /\\appdata\\local\\programs\\/.test(normalized);
    const runtimeLocation = /\\appdata\\(?:local|roaming)\\[^\\]+\\/.test(normalized);
    const criticalExtension = new Set(["exe", "dll", "sys", "ocx", "com", "msi", "msp", "node", "pak"]);
    return installedLocation || (runtimeLocation && criticalExtension.has(extensionOf(file.name))) ? "installation" : "";
}

export function applicationFileMayBeEssential(file: ApplicationFileEntry) { return Boolean(applicationFileSensitivity(file)); }

export function applicationSensitivityLabel(value: ApplicationFileSensitivity) {
    return ({installation:"Installation",shared:"Shared file",synced:"Synced file",system:"System file","":""})[value];
}

export function filterApplicationFiles(files: ApplicationFileEntry[], query: string, format: string) {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return files.filter(file => (format === "all" || (extensionOf(file.name) || "other") === format)
        && terms.every(term => `${file.name} ${file.path}`.toLowerCase().includes(term)));
}

export function groupApplicationFiles(files: ApplicationFileEntry[]) {
    const groups = new Map<string, ApplicationFileEntry[]>();
    for (const file of files) {
        const folder = file.path.replace(/[\\/][^\\/]+$/, "") || "Computer";
        if (!groups.has(folder)) groups.set(folder, []);
        groups.get(folder)!.push(file);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
