import {useId, useState} from 'react';
import {LoaderCircle, Palette, Settings, X} from 'lucide-react';
import {API_BASE_URL} from '../api';
export interface FormatFile {name:string;path:string;size?:number;sourceName?:string;}
interface Props {files:FormatFile[];onRemove:(path:string)=>void;onComplete:(files:FormatFile[])=>Promise<void>;}
export default function ChangeFormatPanel({files,onRemove,onComplete}:Props) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsId = useId();
    const [motherPath,setMother]=useState(''),[headers,setHeaders]=useState(true),[pictures,setPictures]=useState(true),[quality,setQuality]=useState(90),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    const mother=files.find(file=>file.path===motherPath)||files[0];
    const children=files.filter(file=>file.path!==mother?.path);
    const image=Boolean(mother&&/\.(png|jpe?g|bmp|tiff?)$/i.test(mother.name));
    async function apply() {
        if(!mother||!children.length||busy)return;
        setBusy(true);setMessage('Applying the mother format locally…');
        try {
            const response=await fetch(`${API_BASE_URL}/files/change-format`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({mother:mother.path,children:children.map(file=>file.path),options:{headers,pictures,quality}})});
            const data=await response.json();if(!response.ok)throw new Error(data.message||'Format change failed.');
            const output:FormatFile[]=data.converted||[];
            const analysis=data.motherAnalysis&&Object.keys(data.motherAnalysis).length?`Mother analyzed: ${Object.entries(data.motherAnalysis).map(([role,count])=>`${role} ${count}`).join(' · ')}`:'';
            setMessage([`${output.length}/${children.length} copies created.`,analysis,...(data.warnings||[]),...(data.failures||[]).map((failure:{name:string;message:string})=>`${failure.name}: ${failure.message}`)].filter(Boolean).join('\n'));
            if(output.length)await onComplete(output);
        }catch(error){setMessage(error instanceof Error?error.message:'Format change failed.');}finally{setBusy(false);}
    }
    return <section className="changeFormatPanel"><h2><Palette size={17}/>Change format{busy&&<LoaderCircle className="conversionHeaderSpinner format" size={14}/>}{!image && <button type="button" className="changeFormatSettingsToggle" title="Change format settings" aria-label="Change format settings" aria-expanded={settingsOpen} aria-controls={settingsId} onClick={()=>setSettingsOpen(open=>!open)}><Settings size={16}/></button>}</h2><label><select aria-label="Mother format file" value={mother?.path||''} disabled={busy} onChange={event=>setMother(event.target.value)}><option value="" disabled>Choose a mother file</option>{files.map(file=><option key={file.path} value={file.path}>{file.name}</option>)}</select></label><div className="conversionQueue">{files.map(file=><div key={file.path}><span><b>{mother?.path===file.path?'Mother · ':'Child · '}</b>{file.name}</span><button title={`Remove ${file.name} from format queue`} disabled={busy} onClick={()=>onRemove(file.path)}><X size={13}/></button></div>)}</div>{image?<><p>Match the mother's size and DPI, keeping each file's original type. Fit with padding, without cropping. Metadata is not copied.</p><label>JPEG quality: {quality}<input type="range" min="1" max="100" value={quality} onChange={event=>setQuality(Number(event.target.value))}/></label></>:<><fieldset id={settingsId} className="changeFormatSettings" hidden={!settingsOpen} disabled={busy}><legend>Settings</legend><label><input type="checkbox" checked={headers} onChange={event=>setHeaders(event.target.checked)}/>Use mother headers and footers</label><label><input type="checkbox" checked={pictures} onChange={event=>setPictures(event.target.checked)}/>Fit inline images to mother image size</label></fieldset></>}<button className="applyMotherFormat" disabled={busy||!children.length} onClick={()=>void apply()}>{busy?'Formatting…':'Apply mother format'}</button>{message&&<p className="formatReport" role="status">{message}</p>}</section>;
}
