export type RecentFileCategory = "pdf" | "word" | "text" | "excel" | "powerpoint" | "other";
export function recentFileCategory(name:string):RecentFileCategory {
    const extension=name.includes(".")?name.split(".").pop()!.toLowerCase():"";
    if(extension==="pdf")return "pdf";
    if(["doc","docx","odt","rtf"].includes(extension))return "word";
    if(["txt","md","log"].includes(extension))return "text";
    if(["xls","xlsx","xlsm","csv","ods"].includes(extension))return "excel";
    if(["ppt","pptx","pptm","pps","ppsx","odp"].includes(extension))return "powerpoint";
    return "other";
}
export const recentFileCategoryLabel:Record<RecentFileCategory,string>={pdf:"PDF",word:"Word",text:"TXT",excel:"Excel",powerpoint:"PowerPoint",other:"Other"};
