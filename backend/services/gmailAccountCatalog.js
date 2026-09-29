const LEGACY_SHARED_GMAIL_ACCOUNT_ID = "folderrocket-legacy-shared-gmail";

function validAccountId(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
}

function addAssociation(associations, accountId, worldId) {
    if (!validAccountId(accountId) || !validAccountId(worldId)) return;
    const worlds = associations.get(accountId) || new Set();
    worlds.add(worldId);
    associations.set(accountId, worlds);
}

function collectAccountAssociations(preferences = {}) {
    const associations = new Map();
    const worlds = preferences.worlds && typeof preferences.worlds === "object" && !Array.isArray(preferences.worlds)
        ? preferences.worlds
        : {};

    for (const [worldId, value] of Object.entries(worlds)) {
        if (!value || typeof value !== "object") continue;
        const dashboard = worldId === "work"
            ? {...preferences, ...(value.dashboard && typeof value.dashboard === "object" ? value.dashboard : {})}
            : value.dashboard || {};
        for (const block of [...(dashboard.sourceBlocks || []), ...(dashboard.rightSourceBlocks || [])]) {
            if (!block || block.type !== "gmail" || typeof block.id !== "string") continue;
            if (block.accountBlockId === null) continue;
            addAssociation(associations, validAccountId(block.accountBlockId) ? block.accountBlockId : block.id, worldId);
        }

        const emailAlerts = value.emailAlerts || (worldId === "work" ? preferences.emailAlerts : null);
        const gmailBlocks = emailAlerts?.gmail?.blocks;
        if (!gmailBlocks || typeof gmailBlocks !== "object" || Array.isArray(gmailBlocks)) continue;
        for (const [blockId, blockSettings] of Object.entries(gmailBlocks)) {
            if (!blockSettings || typeof blockSettings !== "object" || blockSettings.accountBlockId === null) continue;
            addAssociation(associations, validAccountId(blockSettings.accountBlockId) ? blockSettings.accountBlockId : blockId, worldId);
        }
    }
    return associations;
}

function buildGmailAccountCatalog(accounts, preferences = {}) {
    const associations = collectAccountAssociations(preferences);
    const grouped = new Map();
    for (const account of Array.isArray(accounts) ? accounts : []) {
        if (!account || !validAccountId(account.blockId)) continue;
        const email = typeof account.email === "string" ? account.email.trim() : "";
        const key = email ? `email:${email.toLocaleLowerCase()}` : `id:${account.blockId}`;
        let entry = grouped.get(key);
        if (!entry) {
            entry = {
                blockId: account.blockId,
                blockIds: [],
                email,
                label: email || `Account collegato · ${account.blockId.slice(-6)}`,
                originWorldIds: [],
                originWorldNames: [],
                associatedWorldIds: [],
                originUnknown: false,
                legacyShared: false
            };
            grouped.set(key, entry);
        }
        if (!entry.blockIds.includes(account.blockId)) entry.blockIds.push(account.blockId);
        entry.legacyShared ||= account.legacyShared === true || account.blockId === LEGACY_SHARED_GMAIL_ACCOUNT_ID;
        if (typeof account.originWorldId === "string" && account.originWorldId && !entry.originWorldIds.includes(account.originWorldId)) {
            entry.originWorldIds.push(account.originWorldId);
        }
        if (typeof account.originWorldName === "string" && account.originWorldName && !entry.originWorldNames.includes(account.originWorldName)) {
            entry.originWorldNames.push(account.originWorldName);
        }
        if (!account.originWorldId && !account.originWorldName) entry.originUnknown = true;
        for (const worldId of associations.get(account.blockId) || []) {
            if (!entry.associatedWorldIds.includes(worldId)) entry.associatedWorldIds.push(worldId);
        }
    }
    return [...grouped.values()].map(entry => ({
        ...entry,
        blockIds: entry.blockIds.sort(),
        originWorldIds: entry.originWorldIds.sort(),
        originWorldNames: entry.originWorldNames.sort(),
        associatedWorldIds: entry.associatedWorldIds.sort()
    })).sort((first, second) => first.label.localeCompare(second.label, undefined, {sensitivity: "base"}));
}

module.exports = {buildGmailAccountCatalog, collectAccountAssociations};
