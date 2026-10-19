export interface ObsidianSourceBlocker {
    sourceId: string;
    label: string;
    status: string;
    reasonCode: string;
    action: string;
    retryable: boolean;
}

export interface ObsidianReasonSummary {
    reasonCodes: string[];
    counts: Record<string, number>;
    blockers?: ObsidianSourceBlocker[];
}

export interface ObsidianKnowledgeSummary {
    worldId: string;
    status: "ready" | "indexing" | "blocked";
    sourceSelectionFingerprint: string;
    revision: string;
    readinessFingerprint: string;
    reasonSummary: ObsidianReasonSummary;
}

interface AutoSyncCheckpoint {
    signature: string;
    blockedFingerprint?: string;
    dismissedFingerprint?: string;
}

const checkpoints = new Map<string, AutoSyncCheckpoint>();

function getCheckpoint(key: string, signature: string): AutoSyncCheckpoint {
    let checkpoint = checkpoints.get(key);
    if (!checkpoint || checkpoint.signature !== signature) {
        checkpoint = {signature};
        checkpoints.set(key, checkpoint);
    }
    return checkpoint;
}

export function recordObsidianIncompleteSync(key: string, signature: string, readinessFingerprint: string) {
    getCheckpoint(key, signature).blockedFingerprint = readinessFingerprint;
}

export function shouldPauseObsidianAutoSync(key: string, signature: string, readinessFingerprint: string) {
    const checkpoint = checkpoints.get(key);
    return Boolean(checkpoint && checkpoint.signature === signature && checkpoint.blockedFingerprint === readinessFingerprint);
}

export function recordObsidianSyncSuccess(key: string, signature: string) {
    const checkpoint = getCheckpoint(key, signature);
    checkpoint.blockedFingerprint = undefined;
    checkpoint.dismissedFingerprint = undefined;
}

export function dismissObsidianIncompleteSync(key: string, signature: string, readinessFingerprint: string) {
    getCheckpoint(key, signature).dismissedFingerprint = readinessFingerprint;
}

export function shouldShowObsidianIncompleteSync(key: string, signature: string, readinessFingerprint: string) {
    const checkpoint = checkpoints.get(key);
    return Boolean(checkpoint && checkpoint.signature === signature && checkpoint.blockedFingerprint === readinessFingerprint && checkpoint.dismissedFingerprint !== readinessFingerprint);
}

export function clearObsidianAutoSyncPause(key: string) {
    checkpoints.delete(key);
}
