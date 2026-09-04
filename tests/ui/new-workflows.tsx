// Isolated UI fixture; requests never reach the real backend.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ProcessingWorkspace from '../../src/components/ProcessingWorkspace';
import RecentFilesSourcePanel from '../../src/components/RecentFilesSourcePanel';
import PhoneSourcePanel from '../../src/components/PhoneSourcePanel';
import DashboardSourceBlock from '../../src/components/DashboardSourceBlock';
import FolderManagement from '../../src/components/FolderManagement';
import type {ManagedFolder} from '../../src/components/FolderManagement';
import FolderAppearanceStyles from '../../src/components/FolderAppearanceStyles';
import FileDropZone from '../../src/components/FileDropZone';
import {folderProjectGroups} from '../../src/folderProjects';
import '../../src/App.css';
const files=[{name:'mother.docx',path:'C:\\Fixture\\mother.docx',size:4096},{name:'child.docx',path:'C:\\Fixture\\child.docx',size:4096}];
window.fetch=async(input,init)=>{
    const endpoint=new URL(String(input),location.href).pathname,body=JSON.parse(typeof init?.body==='string'?init.body:'{}');
    if(endpoint==='/files/recent')return Response.json({files:files.map(file=>({...file,createdAt:new Date().toISOString(),downloaded:true})),inspected:2});
    if(endpoint==='/devices/phone')return Response.json({devices:[{id:'test-phone',name:'Demo phone'}]});
    if(endpoint==='/devices/phone/files')return Response.json(body.segments.length?{folders:[],files:[{name:'Photo.jpg',size:12345}]}:{folders:[{name:'Internal storage'}],files:[]});
    if(endpoint==='/devices/phone/copy')return Response.json({name:'Photo.jpg',path:'C:\\Fixture\\Photo.jpg',size:12345});
    if(endpoint==='/list-folder-files')return Response.json({files,folders:[]});
    if(endpoint==='/file-types/inventory')return Response.json({types:[{type:'docx',count:2}]});
    if(endpoint==='/files/preview')return Response.json({kind:'text',text:'Sample text only'});
    if(endpoint==='/files/change-format')return Response.json({converted:[{name:'child_formatted.docx',path:'C:\\Fixture\\child_formatted.docx',sourceName:'child.docx'}],warnings:['Fixture result only.'],failures:[]});
    if(endpoint==='/convert-files')return Response.json({converted:body.files.map((file:{name:string;path:string})=>({name:file.name.replace(/\.[^.]+$/, '_converted.pdf'),path:file.path.replace(/\.[^.]+$/, '_converted.pdf')}))});
    if(endpoint==='/files/rename')return Response.json({name:body.name,path:`C:\\Fixture\\${body.name}`});
    if(endpoint==='/folders/pick-parent')return Response.json({path:'C:\\Fixture'});
    if(endpoint==='/folders/create')return Response.json({path:body.path});
    return Response.json({files:[],folders:[],types:[]});
};
export default function WorkflowsFixture(){
    const [page,setPage]=useState('dashboard');
    const [folders,setFolders]=useState<ManagedFolder[]>([{id:'test-a',name:'Design',path:'C:\\Fixture',description:'Project A',appearance:{backgroundColor:'#b9d9ed',symbol:'🚀'}},{id:'test-b',name:'Drawings',path:'C:\\Fixture2',description:'Project A'}]);
    const update=(id:string,change:Partial<ManagedFolder>)=>setFolders(current=>current.map(folder=>folder.id===id?{...folder,...change}:folder));
    return <><FolderAppearanceStyles folders={folders}/><nav style={{display:'flex',gap:12,padding:16}}>{['dashboard','studio','styles'].map(name=><button key={name} onClick={()=>setPage(name)}>{name}</button>)}</nav>{page==='studio'?<ProcessingWorkspace folders={folders} onUpdate={update}/>:page==='styles'?<FolderManagement folders={folders} onAdd={()=>{}} onUpdate={update} onDelete={()=>{}} onReorder={()=>{}} aiEnabled={false}/>:<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:20,padding:20}}><DashboardSourceBlock block={{id:'recent',type:'recent',height:360}} index={0} total={1} onDelete={()=>{}} onMove={()=>{}} onResize={()=>{}}><RecentFilesSourcePanel folders={[]} onSettings={()=>{}}/></DashboardSourceBlock><div className="foldersContainer">{folderProjectGroups(folders).map(group=><div className="dashboardProjectGroup linkedProject" key={group.key}><div className="dashboardProjectLabel"><span>{group.symbol}</span><small>Project A</small></div>{group.members.map(folder=><div className="folderOrderItem" key={folder.id}><FileDropZone id={folder.id} name={folder.name} pathValue={folder.path} hidePath storageScope="new-workflow-fixture"/></div>)}</div>)}</div><DashboardSourceBlock block={{id:'phone',type:'phone',height:360}} index={0} total={1} onDelete={()=>{}} onMove={()=>{}} onResize={()=>{}}><PhoneSourcePanel/></DashboardSourceBlock></div>}</>;
}
const root=createRoot(document.getElementById('root')!);root.render(<WorkflowsFixture/>);import.meta.hot?.dispose(()=>root.unmount());
