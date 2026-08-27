import FireMountain from "./FireMountain";
import SearchWorkspace from "./SearchWorkspace";

interface FolderSource { name: string; path: string; }
interface Props { folders: FolderSource[]; selectedFolderCount: number; onToggleFolders: () => void; aiEnabled: boolean; }

export default function SearchSourcePanel({folders, selectedFolderCount, onToggleFolders, aiEnabled}: Props) {
    return <section className="sourceCard searchSourceCard">
        <SearchWorkspace folders={folders} selectedFolderCount={selectedFolderCount} onToggleFolders={onToggleFolders} aiEnabled={aiEnabled} compact />
        <FireMountain />
    </section>;
}
