import FireMountain from "./FireMountain";
import SearchWorkspace from "./SearchWorkspace";

interface FolderSource { name: string; path: string; }
interface Props { folders: FolderSource[]; aiEnabled: boolean; onResultsChange?: (hasResults: boolean) => void; }

export default function SearchSourcePanel({folders, aiEnabled, onResultsChange}: Props) {
    return <section className="sourceCard searchSourceCard">
        <SearchWorkspace folders={folders} selectedFolderCount={folders.length} automaticFolders aiEnabled={aiEnabled} compact onResultsChange={onResultsChange} />
        <FireMountain />
    </section>;
}
