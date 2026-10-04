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

## Graphify, plans, and delegation

For a significant cross-module change or refactor, use `npm run graph:build` if the local graph is missing or stale, then query only relevant relationships as described in `docs/GRAPHIFY.md`. All coding roles may use Graphify; confirm its static findings in source and tests. For complex multi-area work, follow `PLANS.md` and maintain one ExecPlan under `docs/plans/`. When independent work warrants delegation, the coordinator may assign frontend, backend/Electron, and quality/Graphify specialists; give each a narrow scope and one writer per file.

Use the project agents according to this explicit workflow:

- For a request to create or refine an implementation prompt, use `prompt_agent` only; it is read-only and must not implement the request.
- For a coding request, use `analyzer` for read-only discovery and a compact TaskState, then `writer` for the scoped implementation. The coordinator may do straightforward work directly when delegation would add no value.
- Use `reviewer` only when the user explicitly asks for a review or invokes Reviewer. Do not trigger it automatically because a change is large or risky.
- Use the existing `debugger` only after an explicitly requested Reviewer pass identifies a concrete defect that needs diagnosis. Do not call it for speculative risks, standalone debugging, or routinely alongside Analyzer/Writer; the coordinator sends a confirmed diagnosis to Writer for any fix.

Keep delegated tasks narrow, avoid parallel agents editing the same file, and skip delegation for obvious small edits. The active project agents are `analyzer`, `prompt_agent`, `writer`, `reviewer`, and `debugger`; use them only according to the routing rules above.

## Git and review

`docs/DEVELOPMENT_AND_RELEASES.md` describes `feature/<short-description>` branches, tested `main`, semantic versions, and release tags. Pull-request conventions are **Not specified in the repository**. Do not create a commit or push unless the task requests it. In reviews, check that planet-specific state stays with the intended planet and that file-transfer changes preserve the requested copy or move behavior; use the current implementation and tests as evidence rather than relying on roadmap text.
