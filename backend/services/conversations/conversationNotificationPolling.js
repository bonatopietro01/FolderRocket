async function observeInboxThreads({recordMessages, scope, threads, mode = "sync"}) {
    if (typeof recordMessages !== "function") throw new TypeError("A notification recorder is required.");
    const threadIds = [];
    let count = 0;
    for (const thread of Array.isArray(threads) ? threads : []) {
        const threadId = String(thread?.id || thread?.threadId || "");
        if (!threadId) continue;
        threadIds.push(threadId);
        const result = await recordMessages({
            ...scope,
            threadId,
            messageIds:(Array.isArray(thread.messages) ? thread.messages : []).map(message => message?.id),
            mode
        });
        count += Number.isFinite(result?.count) ? result.count : 0;
    }
    return {count, threadIds:[...new Set(threadIds)]};
}

module.exports = {observeInboxThreads};
