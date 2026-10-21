import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Applications and Tree Rocket use bounded responsive workspace controls",()=>{
    const css=read("../src/App.css");
    const tree=read("../src/components/TreeRocket.tsx");
    assert.match(css,/\.app:has\(\.applicationsView\)[^{]*\{[^}]*height:100dvh[^}]*overflow:hidden/);
    assert.match(css,/\.applicationsWorkspace \.applicationsGrid[^{]*\{[^}]*overflow:auto/);
    assert.match(tree,/className="treeRocketBrowseSelect"[\s\S]*aria-label="Browse location"[\s\S]*value=\{treeRootMode\}/);
    assert.match(css,/\.treeRocketBrowseSelect select[^{]*\{[^}]*height:28px/);
    assert.match(css,/\.treeRocketToolbar \.treeRocketTabs,.treeRocketToolbar \.treeRocketSearch[^{]*\{[^}]*height:30px/);
});

test("dashboard Sources omit their headings, place add controls after blocks, and center short folder rows",()=>{
    const column=read("../src/components/DashboardSourceColumn.tsx");
    const css=read("../src/App.css");
    assert.match(column,/className="sourcesBlockList"[\s\S]*className="sourcesAddFooter"/);
    assert.doesNotMatch(column,/<div className="sourcesColumnHeader"><strong>\{title\}<\/strong><\/div>/);
    assert.match(column,/aria-label=\{`\$\{className === "sourcesColumn" \? "Left" : "Right"\} \$\{title\.toLowerCase\(\)\} dashboard column`\}/);
    assert.match(column,/aria-label=\{`Add \$\{title\.toLowerCase\(\)\} block`\}/);
    assert.match(css,/\.dashboardFoldersTop \.foldersContainer \{[^}]*justify-content:center/);
});

test("folder scroll edge indicators follow the active layout axis",()=>{
    const frame=read("../src/components/FolderScrollFrame.tsx");
    assert.match(frame,/layout === "folders-top"[\s\S]*viewport\.scrollLeft[\s\S]*viewport\.scrollTop/);
    assert.match(frame,/viewport\.scrollWidth - viewport\.clientWidth[\s\S]*viewport\.scrollHeight - viewport\.clientHeight/);
});

test("dashboard add-block picker escapes clipped source scrollers and remains keyboard-dismissible",()=>{
    const column=read("../src/components/DashboardSourceColumn.tsx");
    const css=read("../src/App.css");
    assert.match(column,/createPortal\([\s\S]*document\.body/);
    assert.match(column,/window\.addEventListener\("scroll", place, true\)/);
    assert.match(column,/event\.key === "Escape"/);
    assert.match(column,/ArrowDown|ArrowUp/);
    assert.match(column,/menuRef\.current\?\.contains/);
    assert.match(css,/\.sourcePicker\.sourcePickerPortal \{ position:fixed/);
    assert.match(column,/sourcePickerIcon/);
});

test("planet sections retain mounted unsaved controls when disclosures collapse",()=>{
    const editor=read("../src/components/ChangeWorld.tsx");
    for(const label of ["Aspetto e grafo","Email account for this planet","Obsidian vault","Agenti del pianeta","Skill del pianeta","Alert and email summaries","Permessi futuri"]){
        assert.ok(editor.includes(`<summary>${label}`),`missing disclosure ${label}`);
    }
    assert.match(editor,/<details className="worldSettingsDisclosure"[\s\S]*<div className="worldSettingsDisclosureBody">[\s\S]*setEditingWorld\(\{\.\.\.editingWorld/);
    assert.match(editor,/className="worldSaveButton"[\s\S]*Salva/);
    assert.match(editor,/className="worldCancelButton"[\s\S]*Annulla/);
});

test("Planet Graph keeps one local knowledge consultation with evidence and compact indexing details",()=>{
    const graph=read("../src/components/PlanetGraph.tsx");
    const css=read("../src/App.css");
    assert.match(graph,/<section className="planetKnowledgeQuery" aria-label="Ask this planet's knowledge">/);
    assert.match(graph,/async function askKnowledge\([\s\S]*?\$\{knowledgeUrl\}\/query/);
    assert.match(graph,/knowledgeQuery\.citations\?\.length[\s\S]*Compact context package/);
    assert.doesNotMatch(graph,/aria-label="Filter graph by (?:source|topic|type|depth)"/);
    assert.match(graph,/aria-label="Show graph indexing details" onClick=\{\(\)=>setNoticesOpen\(open=>!open\)\}/);
    assert.match(graph,/aria-expanded=\{noticesOpen\}[\s\S]*noticesOpen&&<section id="planetGraphNoticePanel"/);
    assert.doesNotMatch(graph,/planetGraphChat|Authorized sources|Retained knowledge|Displayed nodes/);
    assert.match(css,/\.planetGraphSplitLayout \{ grid-template-columns:minmax\(260px,\.78fr\) minmax\(0,1\.6fr\)/);
});

test("Gmail Add chat has server search/paging and thread details request small pages",()=>{
    const conversations=read("../src/components/EmailConversations.tsx");
    const server=read("../backend/server.js");
    const gmail=read("../backend/services/gmailService.js");
    assert.match(conversations,/Showing up to 20 received inbox messages per page/);
    assert.match(conversations,/No additional received conversations from this sender in the last 30 days\./);
    assert.match(conversations,/Load more conversations/);
    assert.match(conversations,/searchChatOptions/);
    assert.match(conversations,/selectConversation\(\{id:option\.threadId,threadId:option\.threadId/);
    assert.match(conversations,/limit:"10"/);
    assert.match(conversations,/Load earlier messages/);
    assert.match(server,/chatInboxPageOptions\(req\.query\.pageToken,req\.query\.query\)/);
    assert.match(server,/getGmailThreadPage\(threadId,req\.user\.id,source\.blockId/);
    assert.match(gmail,/format=metadata&metadataHeaders/);
    assert.match(gmail,/messages\/\$\{encodeURIComponent\(reference\.id\)\}\?format=full/);
    assert.match(gmail,/async function getThreadPage[\s\S]*?references\.slice\(start,end\)/);
});

test("Conversations uses the available application height and the shared readable navigation style",()=>{
    const css=read("../src/App.css");
    assert.match(css,/\.app:has\(\.emailConversationsPage\)[^{]*\{[^}]*height:100dvh[^}]*overflow:hidden/);
    assert.match(css,/\.app:has\(\.emailConversationsPage\) > \.pageFrame[^{]*\{[^}]*flex:1 1 0[^}]*overflow:hidden/);
    assert.match(css,/\.emailConversationsPage\s*\{[^}]*height:100%[^}]*min-height:0/);
    const sharedNavigation = css.slice(css.lastIndexOf("/* Shared destinations now sit between the header and page columns. */"));
    assert.match(sharedNavigation,/\.pageNavigation \.pageMenuItems \{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
    assert.match(sharedNavigation,/\.pageNavigation \.pageMenuItems > button \{[^}]*grid-row:1/);
});

test("selecting another email conversation clears and gates prior thread details",()=>{
    const conversations=read("../src/components/EmailConversations.tsx");
    assert.match(conversations,/function selectConversation\(thread:ThreadSummary\)[\s\S]*threadGeneration\.current\+\+;setSelected\(thread\);setDetail\(null\);setDetailSelectionKey\(""\)/);
    assert.match(conversations,/if\(token===threadGeneration\.current&&selectedKeyRef\.current===requestedKey\)/);
    assert.match(conversations,/const visibleDetail=detailSelectionKey===currentSelectionKey\?detail:null/);
    assert.match(conversations,/visibleDetail\?\.messages\.length/);
    assert.match(conversations,/selectedKeyRef\.current=key/);
});

test("Tree Rocket Desktop roots exclude linked Folder Management folders",()=>{
    const tree=read("../src/components/TreeRocket.tsx");
    assert.match(tree,/treeRootMode === "desktop" \? hostRoots\.filter\(folder => folder\.kind === "desktop"\) : \[\.\.\.linkedRoots, \.\.\.hostRoots\]/);
    assert.match(tree,/\[hostRoots, linkedRoots, treeRootMode\]/);
    assert.match(tree,/mode=\$\{treeRootMode\}/);
    assert.match(tree,/return "My Desktop"/);
    assert.match(tree,/return "Public Desktop · shared"/);
    assert.match(tree,/treeRootMode === "desktop" \? "Desktop roots" : "Computer"/);
    assert.match(tree,/displayName=\{treeRootMode==="desktop"\?desktopRootLabel\(folder\):folder\.name\}/);
    assert.match(tree,/Load next page of folders/);
    assert.match(tree,/Load the next page of direct folders\./);
});

test("mobile Planet Graph is viewport-bounded with internal pane scrolling",()=>{
    const css=read("../src/App.css");
    const layoutRule=css.indexOf(".planetGraphSplitLayout { grid-template-columns:minmax(0,1fr);");
    assert.notEqual(layoutRule,-1,"missing narrow Planet Graph layout rule");
    const mediaStart=css.lastIndexOf("@media(max-width:900px)",layoutRule);
    assert.notEqual(mediaStart,-1,"Planet Graph narrow layout must be inside its responsive breakpoint");
    const nextMedia=css.indexOf("@media(",layoutRule);
    const media=css.slice(mediaStart,nextMedia===-1?css.length:nextMedia);
    assert.match(media,/\.planetGraphSplitLayout \{ grid-template-columns:minmax\(0,1fr\); grid-template-rows:minmax\(150px,\.52fr\) minmax\(0,1fr\) auto;/);
    assert.match(media,/\.planetGraphSplitLayout > \.planetKnowledgeQuery \{ grid-column:1; grid-row:1;/);
    assert.match(media,/\.planetGraphWorkspace \{ grid-column:1; grid-row:2;/);
    assert.match(media,/\.planetGraphConnections \{ grid-column:1; grid-row:3; max-height:clamp\(65px,16vh,135px\);/);
    assert.doesNotMatch(media,/overflow:auto;\s*\}\s*\.planetGraphSplitLayout \{[^}]*min-height:700px/);
});

test("conversation badge distinguishes unsupported and failed checks from a valid zero count",()=>{
    const app=read("../src/App.tsx");
    assert.match(app,/conversationNotification,setConversationNotification\]=useState</);
    assert.match(app,/const notificationScope=`\$\{world\.id\}:\$\{world\.emailAccount\?\.provider\|\|"none"\}:\$\{world\.emailAccount\?\.blockId\|\|"none"\}`/);
    assert.match(app,/\[page,notificationScope,world\.emailAccount\?\.provider,world\.emailAccount\?\.blockId,world\.id\]/);
    assert.match(app,/response\.status===501\|\|data\.code==="provider_unsupported"\|\|data\.supported===false/);
    assert.match(app,/if\(!response\.ok\)\{const message=.*setConversationNotification\(\{scope:notificationScope,kind:"error",count:null,message\}\)/);
    assert.match(app,/data\.supported!==true\|\|!Number\.isFinite\(count\)/);
    assert.match(app,/data\.configured!==true\|\|!expectedAccountId\|\|data\.accountId!==expectedAccountId/);
    assert.match(app,/conversationNotificationStatus\.message/);
    assert.match(app,/conversationUnreadCount!==null&&conversationUnreadCount>0/);
});

test("opening Conversations does not acknowledge the inbox; only the opened local thread is acknowledged",()=>{
    const conversations=read("../src/components/EmailConversations.tsx");
    const app=read("../src/App.tsx");
    const listLoader=conversations.slice(conversations.indexOf("const loadThreads="),conversations.indexOf("useEffect(()=>{const timer=window.setTimeout(()=>void loadThreads()"));
    assert.doesNotMatch(listLoader,/notifications\/acknowledge/);
    assert.match(conversations,/acknowledgeLoadedThread=useCallback\(async\(threadId:string,blockId:string,shared:boolean,selectionKey:string\)/);
    assert.match(conversations,/if\(shared\|\|!accountBlockId\|\|blockId!==accountBlockId\|\|selectedKeyRef\.current!==selectionKey\)return/);
    assert.match(conversations,/JSON\.stringify\(\{threadIds:\[threadId\]\}\)/);
    assert.match(conversations,/folderrocket-refresh-conversation-notifications/);
    assert.match(app,/folderrocket-refresh-conversation-notifications/);
    assert.doesNotMatch(app,/if\(next==="email"\)setConversationNotification/);
});
