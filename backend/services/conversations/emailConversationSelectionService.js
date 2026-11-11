function normalizedSenderIdentity(value) {
    const address=String(value||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    return address?address.trim().toLocaleLowerCase():"";
}

function conversationContactIdentity(messages,accountEmail) {
    const rows=Array.isArray(messages)?messages:[];
    const own=normalizedSenderIdentity(accountEmail);
    const identities=rows.map(message=>normalizedSenderIdentity(message?.sender||message?.from||"")).filter(Boolean);
    return identities.find(identity=>identity!==own)||identities[0]||"";
}

function matchesSavedConversationScope(thread,blockId,references) {
    const candidates=(Array.isArray(references)?references:[]).filter(item=>item?.blockId===blockId);
    if(candidates.some(item=>item.threadId===thread?.id))return true;
    const sender=conversationContactIdentity(thread?.messages,thread?.accountEmail||candidates[0]?.accountEmail);
    return Boolean(sender&&candidates.some(item=>normalizedSenderIdentity(item.sender)===sender));
}

function mergeSavedChatSelectorThreads(pageThreads,references,blockId) {
    const threads=(Array.isArray(pageThreads)?pageThreads:[]).map(item=>({...item,selected:(Array.isArray(references)?references:[]).some(reference=>reference?.blockId===blockId&&reference.threadId===item.id)}));
    const pageIds=new Set(threads.map(item=>item.id));
    for(const reference of Array.isArray(references)?references:[]) {
        if(reference?.blockId!==blockId||pageIds.has(reference.threadId))continue;
        threads.push({id:reference.threadId,subject:reference.subject||"(no subject)",snippet:"Previously selected conversation",updatedAt:reference.selectedAt||"",messageCount:0,messages:reference.sender?[{sender:reference.sender}]:[],selected:true});
    }
    return threads;
}

function findInboxThreadById(pageThreads,threadId) {
    return (Array.isArray(pageThreads)?pageThreads:[]).find(item=>item?.id===threadId)||null;
}

function chatInboxPageOptions(pageToken, query="") {
    return {maxResults:20,pageToken:typeof pageToken==="string"?pageToken:"",query:typeof query==="string"?query.trim().slice(0,200):""};
}

function senderInboxQuery(sender) {
    const address=typeof sender==="string"?sender.trim().toLowerCase():"";
    if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(address))throw new Error("Sender email address is invalid.");
    return `newer_than:30d from:${address}`;
}

module.exports={normalizedSenderIdentity,conversationContactIdentity,matchesSavedConversationScope,mergeSavedChatSelectorThreads,findInboxThreadById,chatInboxPageOptions,senderInboxQuery};
