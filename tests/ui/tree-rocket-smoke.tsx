// Isolated visual fixture. Every folder and file is fictitious; no user files are read or modified.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import FolderScrollFrame from '../../src/components/FolderScrollFrame';
import {folderDescriptionGroups, folderProjectGroups} from '../../src/folderProjects';
import TreeRocket from '../../src/components/TreeRocket';
import '../../src/App.css';

const rootPath = 'C:\\Fixture';
let scenario = 2;
const children = (count: number) => Array.from({length: count}, (_, index) => ({name: `Project ${index + 1}`, path: `${rootPath}\\Project-${index + 1}`}));
window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === '/filesystem/tree-roots') return Response.json({roots: [{name: 'Fixture', path: rootPath, kind: 'computer', directFileCount: 3}]});
    if (url.pathname === '/filesystem/tree-children') {
        const body = JSON.parse(String(init?.body || '{}'));
        const isRoot = body.path === rootPath;
        return Response.json({path: body.path, directFileCount: isRoot ? 3 : 1, folders: isRoot ? children(scenario).map((item,index)=>({...item,directFileCount:index%3})) : [], folderCountsLimited:false, files: body.includeFiles ? [
            {name: 'Plans.pdf', path: `${body.path}\\Plans.pdf`},
            {name: 'Report.docx', path: `${body.path}\\Report.docx`},
            {name: 'Image.png', path: `${body.path}\\Image.png`}
        ] : []});
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
            {[0, 1, 2, 12].map(value => <button key={value} onClick={() => {scenario = value; setCount(value); setRevision(current => current + 1);}}>{value} folders</button>)}
            <button onClick={() => setOpen(true)}>Open Tree Rocket</button>
            <span role="status">{result}</span>
        </div>
        <div className={`dashboard ${layout === 'folders-top' ? 'dashboardFoldersTop' : ''}`} style={{height: 'calc(100vh - 75px)', gridTemplateColumns: layout === 'three-column' ? '160px 1fr 160px' : undefined}}>
            <section className="dashboardColumn sourcesColumn" style={{minHeight: 100}}>Sources</section>
            <FolderScrollFrame layout={layout} itemCount={entries.length}>
                <div className="foldersContainer">{groups.map(group => <div key={group.key} className={`dashboardProjectGroup${group.members.length > 1 ? ' linkedProject' : ''}`}>
                    {group.members.length > 1 && <div className="dashboardProjectLabel"><span>{group.symbol}</span><small>{group.members[0].description}</small></div>}
                    {group.members.map(entry => <div key={entry.path} className="folderOrderItem" style={{height: 94, border: '1px solid #bccfdc', borderRadius: 9, background: '#f6fbff', padding: 8, boxSizing: 'border-box'}}>
                        <strong>{entry.name}</strong><small>{entry.description || 'No project description'}</small>
                    </div>)}
                </div>)}</div>
            </FolderScrollFrame>
            <section className="dashboardColumn rightSourcesColumn" style={{minHeight: 100}}>Sources</section>
        </div>
        {open && <TreeRocket key={revision} folders={[]} onClose={() => setOpen(false)} onAddFolder={(path, name) => {setResult(`${name}: ${path}`); return true;}}/>}
    </>;
}

const fixtureRoot = createRoot(document.getElementById('root')!);
fixtureRoot.render(<Fixture/>);
import.meta.hot?.dispose(() => fixtureRoot.unmount());
