import type {ManagedFolder} from './components/FolderManagement';

export function folderProjectKey(folder: ManagedFolder) {
    return (folder.appearance?.workGroup ?? folder.description ?? '').trim().toLocaleLowerCase();
}
export function folderProjectGroups(folders: ManagedFolder[]) {
    const groups = new Map<string, ManagedFolder[]>();
    for (const folder of folders) {
        const key = folderProjectKey(folder) || `folder:${folder.id}`;
        const group = groups.get(key) || [];
        group.push(folder); groups.set(key, group);
    }
    return [...groups.entries()].map(([key, members]) => {
        let hash = 0; for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
        const palette = ['#dcecf8', '#e2eee2', '#f5e5d5', '#eae0f4', '#dbeeed', '#f5dfe7'];
        const colour = members.find(folder => folder.appearance?.backgroundColor)?.appearance?.backgroundColor || (members.length > 1 ? palette[hash % palette.length] : '');
        return {key, members, colour, symbol: members.find(folder => folder.appearance?.symbol)?.appearance?.symbol || '🔗'};
    });
}

export function folderColourMap(folders: ManagedFolder[]) {
    return new Map(folderProjectGroups(folders).flatMap(group => group.members.map(folder => [folder.id, group.colour] as const)));
}
