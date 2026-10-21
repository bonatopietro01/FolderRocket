import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("R8-R9 refined by R16 retain five accessible destinations inside the header", () => {
    const app = read("../src/App.tsx");
    const header = app.match(/<header className="appHeader">([\s\S]*?)<\/header>/)?.[1] || "";
    const nav = header.match(/<nav className="pageNavigation"[\s\S]*?<\/nav>/)?.[0] || "";
    assert.equal((nav.match(/<button\b/g) || []).length, 5);
    for (const [label, page] of [["Dashboard", "dashboard"], ["Folder Management", "folders"], ["File Studio", "processing"], ["Applications", "applications"], ["Daily Job", "daily"]]) {
        assert.ok(nav.includes(label), label);
        assert.ok(nav.includes(`page === "${page}" ? "page" : undefined`), page);
    }
    assert.match(header, /className="appLogo"/);
    assert.match(header, /className="appHeaderTools"/);
});

test("R10 refined by R17 keeps distinct non-Planet artwork with the saved color and AI marker", () => {
    const css = read("../src/worlds.css");
    const changeWorld = read("../src/components/ChangeWorld.tsx");
    const styles = ["rocky", "glowing", "asteroid", "black-hole", "galaxy"];
    const surfaces = styles.map(style => css.match(new RegExp(`\\.worldPlanet\\.${style} \\.worldPlanetCore \\{([^}]+)\\}`))?.[1]);
    assert.ok(surfaces.every(Boolean));
    assert.equal(new Set(surfaces).size, styles.length);
    assert.doesNotMatch(css, /\.worldPlanet:not\(\.planet\):not\(\.ringed\)\s+\.worldPlanetCore/);
    assert.match(changeWorld, /style=\{\{"--planet-color": world\.color\}/);
    assert.match(changeWorld, /className="worldAiSatelliteOrbit"/);
    assert.match(changeWorld, /className="worldPlanetRing"/);
    assert.match(changeWorld, /className="worldBlackHoleDisk"/);
    assert.match(changeWorld, /className="worldGalaxyArms"/);
});

test("R11 removes the empty-account wording from Gmail while retaining clear and account-selection actions", () => {
    const gmail = read("../src/components/GmailSourcePanel.tsx");
    assert.doesNotMatch(gmail, /No account selected/);
    assert.match(gmail, /Choose an account/);
    assert.match(gmail, /Clear selection/);
    assert.match(gmail, /onAccountBlockIdChange\?\.\(null\)/);
    assert.match(gmail, /Choose account/);
});

test("R12 constrains all File Studio tool panels and long queue labels to their column", () => {
    const css = read("../src/App.css");
    const fileStudioRules = css.slice(css.lastIndexOf("/* Keep all three File Studio tools within their own column at the narrowest grid sizes. */"));
    assert.match(fileStudioRules, /\.processingPage \.conversionStack,\.processingPage \.conversionStack > \* \{[^}]*min-width:0; max-width:100%/);
    assert.match(fileStudioRules, /\.processingPage \.conversionToolCard \.conversionQueue[\s\S]*overflow-x:hidden/);
    assert.match(fileStudioRules, /\.processingPage \.conversionToolCard \.formatQueueName,\.processingPage \.fireMountainFileName/);
    assert.match(fileStudioRules, /\.processingPage \{ grid-template-columns:minmax\(200px,\.8fr\) minmax\(0,1\.2fr\)/);
});

test("R13 removes only the partial-knowledge sentence while keeping graph readiness and graph actions", () => {
    const world = read("../src/components/ChangeWorld.tsx");
    assert.doesNotMatch(world, /Partial knowledge · some sources need attention/);
    assert.match(world, /graph\?\.readiness === "partial" \? ""/);
    assert.match(world, /className="worldGraphButton"[\s\S]*View graph/);
    assert.match(world, /worldGraphReadiness/);
});

test("R14 gives TreeRocket add and check actions the same centered footprint", () => {
    const css = read("../src/App.css");
    const treeActions = css.slice(css.lastIndexOf("/* The add and completed states share one fixed icon button footprint. */"));
    assert.match(treeActions, /\.treeRocketAddFolderButton,\.treeRocketNodeActions \.treeRocketAddedButton \{[^}]*width:29px;[^}]*height:27px;[^}]*place-items:center/);
    assert.match(treeActions, /\.treeRocketAddFolderButton svg,\.treeRocketNodeActions \.treeRocketAddedButton svg \{ width:14px; height:14px; \}/);
});

test("R37 supersedes R15 persistent roots with the same current-folder stage for Desktop and Computer", () => {
    const tree = read("../src/components/TreeRocket.tsx");
    const css = read("../src/App.css");
    assert.match(tree, /className="treeRocketGraphStage"/);
    assert.match(tree, /desktopRootLabel\(folder\)/);
    assert.match(tree, /<span className="treeRocketBreadcrumbSubfolders"[\s\S]*?contents\?\.folderTotal/);
    assert.doesNotMatch(tree, /treeRootMode==="computer"&&<span className="treeRocketBreadcrumbSubfolders"/);
    assert.doesNotMatch(tree, /desktopRootStage|desktopRootChoices|selectedDesktopRoot|treeRocketSubfoldersMeta/);
    assert.doesNotMatch(css, /desktopRootStage|desktopRootChoices|selectedDesktopRoot|treeRocketSubfoldersMeta/);
    assert.match(tree, /currentFolderDisplay[^\n]*className="treeRocketGraphStage"/);
    assert.match(tree, /folder=\{\{\.\.\.currentFolderDisplay, directFolderCount:contents\?\.folderTotal\?\?currentChildren\.length\}\}/);
});
