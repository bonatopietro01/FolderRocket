export interface PhoneFileMetadata {
    name: string;
    extension?: string;
    mimeType?: string;
    typeLabel?: string;
}

const categoryByExtension: Record<string, string> = {
    heic: "image", heif: "image", jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", dng: "image",
    mov: "video", mp4: "video", m4v: "video", avi: "video", webm: "video",
    m4a: "audio", mp3: "audio", wav: "audio", aac: "audio", caf: "audio",
    pdf: "document", txt: "document", rtf: "document", doc: "document", docx: "document", pages: "document",
    zip: "archive", rar: "archive", "7z": "archive"
};

export function phoneFileType(file: PhoneFileMetadata) {
    const nameExtension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
    const extension = (file.extension || nameExtension).replace(/^\./, "").toLowerCase();
    const mimeCategory = file.mimeType?.split("/", 1)[0]?.toLowerCase() ?? "";
    const category = categoryByExtension[extension] || (["image", "video", "audio", "text"].includes(mimeCategory) ? (mimeCategory === "text" ? "document" : mimeCategory) : "other");
    const label = file.typeLabel?.trim() || (extension ? extension.toUpperCase() : category === "other" ? "Unknown file" : category[0].toUpperCase() + category.slice(1));
    return {extension, category, label, iconName: extension && !nameExtension ? `${file.name}.${extension}` : file.name};
}
