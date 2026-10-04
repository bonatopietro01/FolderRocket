const VALID_PROVIDERS = new Set(["gmail", "outlook"]);

function validBlockId(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
}

function normalizeEmailAccount(value) {
    if (value === null) return null;
    if (!value || typeof value !== "object" || !VALID_PROVIDERS.has(value.provider) || !validBlockId(value.blockId)) {
        throw new Error("Choose a valid email account for this planet.");
    }
    return {provider:value.provider, blockId:value.blockId};
}

function worldDashboard(settings, worldId) {
    const worlds = settings?.worlds && typeof settings.worlds === "object" && !Array.isArray(settings.worlds) ? settings.worlds : {};
    const dashboard = worlds[worldId]?.dashboard;
    if (dashboard && typeof dashboard === "object" && !Array.isArray(dashboard)) return dashboard;
    if (worldId === "work") {
        const keys = ["folders", "dashboardWidths", "dashboardHeight", "searchFolderIds", "sourceBlocks", "rightSourceBlocks"];
        return Object.fromEntries(keys.filter(key => Object.hasOwn(settings || {}, key)).map(key => [key, settings[key]]));
    }
    return {};
}

function legacyEmailAccountCandidates(settings, worldId) {
    const dashboard = worldDashboard(settings, worldId);
    const blocks = [...(Array.isArray(dashboard.sourceBlocks) ? dashboard.sourceBlocks : []), ...(Array.isArray(dashboard.rightSourceBlocks) ? dashboard.rightSourceBlocks : [])];
    const found = new Map();
    for (const block of blocks) {
        const provider = block?.type === "gmail" ? "gmail" : block?.type === "outlook" ? "outlook" : "";
        if (!provider || typeof block.id !== "string") continue;
        const blockId = block.accountBlockId === null ? "" : (typeof block.accountBlockId === "string" && block.accountBlockId ? block.accountBlockId : block.id);
        if (!validBlockId(blockId)) continue;
        const key = `${provider}:${blockId}`;
        if (!found.has(key)) found.set(key, {provider, blockId});
    }
    return [...found.values()];
}

function resolveWorldEmailAccount(world, settings, worldId) {
    if (world && Object.hasOwn(world,"emailAccount") && world.emailAccount === null) {
        return {selection:null,migrated:false,conflict:false,candidates:[]};
    }
    if (world?.emailAccount && VALID_PROVIDERS.has(world.emailAccount.provider) && validBlockId(world.emailAccount.blockId)) {
        return {selection:{provider:world.emailAccount.provider,blockId:world.emailAccount.blockId}, migrated:false, conflict:false, candidates:[]};
    }
    const candidates = legacyEmailAccountCandidates(settings, worldId);
    return {
        selection:candidates.length === 1 ? candidates[0] : null,
        migrated:candidates.length === 1,
        conflict:candidates.length > 1,
        candidates
    };
}

function selectAccountBlock(settings, worldId, selection) {
    if (!selection || !VALID_PROVIDERS.has(selection.provider) || !validBlockId(selection.blockId)) return null;
    const dashboard = worldDashboard(settings, worldId);
    const blocks = [...(Array.isArray(dashboard.sourceBlocks) ? dashboard.sourceBlocks : []), ...(Array.isArray(dashboard.rightSourceBlocks) ? dashboard.rightSourceBlocks : [])];
    return blocks.some(block => block?.type === selection.provider && block.id === selection.blockId)
        || blocks.some(block => block?.type === selection.provider && block.accountBlockId === selection.blockId)
        ? {provider:selection.provider,blockId:selection.blockId}
        : {provider:selection.provider,blockId:selection.blockId};
}

module.exports = {VALID_PROVIDERS, validBlockId, normalizeEmailAccount, worldDashboard, legacyEmailAccountCandidates, resolveWorldEmailAccount, selectAccountBlock};
