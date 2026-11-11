const test = require("node:test");
const assert = require("node:assert/strict");
const wiki = require("../services/planet-knowledge/planetWikiService");

test("wiki preview applies the configured scope and reports metadata-only limits", () => {
    const walked = { nodes: [
        { id: "a", type: "file", label: "a.txt", sourceRef: { path: "C:/workspace/a.txt" }, details: { extension: ".txt", size: 42 } },
        { id: "b", type: "file", label: "b.bin", sourceRef: { path: "C:/workspace/b.bin" }, details: { extension: ".bin", size: 100 } },
        { id: "c", type: "file", label: "c.pdf", sourceRef: { path: "C:/workspace/c.pdf" }, details: { extension: ".pdf", size: 3 * 1024 * 1024 } }
    ], sourceStatuses: [{ sourceId: "folder:root", status: "complete" }] };
    const preview = wiki.buildPreview({ worldId: "work", roots: [{ id: "root" }], selection: { folders: true, excludedFileIds: ["a"] }, walked });
    assert.deepEqual([preview.readiness, preview.candidateCount, preview.supportedCount, preview.unsupportedCount, preview.excludedCount, preview.oversizedCount, preview.totalBytes], ["requires-narrowing", 2, 1, 1, 1, 1, 3 * 1024 * 1024]);
    assert.equal(preview.excludedFiles[0].id, "a");
    assert.equal(preview.unsupportedFiles[0].extension, ".bin");
    assert.equal(preview.limits.maxFiles, 250);
    assert.equal(preview.limits.maxIndexedFiles, 3000);
    assert.ok(preview.blockers.some(item => item.code === "file_size_limit"));
});

test("wiki preview preserves safe root failure codes without returning paths", () => {
    const preview = wiki.buildPreview({ worldId: "work", roots: [{ id: "root-a" }], selection: { folders: true }, walked: { nodes: [], sourceStatuses: [{ sourceId: "folder:root-a", status: "failed", reasonCode: "permission_denied", message: "Sensitive path omitted." }] } });
    const blocker = preview.blockers.find(item => item.code === "source_unavailable");
    assert.deepEqual(blocker.reasonCodes, ["permission_denied"]);
    assert.doesNotMatch(JSON.stringify(preview), /Sensitive path omitted|root-a|[A-Za-z]:\\/i);
});

test("wiki preflight blocks disabled, missing, and empty supported-file scopes", () => {
    const emptyWalk = { nodes: [], sourceStatuses: [] };
    const disabled = wiki.buildPreview({ worldId: "work", roots: [], selection: { folders: false, folderMode: "all" }, walked: emptyWalk });
    assert.equal(disabled.readiness, "unavailable");
    assert.ok(disabled.blockers.some(item => item.code === "folders_disabled"));

    const noSelectedRoots = wiki.buildPreview({ worldId: "work", roots: [], selection: { folders: true, folderMode: "selected", folderIds: ["missing"] }, walked: emptyWalk });
    assert.equal(noSelectedRoots.readiness, "unavailable");
    assert.ok(noSelectedRoots.blockers.some(item => item.code === "no_selected_roots"));

    const noFiles = wiki.buildPreview({ worldId: "work", roots: [{ id: "empty-root" }], selection: { folders: true, folderMode: "all" }, walked: emptyWalk });
    assert.equal(noFiles.readiness, "requires-narrowing");
    assert.ok(noFiles.blockers.some(item => item.code === "no_supported_files"));

    const unsupportedOnly = wiki.buildPreview({ worldId: "work", roots: [{ id: "root" }], selection: { folders: true }, walked: { nodes: [{ id: "binary", type: "file", label: "binary.bin", sourceRef: { path: "C:/workspace/binary.bin" }, details: { extension: ".bin", size: 10 } }], sourceStatuses: [{ sourceId: "folder:root", status: "complete" }] } });
    assert.equal(unsupportedOnly.readiness, "requires-narrowing");
    assert.equal(unsupportedOnly.unsupportedCount, 1);
    assert.ok(unsupportedOnly.blockers.some(item => item.code === "no_supported_files"));

    const supported = wiki.buildPreview({ worldId: "work", roots: [{ id: "root" }], selection: { folders: true }, walked: { nodes: [{ id: "text", type: "file", label: "text.txt", sourceRef: { path: "C:/workspace/text.txt" }, details: { extension: ".txt", size: 10 } }], sourceStatuses: [{ sourceId: "folder:root", status: "complete" }] } });
    assert.equal(supported.readiness, "ready");
    assert.equal(supported.supportedCount, 1);
});

test("preview scan errors are reduced to safe categories", () => {
    assert.equal(wiki.safePreviewFailureCode(Object.assign(new Error("The requested path contains an unavailable symbolic link."), { path: "C:/private/fixture" })), "unsafe_symlink");
    assert.equal(wiki.safePreviewFailureCode(Object.assign(new Error("The selected folder cannot be inspected at C:/private/fixture"), { code: "EACCES" })), "permission_denied");
    assert.equal(wiki.safePreviewFailureCode(new Error("Opaque scanner failure at C:/private/fixture")), "preview_scan_failed");
    assert.doesNotMatch(JSON.stringify([wiki.safePreviewFailureCode(new Error("Opaque scanner failure at C:/private/fixture"))]), /private|fixture|[A-Za-z]:\\/i);
});

test("wiki index searches, filters, and paginates more than 500 notes without duplicates", () => {
    const notes = Array.from({ length: 601 }, (_, index) => ({
        id: `page-${String(index).padStart(3, "0")}`,
        title: `Candidate ${String(index).padStart(3, "0")}`,
        kind: index % 2 ? "knowledge-area" : "knowledge-topic",
        markdown: `# Candidate ${index}\n\nSearchable synthetic wiki candidate with enough words for a metadata summary.`
    }));
    const collect = ({ query, kind } = {}) => {
        const collected = [], cursors = new Set();
        let cursor = "";
        do {
            const page = wiki.listPages(notes, { query, kind, cursor, limit: 500 });
            assert.ok(page.pageSize <= 50, "server caps every wiki response at 50 summaries");
            assert.ok(page.pages.every(item => !Object.hasOwn(item, "markdown")), "list pages remain metadata-only");
            collected.push(...page.pages);
            cursor = page.nextCursor;
            if (cursor) {
                assert.equal(cursors.has(cursor), false, "pagination cursor must advance without repeating");
                cursors.add(cursor);
            }
        } while (cursor);
        return collected;
    };
    const all = collect({ query: "candidate" });
    assert.equal(all.length, 601);
    assert.equal(new Set(all.map(item => item.id)).size, 601);
    const areas = collect({ query: "candidate", kind: "area" });
    assert.equal(areas.length, 300);
    assert.ok(areas.every(item => item.kind === "area" && item.title.toLowerCase().includes("candidate")));
    const topics = collect({ query: "candidate", kind: "topic" });
    assert.equal(topics.length, 301);
    assert.ok(topics.every(item => item.kind === "topic" && item.provenance?.confidence === "uncertain-lexical-grouping"));
});

test("wiki details include only page markdown, source refs, and resolvable links", () => {
    const notes = [
        { id: "page-a", title: "Alpha", kind: "knowledge-document", noteTarget: "alpha", markdown: "# Alpha\n\nSee [[beta|Beta]].", source: { sourceIds: ["source-a"] } },
        { id: "page-b", title: "Beta", kind: "knowledge-area", noteTarget: "beta", markdown: "# Beta" }
    ];
    const page = wiki.resolvePage(notes, "page-a", { "source-a": { descriptor: { locator: "C:/workspace/a.txt", updatedAt: "2026-10-24" } } });
    assert.equal(page.markdown, "# Alpha\n\nSee [[beta|Beta]].");
    assert.deepEqual(page.sourceRefs, [{ id: "source-a", path: "C:/workspace/a.txt", updatedAt: "2026-10-24" }]);
    assert.deepEqual(page.links, [{ id: "page-b", title: "Beta", kind: "area" }]);
    assert.equal(wiki.resolvePage(notes, "page-c"), null);
});

test("backend exposes per-planet wiki routes and keeps ingestion manual with last-good guards", async () => {
    const fs = require("node:fs/promises");
    const path = require("node:path");
    const server = await fs.readFile(path.join(__dirname, "..", "server.js"), "utf8");
    assert.match(server, /app\.get\("\/worlds\/:worldId\/wiki\/preview"/);
    assert.match(server, /app\.get\("\/worlds\/:worldId\/wiki"/);
    assert.match(server, /app\.get\("\/worlds\/:worldId\/wiki\/pages\/:pageId"/);
    const previewImplementation = server.slice(server.indexOf("async function previewPlanetWiki"), server.indexOf("function knowledgeReadiness", server.indexOf("async function previewPlanetWiki")));
    assert.match(previewImplementation, /walkConfiguredFolders/);
    assert.match(previewImplementation, /excludePaths:excludedPaths/);
    assert.doesNotMatch(previewImplementation, /,excludePaths,/);
    assert.doesNotMatch(previewImplementation, /readFileContent|readFile\(/);
    const authMe = server.slice(server.indexOf('app.get("/auth/me"'), server.indexOf('app.get("/auth/admin/audit-log"'));
    assert.doesNotMatch(authMe, /scheduleSelectedFolderRefresh|maintainKnowledgeWatcher|graph\/index/);
    const graphIndex = server.slice(server.indexOf('app.post("/worlds/:worldId/graph/index"'), server.indexOf('app.post("/worlds/:worldId/graph/activity"'));
    assert.match(graphIndex, /previewPlanetWiki[\s\S]*wiki_scope_requires_narrowing[\s\S]*writeGraph/);
    const obsidianSync = server.slice(server.indexOf('app.post("/worlds/:worldId/obsidian/sync"'), server.indexOf('app.get("/worlds/:worldId/graph"'));
    assert.doesNotMatch(obsidianSync, /queueKnowledgeSyncJob/, "Obsidian autoSync may export but never starts wiki ingestion");
    assert.match(obsidianSync, /currentKnowledge\.sourceSelectionFingerprint===sourceSelectionFingerprint/);
    assert.match(obsidianSync, /currentKnowledge\.graphRevision===currentScope\.graphRevision/);
    assert.match(obsidianSync, /currentKnowledge\.status!=="ready"/);
    assert.match(obsidianSync, /Rebuild the wiki manually, then retry Obsidian sync/);
    const sync = server.slice(server.indexOf("async function runKnowledgeSync(job,context)"), server.indexOf("function queueKnowledgeSyncJob"));
    assert.match(sync, /selectedCandidates\.length>KNOWLEDGE_MAX_FILES[\s\S]*retainPrevious[\s\S]*return;/);
    assert.match(sync, /if\(extractionIncomplete\)[\s\S]*retainPrevious[\s\S]*return;[\s\S]*analyzeKnowledgeInWorker\(compactDocuments/);
    assert.doesNotMatch(sync, /selectedCandidates\.slice\(0,KNOWLEDGE_MAX_FILES\)/);
});
