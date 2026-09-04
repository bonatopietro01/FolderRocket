import type {ManagedFolder} from './components/FolderManagement';

export function normalizedUsbPath(path: string) {
    return path.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function isWithinUsbPath(path: string, root: string) {
    const value = normalizedUsbPath(path), base = normalizedUsbPath(root);
    return Boolean(base) && (value === base || value.startsWith(`${base}\\`));
}

export function removeDisconnectedUsbFolders<T extends ManagedFolder>(folders: T[], drives: {path:string}[]): T[] {
    const connected = new Set(drives.map(drive => normalizedUsbPath(drive.path)));
    const kept = folders.filter(folder => {
        if (folder.storage === 'imaginary') return true;
        const root = folder.usbDrivePath || (folder.description === 'Connected removable USB drive' ? folder.path : '');
        // A USB block repointed by the user to a local folder must survive removal.
        return !root || !isWithinUsbPath(folder.path, root) || connected.has(normalizedUsbPath(root));
    });
    return kept.length === folders.length ? folders : kept;
}
