const REASON_CODES = Object.freeze([
    "source_index_incomplete",
    "selected_source_limit",
    "content_unavailable",
    "knowledge_limit",
    "source_selection_changed"
]);

function boundedCount(value) {
    return Math.max(0, Math.min(200, Math.floor(Number(value) || 0)));
}

function summarizeKnowledgeBlockers({incompleteSourceCount=0, selectedSourceLimit=false, contentIncomplete=false, knowledgeLimit=false, sourceSelectionChanged=false}={}) {
    const counts={};
    const sourceCount=boundedCount(incompleteSourceCount);
    if(sourceCount)counts.source_index_incomplete=sourceCount;
    if(selectedSourceLimit)counts.selected_source_limit=1;
    if(contentIncomplete)counts.content_unavailable=1;
    if(knowledgeLimit)counts.knowledge_limit=1;
    if(sourceSelectionChanged)counts.source_selection_changed=1;
    const reasonCodes=REASON_CODES.filter(code=>counts[code]);
    const summary=reasonCodes.includes("source_selection_changed")
        ? "The selected sources changed during sync. Refresh the source status and try again."
        : "Review the selected source status and resolve the listed limits or unavailable content before syncing again.";
    return {reasonCodes,counts,summary:summary.slice(0,240)};
}

function knowledgeStatusForBlockers(summary) {
    return Array.isArray(summary?.reasonCodes)&&summary.reasonCodes.length>0?"partial":"ready";
}

module.exports={REASON_CODES,summarizeKnowledgeBlockers,knowledgeStatusForBlockers};
