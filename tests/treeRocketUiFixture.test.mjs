import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const fixture = readFileSync(new URL("./ui/tree-rocket-smoke.tsx", import.meta.url), "utf8");
const followupFixture = readFileSync(new URL("./ui/followup-smoke.tsx", import.meta.url), "utf8");

test("Tree Rocket visual fixture covers requested synthetic folder counts and long labels", () => {
    assert.match(fixture, /\[0, 1, 2, 20\]/);
    assert.match(fixture, /client documents, archive and deadlines 2026/);
    assert.match(fixture, /mode === 'desktop' \? desktopRoots/);
    assert.match(fixture, /name: 'Desktop', path: 'C:\\\\Fixture\\\\Desktop'/);
    assert.match(fixture, /name: 'Public Desktop', path: 'C:\\\\Fixture\\\\Public Desktop'/);
    assert.match(fixture, /directFolderCount: 20/);
    assert.match(fixture, /roots: mode === 'desktop' \? desktopRoots/);
    assert.match(fixture, /folderTotal: folderList\.length/);
    assert.match(fixture, /directFileCount:205/);
    assert.match(fixture, /body\.includeFiles \? visibleFiles : \[\]/);
});

test("Folder Management fixture uses many synthetic formats, files, folders, and mocked transfers", () => {
    assert.match(followupFixture, /syntheticFormats=\["csv"[\s\S]*?"xlsx","zip"\]/);
    assert.match(followupFixture, /syntheticFolderFiles=\(folderPath:string\)=>Array\.from\(\{length:96\}/);
    assert.match(followupFixture, /Array\.from\(\{length:24\}/);
    assert.match(followupFixture, /\/file-types\/inventory/);
    assert.match(followupFixture, /\/list-folder-files/);
    assert.match(followupFixture, /\/files\/copy|\/files\/move/);
    assert.match(followupFixture, /Blocked unexpected fixture request/);
});
