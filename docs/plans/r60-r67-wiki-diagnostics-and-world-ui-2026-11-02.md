# FolderRocket wiki diagnostics and planet presentation

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Ridurre i falsi allarmi durante l’avvio e la sincronizzazione Obsidian, rendere recuperabile l’inventario quando una cartella salvata non esiste più e completare l’interfaccia dei pianeti. La wiki continuerà a essere generata manualmente e soltanto per il pianeta scelto; i comandi saranno nelle impostazioni del relativo vault Obsidian. Le schede saranno uniformi in una griglia desktop a quattro colonne e il buco nero e la galassia useranno immagini dedicate ispirate ai riferimenti dell’utente.

## Progress

- [x] (2026-11-02 21:33Z) Verificati worktree e diff iniziali; letto il prompt allegato, `AGENTS.md`, `.codex/agents/README.md`, `.agents/skills/README.md`, `CODEX.md` e `PLANS.md`.
- [x] (2026-11-02 21:33Z) Architect ha tracciato i flussi R60–R62/R67 in sola lettura; definiti i confini dei proprietari.
- [x] (2026-11-02 21:45Z) Aggiunti test prima del codice; il test HTTP ha incontrato il blocco loopback `EACCES`, quindi l’inventory è stato estratto in un servizio testabile offline.
- [x] (2026-11-02 21:55Z) Corretto l’inventario di cartelle mancanti/non-directory senza conteggi parziali; aggiornati entrambi i chiamanti UI.
- [x] (2026-11-02 22:00Z) Ridotta la diagnostica attesa, mantenuta la guardia wiki 409 e spostati preview/creazione/ricostruzione nelle impostazioni Obsidian.
- [x] (2026-11-02 22:01Z) Integrate le immagini dedicate e uniformate le card a quattro colonne desktop con azioni compatte.
- [x] (2026-11-02 22:03Z) Completati test mirati, lint, build e review read-only; la prova Electron non è praticabile perché il sandbox nega il loopback locale.

## TaskState

```yaml
task_id: folderrocket-r60-r67-wiki-diagnostics-and-world-ui-2026-11-02
project_scope: FolderRocket diagnostics, per-planet wiki controls, inventory recovery, and planet presentation
authorized_sources: [user-provided prompt attachment, AGENTS.md, .codex/agents/README.md, .agents/skills/README.md, CODEX.md, PLANS.md, current source and tests, user-provided reference images]
objective: Diagnose the reported events and implement evidence-backed fixes plus the requested per-planet UI and imagery updates.
constraints:
  - Preserve every pre-existing dirty change, especially R38-R53 and R55-R59; R54 remains canceled.
  - Do not reset, clean, checkout, revert, commit, push, delete user data, or modify Obsidian notes.
  - Use synthetic fixtures only; no personal documents, live mailboxes, provider calls, or external account changes.
  - Keep Obsidian sync guarded by a complete wiki matching current selection and graph revision.
  - Keep wiki generation manual and separate from Obsidian AutoSync.
  - Treat the two supplied images as visual references only.
assumptions:
  - The reported 409 is a valid readiness guard when the wiki is absent or stale; the user's live planet state will not be inspected.
  - The pre-login GET /auth/me 401 is expected; only its startup diagnostic noise is changed.
  - A missing inventory root returns explicit unavailable status and no partial counts; invalid or out-of-scope paths remain rejected.
requirement_coverage:
  - id: R60
    requirement: Preserve Obsidian's complete-wiki guard and make the manual recovery action clear without repeated expected diagnostics.
    acceptance_criteria: [409 still blocks sync when the wiki does not match scope/revision; the last complete vault is preserved; UI points to per-planet Obsidian vault settings; repeated expected 409s do not flood diagnostics; manual and automatic sync remain distinct.]
    package: P3
    owner: Frontend
    relevant_files: [src/App.tsx, src/diagnostics.ts, backend/server.js, src/components/ChangeWorld.tsx, src/components/PlanetWikiRebuildControls.tsx]
    changes: [App points users to Obsidian vault settings; diagnostics suppresses expected sync 409 noise; backend readiness guard unchanged]
    evidence: [backend/test/obsidianGraphProjection.test.js verifies sync does not queue ingestion; tests/diagnostics.test.mjs verifies 409 handling; reviewer found no remaining R60 issue]
    status: COMPLETE
  - id: R61
    requirement: Handle stale or missing folders during file-type inventory without false data or wider scans.
    acceptance_criteria: [Missing/non-directory roots are reported explicitly; unavailable requests return no partial inventory; invalid paths remain rejected; configured-root scope is preserved; both Folder Management and USB callers show a useful status.]
    package: P2
    owner: Backend + Frontend
    relevant_files: [backend/server.js, backend/services/fileTypeInventoryService.js, backend/services/userPathSecurity.js, src/components/FolderManagement.tsx, src/components/UsbSourcePanel.tsx]
    changes: [Added explicit unavailable response with no partial scan; preserved workspace containment; both UI callers show unavailable/error state]
    evidence: [backend/test/fileTypeInventoryR61.test.js passes missing, mixed, non-directory, validator ENOTDIR, valid-count and path-boundary cases; reviewer approved R61]
    status: COMPLETE
  - id: R62
    requirement: Suppress only the expected startup /auth/me 401 diagnostic without weakening auth or hiding later failures.
    acceptance_criteria: [Unauthenticated /auth/me still returns 401; startup-only GET /auth/me 401 is not captured as an error; other auth failures remain diagnosable.]
    package: P3
    owner: Frontend
    relevant_files: [src/diagnostics.ts, src/components/AuthGate.tsx]
    changes: [src/diagnostics.ts suppresses GET /auth/me 401 only when diagnostics identity is startup]
    evidence: [tests/diagnostics.test.mjs passes startup and authenticated 401 cases]
    status: COMPLETE
  - id: R63
    requirement: Classify user-provided historical diagnostic events based on current evidence.
    acceptance_criteria: [Recent, expected, transient, and historical events are separated; October provider and stale-world events are not claimed fixed without reproduction.]
    package: P4
    owner: Coordinator
    relevant_files: [docs/plans/r60-r67-wiki-diagnostics-and-world-ui-2026-11-02.md]
    changes: [Added event-by-event triage table below with timestamps, routes, counts, evidence, reproducibility limits and classifications]
    evidence: [Current source and user-supplied logs; no provider or live planet state accessed]
    status: COMPLETE
  - id: R64
    requirement: Add focused regression proof and complete relevant validation and independent review.
    acceptance_criteria: [Regression tests follow a red-green cycle; lint, build, relevant backend tests, and Electron proof are reported with exact limits; Reviewer is read-only.]
    package: P1/P4
    owner: Coordinator + Reviewer
    relevant_files: [backend/test, tests, docs/plans/r60-r67-wiki-diagnostics-and-world-ui-2026-11-02.md]
    changes: [Added focused regression tests; updated stale presentation assertions; ran lint, build, full suite and read-only review]
    evidence: [21/21 focused frontend tests pass; inventory/path tests 4 pass plus 1 symlink skip; lint/build/syntax pass; backend suite 189 pass, 5 loopback failures and 2 symlink skips; no Electron proof]
    status: COMPLETE_WITH_ENVIRONMENT_LIMITS
  - id: R65
    requirement: Replace the black-hole and galaxy visuals with distinct dedicated assets inspired by the user references.
    acceptance_criteria: [Black hole has a black center and bright amber/gold accretion disk; galaxy has a soft blue-violet spiral and warm bright core; both remain distinct and legible at rendered sizes.]
    package: P3
    owner: Frontend
    relevant_files: [src/components/ChangeWorld.tsx, src/worlds.css, src/assets]
    changes: [Generated and integrated src/assets/planet-black-hole-inspired.png and src/assets/planet-galaxy-inspired.png; older assets preserved]
    evidence: [Both assets are 1254x1254 PNGs with transparent corners and match the requested amber disk and violet spiral directions; Electron rendering not captured]
    status: COMPLETE
  - id: R66
    requirement: Make the Fly to Another Planet cards uniform, fixed-size, and responsive with four desktop columns.
    acceptance_criteria: [Cards align with consistent dimensions and internal layout; desktop shows four per row; smaller widths reduce columns without horizontal overflow; card actions still work.]
    package: P3
    owner: Frontend
    relevant_files: [src/worlds.css, src/components/ChangeWorld.tsx]
    changes: [src/worlds.css keeps cards at 354px, four desktop columns, responsive breakpoints, and compact status/retry action rows]
    evidence: [21 frontend tests pass; reviewer confirmed the action area fits without clipping; actual Electron viewport not verified]
    status: COMPLETE
  - id: R67
    requirement: Move Create wiki/Rebuild wiki actions into the selected planet's Obsidian vault settings.
    acceptance_criteria: [Action is planet-scoped; label follows valid-wiki state; preview and scope blockers remain; no duplicate mutation controls remain on planet cards or wiki page; wiki browsing remains available.]
    package: P3
    owner: Frontend
    relevant_files: [src/components/ChangeWorld.tsx, src/components/PlanetWiki.tsx, src/App.tsx, src/components/PlanetWikiRebuildControls.tsx]
    changes: [PlanetWikiRebuildControls owns preview and create/rebuild in the selected planet's Obsidian vault settings; Wiki page and card remain browse-only]
    evidence: [Saved-scope gate, current-ready label, preview limits, active-job guard, and explicit graph index action confirmed by tests/source review]
    status: COMPLETE
work_packages:
  - id: P1
    requirement_ids: [R60, R61, R62, R64]
    depends_on: [Architect read-only contract]
    deliverable: Coordinator-owned red-green regression tests for backend inventory, startup auth response, 409 handling, settings placement, card layout, and assets. Complete.
  - id: P2
    requirement_ids: [R61]
    depends_on: [P1, inventory response contract]
    deliverable: Backend returns explicit unavailable status for missing/non-directory roots without scanning or partial counts; both callers display the state. Complete.
  - id: P3
    requirement_ids: [R60, R61, R62, R65, R66, R67]
    depends_on: [P1, P2]
    deliverable: Frontend recovery messages and settings controls, startup-only diagnostic filtering, responsive uniform cards, and dedicated visual assets. Complete.
  - id: P4
    requirement_ids: [R63, R64]
    depends_on: [P1, P2, P3]
    deliverable: Focused verification, historical classification, read-only review, and evidence update complete; Electron check unavailable because sandbox loopback is denied.
decisions:
  - (2026-11-02) Keep the existing 409 precondition; it is the safeguard for the last complete vault, not a success path.
  - (2026-11-02) For a missing or non-directory inventory root, return HTTP 200 with status `unavailable`, empty type counts, and indexed unavailable-root reasons; scan no roots in that request. Keep security/path-escape failures as HTTP 400.
  - (2026-11-02) Suppress only GET `/auth/me` HTTP 401 while diagnostics identity is `startup`; retain other auth diagnostics.
  - (2026-11-02) Use the Obsidian settings editor for the sole create/rebuild action; keep wiki navigation separate.
  - (2026-11-02) Use new generated image filenames instead of overwriting existing assets, then reference them from the existing `Planet` rendering path.
skill_usage:
  - {name: superpowers:using-superpowers, path: C:/Users/bonat/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/using-superpowers/SKILL.md, reason: select and apply relevant procedures before workspace work}
  - {name: superpowers:brainstorming, path: C:/Users/bonat/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/brainstorming/SKILL.md, reason: choose a design from the detailed user-approved implementation spec and existing CSS-based planet rendering}
  - {name: superpowers:writing-plans, path: C:/Users/bonat/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/writing-plans/SKILL.md, reason: decompose the cross-module implementation into testable packages}
  - {name: investigate-first, path: .agents/skills/investigate-first/SKILL.md, reason: evidence-rank uncertain causes before edits}
  - {name: requirement-traceability, path: .agents/skills/requirement-traceability/SKILL.md, reason: maintain R60-R67 and ownership/evidence}
  - {name: codebase-design, path: .agents/skills/codebase-design/SKILL.md, reason: agree the inventory response and UI ownership interfaces}
  - {name: surgical-patch, path: .agents/skills/surgical-patch/SKILL.md, reason: make narrowly scoped fixes while preserving the existing dirty worktree}
  - {name: superpowers:test-driven-development, path: C:/Users/bonat/.codex/plugins/cache/openai-curated-remote/superpowers/7.0.1/skills/test-driven-development/SKILL.md, reason: tests are explicitly requested; write and confirm regression failures before production changes}
  - {name: imagegen, path: C:/Users/bonat/.codex/skills/.system/imagegen/SKILL.md, reason: create bitmap planet artwork using the supplied image references}
handoffs:
  - {sender: coordinator, recipient: architect, requirements: [R60, R61, R62, R67], result: read-only diagnosis and response/action contract received; no source edits}
validation:
  performed: [initial worktree/diff audit; source trace for 409/400/401; synthetic inventory/path tests 4 passed; focused frontend tests 21/21 passed; backend syntax check passed; npm run lint passed; npm run build passed with Vite large-chunk warning; npm test 189 passed/5 local HTTP integration failures/2 symlink skips of 196; read-only reviewer approved final R61 and confirmed R66 fix]
  not_performed: [Electron visual verification because sandbox denies loopback HTTP with EACCES; live provider and historical event reproduction because prompt prohibits external accounts and no evidence required them]
blockers: [Electron UI verification not possible in this sandbox: local HTTP loopback is denied with EACCES]
status: COMPLETE_WITH_ENVIRONMENT_LIMITS
```

## Surprises & Discoveries

- `POST /worlds/:worldId/obsidian/sync` deliberately returns `KNOWLEDGE_INCOMPLETE` when the saved wiki fingerprint/revision does not match current scope. Preserve this guard; the user’s planet state was not inspected.
- `POST /file-types/inventory` calls `assertUserPath` before checking `existsSync`; a missing root throws the exact reported message before filtering.
- `AuthGate` calls `/auth/me` before login; `src/diagnostics.ts` currently records this expected 401 as a warning and later migrates startup diagnostics to the signed-in user.
- Wiki create/rebuild controls currently appear on planet cards and in the wiki page. The settings editor already owns per-planet Obsidian scope and sync settings.
- The current `Planet` rendering draws the black hole and galaxy with CSS gradients; the old `planet-black-hole.png` asset appears black in a default-background preview and is not referenced by the component. New dedicated assets avoid changing that file.

## Event Triage (R63)

Classifications below use the supplied log and current source. No personal planet state, provider account, mailbox, or document was accessed. “Not reproduced” means the historical live condition was not replayed; synthetic tests cover only the shared local cause where stated.

| Log time and event | Evidence and reproduction | Cause confidence | Classification |
|---|---|---|---|
| 02/11 22:16:35 Electron startup, 22 occurrences | Informational `electron` startup event, not an error; the historical occurrence count was not replayed. | Startup logging is expected; duplicate count cause not established. | Expected event; count historical/unverified. |
| 02/11 22:17:09 `GET /auth/me` 401, 1 occurrence | `/auth/me` intentionally returns 401 when no session exists; AuthGate probes it before sign-in. | Confirmed expected pre-login response. | Expected; R62 narrows startup diagnostic noise only. |
| 02/11 22:19:09 `POST /file-types/inventory` 400, 2 occurrences | Route validated each root before checking existence. The extracted service reproduces missing and non-directory roots using synthetic directories and returns explicit unavailable status; HTTP loopback reproduction was blocked by sandbox `EACCES`. | Confirmed cause in old route; direct service regression proof passes. | Current defect, fixed under R61; actual selected paths not inspected. |
| 02/11 22:19:18 and 22:21:26 Obsidian sync 409, 1 and 7 occurrences | Sync route rejects absent/stale wiki readiness for the saved folder fingerprint and graph revision, preserving the last complete vault. The planet state from the log was not inspected. | Guard behavior confirmed; whether that wiki needed rebuilding is unverified. | Expected safety precondition; repeated records are diagnostic/UI noise to reduce under R60. |
| 24/10 17:55 Gmail notifications 502, 73 occurrences | Provider route reports notification lookup failure; no account/provider request was permitted. | Current cause cannot be established from the log alone. | Historical provider/transient candidate; unverified. |
| 24/10 15:16 Gmail attachments 400 `fetch failed`, 2 occurrences | No account/provider request and no synthetic remote-fetch reproduction. | Unconfirmed. | Historical/transient candidate; not claimed fixed. |
| 24/10 14:43 `/knowledge`, `/obsidian/folders`, `/obsidian` 404 for two old planet IDs (counts: 4/4/5 and 5/5/5) | Routes return not-found when a requested planet ID is absent. Current planet records were not inspected. | Stale/deleted IDs are plausible but not verified. | Historical; current impact unverified. |
| 24/10 12:39 Gmail conversations/detail 502, 7 and 6 occurrences, `Gmail:TypeError` | Provider integration was not called. | Unconfirmed; log does not establish a root cause. | Historical/transient candidate; not claimed fixed. |
| 24/10 12:16 Obsidian sync 409, 85 occurrences, incomplete selected sources | Same readiness guard preserves the custom vault’s last complete revision; no live source state accessed. | Guard behavior confirmed; specific incomplete source not verified. | Expected safety precondition recorded historically. |
| 14/10 20:25 graph snapshot 400 `EPERM` rename, 2 occurrences | No real snapshot or filesystem mutation replayed. | Filesystem lock or permission is plausible; exact cause unconfirmed. | Historical, not reproduced. |
| 14/10 20:12 settings 404 for old planet ID, 12 occurrences | Current server returns not-found when a requested planet is absent. Current planet state was not inspected. | Old/stale ID is plausible, unverified. | Historical; current impact unverified. |
| 13/10 21:50 local knowledge sync 400, 2 occurrences | Log says sync did not complete and the existing vault was preserved; no reason is included. | Unconfirmed. | Historical; not reproduced and not claimed fixed. |

## Decision Log

- Preserve the backend wiki readiness 409; it prevents publishing incomplete source data to the vault.
- Return no inventory counts when any requested root is missing or is not a directory, so partial results cannot look complete. Do not scan fallback roots.
- Suppress startup `GET /auth/me` 401 only while diagnostics use the `startup` identity; session expiry after authentication remains visible.
- Reuse the current per-planet graph index and scope preview flow from Obsidian settings; retain the page as read-only wiki browsing.
- Use new image assets inspired by the attached references and integrate them into the current `Planet` component.
- The execution plan was supplied and explicitly authorized by the user; no additional design approval round is needed. Keep work in the existing feature branch/worktree because the user’s dirty R38–R59 changes are part of the required baseline and must remain intact.

## Outcomes & Retrospective

R60–R67 implementation is complete. The sync 409 remains the last-good wiki safety guard; repeated expected 409s no longer duplicate diagnostics, and users are directed to the selected planet’s Obsidian vault settings. Missing or non-directory inventory roots now produce a recoverable unavailable state with no partial scan or counts. The pre-login `/auth/me` 401 stays an HTTP 401 and is omitted from diagnostics only during startup. Wiki create/rebuild controls now live only in the selected planet’s Obsidian settings, with saved-scope and readiness gates. New black-hole and galaxy images are integrated, and the fixed 354px planet cards use four desktop columns with compact actions.

Validation: `npm run lint`, `npm run build`, backend syntax check, 21 focused frontend tests, and synthetic inventory/path tests pass. `npm test` reports 189 passed, 5 failed, 2 skipped out of 196: the 5 failing integration tests cannot connect to the backend’s local HTTP listener in this sandbox; the 2 capability-dependent symlink tests skip because Windows reports `EPERM`. Reviewer approved the R61 follow-up and confirmed the R66 clipping fix. Electron visual verification remains unavailable; the generated assets were previewed, but rendered app screenshots were not captured.

## Context and Orientation

La diagnostica fetch è in `src/diagnostics.ts`; il gate di sessione è in `src/components/AuthGate.tsx`; la route inventory è in `backend/server.js`. `ChangeWorld.tsx` contiene la griglia pianeti e l’editor con le impostazioni Obsidian; `PlanetWiki.tsx` presenta l’indice e il dettaglio della wiki. `src/worlds.css` definisce layout, card e rendering CSS dei pianeti. Il flusso esistente per preflight e ricostruzione usa `/worlds/:worldId/wiki/preview`, `/worlds/:worldId/graph/index` e il riepilogo di stato del grafo.

Il worktree iniziale è `feature/desktop-foundation` e contiene numerose modifiche locali relative a R38–R53 e R55–R59. Nessuna di queste va ripristinata. Gli eventi Gmail, i planet ID storici e gli errori del 13–24 ottobre restano classificabili soltanto dal log fornito, salvo riproduzione sintetica di una causa comune.

## Plan of Work

1. Il coordinatore aggiunge test mirati prima delle modifiche: risposta inventory per root mancante, diagnostica startup `/auth/me`, sicurezza del 409, posizione dei controlli wiki e layout/asset del pianeta. Esegue i test e registra i fallimenti attesi.
2. Backend modifica soltanto la route inventory e restituisce uno stato esplicito senza conteggi parziali quando una root non è disponibile; le path fuori scope restano rifiutate.
3. Frontend aggiorna i messaggi di sync e il filtraggio diagnostico, mostra lo stato inventory in entrambi i chiamanti, sposta il controllo di ricostruzione nelle impostazioni Obsidian, uniforma le card e integra i due asset.
4. Il coordinatore esegue test pertinenti, lint, build e una prova Electron su profilo e contenuti sintetici se l’ambiente lo consente. Reviewer conclude in sola lettura.

## Concrete Steps

Dalla radice FolderRocket:

    node --test backend/test/<nuovo-test-inventory-e-wiki>.test.js
    node --test tests/diagnostics.test.mjs tests/planetPresentationR60R67.test.mjs
    node --check backend/server.js
    npm run lint
    npm run build
    npm test

Osservazioni attese: i test iniziali falliscono sulla risposta inventory e sui requisiti UI/diagnostica; dopo la correzione passano. Le verifiche Electron usano soltanto un profilo locale sintetico, senza account provider.

## Validation and Acceptance

- R60: 409 resta bloccante senza wiki completa e compatibile; nessuna ingestion parte dalla sync; il messaggio guida alle impostazioni Obsidian e la diagnostica non duplica il blocco previsto.
- R61: root mancante o non-directory produce `status: unavailable`, elenco degli indici non disponibili e conteggi vuoti; path fuori scope è ancora rifiutato; i due chiamanti mostrano uno stato comprensibile.
- R62: `/auth/me` senza sessione continua a restituire 401; solo tale risposta durante bootstrap viene esclusa dalla diagnostica; 401 dopo l’autenticazione non viene silenziato.
- R63: Gmail/provider, planet ID storici, EPERM e sync incomplete di ottobre sono marcati storici/non riprodotti se non emerge una riproduzione sintetica affidabile.
- R65: due asset dedicati sono visivamente distinti e leggibili nella card grande e nel badge compatto.
- R66: la griglia mostra quattro card per riga su desktop supportato, tutte della stessa dimensione; breakpoint inferiori non tagliano contenuti né introducono overflow orizzontale.
- R67: la sola azione di creazione/ricostruzione si trova nelle impostazioni del vault Obsidian del pianeta selezionato; anteprima, limiti, stato e last-good restano disponibili; la pagina wiki resta consultabile.
- I test mirati aggiunti passano, lint/build sono superati e la review finale è approvata; la suite completa conserva cinque limiti di loopback e due skip `EPERM` registrati sopra.

## Idempotence and Recovery

La richiesta inventory è read-only: su root mancante non viene attraversata alcuna directory. La ricostruzione segue il preflight e l’endpoint esistente; in caso di errore conserva l’ultima wiki completa. Gli asset nuovi hanno nomi distinti e non sovrascrivono quelli precedenti. Tutte le prove filesystem usano directory temporanee sintetiche. Non modificare i dati utente, le note Obsidian o il contenuto delle cartelle reali.

## Artifacts and Notes

`backend/test/fileTypeInventoryR61.test.js` e `tests/planetPresentationR60R67.test.mjs` documentano le prove sintetiche mirate. I due asset generati sono `src/assets/planet-black-hole-inspired.png` e `src/assets/planet-galaxy-inspired.png`. Non sono stati archiviati dati personali o log reali.

## Interfaces and Dependencies

- `POST /file-types/inventory` accetta `{folders: string[]}`. Per folder mancanti/non-directory risponde HTTP 200 con `{status:"unavailable",types:[],total:0,truncated:false,unavailableFolders:[{index:number,reasonCode:"not_found"|"not_directory"}]}`. Per richieste tutte valide conserva `types`, `total`, `truncated` e aggiunge `status:"ready"`. Errori di validazione/sicurezza continuano a essere HTTP 400.
- `GET /auth/me` resta invariato; la sola eccezione diagnostica è lato client per identity `startup`, metodo GET, route esatta e status 401.
- Il rebuild riusa preview e `POST /worlds/:worldId/graph/index`; l’endpoint non cambia il contratto di last-good e scope.
- `Planet` usa asset dedicati per gli stili `black-hole` e `galaxy`; gli altri stili restano nel rendering esistente.

## Revision Notes

- (2026-11-02) Creato il piano dopo aver verificato lo stato del worktree e ricevuto il contract checkpoint read-only dell’Architect. Definito il comportamento esplicito per inventory non disponibile e preservata la guardia wiki 409.
- (2026-11-02 22:03Z) Registrati implementazione R60–R67, limiti di verifica loopback/symlink, esiti dei test, build/lint e review read-only approvata.
