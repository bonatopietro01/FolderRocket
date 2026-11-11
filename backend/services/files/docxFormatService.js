// Edit the child's Open XML package: text, citations and embedded media stay in it.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');
const {DOMParser, XMLSerializer} = require('@xmldom/xmldom');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const elements = (node, ns, name) => Array.from(node.getElementsByTagNameNS(ns, name));
const children = node => Array.from(node.childNodes).filter(child => child.nodeType === 1);
const direct = (node, name) => children(node).find(child => child.namespaceURI === W && child.localName === name);
const serialize = node => new XMLSerializer().serializeToString(node);
function xml(text) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML entities are not supported.');
    return new DOMParser({errorHandler:{warning(){}, error(message){throw new Error(message);}, fatalError(message){throw new Error(message);}}}).parseFromString(text,'application/xml');
}
async function load(file) {
    const stat = await fs.stat(file); if(stat.size > 60*1024*1024) throw new Error('DOCX exceeds 60 MB.');
    const zip = await JSZip.loadAsync(await fs.readFile(file));
    if(Object.keys(zip.files).length > 5000) throw new Error('DOCX has too many package parts.');
    // Check ZIP central-directory sizes before inflating parts.
    let total=0; for(const part of Object.values(zip.files)) { total+=part._data?.uncompressedSize||0; if(total>180*1024*1024)throw new Error('Expanded DOCX exceeds 180 MB.'); }
    return zip;
}
async function readXml(zip, part, fallback) {
    const file=zip.file(part); if(!file&&!fallback)throw new Error(`Missing DOCX part: ${part}`);
    return xml(file?await file.async('string'):fallback);
}
function replaceChild(parent, name, value, owner) {
    const existing=direct(parent,name);
    if(existing){if(value)parent.replaceChild(owner.importNode(value,true),existing);else parent.removeChild(existing);}
    else if(value){
        const imported=owner.importNode(value,true);
        const order=parent.localName==='sectPr'?['headerReference','footerReference','footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid','printerSettings','sectPrChange']:parent.localName==='style'?['name','aliases','basedOn','next','link','autoRedefine','hidden','uiPriority','semiHidden','unhideWhenUsed','qFormat','locked','personal','personalCompose','personalReply','rsid','pPr','rPr','tblPr','trPr','tcPr','tblStylePr']:[];
        const next=order.includes(name)?children(parent).find(child=>order.indexOf(child.localName)>order.indexOf(name)):null;
        if(name==='docDefaults')parent.insertBefore(imported,parent.firstChild);else parent.insertBefore(imported,next||null);
    }
}

function styleRecords(styles) {
    return new Map(elements(styles,W,'style').map(style=>[style.getAttributeNS(W,'styleId'),{
        node:style,
        name:(direct(style,'name')?.getAttributeNS(W,'val')||'').toLowerCase(),
        outline:optionalNumber(direct(direct(style,'pPr')||style,'outlineLvl')?.getAttributeNS(W,'val'))
    }]));
}
function optionalNumber(value) { return value === undefined || value === null || value === '' ? null : Number(value); }
function paragraphText(paragraph) { return elements(paragraph,W,'t').map(node=>node.textContent).join('').trim(); }
function classifyParagraph(paragraph,index,total,records,inReferences=false) {
    const pPr=direct(paragraph,'pPr'),styleId=pPr&&direct(pPr,'pStyle')?.getAttributeNS(W,'val')||'Normal';
    const style=records.get(styleId),name=`${styleId} ${style?.name||''}`.toLowerCase(),text=paragraphText(paragraph);
    if (/^(references|bibliography|works cited|reference list)$/i.test(text)) return 'referencesHeading';
    if (/subtitle/.test(name)) return 'subtitle';
    if (/(^|\W)title($|\W)/.test(name)) return 'title';
    const namedHeading=name.match(/(?:heading|head|titolo|überschrift|titre)\D*([1-6])/i);
    const directOutline=optionalNumber(direct(pPr||paragraph,'outlineLvl')?.getAttributeNS(W,'val'));
    const level=namedHeading?Number(namedHeading[1]):directOutline!==null?directOutline+1:style?.outline!==null&&style?.outline!==undefined?style.outline+1:0;
    if(level>=1&&level<=6)return `heading${level}`;
    if (inReferences && text) return 'reference';
    if(/caption|didascalia|légende/.test(name))return 'caption';
    if(/quote|quotation|citazione/.test(name))return 'quote';
    if(index===0&&text&&text.length<180)return 'title';
    if(index===total-1&&/^doi:|^https?:\/\//i.test(text))return 'reference';
    return 'body';
}
function analyzeParagraphs(document,styles) {
    const paragraphs=elements(document,W,'p'),records=styleRecords(styles),examples=new Map(),counts={};let inReferences=false;
    paragraphs.forEach((paragraph,index)=>{
        const role=classifyParagraph(paragraph,index,paragraphs.length,records,inReferences);
        if(role==='referencesHeading')inReferences=true;
        else if(inReferences&&role.startsWith('heading'))inReferences=false;
        const resolved=inReferences&&role==='body'?'reference':role;
        if(paragraphText(paragraph)){counts[resolved]=(counts[resolved]||0)+1;if(!examples.has(resolved))examples.set(resolved,paragraph);}
    });
    return {paragraphs,records,examples,counts};
}
function applySemanticFormat(paragraph,reference,sourceStyles,targetDocument) {
    let targetP=direct(paragraph,'pPr');if(!targetP){targetP=targetDocument.createElementNS(W,'w:pPr');paragraph.insertBefore(targetP,paragraph.firstChild);}
    const referenceP=direct(reference,'pPr');
    const referenceStyleId=referenceP&&direct(referenceP,'pStyle')?.getAttributeNS(W,'val');
    const referenceStyle=referenceStyleId&&sourceStyles.get(referenceStyleId)?.node;
    for(const name of ['spacing','ind','jc','keepNext','keepLines','pageBreakBefore','widowControl','contextualSpacing','tabs','outlineLvl','suppressLineNumbers','bidi','textDirection']){
        const value=(referenceP&&direct(referenceP,name))||(referenceStyle&&direct(direct(referenceStyle,'pPr')||referenceStyle,name));
        replaceChild(targetP,name,value||null,targetDocument);
    }
    const sampleRun=elements(reference,W,'r').find(run=>elements(run,W,'t').some(text=>text.textContent.trim()));
    const sampleR=sampleRun&&direct(sampleRun,'rPr'),styleR=referenceStyle&&direct(referenceStyle,'rPr');
    for(const run of elements(paragraph,W,'r')){
        if(!elements(run,W,'t').length)continue;
        let targetR=direct(run,'rPr');if(!targetR){targetR=targetDocument.createElementNS(W,'w:rPr');run.insertBefore(targetR,run.firstChild);}
        for(const name of ['rFonts','sz','szCs','color','highlight','shd','lang','b','bCs','i','iCs','caps','smallCaps','u','strike','dstrike','vertAlign','outline','shadow','emboss','imprint','vanish','specVanish','position','kern','spacing','w','fitText','eastAsianLayout']){
            const value=(sampleR&&direct(sampleR,name))||(styleR&&direct(styleR,name));
            replaceChild(targetR,name,value||null,targetDocument);
        }
    }
}

async function formatDocx(motherPath, childPath, target, options={}) {
    const mother=await load(motherPath),child=await load(childPath);
    const source=await readXml(mother,'word/document.xml'), doc=await readXml(child,'word/document.xml');
    const motherStyles=await readXml(mother,'word/styles.xml',`<w:styles xmlns:w="${W}"/>`);
    const styles=await readXml(child,'word/styles.xml',`<w:styles xmlns:w="${W}"/>`);
    const relationships=await readXml(child,'word/_rels/document.xml.rels',`<Relationships xmlns="${P}"/>`);
    const sourceRels=await readXml(mother,'word/_rels/document.xml.rels',`<Relationships xmlns="${P}"/>`);
    const types=await readXml(child,'[Content_Types].xml'),sourceTypes=await readXml(mother,'[Content_Types].xml');
    const imported=new Map();
    function contentType(oldPart,newPart){
        const override=elements(sourceTypes,CT,'Override').find(node=>node.getAttribute('PartName')===`/${oldPart}`);
        const extension=path.posix.extname(oldPart).slice(1);
        const fallback=elements(sourceTypes,CT,'Default').find(node=>node.getAttribute('Extension')===extension);
        const mime=override?.getAttribute('ContentType')||fallback?.getAttribute('ContentType');
        if(mime&&!elements(types,CT,'Override').some(node=>node.getAttribute('PartName')===`/${newPart}`)){
            const node=types.createElementNS(CT,'Override');node.setAttribute('PartName',`/${newPart}`);node.setAttribute('ContentType',mime);types.documentElement.appendChild(node);
        }
    }
    async function copyPart(part) {
        if(part.startsWith('../')||part.startsWith('/')||!mother.file(part))throw new Error('Unsupported mother relationship.');
        if(imported.has(part))return imported.get(part);
        const output=`word/mother_${crypto.randomUUID().replaceAll('-','')}${path.posix.extname(part)}`;
        imported.set(part,output);child.file(output,await mother.file(part).async('nodebuffer'));contentType(part,output);
        const relPath=path.posix.join(path.posix.dirname(part),'_rels',`${path.posix.basename(part)}.rels`);
        if(mother.file(relPath)){
            const rels=await readXml(mother,relPath);
            for(const relation of elements(rels,P,'Relationship')) {
                if(relation.getAttribute('TargetMode')==='External')continue;
                const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(part),relation.getAttribute('Target')));
                relation.setAttribute('Target',path.posix.relative(path.posix.dirname(output),await copyPart(dependency)));
            }
            child.file(path.posix.join(path.posix.dirname(output),'_rels',`${path.posix.basename(output)}.rels`),serialize(rels));
        }
        return output;
    }
    function addRelationship(type,targetPart){
        const id=`rIdMother${crypto.randomUUID().replaceAll('-','')}`;
        const node=relationships.createElementNS(P,'Relationship');node.setAttribute('Id',id);node.setAttribute('Type',`${R}/${type}`);node.setAttribute('Target',path.posix.relative('word',targetPart));relationships.documentElement.appendChild(node);return id;
    }
    const motherAnalysis=analyzeParagraphs(source,motherStyles);
    const childAnalysis=analyzeParagraphs(doc,styles);
    // Preserve child numbering definitions, while importing typography by style ID.
    for(const sourceStyle of elements(motherStyles,W,'style')) {
        const id=sourceStyle.getAttributeNS(W,'styleId');
        const existing=elements(styles,W,'style').find(node=>node.getAttributeNS(W,'styleId')===id);
        const importedStyle=styles.importNode(sourceStyle,true);
        const importedP=direct(importedStyle,'pPr'), existingP=existing&&direct(existing,'pPr');
        if(importedP)replaceChild(importedP,'numPr',existingP&&direct(existingP,'numPr'),styles);
        if(existing)styles.documentElement.replaceChild(importedStyle,existing);else styles.documentElement.appendChild(importedStyle);
    }
    replaceChild(styles.documentElement,'docDefaults',direct(motherStyles.documentElement,'docDefaults'),styles);
    // Promote the mother's direct typography into its corresponding style.
    const examples=new Set();
    for(const paragraph of elements(source,W,'p')) {
        const pPr=direct(paragraph,'pPr'),styleId=pPr&&direct(pPr,'pStyle')?.getAttributeNS(W,'val')||'Normal';
        if(examples.has(styleId)||!elements(paragraph,W,'t').some(node=>node.textContent.trim()))continue;
        examples.add(styleId);
        const style=elements(styles,W,'style').find(node=>node.getAttributeNS(W,'styleId')===styleId);if(!style)continue;
        const run=elements(paragraph,W,'r').find(node=>elements(node,W,'t').some(text=>text.textContent.trim()));
        for(const [property,allowed,reference] of [['rPr',['rFonts','sz','szCs','color'],run&&direct(run,'rPr')],['pPr',['spacing','ind','jc','keepNext'],pPr]]) {
            if(!reference)continue;let destination=direct(style,property);if(!destination){destination=styles.createElementNS(W,`w:${property}`);style.appendChild(destination);}
            for(const name of allowed){const value=direct(reference,name);if(value)replaceChild(destination,name,value,styles);}
        }
    }
    // Remove direct size/font overrides, not emphasis, text or citation fields.
    const storyParts=Object.keys(child.files).filter(name=>/^word\/(document|footnotes|endnotes)\.xml$/.test(name));
    for(const part of storyParts){const story=part==='word/document.xml'?doc:await readXml(child,part);
        for(const props of elements(story,W,'rPr'))for(const name of ['rFonts','sz','szCs'])replaceChild(props,name,null,story);
        for(const props of elements(story,W,'pPr'))for(const name of ['spacing','ind','jc'])replaceChild(props,name,null,story);
        if(part!=='word/document.xml')child.file(part,serialize(story));
    }
    // Match paragraphs by their textual role even when the child uses different or no Word style IDs.
    let inReferences=false;
    childAnalysis.paragraphs.forEach((paragraph,index)=>{
        let role=classifyParagraph(paragraph,index,childAnalysis.paragraphs.length,childAnalysis.records,inReferences);
        if(role==='referencesHeading')inReferences=true;else if(inReferences&&role.startsWith('heading'))inReferences=false;else if(inReferences&&role==='body')role='reference';
        const reference=motherAnalysis.examples.get(role)||motherAnalysis.examples.get(role.startsWith('heading')?'heading1':'body');
        if(reference)applySemanticFormat(paragraph,reference,motherAnalysis.records,doc);
    });
    const sourceSections=elements(source,W,'sectPr');
    for(const [index,section]of elements(doc,W,'sectPr').entries()){
        const reference=sourceSections[Math.min(index,sourceSections.length-1)];if(!reference)continue;
        for(const name of ['type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid'])replaceChild(section,name,direct(reference,name),doc);
        if(options.headers!==false){
            for(const name of ['headerReference','footerReference']){
                for(const item of children(section).filter(node=>node.localName===name))section.removeChild(item);
                for(const item of children(reference).filter(node=>node.localName===name)){
                    const relation=elements(sourceRels,P,'Relationship').find(node=>node.getAttribute('Id')===item.getAttributeNS(R,'id'));if(!relation)continue;
                    const part=path.posix.normalize(path.posix.join('word',relation.getAttribute('Target')));
                    const importedRef=doc.importNode(item,true);importedRef.setAttributeNS(R,'r:id',addRelationship(name==='headerReference'?'header':'footer',await copyPart(part)));section.insertBefore(importedRef,children(section).find(node=>!['headerReference','footerReference'].includes(node.localName))||null);
                }
            }
        }
    }
    if(options.pictures!==false){
        const extent=elements(source,WP,'inline')[0]?.getElementsByTagNameNS(WP,'extent')[0];
        const maxWidth=Number(extent?.getAttribute('cx')),maxHeight=Number(extent?.getAttribute('cy'));
        if(maxWidth>0&&maxHeight>0)for(const picture of elements(doc,WP,'inline')){
            const current=elements(picture,WP,'extent')[0];const width=Number(current?.getAttribute('cx')),height=Number(current?.getAttribute('cy'));if(!width||!height)continue;
            const ratio=Math.min(maxWidth/width,maxHeight/height);for(const dimension of [current,...elements(picture,A,'ext')]){dimension.setAttribute('cx',String(Math.round(width*ratio)));dimension.setAttribute('cy',String(Math.round(height*ratio)));}
        }
    }
    const sourceTheme=elements(sourceRels,P,'Relationship').find(node=>node.getAttribute('Type')===`${R}/theme`);
    if(sourceTheme){
        const theme=await copyPart(path.posix.normalize(path.posix.join('word',sourceTheme.getAttribute('Target'))));
        const currentTheme=elements(relationships,P,'Relationship').find(node=>node.getAttribute('Type')===`${R}/theme`);
        if(currentTheme)currentTheme.setAttribute('Target',path.posix.relative('word',theme));else addRelationship('theme',theme);
    }
    if(!elements(relationships,P,'Relationship').some(node=>node.getAttribute('Type')===`${R}/styles`))addRelationship('styles','word/styles.xml');
    contentType('word/styles.xml','word/styles.xml');
    child.file('word/styles.xml',serialize(styles));child.file('word/document.xml',serialize(doc));child.file('word/_rels/document.xml.rels',serialize(relationships));child.file('[Content_Types].xml',serialize(types));
    await fs.writeFile(target,await child.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),{flag:'wx'});
    return {name:path.basename(target),path:target,sourceName:path.basename(childPath),size:(await fs.stat(target)).size,motherAnalysis:motherAnalysis.counts};
}
module.exports={formatDocx,classifyParagraph};
