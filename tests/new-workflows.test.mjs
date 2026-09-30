import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {recentFiles} from '../backend/services/recentFilesService.js';
import {validateFormatJob} from '../backend/services/changeFormatService.js';
import {folderDescriptionGroups, folderProjectGroups} from '../src/folderProjects.ts';

test('recent scan includes nested new files once and excludes temporary downloads', async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'folderrocket-recent-test-'));
    await fs.mkdir(path.join(root,'nested'));
    await fs.writeFile(path.join(root,'new.pdf'),'fixture');
    await fs.writeFile(path.join(root,'nested','note.docx'),'fixture');
    await fs.writeFile(path.join(root,'partial.crdownload'),'fixture');
    const result=await recentFiles([root,path.join(root,'nested')]);
    assert.equal(result.files.length,2);
    assert.equal(new Set(result.files.map(file=>file.path)).size,2);
    const old=await recentFiles([root],{now:Date.now()+48*3600000});assert.equal(old.files.length,0);
    const bounded=await recentFiles([root],{maxEntries:1});assert.equal(bounded.truncated,true);
});
test('recent hours accept long and fractional periods and reject invalid values', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folderrocket-hours-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    await fs.writeFile(path.join(root, 'sample.txt'), 'fixture');
    assert.equal((await recentFiles([root], {hours: 500, now: Date.now() + 400 * 3600000})).files.length, 1);
    assert.equal((await recentFiles([root], {hours: 0.5, now: Date.now() + 2 * 3600000})).files.length, 0);
    for (const hours of [0, -1, NaN, Infinity, 'invalid']) await assert.rejects(recentFiles([root], {hours}), /positive number/);
});
test('format validates family, keeps mother separate, clamps quality and deduplicates',()=>{
    assert.throws(()=>validateFormatJob('mother.docx',['child.png']),/all be/);
    assert.throws(()=>validateFormatJob('mother.pdf',['mother.pdf']),/mother cannot/);
    assert.throws(()=>validateFormatJob('mother.svg',['child.svg']),/Mother file/);
    assert.throws(()=>validateFormatJob('mother.png',[]),/1 and 20/);
    const job=validateFormatJob('mother.png',['child.jpg','child.jpg'],{quality:500});
    assert.equal(job.quality,100);assert.equal(job.children.length,1);assert.equal(job.format,'original');
    assert.equal(validateFormatJob('mother.docx',['child.pdf','child.rtf'],{format:'docx'}).format,'original');
});
test('description projects share colour and explicit work groups override descriptions',()=>{
    const groups=folderProjectGroups([
        {id:'a',name:'a',path:'',description:' Project ',appearance:{backgroundColor:'#ddeeff'}},
        {id:'b',name:'b',path:'',description:'project'},
        {id:'c',name:'c',path:'',description:'project',appearance:{workGroup:''}},
        {id:'d',name:'d',path:'',description:'other',appearance:{workGroup:'PROJECT'}}
    ]);
    assert.deepEqual(groups[0].members.map(folder=>folder.id),['a','b','d']);
    assert.equal(groups[0].colour,'#ddeeff');assert.equal(groups[1].members.length,1);
});
test('Folders on Top groups non-empty descriptions and keeps empty descriptions independent',()=>{
    const groups=folderDescriptionGroups([
        {id:'a',name:'Alpha',path:'',description:' Work '},
        {id:'b',name:'Beta',path:'',description:'work',appearance:{workGroup:'Different custom group'}},
        {id:'c',name:'Charlie',path:'',description:'Personal'},
        {id:'d',name:'Delta',path:'',description:''},
        {id:'e',name:'Echo',path:'',description:'  '}
    ]);
    assert.deepEqual(groups.map(group=>group.members.map(folder=>folder.id)),[['a','b'],['c'],['d'],['e']]);
    assert.equal(groups[0].key,'description:work');
    assert.ok(groups[0].colour);
    assert.notEqual(groups[2].key,groups[3].key);
    assert.deepEqual(folderProjectGroups([
        {id:'a',name:'Alpha',path:'',description:'Work',appearance:{workGroup:'Custom'}},
        {id:'b',name:'Beta',path:'',description:'Work'}
    ]).map(group=>group.members.map(folder=>folder.id)),[['a'],['b']]);
});
