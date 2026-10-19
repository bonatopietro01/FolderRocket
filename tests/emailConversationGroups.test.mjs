import test from "node:test";
import assert from "node:assert/strict";
import {groupEmailConversations, normalizedSenderIdentity} from "../src/components/emailConversationGroups.ts";
import {emailConversationScopeKey, emailConversationSelectionKey} from "../src/components/emailConversationScope.ts";

test("conversation scope and selected thread keys isolate world and mounted account", () => {
    assert.notEqual(emailConversationScopeKey("planet-a", "gmail", "block-a", "me@example.test"), emailConversationScopeKey("planet-b", "gmail", "block-a", "me@example.test"));
    assert.notEqual(emailConversationScopeKey("planet-a", "gmail", "block-a", "me@example.test"), emailConversationScopeKey("planet-a", "gmail", "block-b", "me@example.test"));
    assert.notEqual(emailConversationScopeKey("planet-a", "gmail", "block-a", "me@example.test"), emailConversationScopeKey("planet-a", "outlook", "block-a", "me@example.test"));
    assert.notEqual(emailConversationSelectionKey("planet-a", "block-a", "thread-a"), emailConversationSelectionKey("planet-b", "block-a", "thread-a"));
});

test("conversation contacts group by sender and mailbox while retaining provider thread targets", () => {
    const rows=[
        {id:"t1",threadId:"provider-thread-1",blockId:"gmail-a",subject:"Earlier",snippet:"",accountEmail:"me@example.test",updatedAt:"2026-01-01",messages:[{sender:"Alice Example <ALICE@example.test>"}]},
        {id:"t2",threadId:"provider-thread-2",blockId:"gmail-b",subject:"Later",snippet:"",accountEmail:"other@example.test",updatedAt:"2026-02-01",messages:[{sender:"alice@example.test"}]},
        {id:"t3",threadId:"provider-thread-3",blockId:"gmail-a",subject:"No sender",snippet:"",accountEmail:"me@example.test",updatedAt:"2026-03-01",messages:[]}
    ];
    assert.equal(normalizedSenderIdentity("Alice <ALICE@example.test>"),"alice@example.test");
    const groups=groupEmailConversations(rows);
    assert.equal(groups.length,3);
    assert.deepEqual(groups.map(group=>group.key),["sender:gmail-a:me@example.test:alice@example.test","sender:gmail-b:other@example.test:alice@example.test","thread:gmail-a:provider-thread-3"]);
    assert.deepEqual(groups[0].threads.map(item=>item.threadId),["provider-thread-1"]);
    assert.deepEqual(groups[1].threads.map(item=>item.threadId),["provider-thread-2"]);
    assert.equal(groups[0].threads[0].blockId,"gmail-a");
    assert.deepEqual(groups[2].threads.map(item=>item.threadId),["provider-thread-3"]);
});

test("contact labels include a readable name and address without using the name as identity", () => {
    const rows=[
        {id:"a",threadId:"a",blockId:"gmail-a",subject:"One",snippet:"",accountEmail:"me@example.test",messages:[{sender:'Alex Smith <alex@example.test>'}]},
        {id:"b",threadId:"b",blockId:"gmail-a",subject:"Two",snippet:"",accountEmail:"me@example.test",messages:[{sender:'Alex Smith <alex@example.test>'}]},
        {id:"c",threadId:"c",blockId:"gmail-a",subject:"Other Alex",snippet:"",accountEmail:"me@example.test",messages:[{sender:'Alex Smith <alex2@example.test>'}]}
    ];
    const groups=groupEmailConversations(rows);
    assert.equal(groups.length,2);
    assert.equal(groups[0].label,"Alex Smith · alex@example.test");
    assert.deepEqual(groups[0].threads.map(item=>item.threadId),["a","b"]);
    assert.equal(groups[1].label,"Alex Smith · alex2@example.test");
});

test("conversation grouping prefers the correspondent when the newest message is from the account", () => {
    const rows=[
        {id:"newest-first",threadId:"provider-thread-a",blockId:"gmail-a",subject:"Recent",snippet:"",accountEmail:"me@example.test",messages:[{sender:"Me <me@example.test>"},{sender:"Alice <alice@example.test>"}]},
        {id:"older-first",threadId:"provider-thread-b",blockId:"gmail-a",subject:"Earlier",snippet:"",accountEmail:"me@example.test",messages:[{sender:"me@example.test"},{sender:"alice@example.test"}]}
    ];
    const groups=groupEmailConversations(rows);
    assert.equal(groups.length,1);
    assert.deepEqual(groups[0].threads.map(item=>item.threadId),["provider-thread-a","provider-thread-b"]);
});
