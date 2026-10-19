import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");

test("planet graph snapshot sync obeys the active planet source selection",()=>{
    const effect=app.slice(app.indexOf("const snapshotsEnabled = world.obsidian?.sourceSelection?.snapshots"),app.indexOf("const previousUsbIds = useRef"));
    assert.match(effect,/if \(!world\.graphEnabled\) return/);
    assert.match(effect,/if\(!snapshotsEnabled\|\|!active\|\|controller\.signal\.aborted\)return/);
    assert.match(effect,/\[world\.graphEnabled,world\.obsidian\?\.sourceSelection\?\.snapshots,world\.id,workspaceScope\]/);
    assert.match(effect,/if\(snapshotsEnabled\)\{/);
    assert.match(effect,/graph\/snapshot[\s\S]*signal:controller\.signal/);
    assert.match(effect,/\.then\(response=>\{if\(!response\.ok\)return;\}\)/);
    assert.match(effect,/controller\.abort\(\)/);
    assert.match(effect,/window\.addEventListener\("folderrocket:daily-activity",uploadActivity\)/);
    assert.ok(effect.indexOf("if(snapshotsEnabled){")<effect.indexOf("window.addEventListener(\"folderrocket:sticky-notes-updated\""));
});

test("failed conversation list, thread, and Add chat loads expose explicit bounded retries",()=>{
    const conversations=readFileSync(new URL("../src/components/EmailConversations.tsx",import.meta.url),"utf8");
    assert.match(conversations,/retryLoad,setRetryLoad\]=useState<"list"\|"thread"\|null>/);
    assert.match(conversations,/setRetryLoad\("list"\)/);
    assert.match(conversations,/setRetryLoad\("thread"\)/);
    assert.match(conversations,/retryLoad==="list"\?loadThreads\(\):loadThread\(\)/);
    assert.match(conversations,/onClick=\{\(\)=>void loadChatOptions\("",false,chatAppliedQuery\)\}[^>]*>Retry/);
    assert.match(conversations,/limit:"10"/);
    assert.match(conversations,/Showing up to 20 received inbox messages per page/);
});

test("Tree Rocket keeps an opened root above its internally scrollable subfolder branch",()=>{
    const css=readFileSync(new URL("../src/App.css",import.meta.url),"utf8");
    assert.match(css,/\.treeRocketGraphStage \{[^}]*flex-direction:column;[^}]*justify-content:flex-start;/);
    assert.match(css,/\.treeRocketChildren \{[^}]*overflow:auto/);
});
