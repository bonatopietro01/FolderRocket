const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
function source(...parts) { return fs.readFileSync(path.join(root, ...parts), "utf8"); }

test("dashboard layout is stored with the active planet settings and available in Workspace Control", () => {
    const app = source("src", "App.tsx");
    const account = source("src", "components", "AuthGate.tsx");
    assert.match(app, /dashboardLayout\?: "three-column" \| "folders-top"/);
    assert.match(app, /dashboardLayout, searchFolderIds/);
    assert.match(app, /\$\{DASHBOARD_LAYOUT_KEY\}-\$\{workspaceScope\}/);
    assert.match(app, /activeWorldStorageScope\(user\.id, worldId\)/);
    assert.match(account, /Workspace controls/);
    assert.match(account, /Three columns/);
    assert.match(account, /Folders on top/);
    assert.match(account, /className=\{aiMode \? "accountAiMode enabled" : "accountAiMode"\}[^>]*>[\s\S]*Bonato Pietro Services[\s\S]*AI integrate FolderRocket/);
    assert.match(source("src", "App.css"), /\.dashboard\.dashboardFoldersTop[^{]*\{[^}]*grid-template-areas:"folders folders" "sourcesLeft sourcesRight"/);
});

test("Tree Rocket is mounted from Folder Management and navigates without reading file contents", () => {
    const app = source("src", "App.tsx");
    const manager = source("src", "components", "FolderManagement.tsx");
    const tree = source("src", "components", "TreeRocket.tsx");
    const server = source("backend", "server.js");
    assert.match(tree, /createPortal\(<section className="treeRocketOverlay"/);
    assert.match(tree, /appRoot\.inert = true/);
    assert.match(tree, /TreeRocketMark size=\{62\}/);
    assert.match(manager, /aria-label="Open Tree Rocket"/);
    assert.doesNotMatch(manager, /<small>Folder map<\/small>/);
    assert.match(manager, /<TreeRocket folders=\{folders\}/);
    assert.match(tree, /className="treeRocketNodeEnter" onClick=\{onOpen\}/);
    assert.match(tree, /className="treeRocketNodeActions"/);
    assert.match(tree, /event\.stopPropagation\(\); onShowFiles\(\)/);
    assert.match(tree, /event\.stopPropagation\(\); onAdd\(\)/);
    assert.match(tree, /onContextMenu=\{event => \{const target = event\.target as HTMLElement; if \(target\.closest\("\[data-graph-node\],button,input"\)\) return; event\.preventDefault\(\); back\(\);\}\}/);
    assert.match(tree, /cameraByPath = useRef\(new Map<string, TreeCamera>\(\)\)/);
    assert.match(tree, /function rememberCamera\(path = currentPath\)/);
    assert.match(tree, /function restoreCamera\(path: string\)/);
    assert.match(tree, /scrollProgress: maxScroll \? \(graph\?\.scrollTop \?\? 0\) \/ maxScroll : 0/);
    assert.match(tree, /graph\.scrollTop = \(graph\.scrollHeight - graph\.clientHeight\) \* \(camera\?\.scrollProgress \?\? 0\)/);
    assert.match(tree, /function handleKeyDown\(event: KeyboardEvent\)/);
    assert.match(tree, /window\.addEventListener\("keydown", handleKeyDown, true\)/);
    assert.match(tree, /event\.key === "Escape" \|\| \(event\.altKey && event\.key === "ArrowLeft"\)/);
    assert.match(tree, /event\.key === "Backspace" && !editing/);
    assert.match(tree, /event\.stopPropagation\(\)/);
    assert.match(tree, /includeFiles\}/);
    assert.match(app, /normalizedPath && folders\.some/);
    assert.match(server, /app\.get\("\/filesystem\/tree-roots", requireAuthenticated/);
    assert.match(server, /app\.post\("\/filesystem\/tree-children", requireAuthenticated/);
    assert.match(tree, /\/filesystem\/tree-search/);
    assert.match(tree, /<FileKindIcon name=\{file\.name\} size=\{22\}\/>/);
    assert.match(tree, /onAddFolder\(folder\.path, folder\.name\)/);
    const css = source("src", "App.css");
    assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(min\(230px,100%\),270px\)\)/);
    assert.match(css, /\.treeRocketNode:hover,\.treeRocketNode:focus-within/);
    assert.match(css, /\.treeRocketGraph \{ overflow-x:hidden; overflow-y:auto/);
    assert.match(css, /\.treeRocketOverlay::before \{ background-image:radial-gradient/);
    assert.match(css.slice(css.lastIndexOf("/* Tree Rocket is a separate, space-themed workspace.")), /\.treeRocketGraph \{[^}]*background-image:none/);
    assert.match(css.slice(css.lastIndexOf("/* Tree Rocket is a separate, space-themed workspace.")), /\.treeRocketChildren \{[^}]*display:grid[^}]*grid-template-columns:repeat\(auto-fit/);
    assert.match(css.slice(css.lastIndexOf("/* Tree Rocket is a separate, space-themed workspace.")), /@media \(prefers-reduced-motion:reduce\) \{\s*\.treeRocketNode \{ transition:none; \}\s*\.treeRocketNode:hover,\.treeRocketNode:focus-within \{ transform:none; \}\s*\}/);
    assert.doesNotMatch(css.slice(css.lastIndexOf("/* Tree Rocket uses the same full-screen")), /background-size:24px 24px/);
    assert.match(app, /type === "teams"/);
    assert.match(source("src", "components", "DashboardSourceBlock.tsx"), /"teams"/);
    assert.match(server, /fs\.promises\.realpath\(userWorkspace\(req\.user\)\)/);
    assert.match(server, /if \(!isPathWithin\(workspaceRealPath, directoryRealPath\)\)/);
});

test("dashboard folder layouts use compact rows and conditional scroll-edge fades", () => {
    const app = source("src", "App.tsx");
    const frame = source("src", "components", "FolderScrollFrame.tsx");
    const css = source("src", "App.css");
    assert.match(app, /<FolderScrollFrame layout=\{dashboardLayout\} itemCount=\{dashboardBrowser \? 0 : folders\.length\}>/);
    assert.match(frame, /return itemCount > visibleColumns \? 2 : 1/);
    assert.match(frame, /maxScroll - scrollPosition > 2/);
    assert.match(frame, /folderFadeBefore/);
    assert.match(frame, /folderFadeAfter/);
    assert.match(css, /grid-template-rows:repeat\(var\(--folder-rows,1\),max-content\)/);
    assert.match(css, /\.dashboardFoldersTop \.dashboardProjectGroup \.folderOrderItem/);
    assert.match(css, /\.foldersColumn\.folderFadeAfter::after/);
});

test("Application filters can be composed and reset, and account integration descriptions remain under their titles", () => {
    const applications = source("src", "components", "ApplicationsWorkspace.tsx");
    const integrationCss = source("src", "App.css");
    assert.match(applications, /aria-label=\{`\$\{app\.name\} initial letter`\}/);
    assert.match(applications, /linked-folder filter/);
    assert.match(applications, /Network share/);
    assert.match(applications, /Synced \(metadata\)/);
    assert.match(applications, /setAppEntryKinds\(current => \(\{\.\.\.current, \[app\.id\]: "files"\}\)\)/);
    assert.match(applications, /className="applicationFilterResults" aria-live="polite"/);
    assert.match(integrationCss, /\.integrationCard > div > small \{ grid-column:2; grid-row:2/);
});

test("Cargo Rocket switches back to the yellow Simple Post-it action without a connected-mailbox label", () => {
    const cargo = source("src", "components", "CargoShip.tsx");
    const css = source("src", "App.css");
    assert.match(cargo, /className=\{postItMode === "ai" \? "active aiMode postItSimpleMode"/);
    assert.match(cargo, /className=\{postItMode === "reminder" \? "active reminderMode postItSimpleMode"/);
    assert.match(cargo, /Choose mailbox/);
    assert.doesNotMatch(cargo, /Choose connected mailbox|No connected mailbox/);
    assert.match(css, /cargoPostItExtraActions button\.postItSimpleMode[^\{]*\{ border-color:#d8b534; background:linear-gradient/);
});

test("Gmail Read attachments menu is allowed to escape the source block clipping", () => {
    const gmail = source("src", "components", "GmailSourcePanel.tsx");
    const css = source("src", "App.css");
    assert.match(gmail, /emailReaderHeaderButton[\s\S]*aria-expanded=\{showSettings\}[\s\S]*createPortal\([\s\S]*role="dialog"/);
    assert.match(gmail, /aria-controls=\{readerMenuId\}/);
    assert.match(gmail, /readerMenuPositionForAnchor\(readerMenuButtonRef\.current\)/);
    assert.match(gmail, /!target\.closest\("\.emailReaderHeaderControl"\) && !insideReader/);
    assert.match(css, /\.emailReaderHeaderMenu \{ position:fixed!important; z-index:16000!important; width:min\(292px,calc\(100vw - 20px\)\)/);
});

test("Daily Job creates recap drafts manually from accounts connected to the active planet", () => {
    const daily = source("src", "components", "DailyJob.tsx");
    const app = source("src", "App.tsx");
    const server = source("backend", "server.js");
    assert.match(app, /<DailyJob storageScope=\{workspaceScope\} worldId=\{world\.id\}/);
    assert.match(daily, /\/cargo-ship\/email-sources\?worldId=/);
    assert.match(daily, /\/cargo-ship\/email-draft/);
    assert.match(daily, /Create recap draft/);
    assert.match(daily, /Include tomorrow’s events and reminders/);
    assert.match(daily, /No email is sent automatically|Nessuna email viene inviata automaticamente/);
    assert.match(server, /rightSourceBlocks/);
    assert.match(server, /if \(block\.accountBlockId === null\) continue/);
    assert.doesNotMatch(daily, /setInterval\(|schedule.*enabled/i);
});

test("Teams source offers selectable chats, channels, mentions and shared-file filters through read-only Graph routes", () => {
    const teams = source("src", "components", "TeamsSourcePanel.tsx");
    const outlook = source("backend", "services", "outlookService.js");
    const server = source("backend", "server.js");
    assert.match(teams, /Chats · 1:1 and groups/);
    assert.match(teams, /Teams channels/);
    assert.match(teams, /Mentions/);
    assert.match(teams, /Shared files/);
    assert.match(teams, /Load older messages/);
    assert.match(teams, /Load more replies/);
    assert.match(teams, /Load more chats/);
    assert.match(teams, /Load more channels/);
    assert.match(server, /app\.get\("\/teams\/messages", requireAuthenticated/);
    assert.match(outlook, /\$expand=replies/);
    assert.match(outlook, /https:\/\/graph\.microsoft\.com\/Chat\.Read/);
    assert.match(outlook, /https:\/\/graph\.microsoft\.com\/ChannelMessage\.Read\.All/);
    assert.match(teams, /&teams=1&format=json/);
    assert.match(outlook, /const scopes = options\.includeTeams \? `\$\{OUTLOOK_SCOPES\} \$\{TEAMS_SCOPES\}` : OUTLOOK_SCOPES/);
    assert.match(teams, /Read-only/);
});

test("AI alerts accept open-ended planet topics and keep the existing small model", () => {
    const builder = source("src", "components", "EmailAlertBuilder.tsx");
    const alerts = source("backend", "services", "gmailWarningService.js");
    assert.match(builder, /Topics or instructions to watch/);
    assert.match(builder, /AI alert topics and instructions/);
    assert.match(alerts, /model: "gpt-4\.1-mini"/);
});

