// Runs the real App with simulated drives. Never reads or modifies host files.
import {createRoot} from 'react-dom/client';
import App from '../../src/App';
let connected = true;
let failing = false;
const drive = {id:'E:', path:'E:\\', label:'Test USB', size:4096, freeSpace:2048};
window.fetch = async (input, init) => {
    const endpoint = new URL(String(input), location.href).pathname;
    if (endpoint === '/settings/dashboard' && init?.method !== 'PUT') return Response.json({settings:{
        folders:[{id:'local',name:'Local folder',path:'C:\\Fixture',description:''}],
        sourceBlocks:[{id:'usb',type:'usb',height:360}], rightSourceBlocks:[], searchFolderIds:[]
    }});
    if (endpoint === '/devices/removable') return failing ? Response.json({message:'Simulated drive-check failure'}, {status:503}) : Response.json({drives:connected ? [drive] : []});
    if (endpoint === '/devices/removable/files') return Response.json({currentPath:'E:\\',files:[{name:'USB-document.pdf',path:'E:\\USB-document.pdf',size:1024}],folders:[]});
    if (endpoint === '/file-types/inventory') return Response.json({types:[]});
    return Response.json({files:[],folders:[],settings:null,aiConfigured:false});
};
export default function Fixture() {
    return <><div><button onClick={()=>{connected=false;failing=false;}}>Unplug test USB</button><button onClick={()=>{connected=true;failing=false;}}>Reconnect test USB</button><button onClick={()=>{failing=true;}}>Fail drive check</button></div><App user={{id:'usb-lifecycle-fixture',email:'fixture@example.test',role:'admin',workspacePath:'C:\\Fixture',createdAt:''}} onLogout={async()=>{}}/></>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture/>);
import.meta.hot?.dispose(()=>root.unmount());
