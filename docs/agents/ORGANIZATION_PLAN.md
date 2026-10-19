# Proposed FolderRocket organization plan

Status: proposal only. No source file was moved or reorganized. The user describes FolderRocket as operating; runtime was not independently observed. The current checkout had pre-existing dirty source, tests and plans, so any implementation must start from a separate copy/worktree with an explicit snapshot of that baseline. Restart, deployment, and data migration are outside this plan and need separate authorization.

## Ownership

- AppStarter: source inventory, path map, compatibility plan and rollback design; read-only for RUNNING analysis.
- Architect: read-only cross-cutting contracts and dependency decisions before changing shared boundaries.
- Backend: Express routes/services/database/filesystem and Electron main/preload/lifecycle/IPC.
- Frontend: React/TypeScript UI, client state, components and API consumption.
- AIEngineer: prompts, extraction, retrieval and AI context/quality.
- Coordinator: unassigned tests, docs, scripts/configuration and release coordination.
- Reviewer: read-only final check of every changed file and every R ID.

## Current path -> proposed destination

| Current path and evidence | Proposal (not existing unless stated) | Owner | References and checks | Rollback |
|---|---|---|---|---|
| backend/server.js:574-3519; one file has auth/world, Obsidian/graph, email/calendar, files/devices, desktop integration and Cargo Ship routes. | Keep server.js as app bootstrap, middleware and route registration. Extract one domain at a time into backend/routes/worldSettings.js, graph.js, obsidian.js, email.js, calendar.js, files.js, applications.js and desktop.js. Existing backend/services remains the business/service layer. | Backend; Architect approves shared contracts. | Update route imports/registration and tests that construct the server. Preserve middleware order, auth, request IDs, route order, error response shape and upload parser. For each extraction, run relevant backend tests, npm test, node --check server.js and npm run build; compare request/response contract tests. | Revert only that route extraction and its import/test edits from the isolated worktree; do not reset the whole checkout. |
| src/App.tsx:201-786 and :786-1044; world effects, switching, navigation, page composition and graph overlays are co-located. Existing components already separate major pages. | Keep App.tsx as the authenticated world shell. After measuring baseline and dependency mapping, consider extracting stable world lifecycle into src/hooks/useWorldSession.ts and page composition/navigation into src/workspace/WorldWorkspace.tsx. Do not split components that are already independently owned without evidence. | Frontend; Architect fixes the world/API contract if shared. | Update imports, props, effects and fixtures. Preserve user/world scoped storage keys, abort behavior for stale requests, event routing, lazy loading, page navigation and switch timing. Run focused frontend tests/fixtures, npm run lint and npm run build. | Restore only the extraction commit/block in the isolated worktree and rerun the same focused checks. |
| desktop/main.cjs:201-379, :390-459 and :618 onward; local backend lifecycle, windows and IPC coexist. desktop/preload.cjs is a separate narrow allowlist. | Keep main.cjs as the Electron entry/orchestrator. Consider desktop/backendProcess.cjs for start/readiness/stop and desktop/ipc/*.cjs for bounded handler groups. Keep preload.cjs explicit; do not create a generic unrestricted IPC bridge. | Backend (Electron owner); Architect reviews trust boundary. | Update require/import wiring and lifecycle tests. Preserve startup readiness, shutdown, origin checks, sandbox/contextIsolation/nodeIntegration settings and every IPC argument/return contract. Run backendLifecycle tests, node syntax checks and a manual isolated Electron smoke after authorization. | Revert the single extracted module and its wiring/tests; do not restart or replace the installed app as part of organization work. |
| CODEX.md legacy descriptions (e.g. :93 and :115-116) conflict with current UI/routes. | Reconcile the architecture sections in CODEX.md against PROJECT_MAP.md and current code; label future roadmap separately from implemented behavior. | Coordinator/AppStarter docs owner; reviewers verify source claims. | Search every claim before editing; add source references and date/revision; review documentation diff. No product build required. | Restore only the documentation edit if claims cannot be verified. |
| src/components, backend/services, backend/test, tests/ui already group meaningful domains. | Keep these areas in place. Do not move files for symmetry or create empty frontend/backend/shared directories. | Existing specialist owner. | Change only when a requirement proves a better boundary; update all imports and tests in the same small block. | Revert the single justified move/block. |

## Reorganization sequence

1. Create an isolated checkout/copy separate from the running app and current dirty working tree. Record the source revision, dirty-file inventory, runtime declaration, current build/lint/test results and any already-failing checks. Do not infer the installed app is identical to this checkout.
2. Reconcile the stale CODEX.md descriptions and confirm file/route ownership. Architect returns read-only decisions for any contract or data-boundary change.
3. Extract one backend route family at a time, starting with a bounded group whose current tests can prove parity. Avoid changing endpoint semantics while moving registration.
4. Extract Electron lifecycle/IPC only after route parity; keep preload capability allowlist stable.
5. Extract frontend orchestration only where a stable prop/state boundary is observable; do not change world storage or navigation semantics during a move.
6. After every block, run the same targeted tests and static checks as baseline. Stop on unexplained failure; distinguish baseline failures from regressions. Reviewer inspects each completed change in read-only mode.
7. Report path-level outcomes and residual checks. A successful build does not prove live OAuth, Gmail/Outlook, filesystem permission or installed Electron behavior.

## Baseline and acceptance

Before any future move, from the repository root run npm run lint, npm test and npm run build; from backend run node --check server.js. Add focused contract tests for any route or IPC family without existing coverage. The two documented source helper tests require Node 24+: node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs. Use tests/README.md fixtures for fake-data UI checks. The current task did not run these checks because it changed only agent configuration and documentation, not app source.

Accept an organization block only if all existing public routes, payload/error shapes, filesystem semantics, per-world scoping, user data locations and Electron security settings remain unchanged; relevant baseline checks pass; the rollback block is explicit; and the Reviewer finds no actionable issue.
