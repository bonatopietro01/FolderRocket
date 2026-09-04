import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const JSZip=require('jszip');
const {DOMParser}=require('@xmldom/xmldom');
const {formatDocx,classifyParagraph}=require('./services/docxFormatService');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function fixture(file,mother){
    const zip=new JSZip();
    zip.file('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`);
    zip.file('_rels/.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="header" Type="${R}/header" Target="header1.xml"/></Relationships>`);
    zip.file('word/styles.xml',`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="${mother?'Arial':'Calibri'}"/><w:sz w:val="${mother?28:20}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:rPr><w:sz w:val="${mother?44:32}"/></w:rPr></w:style></w:styles>`);
    zip.file('word/document.xml',`<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p><w:p><w:r><w:rPr><w:sz w:val="${mother?28:18}"/><w:b/></w:rPr><w:t>${mother?'Mother text':'CHILD CONTENT'}</w:t></w:r><w:r><w:instrText> CITATION ChildReference </w:instrText></w:r></w:p><w:p><w:r><w:t>References</w:t></w:r></w:p><w:p><w:pPr><w:ind w:left="720" w:hanging="${mother?360:0}"/><w:spacing w:after="${mother?120:0}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${mother?'Times New Roman':'Calibri'}"/><w:sz w:val="${mother?20:18}"/></w:rPr><w:t>${mother?'Mother, A. (2024). Template reference.':'Child, B. (2025). Preserved reference.'}</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="header"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:left="${mother?1440:720}"/></w:sectPr></w:body></w:document>`);
    zip.file('word/header1.xml',`<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>${mother?'MOTHER HEADER':'CHILD HEADER'}</w:t></w:r></w:p></w:hdr>`);
    await fs.writeFile(file,await zip.generateAsync({type:'nodebuffer'}));
}
test('native DOCX preserves text/citations/emphasis and transfers styles, margins and header',async()=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'folderrocket-docx-test-'));
    const mother=path.join(directory,'mother.docx'),child=path.join(directory,'child.docx'),target=path.join(directory,'result.docx');
    await fixture(mother,true);await fixture(child,false);const before=await fs.readFile(child);
    const formatted=await formatDocx(mother,child,target);
    assert.deepEqual(await fs.readFile(child),before);
    const result=await JSZip.loadAsync(await fs.readFile(target));
    const content=await result.file('word/document.xml').async('string');
    assert.match(content,/CHILD CONTENT/);assert.match(content,/CITATION ChildReference/);assert.match(content,/Preserved reference/);assert.match(content,/w:hanging="360"/);assert.match(content,/Times New Roman/);assert.match(content,/<w:b\s*\/>/);assert.match(content,/w:left="1440"/);assert.doesNotMatch(content,/Mother text|Template reference/);
    assert.equal(formatted.motherAnalysis.referencesHeading,1);assert.equal(formatted.motherAnalysis.reference,1);
    const styles=await result.file('word/styles.xml').async('string');assert.match(styles,/w:val="28"/);assert.match(styles,/Arial/);assert.match(styles,/w:val="44"/);
    const header=Object.keys(result.files).find(name=>/^word\/mother_.*\.xml$/.test(name));assert.ok(header);assert.match(await result.file(header).async('string'),/MOTHER HEADER/);
    const parsed=new DOMParser().parseFromString(content,'application/xml');assert.equal(parsed.getElementsByTagName('parsererror').length,0);
    const without=path.join(directory,'without-header.docx');await formatDocx(mother,child,without,{headers:false});
    const originalHeader=await JSZip.loadAsync(await fs.readFile(without));assert.match(await originalHeader.file('word/header1.xml').async('string'),/CHILD HEADER/);
    await assert.rejects(formatDocx(mother,child,target),/EEXIST/);
});

test('paragraphs without outline metadata remain body text',()=>{
    const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraph=new DOMParser().parseFromString(`<w:p xmlns:w="${W}"><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>Ordinary paragraph</w:t></w:r></w:p>`,'application/xml').documentElement;
    const records=new Map([['Normal',{name:'normal',outline:null}]]);
    assert.equal(classifyParagraph(paragraph,2,5,records,false),'body');
});
