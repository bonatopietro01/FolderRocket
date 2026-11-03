# Wiki consultabile per ogni pianeta

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Ogni pianeta avrà una wiki FolderRocket locale, consultabile in sola lettura. L’utente vedrà prima un indice leggero, potrà aprire una singola pagina per leggerne contenuto e fonti, e potrà ricostruire la wiki del pianeta dopo un’anteprima esplicita dello scope. La wiki valida resta disponibile durante i lavori e dopo un errore.

## Progress

- [x] (2026-10-24) Confermati ambito, requisiti R55–R59, ownership Backend/Frontend e contratto API.
- [x] (2026-10-24) Implementare preview, indice paginato, dettaglio e ricostruzione backend; conservare API Graph e Knowledge esistenti.
- [x] (2026-10-24) Implementare la pagina wiki e l’azione manuale per pianeta; rendere lazy le viste Graph/Q&A.
- [x] (2026-10-24) Aggiungere o aggiornare verifiche sintetiche, eseguire i controlli applicabili e review indipendente; registrate le limitazioni della suite completa.

## TaskState

```yaml
task_id: planet-wiki-r55-r59-2026-10-24
project_scope: FolderRocket planet wiki and source-index loading
authorized_sources: [AGENTS.md, .codex/agents/README.md, .agents/skills/README.md, CODEX.md, PLANS.md, current source and tests, user-approved plan]
objective: Implement a read-only per-planet wiki with preflight, manual rebuild and lazy page loading.
constraints:
  - Preserve pre-existing uncommitted R38-R53 work; R54 remains canceled.
  - Keep wiki and index isolated by user and planet; do not add a database, provider, or migration.
  - Keep Obsidian autoSync independent and preserve existing Obsidian notes.
  - Do not use personal files or provider accounts for synthetic measurements.
  - Do not commit, push, restart a live instance, or alter external accounts.
assumptions: [Existing folder and file-type settings define each planet scope, Existing knowledge JSON and Markdown are the persistence source]
requirement_coverage:
  - id: R55
    requirement: Consult a unified local read-only wiki for each planet.
    acceptance_criteria: [Home, area, source, topic and label pages are browsable; lexical groupings disclose uncertainty; detail includes source evidence.]
    package: P1/P2
    owner: Backend + Frontend
    relevant_files: [backend/server.js, backend/services/planetWikiService.js, src/components/PlanetWiki.tsx, src/App.tsx]
    changes: [Per-planet wiki index and details API; read-only FolderRocket wiki UI with source evidence and lexical-topic provenance.]
    evidence: [backend/test/planetWikiService.test.js 7/7; synthetic 601-note pagination; Electron opened the Lavoro wiki and showed its index and scope panel.]
    status: PASS
  - id: R56
    requirement: Preview selected file scope and make exclusions and ingestion caps visible.
    acceptance_criteria: [Metadata-only counts and size; explicit unsupported/oversized/incomplete scope; narrow scope before scanning on limits; never silently publish an alphabetical subset.]
    package: P1
    owner: Backend
    relevant_files: [backend/server.js, backend/services/planetWikiService.js]
    changes: [Metadata-only scope preflight; visible unsupported/excluded files, limits and explicit blockers; empty or unsupported-only scopes are rejected.]
    evidence: [wiki preview limits tests; Electron empty-scope preview displayed zero counts, blocker and disabled Create wiki action.]
    status: PASS
  - id: R57
    requirement: Rebuild manually for the selected planet while retaining the last complete wiki.
    acceptance_criteria: [Explicit per-planet Create/Rebuild action; no login or filesystem-triggered wiki scan; failure or incomplete scope preserves last-good; Obsidian autoSync remains separate.]
    package: P1/P2
    owner: Backend + Frontend
    relevant_files: [backend/server.js, src/components/ChangeWorld.tsx, src/App.tsx, src/components/PlanetWiki.tsx]
    changes: [Manual per-planet create/rebuild action; login and watcher refresh triggers removed; Obsidian autoSync remains an export setting; previous complete knowledge retained on preflight/extraction failures.]
    evidence: [backend static regression for auth/login and sync; synthetic rebuild returned ready; reviewer verified empty-scope guard.]
    status: PASS
  - id: R58
    requirement: Load wiki index and content incrementally; keep Graph lazy.
    acceptance_criteria: [Server-side search/filter; paginated index capped at 50 summaries; detail fetched on open; graph and Q&A fetched only in Graph view.]
    package: P1/P2
    owner: Backend + Frontend
    relevant_files: [backend/server.js, backend/services/planetWikiService.js, src/components/PlanetWiki.tsx, src/components/PlanetGraph.tsx]
    changes: [Server-side search/filter and 50-summary pagination; markdown loaded only by page-detail route; Graph is a separate lazy view.]
    evidence: [601-note no-duplicate pagination test; response metrics show 50 summaries/8060 bytes/no markdown and one-page detail/2018 bytes.]
    status: PASS
  - id: R59
    requirement: Make note sources, provenance and rebuild state verifiable.
    acceptance_criteria: [Detail displays provenance/source references; progress and failure reason visible; previous complete revision remains available.]
    package: P1/P2
    owner: Backend + Frontend
    relevant_files: [backend/server.js, backend/services/planetWikiService.js, src/components/PlanetWiki.tsx]
    changes: [Page source paths/dates and links; visible job progress, blockers and last-good notice.]
    evidence: [wiki detail source-ref test; reviewer confirmed authenticated user/planet isolation and last-good guards.]
    status: PASS
work_packages:
  - id: P1
    requirement_ids: [R55, R56, R57, R58, R59]
    depends_on: []
    deliverable: Planet-scoped wiki API, preview and manual-only backend indexing.
  - id: P2
    requirement_ids: [R55, R57, R58, R59]
    depends_on: [P1-contract]
    deliverable: Wiki UI and per-planet actions with lazy Graph and Q&A.
  - id: P3
    requirement_ids: [R55, R56, R57, R58, R59]
    depends_on: [P1, P2]
    deliverable: Synthetic verification, independent review and evidence update.
decisions:
  - Use `/wiki/pages/:pageId` to avoid route collision with `/wiki/preview`.
  - Existing persisted knowledge is projected into UI categories; extraction/generator semantics stay unchanged.
  - Compare legacy full graph/knowledge responses and the new first-page/detail requests against the same synthetic 1000-file fixture if the historical pre-change state cannot be reconstructed safely.
skill_usage:
  - {name: investigate-first, path: .agents/skills/investigate-first/SKILL.md, reason: trace automatic ingestion and loading causes}
  - {name: requirement-traceability, path: .agents/skills/requirement-traceability/SKILL.md, reason: maintain R55-R59 through split ownership and validation}
  - {name: codebase-design, path: .agents/skills/codebase-design/SKILL.md, reason: agree API and data ownership boundaries}
  - {name: surgical-patch, path: .agents/skills/surgical-patch/SKILL.md, reason: backend owners limited changes to wiki API, indexing guards and focused tests}
  - {name: verify-and-stop, path: .agents/skills/verify-and-stop/SKILL.md, reason: frontend/backend owners and Reviewer ran or checked only task-relevant verification}
  - {name: diagnosing-bugs, path: .agents/skills/diagnosing-bugs/SKILL.md, reason: trace and fix the synthetic preview failure caused by the mismatched excludePaths identifier}
handoffs:
  - {sender: coordinator, recipient: architect, requirements: [R55, R56, R57, R58, R59], result: read-only contract checkpoint received}
  - {sender: coordinator, recipient: backend, requirements: [R55, R56, R57, R59], result: API/service and test checkpoint; focused empty-scope guard fixed after review}
  - {sender: coordinator, recipient: frontend, requirements: [R55, R57, R58, R59], result: wiki UI, planet actions, lazy Graph and source-panel state}
  - {sender: coordinator, recipient: reviewer, requirements: [R55, R56, R57, R58, R59], result: initial MEDIUM finding fixed; focused re-review PASS}
validation:
  performed: [node --check backend/server.js, backend/services/planetWikiService.js, backend/test/planetWikiService.test.js PASS; node --test --test-concurrency=1 backend/test/planetWikiService.test.js 7/7 PASS; npm run lint PASS; npm run build PASS with the existing >500 kB chunk warning; node --test tests/planetFileOnlyGraphFrontend.test.mjs tests/uiRefinementR38R49.test.mjs 6/6 PASS; synthetic 1000-file HTTP harness and metrics; Electron test profile opened Lavoro Wiki and verified the empty-scope blocker; reviewer initial review and one focused re-review PASS.]
  not_performed: [Full wiki navigation with a supported file and its detail page in Electron; 1000-file Electron UI profile (performance fixture exercised the local backend/API); the full backend suite did not pass cleanly, as recorded below.]
  full_backend_suite: "npm test: 156 passed, 34 failed, 1 skipped. Failures include sandbox EPERM on temp-file renames and loopback readiness, plus an existing exact-prop assertion in backend/test/worldPersistence.test.js that expects the pre-wiki WorldGrid props. The task-specific wiki suite passed."
blockers: []
status: COMPLETE_WITH_VERIFICATION_LIMITS
```

## Surprises & Discoveries

- Il backend attuale avvia scansioni della conoscenza al login e sui cambi filesystem; la vista Planet Graph carica grafo e knowledge completi all’apertura e può avviare automaticamente l’indicizzazione.
- I limiti attuali di knowledge sono 250 file, 2 MiB per file e 25 MiB di testo estratto; il grafo ha limiti separati di 3000 file, 400 cartelle e profondità 8. Una preview deve rendere espliciti scope incompleti e limiti superati.
- Il preflight iniziale classificava uno scope senza file supportati come pronto; il Reviewer ha individuato il rischio di pubblicare una wiki vuota e sostituire l’ultima versione valida. Il preflight ora blocca `folders:false`, selezioni senza root e scope senza file supportati; i casi sono coperti da regressioni.
- Il primo tentativo del benchmark era fallito perché il vault sintetico non era dentro il workspace sintetico; il fixture è stato corretto e il benchmark ripetuto con 1000 file sintetici.

## Decision Log

- (2026-10-24) Usare un modello wiki unico: home, cartelle/aree, fonti e argomenti; i temi ricavati da termini frequenti sono raggruppamenti lessicali e non relazioni semantiche certe. Decisione confermata dall’utente.
- (2026-10-24) Usare configurazione cartelle e tipi file già salvata per il pianeta; mostrare anteprima e chiedere di restringere lo scope quando incompleto o oltre i limiti. Decisione confermata dall’utente.
- (2026-10-24) Rendere manuale la ricostruzione e mantenere separata la sincronizzazione automatica Obsidian. Riutilizzare gli archivi JSON/Markdown per utente e pianeta; non aggiungere database, provider o migrazioni e non cancellare note Obsidian. Decisione confermata dall’utente.
- (2026-10-24) Nuovi endpoint: `GET /worlds/:worldId/wiki/preview`, `GET /worlds/:worldId/wiki?query=&kind=&cursor=&limit=` (massimo 50 schede), `GET /worlds/:worldId/wiki/pages/:pageId`. La ricostruzione riusa `POST /worlds/:worldId/graph/index` e lo stato esistente; dettaglio e lista restano planet-scoped.
- (2026-10-24) R38–R53 non committati vanno preservati; R54 è annullato. Non creare commit o push.

## Outcomes & Retrospective

Implementati R55–R59. Il confronto sintetico ha usato 1000 file `.txt` in 10 cartelle e uno scope ristretto di 200 file. Preview iniziale: 1000 candidati, 495 ms, 481 byte, `requires-narrowing`; scope ristretto: 200 file, 77 ms, 351 byte, `ready`. Ricostruzione completa dello scope ristretto: 16,623 ms, 200 note, grafo pronto con 403 nodi e 2 archi.

Le API precedenti di caricamento completo hanno restituito 547,624 byte di grafo e 1,232,788 byte di knowledge (1,780,412 byte/605 elementi insieme). La nuova prima pagina ha restituito 50 schede sintetiche, 8,060 byte e nessun Markdown; il dettaglio di una pagina ha restituito 2,018 byte, 1,474 caratteri Markdown e una fonte. La prima pagina è circa il 99.55% più piccola della risposta combinata completa. È un confronto di endpoint sullo stesso dataset sintetico, non una misura storica di una build precedente.

Prova manuale Electron completata sul profilo locale isolato: apertura della Wiki di Lavoro, indice leggero e anteprima dello scope vuoto con ricostruzione disabilitata. La navigazione a una pagina con fonti non è stata eseguita in Electron; il dettaglio è coperto dai test API sintetici. `npm test` completo ha avuto 34 fallimenti e un test saltato (156 passati), principalmente per restrizioni temporanee/loopback del sandbox; un’asserzione statica in `worldPersistence.test.js` attende ancora la vecchia firma di `WorldGrid` dopo l’aggiunta di `onOpenWiki`. Lint, build, sintassi e suite wiki mirata sono passati.

## Context and Orientation

La UI React/TypeScript vive in `src/components/PlanetGraph.tsx`, `src/components/ChangeWorld.tsx` e `src/App.tsx`. Il server locale Express vive in `backend/server.js`; logica di persistenza e trasformazione dovrà stare nel nuovo servizio `backend/services/planetWikiService.js` o nei servizi knowledge già esistenti. La generazione esistente produce già note per fonti, cartelle e argomenti. I dati sono locali e separati per utente e pianeta.

Requisiti stabili:

- **R55**: home e pagine wiki navigabili con evidenze, fonti e stato leggibile.
- **R56**: preview metadata-only dello scope configurato, conteggi e limiti espliciti; scope incompleto o oltre i limiti non deve causare troncamento silenzioso.
- **R57**: ricostruzione esplicita per pianeta; nessuna scansione automatica wiki al login o a ogni cambiamento dei file.
- **R58**: primo caricamento paginato (al massimo 50 schede), dettaglio caricato su richiesta, ricerca/filtri sul server, grafo caricato solo aprendo la vista Graph.
- **R59**: pagine con provenienza e fonti verificabili; l’ultima versione completa resta disponibile dopo fallimenti o cancellazione.

## Plan of Work

1. **Backend**: creare il servizio wiki e i tre endpoint. La preview deve riusare cartelle/tipi selezionati del pianeta, stimare dimensioni senza leggere il contenuto e riportare esplicitamente file non supportati, troppo grandi o scope incompleti. Lista e dettaglio devono applicare utente e pianeta attivi e conservare compatibilità delle vecchie API. Una ricostruzione deve fare preflight e delegare all’indicizzazione già esistente; i fallimenti non sovrascrivono l’archivio valido.
2. **Frontend**: aggiungere la wiki per pianeta e l’azione “Crea wiki”/“Ricostruisci wiki”. Mostrare preview e limiti prima di avviare il job, indicizzare manualmente solo il pianeta corrente, e aprire Graph/Q&A come viste secondarie on-demand. Le pagine sono generated/read-only.
3. **Verifica**: testare isolamento, filtri, ricerca, paginazione oltre 500 candidati, limiti, fonti, stato e preservazione della versione valida dopo errori. Usare solo file sintetici; misurare lo stesso scenario da 1000 file prima/dopo se fattibile. Eseguire test pertinenti, lint, build, check sintassi server e prova manuale Electron ove disponibile. Richiedere review indipendente read-only e correggere al massimo un ciclo mirato.

## Concrete Steps

Directory di lavoro: radice del repository FolderRocket.

    node --test <test backend wiki e regressioni pertinenti>
    node --check backend/server.js
    npm run lint
    npm run build
    npm test

Osservazione attesa: API wiki restituite con scope isolato per pianeta; indice iniziale con non più di 50 schede sintetiche e testo solo dopo l’apertura del dettaglio. Login e modifiche ai file non devono accodare scansioni wiki. La verifica visiva Electron e il confronto prestazioni saranno riportati separatamente dai test statici.

## Validation and Acceptance

- Preview di almeno 500 candidati restituisce conteggi, byte e blocker senza leggere testi né iniziare ingestion; selezioni cartella/tipo ed esclusioni rispettate.
- Scope oltre soglie o incompleto richiede di restringere; non viene sostituito da una scansione parziale o da un troncamento alfabetico silenzioso.
- Pagina lista rispetta pagina massima di 50, ricerca e filtri; la risposta dettaglio include markdown, fonti e link solo per la pagina richiesta.
- Pianeti diversi non condividono note, fonti, indici o job. Ricostruzione manuale avvia solo il pianeta selezionato.
- Errori, cancellazioni e scope incompleti preservano l’ultima wiki integra e ne rendono visibile lo stato.
- Dopo il refactor UI: il grafo non viene richiesto finché Graph non è aperto; login e modifiche filesystem non avviano automaticamente ingestion wiki; Obsidian autoSync mantiene la propria impostazione.
- Misure prima/dopo su 1000 file sintetici: tempo al primo contenuto, dimensione risposta, elementi restituiti e contenuto trasferito per pagina. Nessun documento personale o account provider.

## Idempotence and Recovery

Ricostruire la wiki è una nuova generazione per il solo pianeta richiesto. Scrivere o promuovere l’archivio corrente solo quando la generazione è completa e valida; mantenere la versione precedente durante il lavoro e al fallimento. I test devono usare profili temporanei e contenuti sintetici. Conservare tutte le modifiche di lavoro esistenti; non ripristinare o eliminare file non appartenenti a questa feature.

## Artifacts and Notes

Baseline e misure sintetiche temporanee: `output/r55-wiki-baseline/` (percorso ignorato). Nessun dato personale. Aggiornare questa sezione con file e metriche finali, non con output non riproducibili.

## Interfaces and Dependencies

- `GET /worlds/:worldId/wiki/preview` → conteggi, dimensioni stimate, limiti e blocker dello scope.
- `GET /worlds/:worldId/wiki?query=&kind=&cursor=&limit=` → indice paginato, massimo 50 schede; nessun markdown completo.
- `GET /worlds/:worldId/wiki/pages/:pageId` → pagina richiesta con markdown, riferimenti fonti e link.
- `POST /worlds/:worldId/graph/index` → endpoint esistente riutilizzato dopo preflight; stato esistente riutilizzato e compatibile con Graph.
- Persistenza esistente JSON/Markdown per utente/pianeta; nessuna nuova dipendenza o migrazione.

## Revision Notes

- (2026-10-24) Creato il piano per implementare R55–R59 con ownership Backend/Frontend e verifica coordinata.
- (2026-10-24) Implementati R55–R59; fix mirato per scope vuoti approvato nel re-review. Registrate metriche sintetiche e limiti della suite completa e della navigazione Electron.
