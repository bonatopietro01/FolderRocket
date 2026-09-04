import test from 'node:test';
import assert from 'node:assert/strict';
import {watchFolderDragHover} from '../src/folderDragHover.ts';

function fixture(t) {
    t.mock.timers.enable({apis: ['setTimeout']});
    const listeners = new Map();
    const windowListeners = new Map();
    const scope = {
        addEventListener(type, handler, capture) { assert.equal(capture, true); listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); },
        defaultView: {
            addEventListener(type, handler) { windowListeners.set(type, handler); },
            removeEventListener(type) { windowListeners.delete(type); }
        }
    };
    const block = name => ({
        name, isConnected: true, attributes: new Map(),
        closest(selector) { return selector === '.folder' ? this : null; },
        contains(node) { return node === this || node?.parent === this; },
        setAttribute(key, value) { this.attributes.set(key, value); },
        removeAttribute(key) { this.attributes.delete(key); }
    });
    const calls = [];
    const stop = watchFolderDragHover('.folder', (element, isCurrent) => calls.push({element, isCurrent}), scope);
    t.after(stop);
    return {
        block, calls, stop, listeners,
        emit(type, target, relatedTarget = null, types = ['Files']) {
            listeners.get(type)?.({target, relatedTarget, dataTransfer: {types}});
        },
        blur() { windowListeners.get('blur')?.(); }
    };
}

test('capture-phase hover opens once at two seconds despite repeated dragover', t => {
    const f = fixture(t), folder = f.block('parent');
    f.emit('dragenter', folder);
    assert.equal(folder.attributes.get('data-drag-hover'), 'waiting');
    t.mock.timers.tick(1500);
    f.emit('dragover', folder);
    t.mock.timers.tick(499);
    assert.equal(f.calls.length, 0);
    t.mock.timers.tick(1);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].element, folder);
    assert.equal(folder.attributes.size, 0);
    f.emit('dragover', folder);
    t.mock.timers.tick(5000);
    assert.equal(f.calls.length, 1);
});

test('moving among children retains the timer; moving folders restarts it', t => {
    const f = fixture(t), first = f.block('first'), second = f.block('second');
    const child = {parent: first, closest: selector => first.closest(selector)};
    f.emit('dragover', first);
    t.mock.timers.tick(1000);
    f.emit('dragleave', first, child);
    f.emit('dragover', child);
    t.mock.timers.tick(1000);
    assert.equal(f.calls.length, 1);
    f.emit('dragover', second);
    assert.equal(f.calls[0].isCurrent(), false);
    t.mock.timers.tick(1999);
    assert.equal(f.calls.length, 1);
    t.mock.timers.tick(1);
    assert.equal(f.calls[1].element, second);
});

for (const event of ['dragleave', 'drop', 'dragend', 'blur', 'outside', 'cleanup']) {
    test(`${event} cancels pending navigation and its visual feedback`, t => {
        const f = fixture(t), folder = f.block('parent');
        f.emit('dragover', folder);
        t.mock.timers.tick(1999);
        if (event === 'blur') f.blur();
        else if (event === 'cleanup') f.stop();
        else if (event === 'outside') f.emit('dragover', {closest: () => null});
        else f.emit(event, folder);
        t.mock.timers.tick(1);
        assert.equal(f.calls.length, 0);
        assert.equal(folder.attributes.size, 0);
    });
}

test('stale asynchronous reads cannot navigate after drop or disconnection', t => {
    const f = fixture(t), folder = f.block('parent');
    f.emit('dragover', folder);
    t.mock.timers.tick(2000);
    assert.equal(f.calls[0].isCurrent(), true);
    folder.isConnected = false;
    assert.equal(f.calls[0].isCurrent(), false);
    folder.isConnected = true;
    f.emit('drop', folder);
    assert.equal(f.calls[0].isCurrent(), false);
});

test('folder reordering and empty drag payloads do not open folders', t => {
    const f = fixture(t), folder = f.block('parent');
    for (const types of [[], ['application/x-folderrocket-folder-order']]) {
        f.emit('dragover', folder, null, types);
        t.mock.timers.tick(2000);
    }
    assert.equal(f.calls.length, 0);
});
