function graphUpdateFailureCode(error) {
    return error?.code === "GRAPH_STORAGE_UNAVAILABLE" ? "GRAPH_STORAGE_UNAVAILABLE" : "GRAPH_UPDATE_FAILED";
}

async function recordSentReplyGraphUpdate({sent,threadId,updateGraph}) {
    let graphUpdate;
    try {
        await updateGraph();
        graphUpdate={status:"updated"};
    } catch(error) {
        graphUpdate={status:error?.code === "GRAPH_STORAGE_UNAVAILABLE" ? "unavailable" : "failed",code:graphUpdateFailureCode(error)};
    }
    const messageId=sent?.id||"";
    const resolvedThreadId=sent?.threadId||threadId;
    if(graphUpdate.status==="updated")return {message:"Reply sent in the Gmail conversation.",messageId,threadId:resolvedThreadId};
    return {message:"Reply was sent in the Gmail conversation, but the Planet Graph was not updated.",sent:true,messageId,threadId:resolvedThreadId,graphUpdate};
}

module.exports={recordSentReplyGraphUpdate};
