import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const require = createRequire(import.meta.url);
const project = fileURLToPath(new URL('../', import.meta.url));

test('Electron backend lists nested directories and ASAR files without DEP0180', async () => {
    const electron = require('electron');
    const bundledArchive = path.join(project, 'node_modules/electron/dist/resources/default_app.asar');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folderrocket-host-fs-'));
    try {
        await fs.mkdir(path.join(root, 'parent', 'child'), {recursive:true});
        await fs.writeFile(path.join(root, 'parent', 'child', 'example.docx'), 'fixture');
        await fs.copyFile(bundledArchive, path.join(root, 'parent', 'application.asar'));
        const script = `
            require('./backend/services/hostFilesystem');
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const path = require('node:path');
            const root = process.argv[1];
            assert.equal(fs.statSync(path.join(root, 'parent', 'child')).isDirectory(), true);
            const archive = path.join(root, 'parent', 'application.asar');
            assert.equal(fs.statSync(archive).isFile(), true);
            assert.equal(fs.lstatSync(archive).isDirectory(), false);
            const entries = fs.readdirSync(path.join(root, 'parent'), {withFileTypes:true});
            assert.equal(entries.find(entry => entry.name === 'application.asar').isFile(), true);
            assert.equal(entries.find(entry => entry.name === 'child').isDirectory(), true);
            // Loading backend dependencies still works with the real filesystem.
            require('./backend/node_modules/express');
            const ExcelJS = require('./backend/node_modules/exceljs');
            new ExcelJS.Workbook().addWorksheet('Test');
            require('./backend/services/applicationDiscoveryService')
                .discoverApplicationFiles([root], ['docx', 'asar', 'js'])
                .then(result => {
                    assert.deepEqual(result.files.map(file => file.name).sort(), ['application.asar', 'example.docx']);
                    console.log('Nested folders and archives read successfully');
                }).catch(error => { console.error(error); process.exitCode = 1; });
        `;
        const result = spawnSync(electron, ['--throw-deprecation', '--trace-deprecation', '-e', script, root], {
            cwd:project, env:{...process.env, ELECTRON_RUN_AS_NODE:'1'}, encoding:'utf8', windowsHide:true, timeout:30000
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        assert.doesNotMatch(result.stderr, /DEP0180|DeprecationWarning/);
        assert.match(result.stdout, /Nested folders and archives read successfully/);
    } finally {
        assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('folderrocket-host-fs-'));
        await fs.rm(root, {recursive:true, force:true});
    }
});
