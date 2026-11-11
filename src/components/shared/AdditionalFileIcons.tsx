import {AppWindow, FileArchive, FileCode2, FileText, Film, Music, Palette} from 'lucide-react';

// Shared by all file lists so these formats have the same identity everywhere.
export function additionalFileIcon(extension: string, size = 14) {
    if (['py', 'pyw', 'pyi'].includes(extension)) return <span className="fileKindIcon python" title="Python file" aria-label="Python"><b>Py</b></span>;
    if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return <span className="fileKindIcon javascript" title="JavaScript file" aria-label="JavaScript"><b>JS</b></span>;
    if (['ts', 'tsx'].includes(extension)) return <span className="fileKindIcon typescript" title={`${extension.toUpperCase()} file`} aria-label={extension.toUpperCase()}><b>{extension === 'tsx' ? 'TX' : 'TS'}</b></span>;
    if (extension === 'txt') return <span className="fileKindIcon text" title="Text file" aria-label="TXT"><FileText size={size}/></span>;
    if (['html', 'htm'].includes(extension)) return <span className="fileKindIcon html" title="HTML file" aria-label="HTML"><FileCode2 size={size}/></span>;
    if (extension === 'css') return <span className="fileKindIcon css" title="CSS stylesheet" aria-label="CSS"><Palette size={size}/></span>;
    if (extension === 'gif') return <span className="fileKindIcon gif" title="GIF image" aria-label="GIF"><Film size={size}/></span>;
    if (extension === 'zip') return <span className="fileKindIcon zip" title="ZIP archive" aria-label="ZIP"><FileArchive size={size}/></span>;
    if (['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg'].includes(extension)) return <span className="fileKindIcon audio" title={`${extension.toUpperCase()} audio`} aria-label={`${extension.toUpperCase()} audio`}><Music size={size}/></span>;
    if (extension === 'exe') return <span className="fileKindIcon executable" title="Windows executable" aria-label="EXE"><AppWindow size={size}/></span>;
    return null;
}
