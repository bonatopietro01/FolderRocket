import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneFileType} from '../src/phoneFiles.ts';

test('uses iPhone MTP extension when Explorer hides it from the displayed name', () => {
    assert.deepEqual(phoneFileType({name:'IMG_0042', extension:'.HEIC', mimeType:'image/heic'}), {extension:'heic', category:'image', label:'HEIC', iconName:'IMG_0042.heic'});
});

test('falls back to MIME type and keeps the Windows type label', () => {
    assert.deepEqual(phoneFileType({name:'Asset', mimeType:'video/quicktime', typeLabel:'QuickTime movie'}), {extension:'', category:'video', label:'QuickTime movie', iconName:'Asset'});
});

test('infers ordinary names by extension', () => {
    assert.equal(phoneFileType({name:'scan.pdf'}).category, 'document');
    assert.equal(phoneFileType({name:'voice.m4a'}).category, 'audio');
});
