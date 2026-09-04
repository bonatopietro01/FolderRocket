import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import discovery from '../backend/services/applicationDiscoveryService.js';

test('discovery covers more than 1000 files, nested cloud/Desktop paths and cyclic junctions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folderrocket-discovery-'));
    try {
        const desktop = path.join(root, 'OneDrive - Example', 'Desktop', 'Deep', 'Slides');
        const repository = path.join(root, 'Repositories', 'team-project');
        await fs.mkdir(desktop, {recursive:true});
        await fs.mkdir(path.join(repository,'.git'), {recursive:true});
        for (let i = 0; i < 1005; i++) await fs.writeFile(path.join(desktop, `slides-${i}.pptx`), 'fixture');
        await fs.writeFile(path.join(root, 'ignored.txt'), 'fixture');
        await fs.writeFile(path.join(repository, 'shared.pptx'), 'fixture');
        await fs.symlink(root, path.join(desktop, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
        const result = await discovery.discoverApplicationFiles([root, desktop, path.join(root, 'missing')], ['pptx']);
        assert.equal(result.files.length, 1006);
        assert.equal(result.truncated, false);
        assert.equal(result.skipped, 1);
        assert.equal(new Set(result.files.map(file => file.path)).size, 1006);
        assert.equal(result.folders.reduce((sum, folder) => sum + folder.count, 0), 1006);
        assert.equal(result.files.find(file=>file.name==='shared.pptx').sensitivity,'shared');
        assert.equal(result.files.find(file=>file.name==='slides-0.pptx').sensitivity,'synced');
        await fs.writeFile(path.join(desktop, 'new-slides.pptx'), 'fixture');
        await fs.rm(path.join(desktop, 'slides-0.pptx'));
        const refreshed = await discovery.discoverApplicationFiles([root], ['pptx'], {previous:result});
        assert.equal(refreshed.mode, 'incremental');
        assert.equal(refreshed.added, 1);
        assert.equal(refreshed.removed, 1);
        assert.ok(refreshed.files.some(file => file.name === 'new-slides.pptx'));
        assert.ok(!refreshed.files.some(file => file.name === 'slides-0.pptx'));
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(discovery.discoverApplicationFiles([root], ['pptx'], {signal:controller.signal}), {name:'AbortError'});
    } finally {
        assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('folderrocket-discovery-'));
        await fs.rm(root, {recursive:true, force:true});
    }
});
