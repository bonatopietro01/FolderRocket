import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("planet email identity, local Obsidian metadata, and Tree Rocket mode stay explicitly scoped", () => {
    const worlds = read("../src/worlds.ts");
    const app = read("../src/App.tsx");
    const electron = read("../desktop/main.cjs");
    const editor = read("../src/components/ChangeWorld.tsx");
    const tree = read("../src/components/TreeRocket.tsx");
    const activity = read("../src/worldActivitySnapshot.ts");
    const gmail = read("../src/components/GmailSourcePanel.tsx");
    const outlook = read("../src/components/OutlookSourcePanel.tsx");
    const css = read("../src/App.css");

    assert.match(worlds, /emailAccount\?: WorldEmailAccount \| null/);
    assert.match(worlds, /emailAccount: null, treeRootMode: "computer"/);
    assert.match(app, /emailAccount:updated\.emailAccount\?\?null,treeRootMode:updated\.treeRootMode\|\|"computer"/);
    assert.match(app, /remote\.obsidian\?\{obsidian:remote\.obsidian\}/);
    assert.match(editor, /emailAccounts\?:WorldEmailCatalog/);
    assert.match(gmail, /worldAccountLocked\?\.\?false|worldAccountLocked = false/);
    assert.match(outlook, /worldAccountLocked\?\.\?false|worldAccountLocked = false/);
    assert.match(tree, /tree-roots\?worldId=\$\{encodeURIComponent\(worldId\)\}&mode=\$\{treeRootMode\}/);
    assert.match(tree, /body: JSON\.stringify\(\{query,worldId,mode:treeRootMode\}\)/);

    assert.match(activity, /buildWorldObsidianClientRecords/);
    assert.match(activity, /file contents, credentials, and email bodies are never included/);
    assert.match(editor, /obsidian\/sync/);
    assert.match(editor, /records\}\)\}/);
    assert.match(editor, /result\?\.warnings/);
    assert.match(app, /command\.worldId!==activeWorld\.id/);
    assert.match(app, /!activeWorld\.obsidian\?\.enabled/);
    assert.match(app, /onObsidianCommand\(command/);
    assert.match(app, /command\.action==="open"/);
    assert.match(app, /folderrocket-obsidian-open-email/);
    assert.match(app, /records:buildWorldObsidianClientRecords/);
    assert.match(electron, /target\.pathname==="\/sync"\?"sync":"open"/);
    assert.match(css, /prefers-reduced-motion:reduce[^}]*\.appLogoButton/);
});
