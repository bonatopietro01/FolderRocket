export function emailConversationScopeKey(worldId: string, provider?: string, accountBlockId?: string, accountEmail?: string) {
    return JSON.stringify([worldId, provider || "none", accountBlockId || "none", accountEmail?.trim().toLocaleLowerCase() || "none"]);
}

export function emailConversationSelectionKey(worldId: string, blockId: string, threadId: string) {
    return JSON.stringify([worldId, blockId, threadId]);
}
