import test from 'node:test';
import assert from 'node:assert/strict';
import {isWithinUsbPath, removeDisconnectedUsbFolders} from '../src/usbFolders.ts';

const local = {id:'local', name:'Local', path:'C:\\Work', description:''};
const usb = {id:'usb', name:'USB', path:'E:\\', usbDrivePath:'E:\\', description:''};
const legacy = {id:'legacy', name:'Old USB', path:'F:\\', description:'Connected removable USB drive'};

test('unplug removes only disconnected USB references including saved legacy blocks', () => {
    const folders = [local, usb, legacy];
    assert.deepEqual(removeDisconnectedUsbFolders(folders, [{path:'f:/'}]), [local, legacy]);
    assert.deepEqual(removeDisconnectedUsbFolders(folders, []), [local]);
    assert.equal(removeDisconnectedUsbFolders(folders, [{path:'e:/'}, {path:'F:\\'}]), folders);
});

test('USB subfolders disappear but repointed local blocks and virtual folders survive', () => {
    const child = {...usb, path:'E:\\Documents\\Project'};
    const repointed = {...usb, path:'C:\\Documents'};
    const virtual = {...usb, storage:'imaginary'};
    assert.deepEqual(removeDisconnectedUsbFolders([child, repointed, virtual], []), [repointed, virtual]);
    assert.equal(isWithinUsbPath('e:/Documents/a.txt', 'E:\\'), true);
    assert.equal(isWithinUsbPath('E:\\Documents-old', 'E:\\Documents'), false);
});
