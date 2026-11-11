export function isKnowledgeCandidateSelected(id: string, excludedFileIds: readonly string[]): boolean {
    return !excludedFileIds.includes(id);
}

export function updateKnowledgeExcludedFileIds(excludedFileIds: readonly string[], id: string, include: boolean): string[] {
    return include
        ? excludedFileIds.filter(excludedId => excludedId !== id)
        : [...new Set([...excludedFileIds, id])];
}
