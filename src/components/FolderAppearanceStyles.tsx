import type {ManagedFolder} from './FolderManagement';
import {folderColourMap} from '../folderProjects';

export default function FolderAppearanceStyles({folders}:{folders:ManagedFolder[]}) {
    const colours=folderColourMap(folders);
    const colour=(value?:string)=>value && /^#[a-f\d]{6}$/i.test(value)?value:'';
    return <style>{folders.map(folder=>{
        const appearance=folder.appearance||{}, id=CSS.escape(folder.id), background=colour(colours.get(folder.id)), border=colour(appearance.borderColor);
        return `.folderDropZone[data-folder-id="${id}"]{${background?`background:${background}!important;`:''}${border?`border-color:${border}!important;`:''}${appearance.borderWidth!==undefined?`border-width:${Math.max(0,Math.min(8,appearance.borderWidth))}px!important;`:''}}.folderDropZone[data-folder-id="${id}"] h3{font-weight:${appearance.bold?800:600}!important;font-style:${appearance.italic?'italic':'normal'}!important;text-decoration:${appearance.underline?'underline':'none'}!important}.folderDropZone[data-folder-id="${id}"]::before{content:${JSON.stringify((appearance.symbol||'').slice(0,8))};display:${appearance.symbol?'grid':'none'};position:absolute;top:-10px;left:-9px;place-items:center;width:25px;height:25px;border:1px solid #b9c9d8;border-radius:50%;background:#fff;font-size:14px;z-index:2}.folderTableRow[data-folder-id="${id}"]{${background?`background:color-mix(in srgb,${background} 18%,white)!important;`:''}}`;
    }).join('\n')}</style>;
}
