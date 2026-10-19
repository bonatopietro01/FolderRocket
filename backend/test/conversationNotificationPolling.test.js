const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const {createConversationNotificationService} = require("../services/conversationNotificationService");
const {observeInboxThreads} = require("../services/conversationNotificationPolling");

test("notification polling establishes a quiet baseline, reports only new sync messages, and keeps history silent", async t => {
    const dataDirectory = await fs.mkdtemp(path.join(__dirname, ".notification-poll-"));
    t.after(() => fs.rm(dataDirectory, {recursive:true, force:true}));
    const service = createConversationNotificationService({getDataDirectory:() => dataDirectory});
    const scope = {userId:"fixture-user", worldId:"work", provider:"gmail", accountId:"gmail-work", threadId:"thread-a"};
    const recordMessages = service.recordMessages;

    const baseline = await recordMessages({...scope, messageIds:["message-old"], mode:"baseline"});
    assert.equal(baseline.count, 0);
    const history = await observeInboxThreads({recordMessages, scope:{...scope, threadId:undefined}, mode:"history", threads:[{id:"thread-a", messages:[{id:"message-history"}]}]});
    assert.deepEqual(history, {count:0, threadIds:["thread-a"]});

    const sync = await observeInboxThreads({recordMessages, scope:{...scope, threadId:undefined}, threads:[{id:"thread-a", messages:[{id:"message-old"},{id:"message-new"}]}]});
    assert.deepEqual(sync, {count:1, threadIds:["thread-a"]});
    const repeated = await observeInboxThreads({recordMessages, scope:{...scope, threadId:undefined}, threads:[{id:"thread-a", messages:[{id:"message-old"},{id:"message-new"}]}]});
    assert.equal(repeated.count, 1, "pending notifications remain until acknowledged but are not duplicated");
    assert.deepEqual(await service.getPendingMessages(scope), {pendingMessageIds:["message-new"], count:1});
});
