function buildProviderAccountCatalog(accounts, preferences = {}, {provider = "", worldId = "", selectedBlockId = ""} = {}) {
    const worlds = preferences.worlds && typeof preferences.worlds === "object" && !Array.isArray(preferences.worlds) ? preferences.worlds : {};
    const worldNames = new Map(Object.entries(worlds).map(([id, world]) => [id, typeof world?.name === "string" && world.name.trim() ? world.name.trim() : id]));
    const grouped = new Map();
    for (const account of Array.isArray(accounts) ? accounts : []) {
        if (!account || typeof account.blockId !== "string" || !account.blockId) continue;
        const email = typeof account.email === "string" ? account.email.trim() : "";
        const key = email ? `email:${email.toLocaleLowerCase()}` : `id:${account.blockId}`;
        let item = grouped.get(key);
        if (!item) {
            item = {blockId: account.blockId, blockIds: [], email, originWorldIds: [], originWorldNames: [], originUnknown: false};
            grouped.set(key, item);
        }
        if (!item.blockIds.includes(account.blockId)) item.blockIds.push(account.blockId);
        if (typeof account.originWorldId === "string" && account.originWorldId && !item.originWorldIds.includes(account.originWorldId)) item.originWorldIds.push(account.originWorldId);
        if (typeof account.originWorldName === "string" && account.originWorldName.trim() && !item.originWorldNames.includes(account.originWorldName.trim())) item.originWorldNames.push(account.originWorldName.trim());
        if (!account.originWorldId && !account.originWorldName) item.originUnknown = true;
    }
    for (const [associatedWorldId, world] of Object.entries(worlds)) {
        const selection = world?.emailAccount;
        if (!selection || typeof selection.blockId !== "string" || (provider && selection.provider !== provider)) continue;
        for (const item of grouped.values()) {
            if (!item.blockIds.includes(selection.blockId) || item.originWorldNames.includes(worldNames.get(associatedWorldId))) continue;
            item.originWorldNames.push(worldNames.get(associatedWorldId));
        }
    }
    return [...grouped.values()].map(item => {
        const preferred = item.blockIds.includes(selectedBlockId) ? selectedBlockId :
            (worldId && item.originWorldIds.includes(worldId) ? item.blockIds.find(id => accounts.find(account => account.blockId === id)?.originWorldId === worldId) : "") || item.blockIds[0];
        return {
            blockId: preferred,
            blockIds: [...item.blockIds].sort(),
            email: item.email,
            originWorldNames: [...item.originWorldNames].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"})),
            originUnknown: item.originUnknown && item.originWorldNames.length === 0
        };
    }).sort((a, b) => (a.email || a.blockId).localeCompare(b.email || b.blockId, undefined, {sensitivity: "base"}));
}

module.exports = {buildProviderAccountCatalog};
