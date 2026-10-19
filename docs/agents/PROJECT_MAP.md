# FolderRocket current project map

## Scope and confidence

This map describes the current working-tree source inspected on 2026-10-09. The user says the application is in operation; that is recorded as declared state. No app process or external integration was probed, so observed runtime state is unknown. The checkout already contained many unrelated modified and untracked app files before this task; those changes are user-owned and were preserved. Runtime data, credentials, uploads and generated output were excluded.

The project is Windows-first and local-first. The root package is ESM and runs React 19, TypeScript 6 and Vite 8. The backend package is CommonJS with Express 5 and node:test. Electron is the desktop host. Relevant major dependencies also include lucide-react, ExcelJS/XLSX, Mammoth, pdf-parse, Multer, JSZip and the OpenAI SDK; optional integrations must not be assumed configured.

## Runtime and entry points

| Entry | Verified responsibility |
|---|---|
| Browser frontend | src/main.tsx:23-25 mounts React StrictMode, diagnostics boundary, AuthGate and App. src/api.ts:1-9 selects VITE_API_BASE_URL, or local development/default browser origin. |
| Main workspace | src/App.tsx:201 begins WorldWorkspace; :332-336 handles page navigation; :754-782 builds primary navigation and dashboard source/folder columns; :786-1044 owns world list/selection, settings hydration, page composition and graph/world overlays. |
| World state | src/worlds.ts:114-129 defines storage key/scope and defaults; :207-240 migrates and loads browser-local world state. activeWorldStorageScope(userId, worldId) keeps local settings scoped by user and planet. Server-side world settings use backend/server.js routes and per-user preferences. |
| Backend | backend/server.js is the Express entry. It installs CORS, authentication/request IDs and JSON parsing at :512-572; routes begin at :574; server starts at :3562 and handles process errors/shutdown from :3589 onward. It is 3,619 lines in this checkout and contains 100+ inline routes. |
| Electron | package.json main points to desktop/main.cjs. Backend launch/readiness/shutdown are in desktop/main.cjs:201-379; BrowserWindow setup/security is :390-459; app startup is :618 onward. desktop/preload.cjs:1-53 exposes a narrow allowlist of IPC calls. Both main and Cargo Ship windows set contextIsolation, disable nodeIntegration and enable sandbox. |

## Main behavior paths

| Behavior | Path through modules |
|---|---|
| Sign-in and workspace | main.tsx -> AuthGate -> App -> WorldWorkspace. AuthGate owns the session boundary; App owns the selected world and passes world-scoped props to pages. |
| Dashboard/navigation | WorldWorkspace in App.tsx renders source columns, folder scroll frame and folder browser; it lazy-loads FolderManagement, ProcessingWorkspace, ApplicationsWorkspace and DailyJob. Conversation is a separate page; PlanetGraph and ChangeWorld are full-view overlays. |
| Change planet | App.tsx selectWorld around :921-977 loads the target world's settings, updates active-world state, persists scoped local settings and records measured timing. It aborts an old active-world request before switching. ChangeWorld.tsx displays planets and invokes selection. |
| Folder and file management | FolderManagement.tsx, DashboardFolderBrowser.tsx, TreeRocket.tsx and ApplicationsWorkspace.tsx consume backend file/folder APIs. backend/server.js includes tree/search/file routes around :2437-2715 and rename/copy/move/conversion routes around :2786-3106. Path validation and filesystem behavior live in backend/services/userPathSecurity.js, hostFilesystem.js and related services. |
| Gmail/Outlook/Teams and conversations | EmailConversations.tsx is mounted from App.tsx. World-scoped conversation routes are backend/server.js:1093-1293; Gmail/Outlook account and attachment routes are :3251-3500; Teams read routes are :3394-3442. OAuth/token handling and provider operations are in backend/services. Existing account credentials are shared at the authentication layer; planet settings select an account/block. |
| Planet Graph and Obsidian | ChangeWorld.tsx opens PlanetGraph.tsx from App.tsx:1038-1039. Graph/index/snapshot/conversation routes are backend/server.js:917-1092. backend/services/planetGraphService.js builds and persists stable world-scoped nodes/edges; obsidianVaultService.js projects selected graph records into Markdown. App.tsx:68-83 and :248-328, :412-449 handles sync/signature and planet-scoped snapshot requests. Graph and Obsidian are domain features, not Graphify. |
| AI | World-scoped invocation is backend/server.js:1384-1420. Prompt/context logic appears in backend/ai and AI-oriented services. Backend owns auth, provider keys, routes and transport; AIEngineer owns prompt/retrieval semantics. |
| Daily activity, reminders and diagnostics | DailyJob.tsx, DailyAgendaRail.tsx, StickyNotes.tsx and DiagnosticsCenter.tsx provide the UI. Backend services handle scheduling, activity email, reminders and diagnostic persistence. Keep account/provider and world scope explicit. |
| Desktop file and window integration | desktop/main.cjs starts the packaged local backend, creates app windows, validates trusted navigation and implements IPC handlers; preload.cjs is the renderer capability boundary. Do not broaden IPC without an explicit contract/security review. |

## Persistence and sensitive boundaries

- Browser world definitions and scoped settings are loaded from localStorage in src/worlds.ts and App.tsx.
- backend/services/userPreferencesService.js:5-20 reads/writes per-user JSON preferences under the configured runtime-data directory. desktop/main.cjs sets user-data, uploads and token directories before starting the backend.
- Email token storage is separate from planet configuration. Do not read credential contents for an inventory or copy secrets into agent settings.
- Local files, generated Excel files, uploads, vault contents and diagnostic records are user data. .gitignore excludes backend/data, backend/uploads, input, output, dist, release and graphify-out.

## Build, development and test commands

Exact commands from the manifests and README:

- Browser development: node server.js from backend, plus npm run dev from the repository root in a second terminal.
- Desktop development: npm run desktop; this builds and launches Electron, so it is not a harmless architecture probe.
- Build: npm run build runs tsc -b and Vite.
- Lint: npm run lint.
- Tests: npm test delegates to backend npm test, which runs node --test.
- Backend syntax: node --check server.js from backend.
- Documented root regression tests: Node 24+ and node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs.
- Packaging: npm run desktop:package creates a Windows package.
- UI smoke fixtures are documented in tests/README.md and use fake/mocked data; they do not prove native Explorer, Electron or live-provider behavior.

There are 24 backend test files and 16 root *.test.mjs files at the inventory time, plus UI fixtures. No separate type-check or formatting script is declared. CI workflow configuration was not identified in the inspected top-level files; report it as not specified unless a workflow is found in the repository.

## Organization observations (not confirmed defects)

1. backend/server.js combines middleware, authentication, helpers, more than 100 route registrations and lifecycle in one 3,619-line file. This is a concrete navigation and merge-conflict risk, not proof of a runtime bug.
2. src/App.tsx combines world orchestration, async synchronization, page state and composition in 1,044 lines. Existing domain components already provide extraction points; any further split needs state/async regression tests.
3. desktop/main.cjs combines backend lifecycle, window configuration, protocol and IPC in 857 lines. Preload is a separate, narrow security boundary that must remain stable.
4. CODEX.md contains confirmed documentation drift: it describes source panels as mostly placeholders at :93 and Search/Results placeholders at :115-116, while current App.tsx mounts source blocks, navigation, conversation and graph views and the server contains implemented email, search and graph routes. Update the guide only in a separate documentation task after validating all sections; do not trust its old architecture descriptions.

Graphify was not queried or regenerated. The available source and tests were sufficient for this map; no freshness claim is made for graphify-out. This map is static evidence, not a runtime or end-to-end verification.
