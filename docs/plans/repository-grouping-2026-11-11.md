# Functional folder grouping and legacy cleanup

This ExecPlan follows PLANS.md. The coordinator owns this document.

## Purpose / Big Picture

Complete the user-approved grouping of remaining frontend files and backend services, updating every consumer while preserving behavior. Work takes place on the explicitly authorized `reorganization-project` branch. No commit or push.

## Progress

- [x] Recorded initial dirty state and patch in ignored `node_modules/.cache/reorganization/`.
- [x] Baseline build passed; root and backend suites have existing failures (logs in the same cache).
- [x] Architect reviewed boundaries and runtime-path risks.
- [x] Frontend and backend files moved with all imports rebased (108 recorded moves including the earlier 10).
- [x] Tests, fixtures, documentation and legacy cleanup updated.
- [x] Post-change build, lint, syntax, path-resolution and full-suite comparisons completed.
- [x] Independent read-only final review: APPROVED, DEEP, no actionable findings.

## Surprises & Discoveries

Earlier grouping edits are already present and must be preserved. Baseline root suite: 149 tests, 140 passing, 9 failing. The services runtimePaths and windowsTask derive paths from their own locations; keep those files stable. Shared drag contracts cross feature folders and must resolve to the same modules after moves.

## Decision Log

- 2026-11-11: Keep src/backend/desktop entrypoints and package boundaries. Group internal files only; no route extraction or lifecycle redesign.
- 2026-11-11: Frontend owns src; Backend owns server/services and necessary desktop references; coordinator owns tests, scripts, cleanup and docs. One writer per area.
- 2026-11-11: Keep tested but runtime-unused planetGraphQuery pending product decision. Remove confirmed superseded PNGs and one-off patch script; archive the standalone manual mover with corrected paths and a warning rather than discard possible manual functionality.

## Context and Orientation

Frontend groups: file-studio, file-browser, dashboard, mail, devices, search, daily-work, diagnostics, settings, shared, file-workflows, applications, auth, calendar and sources. Existing conversation and planet-knowledge folders remain. Planet state belongs under src/planets. Backend services group by files, integrations, conversations, planet-knowledge, auth and diagnostics; shared runtime helpers remain at services root.

## Plan of Work

Move files without changing logic; rebase relative imports and path-dependent filesystem references. Owners provide machine-readable old-to-new maps in the ignored cache. Coordinator applies maps to tests and fixtures by resolving paths, updates textual source references in docs and adds a cleanup ledger. Preserve all entrypoint, security, world-scope, storage, token and copy/move semantics.

## Concrete Steps

Record `git status --short` and baseline `npm run build`, `node --test tests/*.test.mjs`, `npm test`. After moves, update all consumers, run the same checks plus lint, `node --check backend/server.js`, and `git diff --check`. Compare failures by test name with the baseline, repairing only move-related regressions.

## Validation and Acceptance

R1: approved groups exist with real files. R2: imports resolve and build passes; relevant tests gain no move-related failures. R3: README, docs index and source references describe the actual tree. R4: baseline edits preserved and no data, secrets, commit or push changes. R5: legacy removals have a documented reason; uncertain code retained or archived. A manual Electron/provider workflow remains for the user; static checks do not establish live behavior.

## Idempotence and Recovery

Maps record each original and resulting path. Stop if a destination exists unexpectedly. Recover a move by reversing its map and reference edits only, preserving baseline content. Do not reset/clean the working tree. Baseline patch and verification logs stay ignored.

## Artifacts and Notes

TaskState: R1 Frontend/Backend SATISFIED (real groups and maps); R2 coordinator SATISFIED for move compatibility with baseline failures still open; R3 coordinator SATISFIED (actual tree and move/cleanup ledger); R4 all owners SATISFIED (content proof, initial patch preserved, no commit/push); R5 coordinator SATISFIED (five unused assets and one-off patch removed, manual mover archived, uncertain query retained). Handoffs: Architect -> owners (path-only contract); owners -> coordinator (maps); coordinator -> Reviewer (final diff and logs). Each owner returned APPLIED safe-refactor, folder-structure, codebase-design and requirement-traceability usage.

Skill usage: `.agents/skills/safe-refactor/SKILL.md` APPLIED for behavior-preserving moves; `folder-structure/SKILL.md` APPLIED for path inventory; `codebase-design/SKILL.md` APPLIED for domain ownership; `requirement-traceability/SKILL.md` APPLIED for R1-R5 coverage. Owners return their own actual usage.

## Interfaces and Dependencies

No public API, persisted schema, dependency or IPC changes. Internal import paths change and all callers are updated. Runtime roots, CommonJS backend package and root Vite/Electron packaging remain compatible.

## Outcomes & Retrospective

Build and lint passed. Backend runtime relative require resolution reports zero missing targets; syntax checks passed for all backend services, server and Electron main/preload. Root suite: 149 tests, 141 passed, 8 failed (baseline 140/9). Backend suite: 203 tests, 189 passed, 12 failed, 2 skipped (baseline 185/16/2). No new failing test names versus baseline. Remaining failures include environment-dependent startup/filesystem tests and existing source-expectation mismatches; they were not altered to hide failures. Full logs are under ignored node_modules/.cache/reorganization. Git diff whitespace check passed. Content comparison of 108 moved files against HEAD, normalizing only relative import paths, found only the worlds.css background-image URL adjustment; it resolves to the same asset. Manual app/provider checks remain for the user.

## Revision Notes

2026-11-11: Created for explicit execution request, consolidating remaining grouping work. Final Reviewer approved R1-R5 with no actionable findings; baseline failures and manual verification limits remain explicit.
