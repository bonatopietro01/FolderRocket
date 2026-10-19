const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const {createConversationNotificationService} = require("../services/conversationNotificationService");

const scope = {
    userId:"user-one",
    worldId:"work-planet",
    provider:"gmail",
    accountId:"account-one@example.test",
    threadId:"thread-one"
};

async function withService(run) {
    const dataDirectory = await fs.mkdtemp(path.join(__dirname, ".conversation-notifications-"));
    try {
        const service = createConversationNotificationService({getDataDirectory:() => dataDirectory});
        await run(service, dataDirectory);
    } finally {
        await fs.rm(dataDirectory, {recursive:true, force:true});
    }
}

test("first observation establishes a quiet baseline; later syncs notify only stable unseen IDs once", async () => {
    await withService(async service => {
        const baseline = await service.recordMessages({...scope, messageIds:["old-1", "old-2"]}, {mode:"sync"});
        assert.equal(baseline.initialized, true);
        assert.deepEqual(baseline.newMessageIds, []);
        assert.equal(baseline.count, 0);

        const update = await service.recordMessages({...scope, messageIds:["new-1", "old-2"]}, {mode:"sync"});
        assert.equal(update.initialized, false);
        assert.deepEqual(update.newMessageIds, ["new-1"]);
        assert.deepEqual(update.pendingMessageIds, ["new-1"]);

        const repeated = await service.recordMessages({...scope, messageIds:["new-1", "old-2"]}, {mode:"sync"});
        assert.deepEqual(repeated.newMessageIds, []);
        assert.deepEqual(await service.getPendingMessages(scope), {pendingMessageIds:["new-1"], count:1});
    });
});

test("baseline and history observations never create notification badges", async () => {
    await withService(async service => {
        await service.recordMessages({...scope, messageIds:["latest"]}, {mode:"baseline"});
        const history = await service.recordMessages({...scope, messageIds:["older-1", "older-2"]}, {mode:"history"});
        assert.deepEqual(history.newMessageIds, []);
        const subsequentSync = await service.recordMessages({...scope, messageIds:["latest", "older-1", "new-arrival"]}, {mode:"sync"});
        assert.deepEqual(subsequentSync.newMessageIds, ["new-arrival"]);
    });
});

test("acknowledging selected or all messages only changes the local checkpoint", async () => {
    await withService(async service => {
        await service.recordMessages({...scope, messageIds:["initial"]}, {mode:"baseline"});
        await service.recordMessages({...scope, messageIds:["initial", "new-1", "new-2"]}, {mode:"sync"});
        assert.deepEqual(await service.acknowledgeMessages({...scope, messageIds:["new-1"]}), {pendingMessageIds:["new-2"], count:1});
        assert.deepEqual(await service.getPendingMessages(scope), {pendingMessageIds:["new-2"], count:1});
        assert.deepEqual(await service.acknowledgeMessages(scope), {pendingMessageIds:[], count:0});
        assert.deepEqual(await service.getPendingMessages(scope), {pendingMessageIds:[], count:0});
        const duplicateSync = await service.recordMessages({...scope, messageIds:["new-1", "new-2"]}, {mode:"sync"});
        assert.deepEqual(duplicateSync.newMessageIds, []);
    });
});

test("checkpoints isolate user, planet, provider, account, and thread", async () => {
    await withService(async service => {
        await service.recordMessages({...scope, messageIds:["baseline"]}, {mode:"baseline"});
        await service.recordMessages({...scope, messageIds:["baseline", "new"]}, {mode:"sync"});
        const alternateScopes = [
            {...scope, userId:"user-two"},
            {...scope, worldId:"personal-planet"},
            {...scope, provider:"outlook"},
            {...scope, accountId:"account-two@example.test"},
            {...scope, threadId:"thread-two"}
        ];
        for (const alternate of alternateScopes) {
            assert.deepEqual(await service.getPendingMessages(alternate), {pendingMessageIds:[], count:0});
            await service.recordMessages({...alternate, messageIds:["baseline"]}, {mode:"baseline"});
            const next = await service.recordMessages({...alternate, messageIds:["baseline", "new"]}, {mode:"sync"});
            assert.deepEqual(next.newMessageIds, ["new"]);
        }
        assert.deepEqual(await service.getPendingMessages(scope), {pendingMessageIds:["new"], count:1});
    });
});

test("scope is hashed on disk and invalid message IDs are ignored", async () => {
    await withService(async (service, dataDirectory) => {
        await service.recordMessages({...scope, messageIds:["  stable-id  ", "stable-id", "", "x".repeat(513), 4]}, {mode:"baseline"});
        const storeDirectory = path.join(dataDirectory, "conversation-notifications");
        const files = await fs.readdir(storeDirectory);
        assert.equal(files.length, 1);
        const persisted = await fs.readFile(path.join(storeDirectory, files[0]), "utf8");
        assert.doesNotMatch(persisted, /user-one|work-planet|account-one|thread-one/);
        assert.deepEqual(await service.getPendingMessages(scope), {pendingMessageIds:[], count:0});
        const update = await service.recordMessages({...scope, messageIds:["stable-id", "new-id"]}, {mode:"sync"});
        assert.deepEqual(update.newMessageIds, ["new-id"]);
    });
});

test("checkpoints survive service recreation", async () => {
    await withService(async (service, dataDirectory) => {
        await service.recordMessages({...scope, messageIds:["initial"]}, {mode:"baseline"});
        await service.recordMessages({...scope, messageIds:["initial", "arrived"]}, {mode:"sync"});
        const restarted = createConversationNotificationService({getDataDirectory:() => dataDirectory});
        assert.deepEqual(await restarted.getPendingMessages(scope), {pendingMessageIds:["arrived"], count:1});
    });
});

test("a transient Windows rename denial retries atomically without losing the staged checkpoint", async () => {
    const dataDirectory=await fs.mkdtemp(path.join(__dirname,".conversation-notifications-retry-"));
    try {
        const renameDelays=[];
        let renameCalls=0;
        let stagedStore;
        const service=createConversationNotificationService({
            getDataDirectory:()=>dataDirectory,
            sleepImpl:async delay=>renameDelays.push(delay),
            renameImpl:async (temporaryPath,targetPath)=>{
                renameCalls+=1;
                if(renameCalls===2) {
                    const existing=JSON.parse(await fs.readFile(targetPath,"utf8"));
                    assert.deepEqual(existing.scopes[Object.keys(existing.scopes)[0]].knownMessageIds,["baseline"]);
                    stagedStore=JSON.parse(await fs.readFile(temporaryPath,"utf8"));
                    assert.deepEqual(stagedStore.scopes[Object.keys(stagedStore.scopes)[0]].pendingMessageIds,["arrived"]);
                    const transient=new Error("temporary file lock");
                    transient.code="EPERM";
                    throw transient;
                }
                return fs.rename(temporaryPath,targetPath);
            }
        });

        await service.recordMessages({...scope,messageIds:["baseline"]},{mode:"baseline"});
        const update=await service.recordMessages({...scope,messageIds:["baseline","arrived"]},{mode:"sync"});

        assert.equal(renameCalls,3,"the failed rename is retried once, then the atomic rename succeeds");
        assert.deepEqual(renameDelays,[15]);
        assert.ok(stagedStore,"the fully written temporary file remains available during the retry");
        assert.deepEqual(await service.getPendingMessages(scope),{pendingMessageIds:["arrived"],count:1});
        assert.deepEqual(update.pendingMessageIds,["arrived"]);
    } finally {
        await fs.rm(dataDirectory,{recursive:true,force:true});
    }
});

test("scope and observation mode validation prevents accidental shared checkpoints", async () => {
    await withService(async service => {
        await assert.rejects(service.recordMessages({...scope, worldId:""}, {mode:"baseline"}), /planet/);
        await assert.rejects(service.recordMessages(scope, {mode:"unknown"}), /observation mode/);
    });
});
