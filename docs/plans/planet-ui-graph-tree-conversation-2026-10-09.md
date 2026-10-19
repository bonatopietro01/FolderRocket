# Repair planet graph, Tree Rocket, Conversation and workspace controls

This ExecPlan follows `PLANS.md`. It covers the user's current request and is a live record of work in this already modified checkout. Preserve all unrelated and pre-existing changes.

## Purpose / Big Picture

Make the two planet styles use the supplied artwork, stabilize workspace navigation and folder rows, show Tree Rocket child folders cleanly with an inline file table, give Planet Graph actionable per-source indexing status, and make Conversation render actual email text while keeping Gmail account selection coherent per planet.

## Progress

- [x] (2026-10-09) Read project rules and current role specifications; recorded that the working tree is already heavily modified.
- [x] (2026-10-09) Read-only source mapping identified current graph diagnostics, Tree Rocket, MIME extraction and world-account behavior; the stale Graphify code index was rebuilt after implementation and three focused queries were checked against source.
- [x] (2026-10-09 10:13 UTC) Confirm shared API contracts for graph source status/retry and Gmail MIME body/media separation; assign backend and frontend ownership without overlapping files.
- [x] (2026-10-09) Integrate transparent black-hole and galaxy artwork; after review, replace the first black-hole artwork with a transparent line-art version and apply high-contrast ring treatment without an outer glow.
- [x] (2026-10-09) Implement backend source diagnostics/retry, MIME extraction and focused tests; post-review fixes add aggregate-cap attribution, batched folder progress and email-source-independent saved chat selection.
- [x] (2026-10-09) Implement frontend graph, Tree Rocket, Conversation and layout fixes; preserve the dirty baseline and update targeted fixture tests.
- [x] (2026-10-09) Run build, lint, backend tests, targeted regression tests, syntax/diff checks, and final read-only review; visual app review and real provider checks were unavailable/not performed.
- [x] (2026-10-09) Report per-requirement evidence, pre-existing changes left intact and live-service limitations.

## Surprises & Discoveries

- The checkout already contains many user modifications across the requested files, tests and new services. Findings are about the current working tree; do not attribute all existing diffs to this task.
- `graphify-out/graph.json` was stale at discovery. Per project guidance, `npm run graph:build` regenerated it after the code changes; Graphify remained code-only navigation and its findings were checked against current source/tests.
- Initial investigation found that some directory/stat/access failures lacked source-specific user-facing status and graph caps could be attributed incorrectly; the route/service now expose source statuses, an aggregate cap status, and batched scan progress.
- Tree Rocket already had direct file counts and paged retrieval; the current UI now exposes a per-folder See files disclosure without adding file nodes to the folder graph.
- Gmail paging existed, but MIME extraction needed to separate message text from inline images and attachments; that separation is now implemented and tested with synthetic MIME fixtures.
- World Gmail selection is explicitly scoped. Daily Jobs uses a separately configured outbound sender; the UI and contract must distinguish that from the inbox account rather than silently replacing it.
- The platform exposes generic Explorer/Worker/Reviewer delegation types, not the project's custom TOML role names as callable agent types. Specialist workers must read their current project role TOML; do not claim a custom runtime role was loaded automatically.

## Decision Log

- Use the current `.codex/agents/` inventory and role instructions. Do not recreate Analyzer, Writer or Debugger.
- Keep one writer for backend contracts/services and one for the React components/styles. The coordinator owns artwork integration, shared tests, TaskState and plan; no overlapping file ownership.
- Use an additive graph-source status contract while preserving existing `warnings` and index route compatibility where feasible.
- Preserve the distinct per-world inbox selection and configured Daily Jobs sender; clarify and validate both.
- For the black-hole asset, retain a black center and segmented concentric rings with restrained neutral contrast against the space background; no glow. For galaxy, retain its white/blue spiral details while removing only the outside canvas.
- No commit, push, install, deploy, user-data migration, or restart of an active app.

## Outcomes & Retrospective

Implementation and requested automated validation are complete. A final read-only review approved the graph-status fixes. Electron/browser visual checks, real provider access, and a credible before/after performance baseline remain unavailable and are not claimed.

## Context and Orientation

The UI is React/TypeScript/Vite. Relevant entry and controls include `src/App.tsx` (page navigation and world selection), `src/components/ChangeWorld.tsx`, `src/worlds.css`, `src/components/FolderManagement.tsx`, `src/components/TreeRocket.tsx`, `src/components/PlanetGraph.tsx`, `src/components/EmailConversations.tsx`, and `src/App.css`.

The backend is CommonJS/Express. Relevant areas include graph indexing in `backend/services/planetGraphService.js`, graph/email routes in `backend/server.js`, folder/file enumeration in `backend/services/treeRocketService.js`, Gmail MIME parsing in `backend/services/gmailService.js`, and world account resolution in `backend/services/worldEmailAccountService.js`. Existing tests include `backend/test/planetGraphAndConversation.test.js`, `backend/test/treeRocketService.test.js`, `backend/test/gmailConversationPagination.test.js`, `backend/test/worldPersistence.test.js`, `tests/snapshotSyncGating.test.mjs`, and the Tree Rocket UI fixture documented in `tests/README.md`.

## TaskState

| ID | Requirement / observable criterion | Owner | Dependencies | Status | Evidence / next check |
|---|---|---|---|---|---|
| R1 | Use the present development-role instructions, preserve deleted legacy roles as deleted, correct stale collaboration references if found, and report which custom roles are callable in this session. | Coordinator; read-only Explorer for mapping | None | COMPLETE | Updated `AGENTS.md` and `.codex/agents/README.md` to remove stale Analyzer/Writer/Debugger workflow claims. Current project TOMLs are used as worker instructions; platform exposes generic Explorer/Worker/Reviewer only, not callable custom role names. |
| R2 | Black-hole and galaxy styles use the two provided local references as transparent app assets, remain recognizable on the space background, and preserve saved world style/color. | Frontend worker; coordinator integrates assets | R1 | IMPLEMENTED; visual app check pending | Added `src/assets/planet-black-hole.png` and `src/assets/planet-galaxy.png`; alpha corners verified; CSS applies contrast to black-hole line art without outer glow. Production build and source-level style test pass; no live app screenshot was taken. |
| R3 | Graph indexing identifies failed sources and limit causes, exposes partial progress/status/retry, isolates failures, preserves valid graph state, and keeps graph/vault aligned to selected planet sources. | Backend worker; Frontend worker for status/retry UI; coordinator tests | Architect contract; R1 | COMPLETE | Structured per-source failures and retry remain; aggregate node/edge cap now reports `aggregate:graph` instead of blaming a source; folder walker persists monotonic progress in batches; chat selection can persist with email graph source disabled while threads stay excluded. Backend suite and lifecycle route test pass. |
| R4 | Dashboard page controls have even width/alignment, contained labels, gentle blue styling and recognizable icons across narrow/zoomed views. | Frontend worker | R1 | IMPLEMENTED; visual app check pending | `src/App.tsx`/`src/App.css` and frontend source regression tests verify centered compact rows, conditional scroll fades, and nav/source controls. No Electron/browser resize/zoom session was run. |
| R5 | Folder Management reorder preserves grid/header/row alignment; style and move controls replace path control in the same slot; normal path editing remains intact. | Frontend worker | R1 | IMPLEMENTED; visual app check pending | Updated `src/components/FolderManagement.tsx`/CSS behavior covered by source regression assertions and full backend test suite; no live reorder drag was performed. |
| R6 | Opening Tree Rocket folders places selected root near top and child folders centered/ordered within viewport, with folder-only graph and stable sizing. | Frontend worker | R1 | IMPLEMENTED; visual app check pending | `TreeRocket.tsx` and layout fixture assertions cover fixed root, bounded child branch, folder-only nodes, responsive controls and no bottom bar. No real Desktop tree was opened in the UI. |
| R7 | Each folder with direct files has See files beside count; it opens a paged/scrollable styled table below that folder without triggering navigation; file rows do not become graph nodes. | Frontend worker; Backend only if current paged contract lacks fields | R6 | COMPLETE in code/tests | Per-folder See files disclosure and bounded paging are present; event propagation is isolated; tests verify file rows remain a preview, not graph nodes. |
| R8 | Conversation loads selected messages efficiently and renders text/plain or sanitized HTML text as message bubbles, keeping inline images/attachments separate and avoiding stale responses. | Backend worker for MIME extraction/API; Frontend worker for rendering; coordinator tests | Shared MIME contract | COMPLETE in code/tests | Conversation paging loads bounded batches; MIME handling prefers plain text, safely converts HTML, separates inline image metadata and downloadable attachments; frontend resets/gates stale conversation loads. Backend/frontend tests pass; no live Gmail/Outlook account was queried. |
| R9 | Gmail inbox account selection remains explicit per world and is displayed consistently in Dashboard/Conversation; Daily Jobs clearly identifies its separately configured sender and never picks a random account. | Backend worker for selection contract; Frontend worker for labels/config | R1, R8 | COMPLETE in code/tests | World-scoped inbox selection and separately configured Daily Jobs sender are covered by two-world/account tests; no real account was consulted. |
| R10 | All applicable tests, build, lint, UI checks and read-only final review are reported per ID, with measurements and service limitations distinguished. | Coordinator; Reviewer final read-only review | R2-R9 | COMPLETE with visual/performance limits | `npm test` passed 122/122; `npm run build` passed with existing >500 kB chunk warning; `npm run lint` passed; 40 helper/frontend tests passed after final UI patch; backend syntax and `git diff --check` passed; final read-only Reviewer approved the graph status/progress fix. No credible before/after speed baseline, live-account test, or Electron visual session was available. |

## Plan of Work

1. Confirm API contracts for graph source status/retry and Gmail MIME body/media separation. Reproduce both with temporary synthetic data. COMPLETE.
2. Backend worker changes assigned graph/Gmail/account services, route handlers, and backend tests. COMPLETE; `backend/server.js` had a single writer.
3. Frontend worker changes assigned React components/styles/UI fixtures. COMPLETE; visual application checks remain pending.
4. Coordinator integrates planet assets, maintains TaskState and tests. COMPLETE.
5. Run checks, resolve concrete failures within scope, perform read-only review, and record evidence. COMPLETE; final Reviewer result APPROVED after focused UI progress refinements.

## Concrete Steps

Working directory is the repository root:

`C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`

Final validation on 2026-10-09: root `npm run build` passes (Vite warns the main minified chunk is 576.49 kB, above 500 kB); root `npm run lint` passes; root `npm test` passes 122/122 after one initial parallel lifecycle timing failure (the isolated test and full rerun passed); seven documented/targeted helper and frontend files pass 40/40 after the final UI patch; backend `node --check server.js` and `services/planetGraphService.js` pass; `git diff --check` passes. The browser/Electron smoke fixture was not opened, real providers were not called, and no reliable pre-change performance baseline exists.

## Validation and Acceptance

- Graph fixtures cover oversized source, an isolated unreadable source, partial status, retry/progress, and source deselection; verify the last valid graph is retained.
- MIME fixtures cover text/plain, HTML fallback, multipart/alternative, text plus inline CID images, normal attachments, and image/binary-only messages.
- World-account tests cover different Gmail selections for two worlds and distinguish inbox identity from Daily Jobs sender.
- Tree Rocket tests cover no/one/two/many child folders, per-folder direct file counts, See files toggling, paging and event propagation.
- UI fixture checks wide and narrow widths, dashboard nav, Folder Management normal/reorder alignment, and Tree Rocket root/child/table placement.
- Planet artwork is inspected for true alpha, detail fidelity and contrast on the app's space backdrop.
- Execute repository commands exactly as documented and have Reviewer inspect only the final relevant diff; report any untouched pre-existing diffs separately.

## Idempotence and Recovery

Keep changes scoped to files assigned in TaskState. Preserve the existing modified/untracked baseline. Add new artwork with new descriptive filenames; do not replace existing assets. If a test exposes a problem, revert only the task-owned hunk/file with coordinator confirmation of ownership, never use broad reset/clean operations. No data migration is planned.

## Artifacts and Notes

- This ExecPlan and TaskState.
- Original generated transparent artwork remains under the Codex generated-image folder; new app copies are `src/assets/planet-black-hole.png` and `src/assets/planet-galaxy.png`.
- Synthetic MIME and graph fixtures only; no real email body or local user data.

## Interfaces and Dependencies

Graph indexing should keep existing route compatibility and string warnings while adding structured per-source status where feasible. Gmail body extraction must return actual textual body separately from MIME image and attachment descriptors. Reuse existing world/account identifiers and tree file paging; do not add provider credentials, service dependencies, or a second graph/cache architecture.

## Revision Notes

2026-10-09: Created from the attached R1–R10 request after read-only source mapping. Rebuilt the stale Graphify code index; it was used only for navigation. Completed implementation and validation. Initial full-suite run had one timing-sensitive backend lifecycle failure under parallel load; isolated test and subsequent full run passed (122/122). Final read-only Reviewer approved aggregate-limit attribution and general/per-source progress labels. No commit, push, install, deployment, migration, real-provider call, or app restart performed.
