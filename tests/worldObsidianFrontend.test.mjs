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
    assert.match(editor, /onSyncObsidian\(editingWorld\.id,signature\)/);
    assert.match(editor, /result\?\.warnings/);
    assert.match(app, /command\.worldId!==activeWorld\.id/);
    assert.match(app, /!activeWorld\.obsidian\?\.enabled/);
    assert.match(app, /onObsidianCommand\(command/);
    assert.match(app, /command\.action==="open"/);
    assert.match(app, /folderrocket-obsidian-open-email/);
    assert.match(app, /records:buildWorldObsidianClientRecords/);
    assert.match(electron, /target\.pathname==="\/sync"\?"sync":"open"/);
    assert.match(worlds, /sourceSelection\?: WorldObsidianSourceSelection/);
    assert.match(worlds, /threadMode: source\.threadMode === "selected"/);
    assert.match(editor, /worldObsidianSources/);
    assert.match(editor, /Select all/);
    assert.match(editor, /Select none/);
    assert.match(editor, /threadMode:"selected"/);
    assert.match(editor, /email\/conversations\?\$\{params\}/);
    assert.match(editor, /Outlook conversation selection is not supported/);
    assert.match(editor, /className="worldCardActions"[\s\S]*className="worldSelectButton"[\s\S]*className="worldGraphButton"/);
    assert.match(css, /\.worldCardActions\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(css, /@media\(max-width:520px\)\s*\{\s*\.worldCardActions\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
    assert.match(editor, /folderrocket:obsidian-sync-status/);
    assert.match(editor, /blockIds\?:string\[\]/);
    assert.match(editor, /originWorldNames\?:string\[\]/);
    assert.match(app, /world\.obsidian\.autoSync !== true/);
    assert.match(app, /5 \* 60 \* 1000/);
    assert.match(app, /requestObsidianSync\(user\.id,world\.id,workspaceScope,obsidianSyncSignature\)/);
    assert.match(app, /existing\.signature===signature\s*\?\s*existing\.request/);
    assert.match(app, /folderrocket:obsidian-sync-status/);
    assert.match(app, /conversationSideRail/);
    assert.match(app,/conversationRailPreview/);
    assert.match(app,/next === "dashboard" && page === "dashboard"/);
    assert.doesNotMatch(app, /Launch Conversation/);
    assert.match(tree, /treeRocketBrowseSelect/);
    assert.match(tree, /treeRocketToolbar" aria-label="Browse, folder and app controls"/);
    assert.match(css, /\.conversationSideRail/);
});

test("planet graph retries, Tree Rocket file previews, and email account identities stay explicit", () => {
    const app = read("../src/App.tsx");
    const css = read("../src/App.css");
    const planet = read("../src/components/ChangeWorld.tsx");
    const planetCss = read("../src/worlds.css");
    const graph = read("../src/components/PlanetGraph.tsx");
    const layout = read("../src/components/planetGraphLayout.ts");
    const tree = read("../src/components/TreeRocket.tsx");
    const email = read("../src/components/EmailConversations.tsx");
    const daily = read("../src/components/DailyJob.tsx");
    const navigation = css.slice(css.lastIndexOf("/* Keep the logo anchored while presenting navigation as consistent, reachable tabs. */"));
    const finalNavigation = css.slice(css.lastIndexOf("/* Shared destinations now sit between the header and page columns. */"));

    assert.match(planet, /className=\{`worldPlanet \$\{world\.style\}/);
    assert.match(planet, /<span className="worldPlanetCore"\/>/);
    assert.match(planet, /className="worldPlanetRing"/);
    assert.match(planet, /className="worldBlackHoleDisk"/);
    assert.match(planet, /className="worldGalaxyArms"/);
    assert.match(planetCss, /\.worldPlanet\.black-hole \.worldPlanetCore \{[^}]*radial-gradient/);
    assert.match(planetCss, /\.worldBlackHoleDisk \{[^}]*conic-gradient/);
    assert.match(read("../src/worlds.ts"), /\["rocky", "planet", "ringed", "glowing", "asteroid", "black-hole", "galaxy"\]/);
    assert.doesNotMatch(planet, /const artwork = <svg/);
    assert.match(app, /<WorldPlanet world=\{worldTravelTarget\}/);
    assert.match(app, /aria-current=\{page === "daily" \? "page" : undefined\}/);
    // R16 supersedes the old full-width and <=520px navigation geometry. Rendered bounds verify the new header slot.
    assert.match(app, /<header className="appHeader">[\s\S]*?<nav className="pageNavigation"[\s\S]*?<\/header>/);
    assert.match(css, /\.pageNavigation \.pageMenuItems > button:focus-visible/);
    assert.match(navigation, /\.pageNavigation \.pageMenuItems > button\.active/);
    for (const destination of ["dashboard", "folders", "processing", "applications", "daily"]) {
        assert.match(app, new RegExp(`navigate\\("${destination}"\\)`));
        assert.match(app, new RegExp(`aria-current=\\{page === "${destination}" \\? "page" : undefined\\}`));
    }
    assert.match(css, /\.appLogo \{[\s\S]*?top: 1px/);
    assert.match(css, /\.planetGraphSplitLayout \{ grid-template-columns:minmax\(260px,\.78fr\) minmax\(0,1\.6fr\)/);

    assert.match(layout, /sourceStatuses:PlanetGraphSourceStatus\[\]/);
    assert.match(layout, /data\.sourceStatuses/);
    assert.match(graph, /source\.retryable/);
    assert.match(graph, /retrySourceId\?\{retrySourceId\}:\{\}/);
    assert.match(graph, /Loaded graph records remain available/);
    assert.match(graph, /source\.sourceId==="aggregate:graph"&&source\.type==="aggregate"/);
    assert.match(graph, /selected sources reached a shared indexing limit/);
    assert.match(graph, /issue\.scope==="global"/);
    assert.match(graph, /Source warnings/);
    assert.match(graph, /typeof source\.total==="number"&&source\.total>0\?` · \$\{source\.processed\} \/ \$\{source\.total\}`:""/);
    assert.match(graph, /setVisibleCap\]=useState\(100\)/);
    assert.match(graph, /cap\+100/);
    assert.match(graph, /Load more nodes/);

    assert.match(tree, /treeRocketSeeFiles/);
    assert.match(tree, /className="treeRocketFiles treeRocketFilesFloating" ref=\{filePreviewRef\} role="dialog"/);
    assert.match(tree, /const closeFilesPanel = useCallback\(\(restoreFocus = false\)/);
    assert.match(tree, /useLayoutEffect\(\(\) => \{ filesViewRef\.current = filesView; \}, \[filesView\]\)/);
    assert.match(tree, /document\.addEventListener\("scroll", schedule, true\)/);
    assert.match(tree, /document\.addEventListener\("pointerdown", dismissOutside, true\)/);
    assert.match(tree, /filePreviewCloseRef\.current\?\.focus\(\)/);
    assert.match(tree, /onShowFiles\(event\.currentTarget\)/);
    assert.match(tree, /className="treeRocketFileList"/);
    assert.match(tree, /loadMoreFilePreview/);
    assert.doesNotMatch(tree, /treeRocketInlineFiles|treeRocketInlineFileTable|onLoadMoreFiles/);
    assert.match(css, /\.treeRocketFilesFloating \{ position:fixed;/);
    assert.match(css, /\.treeRocketFilesFloating > \.treeRocketFileList \{ min-height:0; overflow:auto;/);
    assert.match(tree, /graphNodeId\("folder", folder\.path\)/);
    assert.match(tree, /includeFiles:true/);
    assert.match(css, /\.folderTableRow\.orderingFolder \.folderAppearanceButton \{ height:29px; min-height:29px;/);

    assert.match(email, /inlineImages\?:InlineImageMetadata\[\]/);
    assert.match(email, /Inline images/);
    assert.match(email, /partId:image\.partId/);
    assert.match(email, /email\/gmail\/attachments\/download/);
    assert.match(email, /<pre>\{message\.text/);
    assert.doesNotMatch(email, /<img[^>]+inlineImages/);

    assert.match(daily, /Planet inbox for Conversations and alerts/);
    assert.match(daily, /Recap sender/);
    assert.doesNotMatch(daily, /emailSources\[0\]/);
    assert.match(app, /planetEmailAccount=\{world\.emailAccount\}/);
});
