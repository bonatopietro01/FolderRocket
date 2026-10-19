// Isolated visual fixture. Every folder and file is fictitious; no user files are read or modified.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import FolderScrollFrame from '../../src/components/FolderScrollFrame';
import {folderDescriptionGroups, folderProjectGroups} from '../../src/folderProjects';
import TreeRocket from '../../src/components/TreeRocket';
import '../../src/App.css';

const rootPath = 'C:\\Fixture';
const desktopRoots = [
    {name: 'Desktop', path: 'C:\\Fixture\\Desktop', kind: 'desktop', directFileCount: 3, directFolderCount: 20},
    {name: 'Public Desktop', path: 'C:\\Fixture\\Public Desktop', kind: 'desktop', directFileCount: 4, directFolderCount: 20}
];
let scenario = 2;
let rootMode: 'computer' | 'desktop' = 'desktop';
const rootRequests: string[] = [];
const children = (count: number, parent = rootPath) => Array.from({length: count}, (_, index) => {
    const name = (index + 1) % 5 === 0 ? `Project ${index + 1} — client documents, archive and deadlines 2026` : `Project ${index + 1}`;
    return {name, path: `${parent}\\Project-${index + 1}`};
});
window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === '/applications/catalog') return Response.json({applications: ['SolidWorks', 'Visual Studio Code', 'Word', 'Excel', 'PowerPoint', 'Inkscape', 'Blender', 'Photos', 'Calculator', 'Notepad', 'Paint', 'Teams'].map((name, index) => ({name, appId: `fixture-${index + 1}`}))});
    if (url.pathname === '/applications/open-installed') return Response.json({opened: true});
    if (url.pathname === '/filesystem/tree-roots') {
        const mode = url.searchParams.get('mode') || '';
        rootRequests.push(mode);
        return Response.json({roots: mode === 'desktop' ? desktopRoots : [{name: 'Fixture', path: rootPath, kind: 'computer', directFileCount: 3, directFolderCount: scenario}]});
    }
    if (url.pathname === '/filesystem/tree-children') {
        const body = JSON.parse(String(init?.body || '{}'));
        const desktopRoot = desktopRoots.find(item => item.path === body.path);
        const isRoot = body.path === rootPath || Boolean(desktopRoot);
        const directFiles = Array.from({length: desktopRoot ? desktopRoot.directFileCount : isRoot ? 3 : 205}, (_, index) => {
            const extensions = ['pdf', 'docx', 'png'];
            const name = `Fixture ${String(index + 1).padStart(3, '0')}.${extensions[index % extensions.length]}`;
            return {name, path: `${body.path}\\${name}`};
        });
        const fileOffset = Number.isInteger(body.fileOffset) ? body.fileOffset : 0;
        const visibleFiles = body.includeFiles ? directFiles.slice(fileOffset, fileOffset + 200) : [];
        const folderList = isRoot ? children(scenario, body.path).map(item=>({...item,directFileCount:205})) : [];
        return Response.json({path: body.path, directFileCount: directFiles.length, folders: folderList, folderTotal: folderList.length, folderCountsLimited:false, files: body.includeFiles ? visibleFiles : [],fileOffset,fileTotal:directFiles.length,nextFileOffset:fileOffset+visibleFiles.length<directFiles.length?fileOffset+visibleFiles.length:null,truncatedFiles:fileOffset+visibleFiles.length<directFiles.length});
    }
    if (url.pathname === '/filesystem/tree-search') return Response.json({folders: children(scenario).filter(item => item.name.toLowerCase().includes('project')).map(item => ({...item, rootPath, rootName: 'Fixture', depth: 1})), files: [], scannedDirectories: 1, truncated: false});
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
};

export default function Fixture() {
    const [open, setOpen] = useState(false);
    const [layout, setLayout] = useState<'folders-top' | 'three-column'>('folders-top');
    const [count, setCount] = useState(12);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState('No folder added');
    const entries = children(count).map((entry, index) => ({
        ...entry,
        id: `folder-${index + 1}`,
        description: index < 5 ? 'Work' : index < 9 ? 'Personal' : index % 2 === 0 ? 'Shared' : ''
    }));
    const groups = layout === 'folders-top' ? folderDescriptionGroups(entries) : folderProjectGroups(entries);
    return <>
        <div style={{padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', background: '#edf6fd'}}>
            <strong>Local fixture — fictitious folders and files</strong>
            <button onClick={() => setLayout(layout === 'folders-top' ? 'three-column' : 'folders-top')}>Layout: {layout}</button>
            {[0, 1, 2, 20].map(value => <button key={value} onClick={() => {scenario = value; setCount(value); setRevision(current => current + 1);}}>{value} folders</button>)}
            <button onClick={() => setOpen(true)}>Open Tree Rocket</button>
            <span role="status">{result}</span>
        </div>
        <div className={`dashboard ${layout === 'folders-top' ? 'dashboardFoldersTop' : ''}`} style={{height: 'calc(100vh - 75px)', gridTemplateColumns: layout === 'three-column' ? '160px 1fr 160px' : undefined}}>
            <section className="dashboardColumn sourcesColumn" style={{minHeight: 100}}>Sources</section>
            <FolderScrollFrame layout={layout} itemCount={entries.length}>
                <div className="foldersContainer">{groups.map(group => <div key={group.key} className={`dashboardProjectGroup${group.members.length > 1 ? ' linkedProject' : ''}`}>
                    {group.members.length > 1 && <div className="dashboardProjectLabel"><span>{group.symbol}</span><small>{group.members[0].description || 'Other folders'}</small></div>}
                    {group.members.map(entry => <div key={entry.path} className="folderOrderItem" style={{height: 94, border: '1px solid #bccfdc', borderRadius: 9, background: '#f6fbff', padding: 8, boxSizing: 'border-box'}}>
                        <strong>{entry.name}</strong><small>{entry.description || 'No project description'}</small>
                    </div>)}
                </div>)}</div>
            </FolderScrollFrame>
            <section className="dashboardColumn rightSourcesColumn" style={{minHeight: 100}}>Sources</section>
        </div>
        {open && <><label>Fixture root mode<select aria-label="Fixture root mode" value={rootMode} onChange={event=>{rootMode=event.target.value as 'computer'|'desktop';setRevision(current=>current+1);}}><option value="computer">Computer</option><option value="desktop">Desktop</option></select></label><span aria-label="Root query history">{rootRequests.join(',')}</span><TreeRocket key={revision} folders={[]} worldId="fixture-world" treeRootMode={rootMode} onTreeRootModeChange={async mode=>{rootMode=mode;setRevision(current=>current+1);}} onClose={() => setOpen(false)} onAddFolder={(path, name) => {setResult(`${name}: ${path}`); return true;}}/></>}
    </>;
}

const fixtureRoot = createRoot(document.getElementById('root')!);
fixtureRoot.render(<Fixture/>);
import.meta.hot?.dispose(() => fixtureRoot.unmount());
