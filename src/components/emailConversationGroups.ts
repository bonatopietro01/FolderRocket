export type ConversationSummary = {
    id: string;
    threadId: string;
    blockId: string;
    subject: string;
    snippet: string;
    accountEmail: string;
    updatedAt?: string;
    messages?: Array<{sender?: string; from?: string}>;
};

export type ConversationGroup<T extends ConversationSummary> = {key: string; label: string; threads: T[]};

export function normalizedSenderIdentity(value: string) {
    const text = String(value || "");
    const address = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    return address ? address.trim().toLocaleLowerCase() : "";
}

export function conversationContactIdentity(messages: ConversationSummary["messages"], accountEmail: string) {
    const own = normalizedSenderIdentity(accountEmail);
    const identities = (messages || []).map(message => normalizedSenderIdentity(message.sender || message.from || "")).filter(Boolean);
    return identities.find(identity => identity !== own) || identities[0] || "";
}

export function conversationContactLabel(messages: ConversationSummary["messages"], identity: string) {
    const source = (messages || []).map(message => message.sender || message.from || "").find(value => normalizedSenderIdentity(value) === identity) || "";
    const displayName = source.match(/^\s*([^<"]+?)\s*</)?.[1]?.trim().replace(/^"|"$/g, "");
    return displayName ? `${displayName} · ${identity}` : identity;
}

export function groupEmailConversations<T extends ConversationSummary>(threads: T[]): ConversationGroup<T>[] {
    const groups = new Map<string, ConversationGroup<T>>();
    for (const thread of threads) {
        const identity = conversationContactIdentity(thread.messages, thread.accountEmail);
        const account = normalizedSenderIdentity(thread.accountEmail) || thread.accountEmail.trim().toLocaleLowerCase();
        const key = identity ? `sender:${thread.blockId}:${account}:${identity}` : `thread:${thread.blockId}:${thread.threadId}`;
        const label = identity ? conversationContactLabel(thread.messages, identity) : thread.subject || "Conversation";
        const group = groups.get(key) || {key, label, threads: []};
        group.threads.push(thread);
        groups.set(key, group);
    }
    return [...groups.values()].map(group => ({...group, threads: group.threads.sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))}));
}
