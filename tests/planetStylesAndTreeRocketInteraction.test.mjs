import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worldSource = readFileSync(new URL("../src/components/ChangeWorld.tsx", import.meta.url), "utf8");
const graphSource = readFileSync(new URL("../src/components/PlanetGraph.tsx", import.meta.url), "utf8");
const planetStyles = readFileSync(new URL("../src/worlds.css", import.meta.url), "utf8");
const treeSource = readFileSync(new URL("../src/components/TreeRocket.tsx", import.meta.url), "utf8");
const worldTypes = readFileSync(new URL("../src/worlds.ts", import.meta.url), "utf8");
const visualFixture = readFileSync(new URL("./ui/followup-smoke.tsx", import.meta.url), "utf8");

test("planet artwork fixture covers all seven saved styles in compact and large shared surfaces", () => {
    for (const style of ["planet", "rocky", "ringed", "glowing", "asteroid", "black-hole", "galaxy"]) {
        assert.match(visualFixture, new RegExp(`"${style}"`));
        assert.match(planetStyles, new RegExp(`\\.worldPlanet\\.${style.replace("-", "\\-")}`));
    }
    assert.match(visualFixture, /<Planet world=\{\{\.\.\.world,style,aiEnabled:true\}\} large\/>/);
    assert.match(visualFixture, /<Planet world=\{\{\.\.\.world,style\}\}\/>/);
    assert.match(visualFixture, /length:1200/);
    assert.match(visualFixture, /length:900/);
    assert.match(visualFixture, /<ProcessingWorkspace folders=\{folders\}/);
    assert.match(worldTypes, /\["rocky", "planet", "ringed", "glowing", "asteroid", "black-hole", "galaxy"\]/);
    assert.match(worldSource, /className=\{`worldPlanet \$\{world\.style\}/);
    assert.match(worldSource, /<span className="worldPlanetCore"\/>/);
    assert.match(worldSource, /className="worldPlanetRing"/);
    assert.match(worldSource, /className="worldBlackHoleDisk"/);
    assert.match(worldSource, /className="worldGalaxyArms"/);
    assert.match(worldSource, /className="worldAiSatelliteOrbit"/);
    assert.match(planetStyles, /\.worldPlanet\.black-hole \.worldPlanetCore/);
    assert.match(planetStyles, /\.worldBlackHoleDisk/);
    assert.match(planetStyles, /\.worldPlanet\.rocky \.worldPlanetCore/);
    assert.match(planetStyles, /\.worldPlanet\.asteroid \.worldPlanetCore/);
});

test("Planet Graph coalesces gestures and keeps centered-zoom pointer coordinates aligned", () => {
    assert.match(graphSource, /dragFrame\.current===null\)dragFrame\.current=window\.requestAnimationFrame\(flushGraphDrag\)/);
    assert.match(graphSource, /const x=900\+\(p\.x-pan\.x-900\)\/zoom/);
    assert.match(graphSource, /const y=540\+\(p\.y-pan\.y-540\)\/zoom/);
    assert.match(graphSource, /const worldX=900\+\(cursor\.x-pan\.x-900\)\/zoom/);
    assert.match(graphSource, /const worldY=540\+\(cursor\.y-pan\.y-540\)\/zoom/);
    assert.match(graphSource, /setPan\(\{x:cursor\.x-900-\(worldX-900\)\*nextZoom,y:cursor\.y-540-\(worldY-540\)\*nextZoom\}\)/);
    assert.match(graphSource, /onPointerCancel=\{handleUp\}/);
});

test("Tree Rocket card body opens by pointer and keyboard while action buttons remain separate", () => {
    assert.match(treeSource, /role="group" tabIndex=\{loading \? -1 : 0\}/);
    assert.match(treeSource, /onClick=\{event => \{if \(event\.target instanceof Element && event\.target\.closest\("button"\)\) return; if \(!loading\) onOpen\(\);\}\}/);
    assert.match(treeSource, /event\.target !== event\.currentTarget/);
    assert.match(treeSource, /event\.key === "Enter" \|\| event\.key === " "/);
    assert.match(treeSource, /className="treeRocketSeeFiles" onClick=\{event => \{event\.stopPropagation\(\); onShowFiles\(event\.currentTarget\);\}\}/);
    assert.match(treeSource, /onClick=\{event => \{event\.stopPropagation\(\); onAdd\(\);\}\}/);
});

test("Tree Rocket anchor loss restores focus only when the floating preview held focus",()=>{
    assert.match(treeSource,/closeFilesPanelForAnchorLoss = useCallback/);
    assert.match(treeSource,/focusWasInPreview = Boolean\(filePreviewRef\.current\?\.contains\(document\.activeElement\)\)/);
    assert.match(treeSource,/document\.activeElement === document\.body[\s\S]*foldersTabRef\.current\?\.focus\(\)/);
    assert.match(treeSource,/rect\.bottom <= 0 \|\| rect\.top >= viewportHeight\) \{ closeFilesPanelForAnchorLoss\(\); return; \}/);
    assert.match(treeSource,/ref=\{foldersTabRef\} type="button" role="tab"/);
});

test("Planet Graph opens for current partial evidence and exposes its gaps and managed-note revision", () => {
    assert.match(worldSource, /"disabled"\|"indexing"\|"preparing"\|"stale"\|"empty"\|"partial"\|"ready"\|"error"/);
    assert.match(worldSource, /graph\?\.queryable === true && graph\.stale !== true/);
    assert.match(worldSource, /graph\?\.readiness === "partial" \? ""/);
    assert.doesNotMatch(worldSource, /Partial knowledge · some sources need attention/);
    assert.match(graphSource, /knowledge\?\.readiness==="partial"&&knowledgeGaps\.length>0/);
    assert.match(graphSource, /className="planetKnowledgeGaps"/);
    assert.match(graphSource, /knowledge\?\.managedMarkdown&&/);
    assert.match(graphSource, /knowledge\.managedMarkdown\.revision/);
    assert.match(visualFixture, /readiness:"partial",queryable:true/);
    assert.match(visualFixture, /gaps:\["Synthetic folder: one nested folder is unavailable\."\]/);
});
