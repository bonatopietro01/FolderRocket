import test from 'node:test';
import assert from 'node:assert/strict';
import {recentFileCategory} from '../src/recentFileTypes.ts';
test('recent file filters group office and text formats',()=>{
 assert.equal(recentFileCategory('paper.pdf'),'pdf');assert.equal(recentFileCategory('report.docx'),'word');assert.equal(recentFileCategory('notes.txt'),'text');assert.equal(recentFileCategory('table.xlsx'),'excel');assert.equal(recentFileCategory('slides.pptx'),'powerpoint');assert.equal(recentFileCategory('photo.heic'),'other');
});
