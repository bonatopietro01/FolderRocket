const assert=require("node:assert/strict");
const test=require("node:test");
const {matchesSavedConversationScope,normalizedSenderIdentity,conversationContactIdentity,mergeSavedChatSelectorThreads,findInboxThreadById,chatInboxPageOptions}=require("../services/emailConversationSelectionService");

test("saved chat scope includes its provider thread and new messages from the same normalized sender only",()=>{
    const saved=[{blockId:"gmail-a",threadId:"thread-1",sender:"Alice Smith <ALICE@example.test>"}];
    assert.equal(normalizedSenderIdentity("alice@example.test"),"alice@example.test");
    assert.equal(matchesSavedConversationScope({id:"thread-1",messages:[]},"gmail-a",saved),true);
    assert.equal(matchesSavedConversationScope({id:"thread-2",messages:[{sender:"ALICE@example.test"}]},"gmail-a",saved),true);
    assert.equal(matchesSavedConversationScope({id:"thread-3",messages:[{sender:"Bob <bob@example.test>"}]},"gmail-a",saved),false);
    assert.equal(matchesSavedConversationScope({id:"thread-1",messages:[]},"gmail-b",saved),false);
});

test("an empty or legacy-unconfigured selection never opts the conversation list into the full inbox",()=>{
    const inbox=[{id:"thread-1",messages:[{sender:"alice@example.test"}]}];
    const explicitlySelected=inbox.filter(thread=>matchesSavedConversationScope(thread,"gmail-a",[]));
    assert.deepEqual(explicitlySelected,[]);
});

test("chat selector pages retain selected older threads as removable selected rows",()=>{
    const saved=[{blockId:"gmail-a",threadId:"older-thread",subject:"Older topic",sender:"alice@example.test",selectedAt:"2026-10-02T10:00:00.000Z"}];
    const page=[{id:"new-thread",subject:"New topic",messages:[{sender:"bob@example.test"}]}];
    const rows=mergeSavedChatSelectorThreads(page,saved,"gmail-a");
    assert.deepEqual(rows.map(item=>({id:item.id,selected:item.selected})),[{id:"new-thread",selected:false},{id:"older-thread",selected:true}]);
    assert.equal(rows[1].subject,"Older topic");
    assert.equal(mergeSavedChatSelectorThreads(page,saved,"gmail-b").length,1,"saved references from another account are not injected");
});

test("a conversation loaded from a later inbox page is accepted when selection validates that page",()=>{
    const pageToken="provider-next-page-token";
    assert.deepEqual(chatInboxPageOptions(pageToken),{maxResults:20,pageToken,query:""});
    assert.deepEqual(chatInboxPageOptions(pageToken,"from:person@example.test"),{maxResults:20,pageToken,query:"from:person@example.test"});
    const pageOne=[{id:"page-one-thread"}];
    const pageTwo=[{id:"page-two-thread",subject:"Paged selection"}];
    assert.equal(findInboxThreadById(pageOne,"page-two-thread"),null);
    assert.deepEqual(findInboxThreadById(pageTwo,"page-two-thread"),pageTwo[0]);
});

test("sender matching skips the selected account when its newest message is first",()=>{
    const messages=[{sender:"Me <mine@example.test>"},{sender:"Alice <alice@example.test>"}];
    const reference={blockId:"gmail-a",threadId:"old-thread",sender:"alice@example.test",accountEmail:"mine@example.test"};
    assert.equal(conversationContactIdentity(messages,"mine@example.test"),"alice@example.test");
    assert.equal(matchesSavedConversationScope({id:"new-thread",accountEmail:"mine@example.test",messages},"gmail-a",[reference]),true);
    assert.equal(matchesSavedConversationScope({id:"new-thread-raw-summary",messages},"gmail-a",[reference]),true,"raw Gmail summaries use the saved mailbox identity fallback");
});
