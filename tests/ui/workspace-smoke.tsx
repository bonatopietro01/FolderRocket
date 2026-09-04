// Local-only fixture: all network requests are mocked; no user files are read or moved.
import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import ApplicationsWorkspace from '../../src/components/ApplicationsWorkspace';
import DashboardFolderBrowser from '../../src/components/DashboardFolderBrowser';
import FileDropZone from '../../src/components/FileDropZone';
import {watchFolderDragHover} from '../../src/folderDragHover';
import '../../src/App.css';

const scope = 'isolated-ui-smoke';
localStorage.setItem(`folderrocket-linked-apps-${scope}`, JSON.stringify([
    {id: 'cad', name: 'CAD demo', icon: '⚙️', extensions: ['sldprt', 'pdf'], folders: []},
    {id: 'music', name: 'Music demo', icon: '🎵', extensions: ['mp3'], folders: []}
]));
const cadFiles = [
    {name: 'Gear.sldprt', path: 'C:\\Fixture\\Machine\\Gear.sldprt', size: 15360},
    {name: 'Gear.pdf', path: 'C:\\Fixture\\Manuals\\Gear.pdf', size: 20480},
    {name: 'Frame.sldprt', path: 'C:\\Fixture\\Machine\\Frame.sldprt', size: 8192},
    ...Array.from({length: 30}, (_, i) => ({name: `Assembly-${i}.sldprt`, path: `C:\\Fixture\\Archive\\Assembly-${i}.sldprt`, size: 1024}))
];
let scans = 0;
let folderReads = 0;
window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    const body = JSON.parse(String(init?.body || '{}'));
    if (url.pathname === '/applications/open') { document.getElementById('app-launch-result')!.textContent = `Launch requested: ${body.name}`; return Response.json({ok:true}); }
    if (url.pathname === '/applications/discover') {
        scans++;
        await new Promise(resolve => setTimeout(resolve, 150));
        return Response.json({files: body.extensions.includes('mp3') ? [{name: 'Track.mp3', path: 'C:\\Fixture\\Music\\Track.mp3'}] : cadFiles, folders: []});
    }
    if (url.pathname === '/list-folder-files') {
        folderReads++;
        const folders = body.folder === 'C:\\Fixture' ? [{name: 'Projects', path: 'C:\\Fixture\\Projects'}, {name: 'Empty', path: 'C:\\Fixture\\Empty'}]
            : body.folder === 'C:\\Fixture\\Projects' ? [{name: 'Drawings', path: 'C:\\Fixture\\Projects\\Drawings'}] : [];
        return Response.json({files: [], folders});
    }
    if (url.pathname === '/search-files/open' || url.pathname === '/files/open-location') return Response.json({ok: true});
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
};

export default function Fixture() {
    const [browsing, setBrowsing] = useState(false);
    const [result, setResult] = useState('Ready');
    const [running, setRunning] = useState(false);
    const [stats, setStats] = useState('');
    useEffect(() => watchFolderDragHover('.fixtureRoot .folderDropZone', async (_block, isCurrent) => {
        const response = await fetch('/list-folder-files', {body: JSON.stringify({folder: 'C:\\Fixture'})});
        const data = await response.json();
        if (isCurrent() && data.folders.length) setBrowsing(true);
    }), []);

    async function simulateHover(cancel: boolean) {
        setRunning(true);
        setResult('Checking hover…');
        const block = document.querySelector('.fixtureFolders .folderDropZone');
        if (!block) { setResult('FAIL: no folder'); setRunning(false); return; }
        const before = document.querySelector('.fixtureFolders')?.textContent;
        const transfer = new DataTransfer();
        transfer.setData('application/x-folderrocket-search-result', JSON.stringify({path: 'C:\\Fixture\\test.pdf'}));
        const child = block.querySelector('h3') || block;
        child.dispatchEvent(new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: transfer}));
        if (cancel) {
            await new Promise(resolve => setTimeout(resolve, 200));
            child.dispatchEvent(new DragEvent('dragleave', {bubbles: true, dataTransfer: transfer, relatedTarget: document.body}));
        }
        await new Promise(resolve => setTimeout(resolve, 2250));
        const after = document.querySelector('.fixtureFolders')?.textContent;
        setResult((cancel ? before === after : before !== after) ? `PASS: ${cancel ? 'leaving cancels navigation' : 'subfolder blocks opened'}` : 'FAIL: unexpected folder navigation');
        setRunning(false);
    }

    return <>
        <div style={{padding: 16, background: '#edf6fd'}}>
            <strong>Isolated UI checks — fictitious files only</strong>
            <div style={{display: 'flex', gap: 12, marginTop: 12}}>
                <button disabled={running} onClick={() => void simulateHover(false)}>Hold dragged file for 2 seconds</button>
                <button disabled={running} onClick={() => void simulateHover(true)}>Leave folder before 2 seconds</button>
                <button disabled={running} onClick={() => setBrowsing(false)}>Reset folders</button>
                <button onClick={() => setStats(`Scans: ${scans}; folder reads: ${folderReads}`)}>Show request counts</button>
            </div>
            <p role="status">{result}</p><p>{stats}</p>
            <div className="fixtureFolders" style={{height: 260, width: 640}}>
                {browsing ? <DashboardFolderBrowser initialName="Mother folder" initialPath={'C:\\Fixture'} onHome={() => setBrowsing(false)} storageScope={scope}/>
                    : <div className="foldersContainer fixtureRoot"><FileDropZone id="fixture-mother" name="Mother folder" pathValue={'C:\\Fixture'} hidePath storageScope={scope} aiEnabled/></div>}
            </div>
        </div>
        <p id="app-launch-result">No launch requested</p><ApplicationsWorkspace storageScope={scope}/>
    </>;
}
const fixtureRoot = createRoot(document.getElementById('root')!);
fixtureRoot.render(<Fixture/>);
import.meta.hot?.dispose(() => fixtureRoot.unmount());
