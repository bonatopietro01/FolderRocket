const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const {windowsTask} = require('./windowsTask');
const images = new Set(['.png','.jpg','.jpeg','.bmp','.tif','.tiff']);
const documents = new Set(['.doc','.docx','.pdf','.rtf']);

function validateFormatJob(mother, children, options = {}) {
    const extension = path.extname(mother).toLowerCase();
    const kind = images.has(extension) ? 'image' : documents.has(extension) ? 'document' : '';
    if (!kind) throw new Error('Mother file must be Word, PDF, RTF, PNG, JPEG, BMP or TIFF.');
    if (!Array.isArray(children) || !children.length || children.length > 20) throw new Error('Choose between 1 and 20 child files.');
    const unique = [...new Set(children)];
    for (const file of unique) {
        if (path.resolve(file).toLowerCase() === path.resolve(mother).toLowerCase()) throw new Error('The mother cannot also be a child.');
        if (!(kind === 'image' ? images : documents).has(path.extname(file).toLowerCase())) throw new Error('Mother and children must all be documents or all be images.');
    }
    return {kind, mother, children: unique, format: 'original', headers: options.headers !== false, pictures: options.pictures !== false, quality: Math.max(1, Math.min(100, Number(options.quality) || 90))};
}

let running = false;
async function changeFormat(mother, children, options, workspace) {
    const job = validateFormatJob(mother, children, options);
    if (running) throw new Error('Another format operation is running. Please wait.');
    running = true;
    try {
        job.destination = path.join(workspace, 'Formatted', crypto.randomUUID());
        await fs.mkdir(job.destination, {recursive:true});
        if ([mother,...job.children].every(file=>path.extname(file).toLowerCase()==='.docx')) {
            const {formatDocx}=require('./docxFormatService');
            const converted=[],failures=[];
            for(const source of job.children) {
                try { converted.push(await formatDocx(mother,source,path.join(job.destination,`${path.basename(source,'.docx')}_${crypto.randomUUID().slice(0,6)}_formatted.docx`),job)); }
                catch(error){failures.push({name:path.basename(source),message:error.message});}
            }
            return {converted,failures,destination:job.destination,motherAnalysis:converted[0]?.motherAnalysis||{},warnings:['Mother structure analyzed locally: titles, subtitles, heading levels, body paragraphs, quotations, captions, references, fonts, text emphasis, alignment, indentation, spacing and page behavior are matched by semantic role. Child text, citations and numbering are retained. Review complex tables, floating images and bibliography systems. Mother fonts must be installed to render identically.']};
        }
        const result = await windowsTask('change-format.ps1', job, 240000);
        return {...result, destination: job.destination};
    } finally { running = false; }
}
module.exports = {validateFormatJob, changeFormat};
