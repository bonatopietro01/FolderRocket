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
    assert.match(tree, /TreeRocketMark size=\{82\}/);
    assert.match(manager, /aria-label="Open Tree Rocket"/);
    assert.doesNotMatch(manager, /<small>Folder map<\/small>/);
    assert.match(manager, /<TreeRocket folders=\{folders\}/);
    assert.match(tree, /className="treeRocketNodeEnter" onClick=\{onOpen\}/);
    assert.match(tree, /aria-label=\{`Open folder \$\{folder\.name\}`\}/);
    assert.match(tree, /className="treeRocketNodeActions"/);
    assert.match(tree, /<span>Show Files<\/span>/);
    assert.match(tree, /Add to Folder Management/);
    assert.match(tree, /<strong id="treeRocketTitle"><span>Tree<\/span><span>Rocket<\/span><\/strong>/);
    assert.match(tree, /aria-label="Tree Rocket view"/);
    assert.match(tree, />Folder<\/button>/);
    assert.match(tree, />Apps<\/button>/);
    assert.match(tree, /className="treeRocketAppsRefresh"/);
    assert.match(tree, /className="treeRocketAppsMeta" aria-live="polite"/);
    assert.match(tree, /Windows Start menu/);
    assert.match(tree, /\/applications\/catalog/);
    assert.match(tree, /\/applications\/open-installed/);
    assert.match(server, /app\.get\("\/applications\/catalog", requireAuthenticated/);
    assert.match(server, /app\.post\("\/applications\/open-installed", requireAuthenticated/);
    assert.match(server, /Array\.isArray\(result\?\.applications\)/);
    assert.match(tree, /Added to Folder Management/);
    assert.match(tree, /Add folders from this location/);
    assert.doesNotMatch(tree, /<small>FOLDERROCKET<\/small>|Indietro|Radici|Mostra file|Cerca cartelle|Nessuna sottocartella/);
    assert.match(tree, /event\.stopPropagation\(\); onShowFiles\(\)/);
    assert.match(tree, /event\.stopPropagation\(\); onAdd\(\)/);
    assert.match(tree, /onContextMenu=\{event => \{event\.preventDefault\(\); back\(\);\}\}/);
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
    assert.match(tree, /includeFiles, includeFolderFileCounts: true/);
    assert.match(app, /normalizedPath && folders\.some/);
    assert.match(server, /app\.get\("\/filesystem\/tree-roots", requireAuthenticated/);
    assert.match(server, /app\.post\("\/filesystem\/tree-children", requireAuthenticated/);
    assert.match(tree, /\/filesystem\/tree-search/);
    assert.match(tree, /<FileKindIcon name=\{file\.name\} size=\{22\}\/>/);
    assert.match(tree, /onAddFolder\(folder\.path, folder\.name\)/);
    assert.match(tree, /iconDataUrl\?: string/);
    assert.match(tree, /InstalledApplicationIcon application=\{application\}/);
    assert.match(tree, /className="treeRocketAppsScroll"/);
    assert.match(tree, /installedApplicationsCache: InstalledApplication\[\]\ \|\ null/);
    assert.match(tree, /installedApplicationsCache = nextApplications/);
    assert.doesNotMatch(tree, /setApplications\(\[\]\)/);
    assert.match(tree, /The last available catalog is still shown; refresh to retry\./);
    assert.match(tree, /<RefreshCw className=\{appsLoading \? "treeRocketSpinner" : ""\}/);
    assert.match(tree, /className="treeRocketGraphStage"/);
    assert.match(tree, /className="treeRocketBranch"/);
    assert.doesNotMatch(tree, /treeRocketZoom|style=\{\{zoom\}\}|Open Applications workspace|<footer><span>Click a folder/);
    const appsScript = source("backend", "scripts", "open-application.ps1");
    assert.match(appsScript, /function Get-ApplicationIconDataUrl/);
    assert.match(appsScript, /ExtractAssociatedIcon/);
    assert.match(appsScript, /iconDataUrl/);
    assert.match(appsScript, /catch \{\s*return \$null\s*\}/);
    const css = source("src", "App.css");
    assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(min\(230px,100%\),270px\)\)/);
    assert.match(css, /\.treeRocketNode:hover,\.treeRocketNode:focus-within/);
    assert.match(css, /\.treeRocketNodeEnter \{ position:absolute; z-index:0; inset:0;/);
    assert.match(css, /\.treeRocketNodeActions \{ position:relative; z-index:2;/);
    assert.match(tree, /document\.addEventListener\("pointerdown", dismissOutside, true\)/);
    assert.match(tree, /includeFolderFileCounts: true/);
    assert.match(server, /includeFolderFileCounts: req\.body\?\.includeFolderFileCounts === true/);
    assert.doesNotMatch(tree, /window\.setTimeout\(onClose/);
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
    assert.match(server, /if \(current\.enabled !== true\) return res\.status\(409\)\.json\(\{message:"Activity notifications are disabled for this planet\."\}\)/);
    assert.match(server, /nextDigestAt:require\("\.\/services\/worldActivityEmailService"\)\.nextDigestAt/);
});

test("Tree Rocket uses app icons, shared zoom, a fixed root branch and no bottom action bar", () => {
    const tree = source("src", "components", "TreeRocket.tsx");
    const css = source("src", "App.css");
    const script = source("backend", "scripts", "open-application.ps1");
    assert.match(tree, /iconDataUrl\?: string/);
    assert.match(tree, /InstalledApplicationIcon application=\{application\}/);
    assert.match(tree, /className="treeRocketAppsScroll"/);
    assert.match(tree, /className="treeRocketGraphStage"/);
    assert.match(tree, /className="treeRocketBranch"/);
    assert.doesNotMatch(tree, /treeRocketZoom|style=\{\{zoom\}\}|Open Applications workspace|<footer><span>Click a folder/);
    assert.match(script, /function Get-ApplicationIconDataUrl/);
    assert.match(script, /ExtractAssociatedIcon/);
    assert.match(script, /iconDataUrl/);
    assert.match(script, /catch \{\s*return \$null\s*\}/);
    const refined = css.slice(css.lastIndexOf("/* Tree Rocket shares the workspace zoom"));
    assert.match(refined, /\.treeRocketBrandTitle \.treeRocketMark \{ width:104px; height:104px;/);
    assert.match(refined, /\.treeRocketBrandTitle \{ display:flex; min-width:0; align-items:center; gap:12px; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none;/);
    assert.match(refined, /\.treeRocketBrand \{ display:flex; width:auto; min-width:0; flex-direction:row; align-items:center; justify-self:center; justify-content:center;/);
    assert.match(refined, /\.treeRocketBrandTitle > strong span:last-child \{ color:#087ed8;/);
    assert.match(refined, /\.treeRocketTabs \.treeRocketAppsRefresh \{ display:grid; width:34px; min-height:34px;/);
    assert.match(refined, /\.treeRocketHeaderTools \{ display:flex/);
    assert.match(refined, /\.treeRocketGraphStage \{ display:flex;[^}]*flex-direction:column; align-items:center/);
    assert.match(refined, /\.treeRocketChildren \{[^}]*overflow:auto/);
    assert.match(refined, /\.treeRocketChildrenHeading > i \{ display:grid; width:25px; height:25px;[^}]*place-items:center/);
    assert.match(refined, /\.treeRocketAppIcon img \{ display:block; width:40px; height:40px;/);
    assert.match(refined, /\.treeRocketAppsPanel \{[^}]*height:100%/);
    assert.match(refined, /\.treeRocketAppsPanel > \.treeRocketAppsScroll \{[^}]*background:transparent[^}]*overflow:auto[^}]*scrollbar-width:none/);
    assert.match(refined, /\.treeRocketAppsPanel > \.treeRocketAppsScroll > \.treeRocketAppGrid \{ justify-items:stretch; \}/);
    assert.match(refined, /\.treeRocketAppsScroll::-webkit-scrollbar \{ display:none/);
    assert.doesNotMatch(refined, /treeRocketWindow.?footer|treeRocketZoom|treeRocketAppsWorkspaceLink/);
});

test("dashboard folder layouts use compact rows and conditional scroll-edge fades", () => {
    const app = source("src", "App.tsx");
    const frame = source("src", "components", "FolderScrollFrame.tsx");
    const groups = source("src", "folderProjects.ts");
    const css = source("src", "App.css");
    assert.match(app, /<FolderScrollFrame layout=\{dashboardLayout\} itemCount=\{dashboardBrowser \? 0 : folders\.length\}>/);
    assert.match(app, /dashboardLayout === "folders-top" \? folderDescriptionGroups\(folders\) : folderProjectGroups\(folders\)/);
    assert.match(groups, /description\.trim\(\)\.toLocaleLowerCase\(\)/);
    assert.doesNotMatch(frame, /addEventListener\("wheel"|deltaY/);
    assert.match(frame, /maxScroll - scrollPosition > 2/);
    assert.match(frame, /folderFadeBefore/);
    assert.match(frame, /folderFadeAfter/);
    assert.match(css, /\.dashboardFoldersTop \.foldersContainer \{ display:flex; width:max-content; min-width:100%; height:100%;/);
    assert.match(css, /\.dashboardFoldersTop \.foldersContainer \{[^}]*flex-direction:row;/);
    assert.match(css, /\.dashboardFoldersTop \.foldersContainer > \.dashboardProjectGroup \{ position:relative; display:flex;/);
    assert.match(css, /\.dashboardFoldersTop \.dashboardProjectGroup \.folderOrderItem/);
    assert.match(css, /\.dashboardFoldersTop \.dashboardTopProjectTag \{ position:absolute; top:50%;/);
    assert.match(css, /\.dashboardFoldersTop \.dashboardTopProjectTag \{ display:none!important; \}/);
    assert.match(css, /overflow-x:auto; overflow-y:hidden; overscroll-behavior-x:contain/);
    assert.match(css, /\.foldersColumn\.folderFadeAfter::after/);
});

test("File Studio queue labels and cards adapt without changing their queues", () => {
    const workspace = source("src", "components", "ProcessingWorkspace.tsx");
    const changeFormat = source("src", "components", "ChangeFormatPanel.tsx");
    const css = source("src", "App.css");
    assert.match(workspace, /queue\.length > 0 && <div className="studioQueueHeading"><span>Files to convert<\/span>/);
    assert.doesNotMatch(workspace, /The original file remains unchanged|conversionEmptyState/);
    assert.doesNotMatch(changeFormat, /Files receiving the format/);
    assert.doesNotMatch(changeFormat, /Fonts, spacing and structure come from this file|Add one source file and at least one target file/);
    assert.match(changeFormat, /files\.map\(file =>/);
    assert.match(css, /@media \(max-width:1050px\) \{[\s\S]*\.processingPage \{ height:auto;/);
    assert.match(css, /@media \(max-width:720px\) \{[\s\S]*\.processingPage \{ display:flex;/);
    assert.match(css, /\.processingPage \.conversionToolCard > h2 \{ margin-left:0; margin-right:0; border-radius:8px; \}/);
    assert.match(css, /\.processingPage \.changeFormatPanel \.formatQueueRow \{ grid-template-columns:minmax\(34px,auto\) minmax\(0,1fr\) auto 21px;/);
    assert.match(workspace, /folderColourMap\(folders\)/);
    assert.match(workspace, /folderColours\.get\(folder\.id\)/);
});

test("Folder Management reorder and add controls use a compact toolbar above the list", () => {
    const manager = source("src", "components", "FolderManagement.tsx");
    const css = source("src", "App.css");
    assert.match(manager, /className="folderTableToolbar" role="toolbar"/);
    assert.match(manager, /orderingFolders \? "Finish ordering folders" : "Reorder folders"/);
    assert.match(manager, /title="Add folder"/);
    assert.match(manager, /<div className="folderTable" role="table">/);
    assert.match(css, /\.folderTable \{ min-width:0!important; overflow-x:hidden!important;/);
    assert.match(css, /\.folderTableRow,\.folderTableRow\.orderingFolder,\.folderTableRow\.orderingHead \{ width:100%; min-width:0!important;/);
    assert.match(css, /\.folderTableHead \{ color:#52667d; font-size:15px; font-weight:800; text-transform:uppercase; \}/);
    assert.match(css, /\.folderTableRow input \{ font-size:14px; font-weight:700; \}/);
    assert.match(css, /\.folderTableToolbar > strong \{ margin-right:auto; color:#344e63; font-size:15px; font-weight:900/);
    assert.match(css, /\.recentSourceCard \.usbFileList::-webkit-scrollbar \{ width:2px; height:2px; \}/);
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

test("Cargo Rocket email choices are loaded only from the active planet's dashboard", () => {
    const cargo = source("src", "components", "CargoShip.tsx");
    const server = source("backend", "server.js");
    assert.match(cargo, /email-sources\?worldId=\$\{encodeURIComponent\(worldId\)\}/);
    assert.match(cargo, /No email account is selected for this planet[\s\S]*Gmail block on the Dashboard/);
    assert.match(server, /const worldId = readWorkspaceWorldId\(req\)/);
    assert.match(server, /allPreferences\.worlds\?\.\[worldId\]\?\.dashboard/);
    assert.match(server, /if \(block\.accountBlockId === null\) continue/);
    assert.match(server, /const account = \(provider === "gmail" \? gmailAccounts : outlookAccounts\)\.find\(item => item\.blockId === blockId\)/);
    assert.match(server, /seenAccounts\.has\(accountKey\)/);
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
    assert.match(outlook, /const scopes = \[OUTLOOK_SCOPES, \.\.\.\(options\.includeTeams \? \[TEAMS_SCOPES\] : \[\]\), \.\.\.\(options\.includeSend \? \[OUTLOOK_SEND_SCOPE\] : \[\]\)\]\.join\(" "\)/);
    assert.match(teams, /Read-only/);
});

test("AI alerts accept open-ended planet topics and keep the existing small model", () => {
    const builder = source("src", "components", "EmailAlertBuilder.tsx");
    const alerts = source("backend", "services", "gmailWarningService.js");
    assert.match(builder, /Topics or instructions to watch/);
    assert.match(builder, /AI alert topics and instructions/);
    assert.match(alerts, /model: "gpt-4\.1-mini"/);
});

