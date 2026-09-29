import {API_BASE_URL} from "./api";

export interface EmailAccount {
    blockId: string;
    blockIds?: string[];
    email: string;
    label: string;
    originWorldIds?: string[];
    originWorldNames?: string[];
    associatedWorldIds?: string[];
    originUnknown?: boolean;
    legacyShared?: boolean;
}
type Provider = "gmail" | "outlook";

const cache = new Map<string, {expiresAt: number; accounts: EmailAccount[]}>();
const inFlight = new Map<string, Promise<EmailAccount[]>>();
const generations = new Map<string, number>();

export async function loadEmailAccounts(provider: Provider, userId: string, force = false): Promise<EmailAccount[]> {
    const key = `${userId}:${provider}`;
    const current = cache.get(key);
    if (!force && current && current.expiresAt > Date.now()) return current.accounts;
    const pending = inFlight.get(key);
    if (pending) return pending;
    const generation = generations.get(key) || 0;
    const request = (async () => {
        const response = await fetch(`${API_BASE_URL}/email/${provider}/accounts`, {credentials: "include"});
        if (!response.ok) throw new Error(`Unable to load ${provider} accounts.`);
        const data = await response.json() as {accounts?: EmailAccount[]};
        const accounts = Array.isArray(data.accounts)
            ? data.accounts.filter(account => typeof account?.blockId === "string" && typeof account?.label === "string").map(account => ({
                ...account,
                blockIds: Array.isArray(account.blockIds)
                    ? account.blockIds.filter((blockId): blockId is string => typeof blockId === "string")
                    : [account.blockId],
                originWorldIds: Array.isArray(account.originWorldIds)
                    ? account.originWorldIds.filter((worldId): worldId is string => typeof worldId === "string")
                    : [],
                originWorldNames: Array.isArray(account.originWorldNames)
                    ? account.originWorldNames.filter((name): name is string => typeof name === "string")
                    : [],
                associatedWorldIds: Array.isArray(account.associatedWorldIds)
                    ? account.associatedWorldIds.filter((worldId): worldId is string => typeof worldId === "string")
                    : []
            }))
            : [];
        if (generations.get(key) === generation) cache.set(key, {expiresAt: Date.now() + 30_000, accounts});
        return accounts;
    })();
    inFlight.set(key, request);
    try { return await request; }
    finally { if (inFlight.get(key) === request) inFlight.delete(key); }
}

export function emailAccountContainsBlock(account: EmailAccount, blockId: string) {
    return account.blockId === blockId || Boolean(account.blockIds?.includes(blockId));
}

export function emailAccountOptionLabel(account: EmailAccount, worldNames: Record<string, string>) {
    const names = (ids: string[]) => ids.map(id => worldNames[id]).filter((name): name is string => Boolean(name));
    const origins = [...new Set([...names(account.originWorldIds ?? []), ...(account.originWorldNames ?? [])])];
    const associations = [...new Set(names(account.associatedWorldIds ?? []))].filter(name => !origins.includes(name));
    const provenance = origins.length
        ? `collegato da ${origins.join(", ")}`
        : associations.length
            ? `associato a ${associations.join(", ")}`
            : "origine non specificata";
    const associationSuffix = origins.length && associations.length ? ` · selezionato in ${associations.join(", ")}` : "";
    const unknownOriginSuffix = origins.length && account.originUnknown ? " · altra origine non specificata" : "";
    const legacySuffix = account.legacyShared ? " · collegamento condiviso preesistente" : "";
    return `${account.email || account.label} · ${provenance}${associationSuffix}${unknownOriginSuffix}${legacySuffix}`;
}

export function invalidateEmailAccounts(provider: Provider, userId: string) {
    const key = `${userId}:${provider}`;
    cache.delete(key);
    generations.set(key, (generations.get(key) || 0) + 1);
    inFlight.delete(key);
}
