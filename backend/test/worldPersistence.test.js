const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function loadWorldModule(storage) {
    const sourcePath = path.join(__dirname, "..", "..", "src", "worlds.ts");
    const source = fs.readFileSync(sourcePath, "utf8");
    const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module = {exports:{}};
    const localStorage = {
        get length() { return storage.size; },
        getItem(key) { return storage.get(key) ?? null; },
        setItem(key, value) { storage.set(key, String(value)); },
        key(index) { return [...storage.keys()][index] ?? null; }
    };
    vm.runInNewContext(output, {module, exports:module.exports, localStorage, crypto:require("node:crypto"), Date, Object, JSON, Array, Set, String, Boolean, Math});
    return module.exports;
}

test("planet profiles, styles, and future permission hooks remain separate across switches", () => {
    const storage = new Map();
    const worlds = loadWorldModule(storage);
    const work = {...worlds.createDefaultWorlds()[0], agents:[{id:"agent-work",name:"Revisore",description:"solo lavoro",instructions:"Istruzioni lavoro",enabled:true}], skills:[], permissions:{schemaVersion:1,configured:false}};
    const personal = {...worlds.createDefaultWorlds()[1], agents:[], skills:[{id:"skill-personal",name:"Personale",description:"solo personale",instructions:"Istruzioni personali",enabled:true}], permissions:{schemaVersion:1,configured:false}};
    const key = worlds.worldsStorageKey("user-a");
    storage.set(key, JSON.stringify({worlds:[work,personal],activeWorldId:"work"}));

    const firstLoad = worlds.loadWorkspaceWorldState("user-a");
    assert.equal(firstLoad.worlds[0].agents[0].instructions,"Istruzioni lavoro");
    assert.equal(firstLoad.worlds[0].skills.length,0);
    assert.equal(firstLoad.worlds[1].agents.length,0);
    assert.equal(firstLoad.worlds[1].skills[0].instructions,"Istruzioni personali");
    assert.notEqual(worlds.activeWorldStorageScope("user-a","work"),worlds.activeWorldStorageScope("user-a","personal"));
    assert.ok(firstLoad.worlds.every(world=>world.permissions.configured===false));

    storage.set(key, JSON.stringify({...firstLoad,activeWorldId:"personal"}));
    const switchedLoad = worlds.loadWorkspaceWorldState("user-a");
    assert.equal(switchedLoad.activeWorldId,"personal");
    assert.equal(switchedLoad.worlds[0].agents[0].instructions,"Istruzioni lavoro");
    assert.equal(switchedLoad.worlds[1].skills[0].instructions,"Istruzioni personali");
});

test("planet artwork and world switch retain distinct styles and reduced-motion handling", () => {
    const css = fs.readFileSync(path.join(__dirname,"..","..","src","worlds.css"),"utf8");
    const app = fs.readFileSync(path.join(__dirname,"..","..","src","App.tsx"),"utf8");
    const worldsScreen = fs.readFileSync(path.join(__dirname,"..","..","src","components","ChangeWorld.tsx"),"utf8");
    const account = fs.readFileSync(path.join(__dirname,"..","..","src","components","AuthGate.tsx"),"utf8");
    const integrations = fs.readFileSync(path.join(__dirname,"..","..","src","components","IntegrationSetup.tsx"),"utf8");
    assert.match(css,/\.worldPlanet\.rocky::before/);
    assert.match(css,/\.worldPlanet\.glowing::before/);
    assert.match(css,/\.worldPlanet\.ringed\s*>\s*em/);
    assert.match(css,/\.worldPlanet\.ringed::after[^}]*z-index:3[^}]*clip-path:inset\(50% 0 0\)/);
    assert.match(css,/\.worldAiSatelliteOrbit\s*>\s*i[^}]*animation:planetSatelliteOrbit/);
    assert.match(worldsScreen,/world\.aiEnabled \? " aiEnabled"/);
    assert.match(app,/return Number\.isFinite\(value\).*\.85/);
    assert.match(app,/migrateDefaultWorldZoom\(user\.id, state\.worlds\)/);
    assert.match(account,/className="accountWorkspaceControls"/);
    assert.match(account,/aria-label="Zoom out"/);
    assert.match(account,/className="accountPageZoomRow"/);
    assert.match(account,/Altri zoom/);
    assert.match(account,/Side post-its/);
    assert.match(account,/Width \{bookmarkWidth\}px/);
    assert.match(account,/Height \{bookmarkHeight\}px/);
    assert.match(account,/className=\{aiMode \? "accountAiMode enabled" : "accountAiMode"\}/);
    assert.match(account,/className="accountServicesButton"/);
    assert.match(account,/IntegrationSetup isAdmin=\{user\.role === "admin"\}[^>]+open=\{open && servicesOpen\}/);
    assert.doesNotMatch(account,/pageZoomTracker/);
    assert.doesNotMatch(worldsScreen,/worldAiToggle/);
    assert.match(worldsScreen,/worldAiAccountNote/);
    assert.doesNotMatch(integrations,/AI \{aiMode \? "ON" : "OFF"\}/);
    assert.doesNotMatch(integrations,/className=\{aiMode \? "integrationAiMode enabled"/);
    assert.match(integrations,/className="integrationSetupPanel accountServicesPanel"/);
    assert.match(integrations,/onOpenChange\(false\)/);
    assert.match(app,/className=\{aiEnabled \? "appAiStatus active" : "appAiStatus inactive"\}/);
    assert.match(app,/AI ON.*AI OFF/s);
    assert.match(app,/Fly To Another Planet/);
    assert.doesNotMatch(app,/Fly to another world/);
    assert.doesNotMatch(app,/Change World/);
    assert.match(css,/--world-space-image/);
    assert.match(css,/worldEditorScrim[^\n]*--world-space-image/);
    assert.match(css,/worldTravelScreen[^\n]*--world-space-image/);
    assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(app,/matchMedia\("\(prefers-reduced-motion:\s*reduce\)"\)/);
    assert.match(app,/animationFloor/);
    assert.match(app,/sequence\s*!==\s*worldSwitchSequence\.current/);
    assert.match(app,/worldSwitchInFlight\.current\s*=\s*true/);
});

test("workspace restores the light background and keeps the active planet beside the wordmark", () => {
    const appCss = fs.readFileSync(path.join(__dirname,"..","..","src","App.css"),"utf8");
    const worldsCss = fs.readFileSync(path.join(__dirname,"..","..","src","worlds.css"),"utf8");
    const app = fs.readFileSync(path.join(__dirname,"..","..","src","App.tsx"),"utf8");
    const worldScreen = fs.readFileSync(path.join(__dirname,"..","..","src","components","ChangeWorld.tsx"),"utf8");
    assert.match(appCss,/body\s*\{\s*background:\s*linear-gradient\([\s\S]*?#ffffff 0%[\s\S]*?#f2f6fb 100%/);
    assert.doesNotMatch(appCss,/\.app::before/);
    assert.match(worldsCss,/\.changeWorldBackdrop[^\n]*--world-space-image/);
    assert.match(worldsCss,/\.worldTravelScreen[^\n]*--world-space-image/);
    assert.match(app,/className="appWorldIdentity"[^>]*aria-label=\{`Pianeta attivo: \$\{world\.name\}`\}/);
    assert.match(app,/WorldPlanet world=\{world\}/);
    assert.match(worldsCss,/\.appWorldIdentity \.worldPlanet/);
    assert.match(worldScreen,/className=\{`worldPlanet \$\{world\.style\}/);
    const launcher = app.match(/<button type="button" className="worldChangeLauncher"[\s\S]*?<\/button>/)?.[0] || "";
    assert.match(launcher,/<span>Fly To Another Planet<\/span>/);
    assert.doesNotMatch(launcher,/world\.name|<small>/);
});

test("world switch reuses its freshly loaded settings and records timing without the old long delay", () => {
    const app = fs.readFileSync(path.join(__dirname,"..","..","src","App.tsx"),"utf8");
    const worldsCss = fs.readFileSync(path.join(__dirname,"..","..","src","worlds.css"),"utf8");
    assert.match(app,/if \(settingsPreloadedRef\.current\) \{[\s\S]*?return \(\) => \{ active = false; \};\s*\}\s*fetch\(dashboardSettingsUrl/);
    assert.match(app,/settingsPreloaded=\{preloadedSettingsWorldId === activeWorld\.id\}/);
    assert.match(app,/setPreloadedSettingsWorldId\(worldId\);\s*setActiveWorldId\(worldId\)/);
    assert.match(app,/settings\/dashboard\?worldId=\$\{encodeURIComponent\(worldId\)\}/);
    assert.match(app,/lettura impostazioni \$\{Math\.round\(settingsLoadDurationMs\)\} ms/);
    assert.match(app,/sincronizzazione \$\{Math\.round\(activeWorldSyncDurationMs\)\} ms/);
    assert.match(app,/reducedMotion \? 100 : 700/);
    assert.match(worldsCss,/--world-travel-duration,700ms/);
    assert.doesNotMatch(app,/reducedMotion \? 180 : 1900/);
    assert.match(app,/activeWorldSyncedOnServerRef\.current === activeWorld\.id/);
});

test("planet editor keeps the card grid stable and uses contained modal scrolling", () => {
    const screen = fs.readFileSync(path.join(__dirname,"..","..","src","components","ChangeWorld.tsx"),"utf8");
    const css = fs.readFileSync(path.join(__dirname,"..","..","src","worlds.css"),"utf8");
    assert.match(screen,/const WorldGrid = memo\(function WorldGrid/);
    assert.match(screen,/const beginEditWorld = useCallback/);
    assert.match(screen,/const selectPlanet = useCallback[\s\S]*?\}, \[onSelect, switchingWorldId\]\)/);
    assert.match(screen,/<WorldGrid worlds=\{worlds\} activeWorldId=\{activeWorldId\} switchingWorldId=\{switchingWorldId\} onEditWorld=\{beginEditWorld\} onSelectWorld=\{selectPlanet\}\/>/);
    const cardStyles = css.match(/\.worldCard \{([^}]*)\}/)?.[1] || "";
    assert.doesNotMatch(cardStyles,/backdrop-filter/);
    const editorScrollStyles = css.match(/\.worldEditorBody \{([^}]*)\}/)?.[1] || "";
    assert.match(editorScrollStyles,/min-height:0/);
    assert.match(editorScrollStyles,/overscroll-behavior:contain/);
    assert.match(editorScrollStyles,/scrollbar-gutter:stable/);
    assert.match(css,/\.changeWorldPage\.worldEditorOpen[^\n]*animation-play-state:paused/);
    assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
