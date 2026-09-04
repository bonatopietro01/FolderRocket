// This fixture never calls the backend or touches real files.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import FireMountain from '../../src/components/FireMountain';
import RecentFilesSourcePanel from '../../src/components/RecentFilesSourcePanel';
import '../../src/App.css';

const requests: string[] = [];
const notifications: string[] = [];
let fail = true;
window.confirm = () => true;
window.alert = message => { notifications.push(String(message)); document.getElementById('notifications')!.textContent = notifications.join('\n'); };
Object.assign(window, {showDirectoryPicker: async () => { throw new Error('Unexpected directory picker'); }});
window.fetch = async (input, init) => {
    const endpoint = new URL(String(input), location.href).pathname;
    const body = JSON.parse(String(init?.body || '{}'));
    if (endpoint === '/files/recent') {
        document.getElementById('recent-request')!.textContent = `Requested hours: ${body.hours}`;
        return Response.json({files: []});
    }
    if (endpoint === '/trash-file') {
        requests.push(body.path);
        document.getElementById('requests')!.textContent = requests.join('\n');
        if (init?.credentials !== 'include') throw new Error('Missing session credentials');
        if (fail && body.path.endsWith('retry.txt')) return Response.json({message: 'Simulated failure'}, {status: 500});
        return Response.json({message: 'Simulated success'});
    }
    throw new Error(`Unexpected endpoint ${endpoint}`);
};
export default function Fixture() {
    const [hours, setHours] = useState(24);
    return <><button onClick={() => window.dispatchEvent(new CustomEvent('folderrocket-add-to-fire', {detail: [{name: 'ok[1].txt', path: 'C:\\Fixture\\ok[1].txt'}, {name: 'retry.txt', path: 'C:\\Fixture\\retry.txt'}]}))}>Queue test files</button><button onClick={() => { fail = false; }}>Allow retry</button><FireMountain/><FireMountain/><pre id="requests"/><pre id="notifications"/><pre id="recent-request"/><RecentFilesSourcePanel folders={[]} hours={hours} onSettings={setHours}/></>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture/>);
import.meta.hot?.dispose(() => root.unmount());
