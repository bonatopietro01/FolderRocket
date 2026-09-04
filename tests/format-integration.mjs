// Windows image test; add --word for optional Word automation. Generated files only.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import assert from 'node:assert/strict';
import {changeFormat} from '../backend/services/changeFormatService.js';
const run=promisify(execFile);
const withWord=process.argv.includes('--word');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'folderrocket-format-test-'));
console.log('Generated fixtures:',directory);
await run('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.resolve('tests/create-format-fixtures.ps1'),'-Directory',directory,...(withWord?['-WithWord']:[])],{windowsHide:true,timeout:90000});
const before=withWord?await fs.readFile(path.join(directory,'child.docx')):null;
console.log('Checking image format transfer');
const image=await changeFormat(path.join(directory,'mother.png'),[path.join(directory,'child.png'),path.join(directory,'child.jpg')],{},directory);
assert.equal(image.converted.length,2,JSON.stringify(image.failures));
for(const file of image.converted) {
    assert.equal(path.extname(file.name),path.extname(file.sourceName));
    const bytes=await fs.readFile(file.path);
    if(file.name.endsWith('.jpg'))assert.equal(bytes.subarray(0,3).toString('hex'),'ffd8ff');
    else assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
}
let document;
if(withWord){
    console.log('Checking document format transfer');
    document=await changeFormat(path.join(directory,'mother.docx'),['docx','pdf','rtf','doc'].map(ext=>path.join(directory,`child.${ext}`)),{},directory);
    assert.equal(document.converted.length,4,JSON.stringify(document.failures));
    for(const file of document.converted) {
        assert.equal(path.extname(file.name),path.extname(file.sourceName));
        const bytes=await fs.readFile(file.path);
        const signature={'.docx':'504b0304','.pdf':'25504446','.rtf':'7b5c7274','.doc':'d0cf11e0'}[path.extname(file.name)];
        assert.equal(bytes.subarray(0,4).toString('hex'),signature);
    }
    assert.deepEqual(await fs.readFile(path.join(directory,'child.docx')),before,'Original child was changed');
}
const output=await run('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.resolve('tests/verify-format-output.ps1'),...(document?['-Document',document.converted[0].path]:[]),'-Image',image.converted[0].path],{windowsHide:true,timeout:60000});
console.log(output.stdout.trim());
console.log('PASS: generated copies verified.');
