# Adapt FolderRocket development agents and record a safe application map

This ExecPlan follows PLANS.md. It records the delivered agent setup and a proposed code-organization plan; it does not authorize moving application code or changing the running installation.

## Purpose / Big Picture

Configure the six requested development roles in the repository's existing Codex TOML format, include their shared skills, map the current FolderRocket architecture from source, and prepare a safe current-path-to-target-path organization proposal. The user reports that the application is operating; this task must not alter its source behavior or process lifecycle.

## Progress

- [x] (2026-10-09 08:46Z) Read the existing project rules, relevant docs, manifests, role specifications and skills; recorded the pre-existing dirty checkout.
- [x] (2026-10-09 08:46Z) Added six role configurations and the three project-local skill copies; updated the project routing rules and collaboration index.
- [x] (2026-10-09 08:46Z) Added source-backed application map and a reversible organization proposal.
- [x] (2026-10-09 08:53Z) Validate agent configuration structure, artifact presence and whitespace; close the focused independent read-only review.
- [x] (2026-10-09 08:46Z) No application source, user data, active process, deployment or migration was touched.

## Surprises & Discoveries

- The repository already had five Codex agent TOMLs: analyzer, writer, debugger, prompt_agent and reviewer. The first four had pre-existing local modifications before this task. Reviewer is the only direct role equivalent and is updated in place; the other configurations are preserved and the new README explains the compatibility boundary.
- The current code is more capable than parts of CODEX.md describe. It claims some source panels and search/results are placeholders, but current App.tsx and backend routes implement those flows.
- Graphify was not used because current source inspection was sufficient and freshness was not established for this dirty working tree.
- The user-declared running state was not independently probed; runtime state remains unknown.

## Decision Log

- Use the existing .codex/agents/*.toml layout rather than creating a second role configuration format. This preserves local model and sandbox conventions.
- Keep gpt-6-luna for the new roles; use read-only sandboxes for Architect and Reviewer. Backend is also the explicit owner of Electron because no desktop specialist was requested.
- Preserve existing analyzer/writer/debugger/prompt_agent files rather than delete or rename them. The new collaboration README routes the requested development workflow through the six configured roles.
- AppStarter is configured to treat RUNNING analysis as read-only; any future reorganization must use an isolated checkout/copy, baseline, small blocks and explicit authorization.
- Do not run build, tests, Electron, Graphify generation, package, or external provider checks for this documentation/configuration task. These could mutate generated state or interact with the active app and are not needed to validate the edited TOML/docs.

## Outcomes & Retrospective

Six project TOML configurations, three project-local skill copies, a coordination README, a source-backed project map, an organization proposal, and this ExecPlan are present. AGENTS.md now points to the six-role workflow. No application code was moved or changed. Structural checks, artifact presence, whitespace validation, source-hash provenance notes, and the focused Reviewer re-review are recorded below. A standards-compliant TOML parse and fresh-session Codex load were unavailable and are not claimed.

## Context and Orientation

The application map is docs/agents/PROJECT_MAP.md and the proposed organization is docs/agents/ORGANIZATION_PLAN.md. Agent configuration and routing are under .codex/agents; skills live under .codex/skills. The application uses src/ React/TypeScript/Vite, backend/ CommonJS/Express, and desktop/ Electron. backend/server.js is the server entry, src/main.tsx mounts the UI and desktop/main.cjs starts Electron plus the local backend.

The initial git status already showed modified application source, tests and documentation. Those unrelated changes belong to the user and must remain untouched. Do not reset, stage, or clean the working tree.

## Plan of Work

1. Compare user-provided specifications and existing agent configurations, preserving valid model and safety customizations.
2. Add project TOMLs for AppStarter, Architect, Backend, Frontend and AIEngineer; update the existing Reviewer config in place.
3. Copy the three requested skills into the repository using relative paths and document their provenance.
4. Update AGENTS.md and add the coordination README, source map and isolated organization plan.
5. Validate only the agent/doc artifacts and ask Reviewer for a read-only audit. Do not touch application code, user data, running processes, deployments or integrations.

## Concrete Steps

Working directory: repository root, C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp.

Read-only discovery commands included git status --short, rg --files, targeted rg -n over source and manifests, and reading README.md, AGENTS.md, CODEX.md, PLANS.md and tests/README.md. The exact application checks available from package scripts are npm run build, npm run lint and npm test; backend syntax check is node --check server.js from backend. They are not required for changes limited to agent configs and documentation.

## Validation and Acceptance

- All six expected TOMLs use the existing keys and pass structural checks for required fields, duplicate keys, and balanced instruction strings. A standards-compliant TOML parser/runtime load was not available and is not claimed.
- Architect and Reviewer remain read-only; Backend covers Electron ownership; AIEngineer does not own credentials/gateway; AppStarter describes RUNNING safeguards.
- Every configured role links only to skills present in the project and preserves requirement IDs across handoffs.
- Project map claims cite current source paths/lines; stale documentation is labelled as drift, not treated as runtime truth.
- Organization paths are explicitly proposals; no application file was moved.
- Fresh-session loading and live app behavior are not claimed unless separately observed.

## TaskState

This table is the authoritative requirement register for this task. IDs remain stable across discovery, implementation, and review. Status values: `DONE`, `IN_REVIEW`, `NOT_VERIFIED`, or `NOT_STARTED`.

| ID | Acceptance criterion | Owner | Depends on | Status | Evidence |
|---|---|---|---|---|---|
| R1 | Inspect current project instructions, structure, source entry points, build/test commands, existing role configs, and supplied specifications before edits. | AppStarter | None | DONE | `docs/agents/PROJECT_MAP.md`; checked `AGENTS.md`, `CODEX.md`, `README.md`, `PLANS.md`, package manifests, source, tests, and existing `.codex/agents/*.toml`. |
| R2 | Create/update AppStarter, Architect, Backend, Frontend, AIEngineer, Reviewer in the adopted project config format; preserve valid existing equivalent-role customizations and avoid duplicate/renamed roles. | Coordinator; Reviewer read-only verification | R1 | DONE | Six files under `.codex/agents/`; existing `reviewer.toml` updated in place; pre-existing `analyzer`, `writer`, `debugger`, and `prompt_agent` preserved and documented as non-default legacy/separate routes. |
| R3 | Integrate all three supplied skills and document role coordination, scope routing, and requirement-ID handoffs. | Coordinator | R1, R2 | DONE | `.codex/skills/agent-configuration/SKILL.md`, `requirement-traceability/SKILL.md`, `project-graph-context/SKILL.md`; `.codex/agents/README.md`; `AGENTS.md`. |
| R4 | Configure AppStarter `RUNNING` behavior as read-only inventory, evidence-backed organizational findings, and a justified current→target map with references, owners, checks, rollback. | AppStarter; Architect verifies cross-module boundaries | R1 | DONE | `docs/agents/PROJECT_MAP.md` and proposal-only `docs/agents/ORGANIZATION_PLAN.md`; running state is user-declared, not independently probed. |
| R5 | Keep any future code reorganization isolated and reversible; do not alter the active app, restart, deploy, or migrate data in this task. | AppStarter; coordinator | R4 | DONE | No application source, runtime/user data, active process, deployment, or migration touched; organization plan requires separate checkout/copy and baseline. |
| R6 | Validate the configuration artifacts and obtain a final independent read-only review; report any unavailable fresh-session/runtime checks precisely. | Coordinator; Reviewer | R2, R3, R4, R5 | DONE | Structural TOML checks, expected artifact presence, whitespace check and `git diff --check` passed. Reviewer first requested this auditable TaskState; focused re-review approved it with no new material defects. Full TOML parser and fresh Codex session loading remain unavailable. |

### Work packages

| Package | Requirements | Owner | Dependency | State |
|---|---|---|---|---|
| P1 — Source-backed inventory | R1, R4 | AppStarter | None | Complete |
| P2 — Six role configurations and routing | R2, R3 | Coordinator; Reviewer checks read-only | P1 | Complete |
| P3 — Map and reversible organization proposal | R4, R5 | AppStarter; Architect boundary review | P1 | Complete |
| P4 — Artifact validation and review | R6 | Coordinator; Reviewer | P2, P3 | In review |

## Idempotence and Recovery

The changes are additive except for updating the existing Reviewer configuration and the agent-routing section of AGENTS.md. To recover a configuration-only mistake, restore only the specific files listed in the final diff from the pre-task version; preserve all pre-existing dirty files. Do not use broad reset/clean commands. No runtime data or installed-app files are changed by these artifacts.

## Artifacts and Notes

- .codex/agents/*.toml
- .codex/agents/README.md
- .codex/skills/{agent-configuration,requirement-traceability,project-graph-context}/SKILL.md
- docs/agents/PROJECT_MAP.md
- docs/agents/ORGANIZATION_PLAN.md
- AGENTS.md
- docs/plans/folderrocket-agent-setup-2026-10-09.md

## Interfaces and Dependencies

The configuration uses the existing Codex TOML keys name, description, model, model_reasoning_effort, sandbox_mode and developer_instructions. It adds no runtime dependency or application endpoint. The skills are plain Markdown and have no package/runtime dependencies.

## Revision Notes

2026-10-09: Initial plan and implementation artifacts for the user-requested six-role setup and RUNNING-mode source map. Added R1–R6 TaskState after Reviewer requested auditable requirement coverage; focused re-review approved at 08:53Z.

## Follow-up: integrate the supplied Full_stack_pack export

This follow-up applies the updated pack to the existing project role configuration. It preserves the established FolderRocket TOMLs and adapted shared skills instead of creating a parallel agent-kit. The supplied export includes five general role documents; the existing AppStarter and Prompt Agent remain project-owned configurations. FolderRocket has no Evaluation Agent or AgentOptimizer, so pipeline-benchmark remains a procedure owned by the coordinator or a specifically assigned role.

### Progress

- [x] (2026-10-09 15:38Z) Read the pack instructions, role documents, skill catalog, and the current project configurations; confirmed that the project already had adapted versions of all five supplied roles.
- [x] (2026-10-09 15:44Z) Added the ten missing skill folders and their support resources; preserved the three FolderRocket-adapted shared skills and existing Handoff content.
- [x] (2026-10-09 15:44Z) Added role-specific skill routing, updated test-command gates to require a user request, and refreshed source provenance for the current pack versions.
- [x] Applied the first review's two documentation corrections: verified the earlier AppStarter source hash and removed the stale legacy Writer reference from Prompt Agent guidance.
- [x] Focused final read-only re-review approved the corrections with no remaining findings.

### Follow-up TaskState

| ID | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| R7 | Compare the supplied pack with current role configurations, preserving FolderRocket ownership, safety constraints, and existing roles. | SATISFIED | Updated `.codex/agents/*.toml` routing in place; kept the current AppStarter and Prompt Agent; no legacy or Evaluation roles added. |
| R8 | Make the complete 14-skill library and required support files available at the project's skill location without overwriting adapted files. | SATISFIED | `.codex/skills/` now has 14 skill folders; ten were added with their support files, Handoff content was retained, and three customized skills were not replaced. |
| R9 | Document skill triggers, unavailable runtime roles, and source provenance accurately. | SATISFIED | `.codex/skills/README.md` describes routing, support assets and limits; `.codex/agents/README.md` records current source hashes and clarifies that configuration files do not activate a runtime. |
| R10 | Obtain a strict read-only review of the file changes and report checks without claiming application behavior. | SATISFIED | Reviewer approved the focused re-review with no remaining findings. No app build or tests were run because this change is limited to agent documentation/configuration and the user did not request testing. |

### Follow-up validation limits

No application code, runtime process, user data, external integration, or credentials were touched. The added `.codex/agents/*.toml` files are not proof that a fresh Codex session loads these roles or skills. The Bash bug-loop template is documentation only and was not executed. Application tests, build, lint, and visual checks were not run.
