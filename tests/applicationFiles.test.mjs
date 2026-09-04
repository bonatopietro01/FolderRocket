import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationFileMayBeEssential, applicationFileSensitivity, applicationSensitivityLabel, filterApplicationFiles, groupApplicationFiles} from '../src/applicationFiles.ts';

const files = [
    {name: 'Gear.SLDPRT', path: 'C:\\Projects\\Machine\\Gear.SLDPRT'},
    {name: 'Gear.pdf', path: 'C:\\Projects\\Manuals\\Gear.pdf'},
    {name: 'Readme', path: 'C:\\Projects\\Machine\\Readme'},
    {name: 'music.mp3', path: '/media/music.mp3'}
];

test('search matches names and folder paths, ignoring case and extra spaces', () => {
    assert.deepEqual(filterApplicationFiles(files, '  MACHINE   gear ', 'all'), [files[0]]);
    assert.deepEqual(filterApplicationFiles(files, 'gear', 'all'), files.slice(0, 2));
    assert.deepEqual(filterApplicationFiles(files, '', 'all'), files);
});

test('query and format filters combine, including files without extension', () => {
    assert.deepEqual(filterApplicationFiles(files, 'gear', 'pdf'), [files[1]]);
    assert.deepEqual(filterApplicationFiles(files, 'gear', 'mp3'), []);
    assert.deepEqual(filterApplicationFiles(files, '', 'sldprt'), [files[0]]);
    assert.deepEqual(filterApplicationFiles(files, '', 'other'), [files[2]]);
});

test('results remain grouped by actual parent folder on Windows and Unix', () => {
    const groups = new Map(groupApplicationFiles(files));
    assert.deepEqual(groups.get('C:\\Projects\\Machine'), [files[0], files[2]]);
    assert.deepEqual(groups.get('C:\\Projects\\Manuals'), [files[1]]);
    assert.deepEqual(groups.get('/media'), [files[3]]);
    assert.deepEqual(groupApplicationFiles([]), []);
});

test('potential application files are warned without flagging ordinary project files', () => {
    assert.equal(applicationFileMayBeEssential({name: 'engine.dll', path: 'C:\\Program Files\\Example\\engine.dll'}), true);
    assert.equal(applicationFileMayBeEssential({name: 'Example.exe', path: 'C:\\Users\\me\\AppData\\Local\\Programs\\Example\\Example.exe'}), true);
    assert.equal(applicationFileMayBeEssential({name: 'app.js', path: 'C:\\Projects\\Example\\app.js'}), false);
    assert.equal(applicationFileMayBeEssential({name: 'portable.exe', path: 'C:\\Users\\me\\Downloads\\portable.exe'}), false);
    assert.equal(applicationFileSensitivity({name:'plan.docx',path:'G:\\Shared drives\\Team\\plan.docx'}),'shared');
    assert.equal(applicationFileSensitivity({name:'notes.txt',path:'C:\\Users\\me\\OneDrive\\notes.txt'}),'synced');
    assert.equal(applicationSensitivityLabel('installation'),'Installation');
    assert.equal(applicationSensitivityLabel('shared'),'Shared file');
});
