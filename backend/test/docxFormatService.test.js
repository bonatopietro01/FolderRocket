const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const JSZip = require("jszip");
const {formatDocx} = require("../services/docxFormatService");

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";

async function writeDocx(filePath, {title, heading, body, font, size, spacing, pageWidth}) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    zip.file("word/_rels/document.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file("word/styles.xml", `<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="${spacing}"/></w:pPr><w:rPr><w:rFonts w:ascii="${font}"/><w:sz w:val="${size}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="${Number(size) - 4}"/></w:rPr></w:style></w:styles>`);
    zip.file("word/document.xml", `<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}"/><w:sz w:val="${size}"/><w:b/></w:rPr><w:t>${title}</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:sz w:val="${Number(size) - 4}"/></w:rPr><w:t>${heading}</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:after="120"/></w:pPr><w:r><w:t>${body}</w:t></w:r><w:hyperlink w:anchor="citation"><w:r><w:t>[citation-1]</w:t></w:r></w:hyperlink></w:p><w:sectPr><w:pgSz w:w="${pageWidth}" w:h="15840"/><w:pgMar w:top="900" w:bottom="900" w:left="1000" w:right="1000"/></w:sectPr></w:body></w:document>`);
    await fs.writeFile(filePath, await zip.generateAsync({type: "nodebuffer"}));
}

test("DOCX format transfer matches semantic text styles while preserving child content and source file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-docx-format-"));
    try {
        const mother = path.join(root, "mother.docx");
        const child = path.join(root, "child.docx");
        const output = path.join(root, "child-formatted.docx");
        await writeDocx(mother, {title: "Mother heading", heading: "Mother section", body: "Mother body", font: "Arial", size: 40, spacing: 400, pageWidth: 12240});
        await writeDocx(child, {title: "Child title", heading: "Child section", body: "Child body", font: "Calibri", size: 22, spacing: 100, pageWidth: 11906});
        const sourceBefore = await fs.readFile(child);
        const result = await formatDocx(mother, child, output, {});
        const sourceAfter = await fs.readFile(child);
        const formatted = await JSZip.loadAsync(await fs.readFile(output));
        const document = await formatted.file("word/document.xml").async("string");
        const styles = await formatted.file("word/styles.xml").async("string");
        assert.deepEqual(sourceAfter, sourceBefore);
        assert.equal(result.sourceName, "child.docx");
        assert.equal(result.motherAnalysis.title, 1);
        assert.equal(result.motherAnalysis.heading1, 1);
        assert.match(document, /Child title/);
        assert.match(document, /Child section/);
        assert.match(document, /Child body/);
        assert.match(document, /\[citation-1\]/);
        assert.match(document, /w:pgSz w:w="12240"/);
        assert.match(document, /w:spacing w:after="400"/);
        assert.match(document, /w:rFonts w:ascii="Arial"/);
        assert.match(styles, /w:rFonts w:ascii="Arial"/);
        assert.match(styles, /w:sz w:val="40"/);
    } finally {
        await fs.rm(root, {recursive: true, force: true});
    }
});
