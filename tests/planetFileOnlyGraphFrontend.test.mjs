import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(join(root,path),"utf8");

test("R50 keeps graph and Obsidian scope file-only while retaining separate enable toggles",()=>{
    const app=read("src/App.tsx");
    const settings=read("src/components/ChangeWorld.tsx");
    assert.doesNotMatch(app,/\/graph\/(?:snapshot|activity)/);
    assert.doesNotMatch(app,/buildWorldObsidianClientRecords|records:\s*buildWorldObsidianClientRecords/);
    assert.match(app,/obsidian\/sync`,\{method:"POST",credentials:"include"\}/);
    assert.doesNotMatch(app,/graph\/index`,\{method:"POST"[^}]*body:/);
    assert.match(settings,/Domain links, email, calendar and workspace activity are not included/);
    assert.match(settings,/Synchronize supported files from this planet’s configured folders/);
    assert.match(settings,/checked=\{editingWorld\.graphEnabled === true\}/);
    assert.match(settings,/checked=\{editingWorld\.obsidian\?\.enabled===true\}/);
    assert.doesNotMatch(settings,/\/email\/conversations\?/);
    assert.match(settings,/email:false,alerts:false,activity:false,snapshots:false,clientNotes:false,attachments:false/);
});

test("R52 exposes a planet-only email unlink action that clears the world setting",()=>{
    const settings=read("src/components/ChangeWorld.tsx");
    const app=read("src/App.tsx");
    assert.match(settings,/Unlink from this planet/);
    assert.match(settings,/function clearWorldEmailAccount\(\)[\s\S]*?emailAccount:null/);
    assert.match(app,/emailAccount:updated\.emailAccount\?\?null/);
});
