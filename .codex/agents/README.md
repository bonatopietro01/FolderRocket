# FolderRocket development-agent configuration

The runtime reads role configurations from `.codex/agents/*.toml` and procedures from `.agents/skills/<skill>/SKILL.md`. See the [canonical path map](../../AGENTS.md#canonical-paths-for-agents-and-skills). `.codex/skills/` is only a compatibility pointer, not a second skills installation.

The six development TOMLs are project-level Codex agent configurations: AppStarter is adapted from an earlier source, while Architect, Backend, Frontend, AIEngineer, and Reviewer adapt the corresponding Full_stack_pack specifications. The separate prompt_agent.toml adapts PromptAgent_General.md from that pack. They follow the existing .codex/agents/*.toml format. All 14 project skills are accessible to every role within its permissions. See [the skill catalog](../../.agents/skills/README.md) for activation and applicability. Source specifications remain upstream; TOMLs and skills are project adaptations.

## Configured roles

| Role | Configuration | Owner and trigger |
|---|---|---|
| AppStarter | app_starter.toml | New-app setup or requested architecture/organization mapping. In RUNNING mode, analyze read-only and propose isolated, reversible work; never reorganize the active source checkout. |
| Architect | architect.toml | Read-only decisions across API, persistence, security, world scope, or module boundaries. |
| Backend | backend.toml | Express/API, server services, persistence, filesystem, integrations, and Electron main/preload/lifecycle/IPC. |
| Frontend | frontend.toml | React/TypeScript UI, client state, layout and API consumption. |
| AIEngineer | ai_engineer.toml | Prompt semantics, extraction, retrieval and AI context/quality. Backend retains credentials, routes and provider gateway. |
| Reviewer | reviewer.toml | Read-only final review after file-changing work; never implements fixes. |

## Separate Prompt Agent

prompt_agent.toml adapts the Prompt Agent specification included in this Full_stack_pack. It is activated for explicit prompt-writing requests, stays read-only, and hands development work to the coordinator and current implementation owners; it is not an additional implementation role.

## Coordination

The main chat remains coordinator; these files do not autonomously start other agents. It owns the original request, TaskState, stable IDs R1…, dependencies, decisions, owners, status and evidence. For each ID record an observable acceptance criterion and preserve it across handoffs, including blocked or unverified items. The shared schema and workflow are in ../../.agents/skills/requirement-traceability/SKILL.md.

For a request to create or update agent configuration, first apply ../../.agents/skills/agent-configuration/SKILL.md. It governs equivalence checks, preservation and provenance; it does not make a TOML configuration load in a fresh session automatically. Select other procedures from ../../.agents/skills/README.md only when their triggers match; none widens a role's permissions.

Route only relevant work: AppStarter for structure, Architect for cross-cutting decisions, then one implementation owner per file/contract. Frontend and Backend agree API contracts before both sides change. AIEngineer joins only for AI behavior. Backend owns Electron because there is no separate desktop specialist. The coordinator owns unassigned tests, repository documentation, tooling and release coordination, unless a task assigns a different authorized owner. Reviewer concludes every file-changing task in read-only mode. Permit at most one targeted fix and re-review cycle.

For RUNNING applications, AppStarter's analysis is read-only. A later source reorganization requires a separate checkout/copy, baseline, small reversible blocks and explicit scope. Restart, deployment and data migration are separate actions. No role may infer permission for real accounts, email, file deletion, migration, external API usage, commit or push.

## Automatic routing by the coordinator

At every delegation require the role to complete the mandatory skill activation protocol in [.agents/skills/README.md](../../.agents/skills/README.md) before work and return actual `skill_usage`. The coordinator checks this gate before accepting any checkpoint; catalog-only reads or intended future skill use do not satisfy it.

At intake read the original request and project instructions, inspect the working-tree baseline before edits, and identify requirements and authorized actions. Follow explicit skill or agent requests when applicable; select other skills from the catalog by their triggers. Read each selected SKILL.md before using it. For multi-part work maintain TaskState using [requirement-traceability](../../.agents/skills/requirement-traceability/SKILL.md); keep one ExecPlan when PLANS.md requires it. Reuse verified context rather than remapping the whole application for every task.

| Trigger | Route | Gate before the next step |
|---|---|---|
| User asks to create/refine a prompt, including "fammi il prompt", "fammi un prompt", "fammi prompt" and "fai prompt per..." | Coordinator → Prompt Agent → coordinator | The coordinator must actually call Prompt Agent with the available agent tool, rather than only announce it. Each prompt assignment reads writing-for-agents and grilling, checks the decision frontier, and reports actual skill_usage. Before delivery, Prompt Agent returns either `READY` with a complete prompt or `DECISION_PENDING` with the facts and first unresolved decision frontier. For `DECISION_PENDING`, the coordinator applies grilling, asks each round and waits for the answers. When the frontier is empty, summarize the decisions and obtain the user's confirmation of shared understanding before resuming Prompt Agent and delivering the final prompt. Implementation follows only if the user also asked to execute it. |
| User asks for bootstrap, structure mapping or organization | Coordinator → AppStarter | Evidence-backed map and scoped proposal. RUNNING analysis is read-only; a requested reorganization follows the separate-copy/worktree rule. |
| Change crosses module/API/data/security/integration boundaries | Coordinator → Architect → implementation owner(s) | Accepted contracts, dependencies and exactly one owner per shared file/interface. |
| Scoped UI/client change | Coordinator → Frontend | Implemented behavior and pertinent verification linked to the assigned R IDs. |
| Scoped server/filesystem/persistence/Electron change | Coordinator → Backend | Implemented behavior, path/data safety and pertinent verification. |
| Prompt/extraction/retrieval/AI-context change | Coordinator → AIEngineer; Backend joins for gateway/credentials/routes | Agreed semantic/technical contract, authorized sources and evidence of behavior; model usage needs existing authorization. |
| Task changes only repository documentation/tooling/configuration | Coordinator owns implementation; specialists advise when relevant | Structural/content checks appropriate to the changed artifacts. |
| Task changed files | Coordinator → Reviewer → coordinator | Read-only review of the actual task changes and evidence; at most one focused owner fix and re-review. |
| User asks for handoff, retro or benchmark | Coordinator selects the corresponding skill and assigns an owner if useful | Requested artifact or measured result with scope, sources and limitations. |

Interpret the user’s intent: a real request to write a prompt dispatches Prompt Agent even if a lexical hook misses its wording. A report about routing that quotes "fammi il prompt", a negation, or a source example is not itself a new prompt-writing request. Hook output is a reminder and never overrides the original request.

Skip unrelated stages. A small obvious edit can stay with the coordinator, followed by the required Reviewer. A request naming an agent gets a scoped brief for that agent; preserve that role's permissions. The coordinator dispatches relevant roles without asking the user to repeat existing authorization. If a material user decision remains after source inspection, use grilling and collect questions through the coordinator; resume the dependent stage when the answer arrives. When no material decision remains, deliver the prompt without manufacturing questions.

Run agents in parallel only for independent packages with disjoint write ownership and settled shared contracts. Respect the actual runtime concurrency limit. Each implementation agent is not alone in the checkout: preserve changes by other agents and user edits, and report ownership conflicts to the coordinator before writing. When a shared file is required by two packages, sequence the writes or assign the file to one owner. The coordinator integrates results and owns the final completion claim.

## Skill access and handoff contract

All roles read [the skill catalog](../../.agents/skills/README.md). Role-specific lists in TOMLs are examples, not an access whitelist. Skills provide procedures; role permissions still apply. Read-only roles return proposed text/findings when a skill asks for writing, generation or execution. For an explicit skill request absent from the runtime catalog, resolve its local SKILL.md through the catalog and read it; report a missing source or tool instead of claiming execution.

Every delegated brief explicitly requires automatic skill selection, SKILL.md reads before work, and actual skill_usage in the return; Prompt Agent briefs require the two mandatory procedures and a decision-frontier result. Every delegated brief carries the original requirement IDs and acceptance criteria, scope/authorized sources, assigned files and ownership, settled contracts/decisions, dependencies, applicable skill references, existing-change baseline, and expected result/verification. Before an owner edits, it confirms that required dependencies and file ownership are clear.

Every return carries requirement status, changed files or read-only findings, decisions/contracts, skills actually read and applied, performed/failed/unavailable checks with evidence, remaining questions/blockers and the intended next owner. The coordinator merges these fields into TaskState `requirement_coverage`, `skill_usage`, `handoffs`, `validation` and `blockers`; agents return updates rather than concurrently overwriting the shared plan. Pending and unverified requirements survive every handoff. Routine transfers use this compact brief; the handoff skill creates a standalone continuation document when that artifact is requested.

Completion requires all in-scope requirements satisfied with appropriate evidence and the required review complete. Missing browser/live-provider/visual proof remains explicit. One unresolved review finding after the permitted fix cycle remains open in the final response; do not relabel it as success.

## Project boundaries

- Frontend: src/main.tsx, src/App.tsx, src/components, src/*.ts and UI styles.
- Backend: backend/server.js, backend/services, backend/ai, backend/database and backend/test.
- Electron: desktop/main.cjs and desktop/preload.cjs; Backend owns this area and must preserve the narrow IPC surface.
- Local-world state is keyed by user and planet. Preserve world isolation; provider tokens remain in the existing authentication/token system and are not planet settings.
- Filesystem access is sensitive. Preserve path validation and distinguish copy from move.
- Graphify is a static code-relationship aid. Planet Graph is FolderRocket product data. Never conflate them; Graphify findings need confirmation in current source.

## Validation commands

Pertinent verification is part of authorized implementation under AGENTS.md and current task instructions. Choose checks proportional to the change: documentation/configuration changes need parsing, references and content review; runtime code changes need relevant behavior checks and the prescribed repository gates. Reuse current results when code and inputs match; broaden only for a new change, failure or unresolved risk. Avoid tests that merely repeat wording or implementation. Read-only roles inspect evidence and run only checks compatible with their permissions; writing checks belong to the implementation owner/coordinator.

Use exact repository commands when relevant. From the root: npm run build (TypeScript project build plus Vite), npm run lint, npm test. From backend: node --check server.js for server changes. The documented focused source tests require Node 24 or newer: node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs. UI fixtures in tests/README.md use fake data and do not prove Electron or live-provider behavior. A separate type-check and formatting command are not specified.

Do not run the desktop command or packaging during a RUNNING analysis: npm run desktop builds and launches Electron; npm run desktop:package creates a Windows package. Never read or modify .env, backend/data, backend/uploads, input, output, release, personal files, user vaults, or credentials for an architecture inventory.

## Current role inventory

The current project configurations are AppStarter, Architect, Backend, Frontend, AIEngineer, Reviewer, and the separate Prompt Agent. The user removed the legacy Analyzer, Writer, and Debugger configurations; do not recreate or dispatch them unless requested. A TOML file documents a role but does not prove that Codex loaded or can call it in a particular session. When the session only exposes generic Explorer/Worker/Reviewer tools, use the matching project instructions as the scoped brief and report that runtime limitation accurately.

## Provenance

SHA-256 values below identify the supplied source versions used for adaptation. Project-local skills are derived from these sources and adapted for FolderRocket's six configured roles; line endings may be normalized. To change a role, update the project TOML, preserve project constraints, and refresh its source hash only when the supplied canonical file changes.

| Supplied source | SHA-256 |
|---|---|
| AppStarterAgent_General.md | 29FBF8A2A3B1B74C73B2E4592EAF75C83DAA7B52FC7E7CEB4D385D1D2D3BF728 |
| ArchitectAgent_General.md | 9EE3DBFBD62B53B390C80490C9771E6493B52CC1DE2FE641BDD4111806552E7D |
| BackendAgent_General.md | 7200FE7D6058B48598DA3BFF55935ED36D288332E0EBCF00B51BFAED6AB12843 |
| FrontendAgent_General.md | 8728E167FC19639502F294684208F1FFC9184D8B9E3F79CDD4B13773F0290102 |
| AIEngineerAgent_General.md | A3F9B32076C948864294949AFA730B5DB804E9CBCC7B1F1F8EAEA5CD7C990B60 |
| ReviewerAgent_General.md | 4FB1A3BEE61C603166522A479C535984C5D575D4A6C252EE8DA1B204F806C097 |
| PromptAgent_General.md | 09F86C8EDF4F9B1C8C2EA3FE2E4D43271F843BC151DC3F29592958586992E93E |
| agent-configuration/SKILL.md | E66470EBF5CC34B4D1DC7A51EBC07B7C2E44580E0F90F49D90BEFF4FE5A0922E |
| codebase-design/SKILL.md | 2C20617F87EC8AF6A434859F381B2F061A69B530444E74EB39E78BB016A6D1E2 |
| diagnosing-bugs/SKILL.md | 849198DF88CDB65FD0D97236604C1FCA7FF2F22D2F705F9724A800D0266B118D |
| grilling/SKILL.md | BEFDFF1E27A1DFE2A294D5871169AC1AFE16D983911DAA4F32627514A48C1E15 |
| handoff/SKILL.md | 4CBB043950DAD2FFD3662FF1A5A0B51AE676004B5CAE10E3787E8EE7A4EE69D3 |
| investigate-first/SKILL.md | 7CC19DD2FC457EB20D65C44DEE4D1B72DCDFCD1617182F5BFF666700F2A055D8 |
| pipeline-benchmark/SKILL.md | 00A5499217B2D0B8B67B58D000894A1556161CD84ECC270B4CD33C4905325A67 |
| project-graph-context/SKILL.md | D66CB1B3E0C9602083BB1F3452ADD53DC27F18C4EBB4591C7C29204F66509D66 |
| requirement-traceability/SKILL.md | D68A162E824999A8C70CF538AA5BC4D1F1ADB979523B789F48338A5FEF80CBC6 |
| retro/SKILL.md | 33FBC28568E3146F20FD908B12998BC0AB30AA4F4C87288199A40793EFA94696 |
| safe-refactor/SKILL.md | CD52867ABA26AAFB53379D43068CEF9B2FECA3A3FFF850F877A99F710CCD02C0 |
| surgical-patch/SKILL.md | 81EA9F7B51409970099E04B98875DD65806CD35472F9A774B847030328187387 |
| verify-and-stop/SKILL.md | 3D5599F49771B864EBA94F27F456FDA295C48C1A37FA6BA2F65FDCB13CC32ACB |
| writing-for-agents/SKILL.md | 551ADCA942227B44192EDBA88ACD4E8DB911F0121CE58AD16944CCF6A896A74A |

Note: AppStarterAgent_General.md is not included in this Full_stack_pack; its SHA-256 above was verified against the earlier canonical source at PROMPT_AGENTI/Agents/AppStarterAgent_General.md (also present under Starter_pack/App_starter_pack/Agents). PromptAgent_General.md is included in this pack under Agents/ and its hash above identifies the source adapted in prompt_agent.toml. The Prompt Agent remains separate from the six development roles.
