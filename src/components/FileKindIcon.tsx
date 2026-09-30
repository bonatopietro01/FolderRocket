import {Archive, File, FileSpreadsheet, FileText, Film, Image, Music} from "lucide-react";
import {additionalFileIcon} from "./AdditionalFileIcons";

export default function FileKindIcon({name, size = 17}: {name: string; size?: number}) {
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const additional = additionalFileIcon(extension, size);
    if (additional) return additional;
    if (["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp"].includes(extension)) return <span className="fileKindIcon powerpoint" title="PowerPoint presentation" aria-label="PowerPoint"><b>P</b></span>;
    if (extension === "pdf") return <span className="fileKindIcon pdf" title="PDF"><FileText size={size}/></span>;
    if (["doc", "docx", "odt"].includes(extension)) return <span className="fileKindIcon word" title="Word document"><FileText size={size}/></span>;
    if (["xls", "xlsx", "ods"].includes(extension)) return <span className="fileKindIcon excel" title="Spreadsheet"><FileSpreadsheet size={size}/></span>;
    if (extension === "csv") return <span className="fileKindIcon csv" title="CSV"><FileSpreadsheet size={size}/></span>;
    if (["mp3", "wav", "m4a", "flac", "aac", "ogg"].includes(extension)) return <span className="fileKindIcon audio" title="Audio"><Music size={size}/></span>;
    if (["mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v"].includes(extension)) return <span className="fileKindIcon video" title="Video"><Film size={size}/></span>;
    if (["txt", "md", "rtf", "log"].includes(extension)) return <span className="fileKindIcon txt" title="Text file"><FileText size={size}/></span>;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic"].includes(extension)) return <span className="fileKindIcon image" title="Image"><Image size={size}/></span>;
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return <span className="fileKindIcon archive" title="Archive"><Archive size={size}/></span>;
    return <span className="fileKindIcon generic" title="File"><File size={size}/></span>;
}
