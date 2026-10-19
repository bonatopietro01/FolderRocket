# Eseguire il prompt FolderRocket: Tree Rocket, Obsidian e UI

Questo ExecPlan segue `PLANS.md`. È il piano vivo per la richiesta allegata e conserva gli ID R1–R11.

## Purpose / Big Picture

Rendere Tree Rocket leggibile e stabile con cartella selezionata a sinistra, file in un pannello separato e card più compatte; generare note Markdown Obsidian collegate e coerenti con le sorgenti selezionate; chiarire Dashboard, viaggio tra pianeti, globo luminoso e account Gmail.

## Progress

- [x] (2026-10-09 14:52Z) Letto il prompt allegato, `AGENTS.md`, `CODEX.md`, `PLANS.md`; registrato lo stato Git già modificato.
- [x] (2026-10-09 14:52Z) Avviata analisi Architect read-only del contratto grafo/vault e assegnate le superfici UI a Frontend.
- [x] (2026-10-09 15:02Z) Completate le modifiche UI/backend e concordato il modello README → hub sorgenti → note entità; sync usa link Obsidian risolti e scope sorgente coerenti.
- [x] (2026-10-09 15:18Z) Aggiunte fixture sintetiche per risposte Tree Rocket ritardate e catalogo Gmail (più account, singolo, vuoto, loading, error); aggiornati test Obsidian per le vere identità sorgente.
- [x] (2026-10-09 15:23Z) Eseguiti build/lint e verifiche mirate; suite completa ripetuta, con errori e limiti d’ambiente registrati sotto.
- [x] (2026-10-09 15:25Z) Reviewer read-only riesamina il ciclo di correzione; i difetti di async, collegamenti README e scope sorgente sono risolti. Rimane il feedback sulla larghezza della rail preview chiusa, registrato come limite UI.

## Surprises & Discoveries

La worktree contiene molte modifiche preesistenti, incluse modifiche precedenti a Tree Rocket, Obsidian, account Gmail, dashboard e test. Va preservata ogni modifica. `backend/services/obsidianVaultService.js` generava già file Markdown per nodi e file `relation` separati per gli archi; la nuova proiezione usa entità/hub sorgente con link interni risolti e rimuove le note relazione rumorose. Suite completa finale: 127/130. Due test che avviano il server non riescono a completare richieste HTTP locali anche se il processo dichiara di ascoltare; il test Obsidian isolato fallisce allo stesso modo, coerente con la restrizione socket del sandbox. Il test symlink fallisce con `EPERM` nel sandbox Windows. Questi limiti non sono corretti aumentando i timeout. La precedente asserzione attività/search usava nodi sintetici senza riferimenti sorgente realistici e si aspettava di esportare nodi senza una sorgente; la fixture ora modella `sourceType/sourceRef` reali e il test specifico passa.

## Decision Log

- 2026-10-09, coordinatore: IDs R1–R11 dal prompt allegato restano stabili. Il prompt autorizza l’implementazione, le fixture e i test specificati.
- 2026-10-09, coordinatore: nessun file personale, token OAuth o account reale va modificato durante le verifiche; usare dati sintetici.
- 2026-10-09, coordinatore: il coordinatore possiede piano, fixture/test e raccolta prove; Architect analizza contratto read-only; Frontend e Backend hanno ambiti disgiunti; Reviewer è solo read-only.

## Outcomes & Retrospective

La prima review ha individuato cinque difetti. Il riesame conferma la correzione delle risposte obsolete, dei link dal README agli hub, degli scope filesystem e della chiarezza account Gmail. La rail file è sempre montata per evitare che il grafo si sposti; quando è chiusa mostra un placeholder contestuale. Reviewer considera ancora troppo ampia la riserva (210–270px desktop, 140px–30vh mobile). La geometria non è verificabile nel browser disponibile; questo resta il principale limite UI. Test/build non provano layout visivo o integrazioni live.

## Context and Orientation

Frontend: `src/components/TreeRocket.tsx`, `src/App.css`, `src/worlds.css`, `src/components/ChangeWorld.tsx`, `src/components/EmailConversations.tsx`. Backend/vault: `backend/services/obsidianVaultService.js`, `backend/services/planetGraphService.js`, route grafo/vault in `backend/server.js`. Verificare le route nel sorgente attuale prima di cambiare contratti. Test esistenti in `backend/test/obsidianAndWorldSettings.test.js`, `backend/test/planetGraphAndConversation.test.js`, `backend/test/backendLifecycle.test.js`, `backend/test/dashboardTreeRocketUi.test.js`, `backend/test/treeRocketService.test.js` e `tests/`.

## Requirement coverage / TaskState

| ID | Requisito e criterio osservabile | Pacchetto / owner | File o contratto candidato | Evidenza richiesta | Stato |
|---|---|---|---|---|---|
| R1 | Cartella aperta a sinistra; gerarchia e breadcrumb senza overlap | UI / Frontend | TreeRocket.tsx, App.css | Test fixture/statici; reviewer segnala rail larga quando il preview è chiuso; screenshot/bounds non ottenuti | Implementato; limite UI aperto |
| R2 | Intera card apre cartella; pulsanti figli operano solo autonomamente; tastiera accessibile | UI / Frontend | TreeRocket.tsx, App.css | Fixture/test del contratto; click UI non eseguito | Implementato; browser non verificato |
| R3 | Pannello file separato a sinistra, scroll/paging propri, geometria card stabile, no risultati stale | UI / Frontend | TreeRocket.tsx, App.css | Request ID + abort; Project 20 ritardato nel mock; reviewer conferma la stabilità tra aperture | Implementato; compattezza rail non verificata |
| R4 | Card moderatamente più piccole, leggibili per 0/1/2/20 cartelle e nomi lunghi | UI / Frontend | TreeRocket.tsx, App.css | Fixture sintetica 0/1/2/20 e nomi lunghi | Implementato; misure visuali non ottenute |
| R5 | Note .md significative per entità/sorgente con contesto e provenienza | Vault / Architect→Backend | obsidianVaultService.js | Proiezione e provenienza coperte da test backend | Implementato; vault live non usato |
| R6 | Link Markdown interni risolti, hub pianeta/sorgente; niente archi inventati o note tecniche rumorose | Vault / Architect→Backend | graphRecords, toMarkdown | Test README: link ai soli hub emessi, target risolti; suite mirata passata | Implementato; vault live non usato |
| R7 | Stesso scope e selezioni grafo/vault, idempotenza, conflitti/manual edits e parziali preservati | Vault / Architect→Backend | server route, filterGraphBySources, syncVault | `filesystem:folder:<id>` allineato; pruning parziale/manuale/idempotente coperto | Implementato; vault live non usato |
| R8 | Nav Dashboard su 2 righe, simmetrica con controlli a sinistra e misure uniformi | UI / Frontend | App.css, App.tsx se necessario | Fixture con classi di produzione e controlli statici | Implementato; misure browser non ottenute |
| R9 | Logo/titolo Fly to Another Planet allineati; glowing nella stessa box degli altri stili | UI / Frontend | worlds.css, ChangeWorld.tsx | Fixture/stile sintetico e test statici | Implementato; card renderizzata non verificata |
| R10 | Account Gmail connessi distinti da quello selezionato per pianeta; stati e azioni chiare | UI / Frontend | ChangeWorld.tsx, EmailConversations.tsx | Fixture multi/uno/vuoto/loading/error; catalogo locale e percorso Dashboard → Gmail | Implementato; Gmail live non collegato |
| R11 | Test, lint/build, npm test, syntax check server se cambia, diff check, review e limiti | QA / coordinatore + Reviewer | fixtures/tests/plan | Build/lint/mirate passano; npm test 127/130; syntax/diff passati; re-review completato con limite rail registrato | Completato con limiti |

## Plan of Work

Architect esamina prima il contratto dei record Markdown, selezione fonti, archi e sincronizzazione; Backend modifica soltanto dopo l’accordo del contratto. Frontend implementa Tree Rocket, Dashboard, planet travel, stile glowing e chiarezza Gmail in file assegnati. Il coordinatore aggiunge test/fixture per i requisiti senza copertura. La verifica browser usa solo fixture sintetiche, se la policy browser lo consente; non avvia o riavvia l’istanza app attiva.

## Concrete Steps

Dalla root `C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`:

    node --test <test mirati concordati>
    npm run lint
    npm run build
    npm test
    node --check backend/server.js
    git diff --check

Le suite effettive vanno scelte sui file modificati e registrate prima della consegna. Un errore intermittente va riportato con log e stato osservato, non coperto aumentando solo i timeout.

## Validation and Acceptance

Accettazione Tree: cliccare radice/card e controlli; aprire file con molte pagine; verificare che card non crescano e che lista/cartelle abbiano scroll indipendenti. Provare 0/1/2/20 cartelle, nomi lunghi, viewport largo/stretto. R8–R10: fixture visuale con nav su due righe, header planet travel, glowing nelle diverse scale e più account sintetici per pianeta. Vault: esempio piccolo delle note, ogni wikilink risolto, tutte le entità raggiungibili dall’hub della propria sorgente, sorgenti escluse assenti, rigenerazione idempotente, manual edit e dati di altre sorgenti preservati. Reviewer confronta codice, test e prove.

## Idempotence and Recovery

Non eseguire sincronizzazione su vault personale. Testare su directory temporanea sintetica; ripetere sync senza duplicare note. Non usare reset/clean/revert. In caso di errore ripristinare soltanto i propri hunk documentati, preservando modifiche preesistenti.

## Artifacts and Notes

Prompt eseguibile: `docs/prompts/folderrocket-improved-execution-2026-10-09.md`. Handoff originale: `docs/plans/prompt-execution-refinement-2026-10-09.md`. Documentazione ufficiale Obsidian: https://obsidian.md/help/plugins/graph e https://obsidian.md/help/links.

## Interfaces and Dependencies

Usare i tipi e le route correnti per Planet/account/source selection. Per Obsidian, wikilink relativi al vault con `/` e nomi sicuri; mantenere manifest, stable IDs, protezione conflitti e selezioni. Nessuna nuova dipendenza prevista senza motivazione verificata.

## Revision Notes

- 2026-10-09: creato piano dalla richiesta allegata, con copertura R1–R11 prima delle implementazioni.
- 2026-10-09 15:25Z: registrati esiti build/lint/test e limiti dopo il riesame mirato; verifica visiva non ottenuta.
