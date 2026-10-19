# FolderRocket coding instructions

## Project and architecture

FolderRocket is a Windows-first, local-first workspace for files, email attachments, conversion, archives, and deadlines. `src/` is a React/TypeScript/Vite frontend; `backend/` is a local Node/Express server; `desktop/` launches them through Electron. AI and mail connections are optional. Read `CODEX.md` before changing architecture or file-management behavior, but verify its planned or older descriptions against the current source.

## Repository map

- `src/components/`: UI blocks; `src/App.tsx` assembles the workspace; `src/api.ts` selects the API base URL.
- `backend/server.js`: API entry point; `backend/services/`, `backend/ai/`, and `backend/database/`: file, integration, analysis, and Excel logic; `backend/test/`: backend tests.
- `desktop/`: Electron main process, preload, and installed-app configuration template.
- `tests/` and `tests/ui/`: Node regression tests and browser smoke fixtures.
- `browser-extension/folderrocket-gmail-bridge/`: optional local Gmail drag bridge.
- `scripts/`: packaging, Graphify, and local administration tools; `build/`: packaging icon; `docs/`: development notes and plans.

## Setup and exact commands

Use PowerShell on Windows. From the repository root run `npm install`; then enter `backend/` with `Set-Location backend` and run `npm install`. For browser development, run `node server.js` from `backend/` in one terminal and `npm run dev` from the repository root in another. `npm run desktop` builds and opens Electron with its local backend.

From the repository root, `npm run build` runs `tsc -b` and the Vite production build; `npm run lint` runs ESLint; `npm test` runs the backend Node test suite. For documented workspace regression tests, use Node 24 or newer and run `node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs`. Run `node --check server.js` from `backend/` when changing the server. `npm run desktop:package` creates a Windows package. A separate type-check command, a formatting command, and CI/CD workflows are **Not specified in the repository**.

## Coding and tests

Follow the existing React/TypeScript modules in `src/` and CommonJS modules in `backend/` and `desktop/`. Reuse existing services and `lucide-react` icons. `CODEX.md` warns against duplicate Express routes or event handlers and broad CSS selectors that affect unrelated controls. Formal naming rules are **Not specified in the repository**; follow nearby files.

Add backend tests under `backend/test/` using `node:test`; add source-helper regression tests under `tests/` following the existing `.test.mjs` files. For UI behavior, `tests/README.md` documents the `/tests/ui/workspace-smoke.html` fixture. Test the changed behavior, then run relevant tests, lint, and build. Before a meaningful commit, `docs/DEVELOPMENT_AND_RELEASES.md` also requires a backend syntax check, a manual check of the changed workflow, and a review of `git status` for local data or secrets. Report checks that could not be performed.

## Configuration and protected data

For browser development, copy `backend/.env.example` to local `backend/.env`; its optional settings include `PORT`, `HOST`, origins, an OAuth token key, and OpenAI/Gmail/Calendar/Outlook credentials. `src/api.ts` accepts optional `VITE_API_BASE_URL`. Installed-app credentials belong in `%APPDATA%\FolderRocket\config.env`, using `desktop/config.env.example` as a template. Never commit real credentials, OAuth tokens, personal documents, generated Excel files, or signing keys. `.gitignore` excludes local data and generated paths such as `backend/data/`, `backend/uploads/`, `input/`, `output/`, `dist/`, `release/`, and `graphify-out/`. Immutable source files are **Not specified in the repository**.

## Canonical paths for agents and skills

For this repository, use the local runtime copies below. The upstream Full_stack_pack is the import/provenance source; agents do not load that external pack for each assignment.

| What to read | Project path | Purpose |
|---|---|---|
| Agent roles | `.codex/agents/<role>.toml` | Identity, scope, permissions and runtime instructions for the seven roles. |
| Agent workflow | [.codex/agents/README.md](.codex/agents/README.md) | Coordinator dispatch, ownership and handoff rules. |
| Skill catalog and activation protocol | [.agents/skills/README.md](.agents/skills/README.md) | Automatic procedure selection at every role invocation. |
| Skill procedure and resources | `.agents/skills/<skill>/SKILL.md` and its folder | Read the selected procedure and its required references/scripts. |
| Routing reminders | `.codex/hooks.json` and `.codex/hooks/` | Optional trusted lifecycle context; the coordinator still calls the agents. |
| Legacy skills path | [.codex/skills/README.md](.codex/skills/README.md) | Compatibility link only; install and update skills in `.agents/skills`, not here. |

## Graphify, plans, and delegation

For a significant cross-module change or refactor, use `npm run graph:build` only when the active task permits generating an index and the local graph is missing or stale; then query relevant relationships as described in `docs/GRAPHIFY.md`. Confirm static findings in source and tests. For complex multi-area work, follow `PLANS.md` and maintain one ExecPlan under `docs/plans/`. When independent work warrants delegation, use AppStarter for structure, Architect for cross-boundary decisions, and Backend, Frontend or AIEngineer for their assigned areas; the coordinator owns unassigned tests, documentation, tooling and quality checks. Give each role a narrow scope and one writer per file.

Use the project agents according to this workflow, documented in `.codex/agents/README.md`:

At task intake, follow the routing and handoff contract in `.codex/agents/README.md` and consult `.agents/skills/README.md`. Every invoked role must complete the mandatory skill activation protocol in `.agents/skills/README.md` before work: automatically select the pertinent procedures, read their `SKILL.md` files, apply them within scope, and return actual `skill_usage`; do not wait for the user to name skills. The coordinator checks this gate before accepting a checkpoint. A named skill must also be located and read before use. All project skills are accessible to every role within its scope and permissions. The coordinator dispatches relevant agents according to this workflow without requiring the user to repeat an already authorized request, and records actual skill usage and handoffs in TaskState for multi-part work.

- The main chat is the coordinator and owns the original request, TaskState, stable requirement IDs (`R1`…), owners, dependencies, decisions, status, and evidence. Agent TOMLs configure roles but do not autonomously dispatch them.
- Use `app_starter` for requested project bootstrap, structure analysis, or organization. In `RUNNING` mode it maps the active application read-only and proposes a separate-checkout/copy plan; do not reorganize the active source or installation.
- Use `architect` read-only before changes that cross module, data, API, security, or integration boundaries.
- Assign implementation to one relevant owner per file/contract: `frontend` for React/TypeScript UI and client state; `backend` for Express, services, persistence, filesystem and Electron main/preload/lifecycle/IPC; `ai_engineer` for prompt, extraction, retrieval and AI context behavior. Backend retains provider credentials and gateway. The coordinator owns unassigned tests, documentation, tooling, and release coordination unless assigned otherwise.
- Before implementation, agree shared API/data contracts and preserve each R ID through handoffs. For complex multi-area work follow `PLANS.md` and maintain one ExecPlan.
- `reviewer` performs the final review of every file-changing task in strict read-only mode. Review depth follows risk; it does not implement fixes. Allow at most one focused fix/re-review cycle.
- `prompt_agent` remains separate. Real requests such as "fammi il prompt", "fammi un prompt", "fammi prompt" and "fai prompt per..." require an actual coordinator call to this role, which prepares the prompt without executing its task. At every prompt assignment it reads `writing-for-agents` and `grilling`, performs the decision-frontier check before `READY`, and reports both in `skill_usage`. Quotes, negations and reports about routing do not by themselves request a new prompt.
- The user removed the legacy `analyzer`, `writer`, and `debugger` configurations. Do not recreate or dispatch those roles. Use only the current six development roles above; `prompt_agent` remains a separate prompt-writing role.

Keep delegated tasks narrow, avoid parallel agents editing the same file, and skip delegation for obvious small edits. The configured development roles are `app_starter`, `architect`, `backend`, `frontend`, `ai_engineer`, and `reviewer`; `prompt_agent` is separate. The older Analyzer/Writer/Debugger files were removed by the user and must stay removed unless requested again.

## Git and review

`docs/DEVELOPMENT_AND_RELEASES.md` describes `feature/<short-description>` branches, tested `main`, semantic versions, and release tags. Pull-request conventions are **Not specified in the repository**. Do not create a commit or push unless the task requests it. In reviews, check that planet-specific state stays with the intended planet and that file-transfer changes preserve the requested copy or move behavior; use the current implementation and tests as evidence rather than relying on roadmap text.
