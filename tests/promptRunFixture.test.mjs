import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const fixture = readFileSync(new URL("./ui/prompt-run-smoke.tsx", import.meta.url), "utf8");
const treeFixture = readFileSync(new URL("./ui/tree-rocket-smoke.tsx", import.meta.url), "utf8");

test("latest prompt UI fixture uses production components and isolated synthetic accounts and files", () => {
    assert.match(fixture, /import ChangeWorld from/);
    assert.match(fixture, /import TreeRocket from/);
    assert.match(fixture, /example\.test/);
    assert.match(fixture, /Blocked unexpected fixture request/);
    assert.match(fixture, /filesystem\/tree-children/);
    assert.match(fixture, /onAddFolder=\{async\(_path,name\)/);
    for (const state of ["multiple", "single", "empty", "loading", "error"]) {
        assert.match(fixture, new RegExp(`value="${state}"`));
    }
    assert.doesNotMatch(fixture, /localStorage|process\.env|C:\\Users\\/);
});

test("Tree Rocket fixture covers folder cardinality and the floating file preview pagination", () => {
    assert.match(treeFixture, /\[0, 1, 2, 20\]/);
    assert.match(treeFixture, /directFileCount:205/);
    assert.match(treeFixture, /fileOffset\+visibleFiles\.length<directFiles\.length/);
});
