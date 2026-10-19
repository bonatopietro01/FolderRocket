# FolderRocket application logic and agent routing stabilization

## Purpose

Correct reproducible logic and workflow defects across FolderRocket, prioritizing Planet Graph and its local Markdown knowledge network. Preserve the current page organization, improve the named page flows, restore seven recognizable planet styles, and make skill/agent routing more reliable in Codex and in the app's local knowledge workflow.

## Starting state and constraints

- Branch at intake: `feature/desktop-foundation`.
- The checkout already contains extensive tracked modifications and untracked files, including prior graph, vault, local-model, conversation, Tree Rocket, UI, agent and skill work. Preserve every item; do not reset, clean, broadly revert, commit or push.
- The prior plan `docs/plans/full-interface-local-knowledge-2026-10-12.md` is retained as history. This document is the only ExecPlan for the current follow-up.
- Do not inspect personal files, credentials, real mail accounts or the user's custom vault. Use synthetic fixtures and temporary directories.
- User operations on files remain explicit. Local knowledge and consultation may run automatically. Do not download or auto-start a model, make automatic remote AI calls, or send communications.
- Reviewer is read-only; permit at most one focused correction/re-review cycle. Visual and fresh-session behavior must be reported as unverified if no permitted runtime can demonstrate it.

## TaskState

| ID | Acceptance condition | Owner | Dependencies | Status / evidence |
|---|---|---|---|---|
| R1 | Map named app flows through UI, state, API, services, persistence and Electron; record scope and evidence limits. | Coordinator | Baseline | COMPLETE — source map and read-only Architect/Frontend/Backend/AIEngineer reports recorded; baseline Git status preserved. Live page rendering is explicitly unverified. |
| R2 | Reproduce defects D1… with setup, steps, observed/expected output, severity and evidence; separate bugs from hypotheses/environment limits. | Coordinator + relevant owner | R1 | COMPLETE — D1–D11 distinguish source/test-confirmed defects from the sandbox constraint in D9; focused and full synthetic backend tests were run. |
| R3 | Trace confirmed failures to causes and prioritize data integrity, isolation, unsafe file operations and blocked workflows. | Coordinator + Architect | R2 | COMPLETE — Architect mapped ordering, freshness, generation coalescing, custom-vault partial writes and watcher boundaries; final review also identified and closed D10–D11. |
| R4 | Apply narrow fixes for confirmed in-scope defects, preserving existing behavior and agreed cross-module contracts. | Frontend / Backend / AIEngineer | R3, contracts | IMPLEMENTED — frontend, local retrieval semantics, graph pipeline, migration persistence, and retryable error recovery are covered by focused and full tests; read-only re-review pending. |
| R5 | Preserve user/world/account/source/conversation scope, canonical path containment, copy/move semantics and manual notes. | Backend + Coordinator | R4 | VERIFIED — synthetic isolation, containment, manual-note, per-planet account, and vault migration checks pass; real user data was not accessed. |
| R6 | Prove changed behavior with input/output, API/service/UI tests; run relevant repo gates and record pass/fail/skip/unavailable accurately. | Coordinator + owners | R4 | COMPLETE — full backend `npm test` 166/166; focused frontend and hook tests 25/25; workspace regressions 16/16; build, lint, JS syntax and diff check pass. Full backend suite needed an elevated run for loopback and junction fixtures. Rendered UI and native hook session remain unavailable. |
| R7 | Maintain one TaskState/ExecPlan, owners, dependencies, skill usage and evidence; use current roles and non-overlapping writers. | Coordinator | Baseline | COMPLETE — this is the sole new ExecPlan; Architect, Frontend, Backend, AIEngineer and Reviewer had separate scopes; skill usage and evidence recorded. |
| R8 | Obtain independent read-only review of actual diff and evidence; at most one focused fix/re-review cycle. | Reviewer | R4, R6 | COMPLETE — first review returned two graph error-state findings; the focused correction was re-reviewed read-only, with no remaining concrete blockers. |
| R9 | Make Planet Graph use one ordered, revision-safe pipeline; explicit readiness/progress/revision; current partial evidence queryable; no stale publication. | Backend + Frontend + AIEngineer | Architect contract | VERIFIED — readiness/revision, ordered indexing, latest-generation queue, partial source retention and query gating have focused behavior coverage; graph failure now exposes retryable source states and `error` readiness. |
| R10 | Materialize real per-user/per-planet Markdown; valid links and distinct structural/evidence links; protect custom vault/manual notes; exclude generated roots canonically. | Backend + AIEngineer | R9, R5 | VERIFIED — scoped managed Markdown, resolvable links, structural/evidence separation, idempotency, manual-edit protection, partial-vault gating and migrated-vault path persistence pass synthetic tests. |
| R11 | Add deterministic local worker routing and selected-folder change monitoring; incrementally reprocess changed files only; no remote calls in local workflow. | Backend + AIEngineer | R9, R10 | VERIFIED — optional loopback model and extractive fallback remain local-only; selected-root watch, 2s debounce, 5m metadata polling, disposal and generated-root exclusion tests pass. |
| R12 | Restore seven distinct hybrid planet styles at 32px/98px across shared surfaces; retain saved IDs/preferences. | Frontend | R1 | IMPLEMENTED — seven-way mapping and style CSS updated; saved IDs preserved in existing settings contract. Frontend fixtures cover compact/large shared surfaces; rendered visual comparison unavailable. |
| R13 | Improve all named pages within current organization, with reachable actions, correct context and recoverable loading/error/empty states. | Frontend | R1, R4 | PARTIAL — Planet Graph partial/readiness UI and Tree Rocket card interaction corrected; other named-page changes are present in the heavily modified baseline but lack a fresh end-to-end render check. No browser surface was available. |
| R14 | Make skills discoverable from one canonical `.agents/skills` source, add minimal trusted native routing hooks and verify real fresh-session positive/negative cases. | Coordinator | R7 | PARTIAL — moved all 32 skill files across 14 folders to `.agents/skills`; SHA-256 manifest matches pre-migration; `Handoff` case and metadata/resources preserved. Active references point to the catalog and `.codex/skills/README.md` is a compatibility pointer. Three native events and synthetic positive/negative tests are configured. Codex `/hooks` trust and native fresh-session execution are not yet reviewed or observed. Empty legacy folder shells were removed after verifying there were no skill files left. |

## Confirmed defect register

| ID | Reproduction / observed result versus expected | Severity | Evidence and status |
|---|---|---|---|
| D1 | Enable a planet graph with current retained source notes and request the summary; the API returned `knowledgeStatus`/`queryable` without public `readiness`, while `ChangeWorld` gated graph entry on `readiness === "ready"`. Expected an explicit current state and graph entry for queryable partial evidence. | High | `backend/server.js` graph summary, `planetKnowledgeService.js`, and `ChangeWorld.tsx`; readiness and partial-query fixtures pass. |
| D2 | Change selected folder contents or the source selection during an active knowledge job; indexing and knowledge sync were separate and outdated work could publish. Expected current graph revision and only the newest selected scope to publish. | High | Architect source trace; `planetKnowledgePipeline.test.js` proves active/pending generation ordering, replacement and serialization; backend graph contract regression passes. |
| D3 | Cause one selected source to fail while another succeeds, then sync Obsidian; the prior flow could write partial records into the user vault. Expected the last complete user vault revision to remain until a complete replacement. | High | `backend/server.js` knowledge publication and `backend/services/obsidianVaultService.js`; last-complete gating added and covered by `backend knowledge sync rebuilds complete snapshots and isolates unsupported sources`. |
| D4 | Select a source folder containing the managed output or configured vault; baseline exclusion covered only configured vault paths and lacked a canonical always-managed Markdown root. Expected generated output never to re-enter source intake. | High | Architect trace; canonical paths, fingerprint and exclusion checks in `server.js`, `planetKnowledgeService.js`; regression `configured Obsidian vault paths are excluded from knowledge candidates and invalidate retained knowledge`. |
| D5 | Edit a selected folder after indexing and leave the workspace open; `/knowledge` reported `automaticWatcher:false` and no selected-folder watcher ran. Expected a local incremental refresh, batched at 2 seconds with a 5-minute metadata fallback. | Medium | `selectedFolderWatcher.js`; tests cover batching/disposal, five-minute polling, nested metadata changes, and case-insensitive generated-root exclusion. |
| D6 | Build area hubs and retrieve a fact; membership alone could be confused with evidence and used to infer/cite a relation. Expected membership edges to organize the graph only, with factual answers backed by content evidence. | High | AIEngineer report; `backend/services/localKnowledgeEngine.js` labels `structural-membership` separately from `content-evidence`; 13 focused local engine tests pass. |
| D7 | Open the planet selector/style surfaces for each saved style; five variants resolved to the same blue artwork and CSS reset variant-specific treatments. Expected seven distinguishable saved identities at compact and large sizes. | Medium | Frontend source audit; `ChangeWorld.tsx`, `worlds.css`, `worlds.ts` updated; `planet artwork fixture covers all seven saved styles in compact and large shared surfaces` passes. Rendered comparison unavailable. |
| D8 | Click the body of a Tree Rocket folder card, outside its nested buttons; it did not open. Expected pointer and keyboard activation of the card with nested actions independent. | Medium | Frontend source audit; `TreeRocket.tsx` body pointer/Enter/Space behavior and independent action handling added; focused fixture passes. Rendered interaction unavailable. |
| D9 | Run authenticated local-server and Windows junction regressions under the restricted sandbox; loopback access and junction creation were denied. | Environment | The restricted run could not execute these OS operations, but the full synthetic backend suite passed outside the sandbox with approved elevated access. This was not an application defect. |
| D10 | Rename a planet after creating its verified legacy vault, then sync; migration copied the vault to the planet-named path but did not persist that path before the source-scope check, so sync returned 400. Expected the migrated vault to remain selected and manual notes to survive. | Medium | `backend/server.js` Obsidian sync; integration now verifies migration, active path persistence, full selected-source readiness and manual-note preservation. |
| D11 | Force graph indexing to fail while sources are marked indexing; graph status became error but source Retry stayed disabled and readiness omitted the graph error. Expected retryable source failures and explicit error readiness. | Medium | Read-only Reviewer finding; `failIndexingSources`, graph error mapping and unit regressions added; focused and full suite pass. |

## Surprises and discoveries

- The baseline readiness contract and generation ordering defects are corrected; API/service and UI fixtures cover explicit readiness, revision freshness, and newest-pending publication.
- The integration test exposed a verified legacy-vault migration that copied to a renamed planet folder without persisting the new path. Sync now updates that setting only if no concurrent settings change occurred.
- The first independent review found that internal graph failures left source controls stuck in `indexing`; source retries now become enabled and graph error is surfaced in readiness.
- Existing local extraction remains deterministic; the optional model runtime is loopback-only. Selected folder monitoring now uses a bounded watcher plus a metadata fallback.
- Skill migration is a user-authorized change to many currently untracked files and active instruction references; preserve directory contents and update only active references, leaving historical plans intact.
- The `.codex/skills` and descendant skill directories were Windows OneDrive reparse points. Direct sandboxed moves failed; moving the 32 files within the repository required the bounded elevated operation. Their SHA-256 path/content/length manifest before and after is identical (`52C2091F6AF00C94AA84B54B82D4D97416BDAA7FBB42D90098207770D3DE3D39`). Empty old folder shells were removed only after confirming the compatibility README was the sole remaining file.

## Decision log

- 2026-10-13: Keep existing app sections/navigation and improve flows in place.
- 2026-10-13: Local generative model is optional, separately installed/configured, with extractive fallback; no automatic download/start or remote AI calls.
- 2026-10-13: Automatic app work is limited to local knowledge and consultation; user file operations remain explicit.
- 2026-10-13: Selected folder changes are watched while the app is open; batch events for 2 seconds and use a 5-minute metadata fallback.
- 2026-10-13: Current successful source evidence remains queryable in partial results, with failed/incomplete sources visible.
- 2026-10-13: Markdown output is managed per authenticated user and planet; the custom vault keeps its latest complete revision and manual edits.
- 2026-10-13: Use seven distinct hybrid planet identities while preserving existing IDs and preferences.
- 2026-10-13: Keep six current development roles and the separate Prompt Agent; do not recreate Analyzer, Writer or Debugger.

## Context and orientation

- Frontend: `src/App.tsx`, `src/components/`, `src/App.css`, `src/worlds.css`, `src/worlds.ts`.
- Backend: `backend/server.js`, `backend/services/planetGraphService.js`, `planetKnowledgeService.js`, `localKnowledgeEngine.js`, `obsidianVaultService.js`, and related tests.
- Agent/skill configuration: `AGENTS.md`, `CODEX.md`, `PLANS.md`, `.codex/agents/`, `.agents/skills/`; `.codex/skills/README.md` is a compatibility pointer.
- Current key interfaces: `/worlds/:worldId/graph?summary=1`, `/graph/index`, `/knowledge`, `/knowledge/sync`, `/knowledge/query`, `/knowledge/jobs/:jobId`, and Obsidian sync routes.
- Source and prior-plan descriptions must be verified against current implementation. Graphify is a code relationship aid, not Planet Graph data.

## Plan of work

1. Complete the source map and capture red-capable regressions for confirmed graph, local watcher, and page defects. Record D IDs and evidence before fixes; reuse existing fixtures when they exercise behavior rather than source text.
2. Architect agrees readiness, generation, source revision, Markdown and worker interfaces. Backend and AIEngineer implement the local orchestration, canonical managed-note publication, scope-safe incremental refresh, and bounded watcher; frontend wires explicit states and recovery to the existing routes.
3. Correct the named page flows and planet family in the narrowest owning frontend modules. Keep saved planet identifiers/preferences and app navigation unchanged.
4. Migrate skills to `.agents/skills` intact, leave a compatibility README, update active instructions/agent configs, then add local read-only Codex hooks. Do not bypass platform trust. Test a fresh session only if the runtime can provide one.
5. Run focused regressions first, then the prescribed backend syntax, `npm test`, `npm run lint`, `npm run build` and `git diff --check`. Verify rendered UI and session routing where surfaces permit. Reviewer checks the actual complete diff read-only.

## Interfaces and dependencies

- Graph summary must expose `readiness` with `disabled`, `indexing`, `preparing`, `stale`, `empty`, `partial`, `ready`, `error`, plus revision/progress and `queryable` derived from current retained evidence documents.
- Knowledge result must identify managed Markdown path, revision, status, updated time and completeness. Canvas, retrieval and Markdown projection use the same published revision.
- Keep existing routes where possible. Internal worker registry uses typed, bounded capabilities for selected-source indexing, extraction, optional local summary/fallback, organization, retrieval, Markdown materialization and Obsidian export.
- Active work is keyed by authenticated user and planet plus desired fingerprint. Equivalent requests coalesce; one newest follow-up may queue; stale generations cannot publish. Cancel clears active/pending work, retries are bounded.
- File watcher is limited to selected roots and disposed on scope/session change; debounce 2 seconds and metadata fallback 5 minutes; maximum one heavy pipeline per backend process.
- Custom Obsidian export stays at the last complete revision on partial/error. Prune only unchanged manifest-owned notes; preserve manual edits and generated data from source ingestion.
- Skill migration preserves all 14 skill directories, resources, metadata, case and provenance. Historical documents remain historical; active instruction paths are updated.

## Validation and acceptance

- API/service regressions: missing readiness contract, first-run indexing through visible notes without a second click, selected-source update, scope change during active job, latest-generation coalescing, stale-publication prevention, partial success/gaps/retry, cancel/pause, empty/error recovery.
- Markdown/vault regressions: managed path containment and isolation, all wikilinks resolve, structural links cannot be retrieved as evidence, repeated sync is idempotent, manual edits survive, partial results do not replace custom vault's last complete revision, generated roots are not re-ingested.
- Watcher/local AI regressions: selected roots only, 2-second batching, metadata fallback, disposal on scope change, changed files only, local runtime stub/failure, extractive fallback, no remote request.
- UI regressions: every named page's action/state flow, desktop/narrow/short viewport where rendered tooling is available; seven planets recognized at 32px and 98px across cards, header, selector and style picker.
- Codex routing checks: canonical skill paths and all references; hook configuration/schema and trust state; fresh-session positive prompt/bug/handoff/grilling cases and negative unrelated cases. Report unavailable runtime capabilities rather than claiming execution.
- Final evidence table links each R ID and D ID to changed paths and exact checks. Separate passed, failed, skipped, not-run and environment-limited results.

## Idempotence and recovery

- Re-running source indexing with unchanged descriptors must not re-extract unchanged content or create duplicate notes/links.
- Knowledge publication is atomic and scoped to a generation; interrupted or obsolete generations retain the last good complete result.
- Retain only bounded current and last-complete snapshots; incomplete or failed work never prunes user-managed content.
- Skill migration is rerunnable: if the canonical target already exists, compare contents and stop rather than overwrite or delete divergent files.

## Progress

- [x] (2026-10-13) Captured dirty baseline on `feature/desktop-foundation`; confirmed tracked and untracked changes must be preserved.
- [x] (2026-10-13) Read requested skills and began current-source audit; confirmed readiness contract mismatch and missing automatic watcher in inspected path.
- [x] (2026-10-13) Ran focused graph/knowledge/vault baseline in a writable task temp root: 39 passed, 1 failed at local server loopback readiness, 1 skipped because Windows sandbox denied junction creation (`EPERM`).
- [x] (2026-10-13) Architect completed read-only contract review for R9–R11 and R14; findings recorded above.
- [x] (2026-10-13) Completed R1–R3 source tracing and D1–D11 evidence register, including the two additional review/integration findings.
- [x] (2026-10-13) Verified R9–R11 graph pipeline, Markdown, vault migration and watcher behavior with focused tests and the full backend suite.
- [x] (2026-10-13) Verified R12–R13 available nonvisual fixtures and layout/source checks; rendered desktop/narrow/short page review remains unavailable.
- [x] (2026-10-13) Migrated and checked skills; synthetic hook routing passes, while platform trust review and a native fresh-session observation remain unverified.
- [x] (2026-10-13) Completed the one read-only review/correction/re-review cycle; reviewer reported no remaining concrete blockers.
- [x] (2026-10-13) Final validation: backend suite 166/166; focused frontend/hook tests 25/25; workspace regressions 16/16; build, lint, syntax and `git diff --check` passed.

## Artifacts and notes

- Baseline is the pre-existing Git status and diff summary in the active task record; do not replace it with a clean-checkout assumption.
- Current source evidence: `backend/server.js` `knowledgeReadiness()` and the graph summary route; knowledge sync job queue; the baseline `/knowledge` response reported `automaticWatcher:false`.
- No real account, vault or user document has been accessed.

## Revision notes

- 2026-10-13: Created this follow-up ExecPlan to preserve the completed 2026-10-12 plan and track the newly authorized R1–R14 work.
