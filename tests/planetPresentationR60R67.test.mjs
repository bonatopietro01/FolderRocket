import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const readProjectFile = path => readFileSync(new URL(path, projectRoot), "utf8");
const worldSource = readProjectFile("src/components/ChangeWorld.tsx");
const wikiSource = readProjectFile("src/components/PlanetWiki.tsx");
const appSource = readProjectFile("src/App.tsx");
const diagnosticsSource = readProjectFile("src/diagnostics.ts");
const folderManagementSource = readProjectFile("src/components/FolderManagement.tsx");
const usbSource = readProjectFile("src/components/UsbSourcePanel.tsx");
const planetStyles = readProjectFile("src/worlds.css");

test("wiki readiness stays a guard and diagnostics direct the user to planet Obsidian settings", () => {
    assert.match(diagnosticsSource, /KNOWLEDGE_INCOMPLETE/);
    assert.match(diagnosticsSource, /details\.route.*obsidian\/sync/);
    assert.match(appSource, /Obsidian vault settings/i);
    const syncRoute = readProjectFile("backend/server.js").split('app.post("/worlds/:worldId/obsidian/sync"')[1].split('app.get("/worlds/:worldId/graph"')[0];
    assert.match(syncRoute, /currentKnowledgeMatches|currentKnowledge\.status!=="ready"/);
    assert.match(syncRoute, /status\(409\)\.json\(\{code:"KNOWLEDGE_INCOMPLETE"/);
});

test("file-type inventory callers display unavailable-root status without treating counts as complete", () => {
    assert.match(folderManagementSource, /status\s*===\s*["']unavailable["']/);
    assert.match(folderManagementSource, /unavailableFolders/);
    assert.match(usbSource, /status\s*===\s*["']unavailable["']/);
    assert.match(usbSource, /unavailableFolders/);
});

test("only the Obsidian settings editor owns wiki creation and rebuild controls", () => {
    const worldGrid = worldSource.slice(worldSource.indexOf("const WorldGrid"), worldSource.indexOf("export default function ChangeWorld"));
    assert.match(worldGrid, /Apri wiki/);
    assert.doesNotMatch(worldGrid, /Crea wiki|Ricostruisci wiki/);
    assert.match(worldSource, /<PlanetWikiRebuildControls\b/);
    assert.doesNotMatch(wikiSource, /planetWikiRebuildButton|RICOSTRUZIONE MANUALE/);
    assert.match(worldSource, /worldSettingsDisclosure[\s\S]{0,9000}<PlanetWikiRebuildControls\b/);
});

test("planet cards use fixed dimensions and four desktop columns with responsive narrower layouts", () => {
    const gridRule = planetStyles.match(/\.worldGrid\s*\{([^}]+)\}/)?.[1] || "";
    const cardRule = planetStyles.match(/\.worldCard\s*\{([^}]+)\}/)?.[1] || "";
    assert.match(gridRule, /grid-template-columns\s*:\s*repeat\(4\s*,\s*minmax\(0\s*,\s*1fr\)\)/);
    assert.match(cardRule, /height\s*:\s*\d+px/);
    assert.match(planetStyles, /@media\s*\(max-width\s*:\s*\d+px\)[\s\S]*?\.worldGrid[^}]*grid-template-columns/);
    assert.match(planetStyles, /overflow-x\s*:\s*hidden|overflow-x\s*:\s*clip/);
});

test("black-hole and galaxy have dedicated image assets inspired by the supplied references", () => {
    assert.match(worldSource, /planet-black-hole-inspired\.png/);
    assert.match(worldSource, /planet-galaxy-inspired\.png/);
    assert.match(worldSource, /worldPlanetArtwork/);
    assert.match(planetStyles, /\.worldPlanetArtwork/);
    assert.ok(existsSync(new URL("../src/assets/planet-black-hole-inspired.png", import.meta.url)));
    assert.ok(existsSync(new URL("../src/assets/planet-galaxy-inspired.png", import.meta.url)));
});
