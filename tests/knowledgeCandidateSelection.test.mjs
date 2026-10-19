import test from "node:test";
import assert from "node:assert/strict";
import {isKnowledgeCandidateSelected, updateKnowledgeExcludedFileIds} from "../src/components/knowledgeCandidateSelection.ts";

test("an excluded candidate can be selected again using the saved exclusion IDs", () => {
    const initiallyExcluded = ["file-1", "file-2"];
    assert.equal(isKnowledgeCandidateSelected("file-1", initiallyExcluded), false);

    const reenabled = updateKnowledgeExcludedFileIds(initiallyExcluded, "file-1", true);
    assert.deepEqual(reenabled, ["file-2"]);
    assert.equal(isKnowledgeCandidateSelected("file-1", reenabled), true);
});

test("candidate exclusion toggles are idempotent", () => {
    assert.deepEqual(updateKnowledgeExcludedFileIds(["file-1"], "file-1", false), ["file-1"]);
    assert.deepEqual(updateKnowledgeExcludedFileIds([], "file-1", true), []);
});
