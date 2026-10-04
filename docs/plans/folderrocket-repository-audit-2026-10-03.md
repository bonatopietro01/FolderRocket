# Audit and stabilize FolderRocket

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Esaminare i sorgenti, i test, la documentazione e la configurazione di FolderRocket per individuare difetti riproducibili, colli di bottiglia e differenze tra requisiti documentati e implementazione. Correggere soltanto problemi circoscritti e dimostrati, preservando dati locali e tutte le modifiche preesistenti. Le nuove funzioni e i refactor ampi saranno raccomandazioni separate.

## Progress

- [x] (2026-10-03 16:41Z) Verificati branch e modifiche iniziali; inventariati file tracciati per area e file non ignorati; letti README, PLANS, AGENTS, CODEX, package e istruzioni dei test.
- [x] (2026-10-03 16:41Z) Verificata la freschezza di Graphify e interrogati startup/prestazioni, operazioni file e isolamento per pianeta.
- [x] (2026-10-03 16:50Z) Baseline completata: `npm run build`, `npm run lint`, `npm test` (60/60) e tutti i test `tests/*.test.mjs` (31/31) passano con Node 24.18.1.
- [x] (2026-10-03 17:02Z) Provate le fixture UI sintetiche: apertura/cancellazione hover, preview file e conferma Add in Tree Rocket; modalità Folder/Apps e layout dashboard a 640×800 e 1280×720.
- [x] (2026-10-03 17:08Z) Confermati e corretti tre difetti: letture sincrone degli allegati email, enumerazione sincrona nella ricerca, redazione incompleta dei percorsi Windows con spazi.
- [x] (2026-10-03 17:10Z) Riprodotto con junction temporanea l’accesso lessicale a un target esterno; aggiunta validazione realpath per i percorsi degli account non amministratori, con test su link interni/esterni e destinazioni mancanti.
- [x] (2026-10-03 17:12Z) Aggiornato Graphify incrementale (1955 nodi, 3783 archi) e interrogate le relazioni dei nuovi helper e dei flussi di ricerca/bozza.
- [x] (2026-10-03 17:29Z) Completati build, lint, suite backend (63/63), test helper (32/32), controlli sintassi, fixture UI e verifica finale del diff; aggiornato Graphify all'ultimo sorgente.

## Surprises & Discoveries

- All'inizio del lavoro il branch è `feature/desktop-foundation`. Erano già presenti modifiche a `AGENTS.md`, `src/App.css`, `src/components/TreeRocket.tsx`, test UI e `.codex/agents/`; vanno preservate.
- Il grafo `graphify-out/graph.json` iniziale conteneva 1916 nodi. È stato aggiornato due volte durante l'audit; il risultato finale contiene 1955 nodi e 3778 archi. Le query mirate confermano i punti d'ingresso `src/App.tsx`, `src/api.ts`, `backend/server.js`, i flussi file, la ricerca e le bozze email. Ogni relazione è stata verificata nel codice e nei test pertinenti.
- Il repository documenta profili locali e permessi futuri in `docs/LOCAL_PROFILES_ROADMAP.md` e `docs/WORLD_PERMISSIONS_FUTURE.md`, oltre a più piani Tree Rocket e note workflow.
- La build Vite segnala CSS come principale quota dei tempi di plugin; gli asset `tree-rocket-logo.png` (1.45 MB) e `folderrocket-space-login.png` (1.71 MB) sono grandi. La build elenca però diversi chunk e non stabilisce che questi asset rallentino l'avvio: verificarne i punti di caricamento e misurare prima di proporre ottimizzazioni.

- Gmail e Outlook codificavano gli allegati delle bozze dopo `readFileSync` nel percorso delle API asincrone. Le letture ora usano `fs.promises.readFile` in sequenza; test sintetici verificano più allegati, byte e ordine, e falliscono se viene chiamato `readFileSync`.
- `searchService` contava al massimo 1200 file ma attraversava le directory con `readdirSync`, controllava la radice con `existsSync/statSync` e otteneva sincronicamente le dimensioni dei risultati. Ora enumera e legge i metadati in modo asincrono e cede l’event loop ogni 250 voci; mantiene lo stesso limite di file e non tronca deliberatamente la completezza della ricerca. Non esiste ancora un limite sul numero totale di directory: su alberi enormi la ricerca può quindi restare lunga, ma non monopolizza intenzionalmente l’event loop.
- La sanitizzazione diagnostica sostituiva solo il primo segmento di un path Windows contenente spazi. Un esempio sintetico mostrava che il resto del nome continuava nel testo salvato. La redazione frontend/backend ora comprende i percorsi con spazi e preserva la parentesi/contesto successivo; test coprono entrambe le implementazioni.
- Un controllo di sicurezza su directory temporanee ha dimostrato che la verifica solo lessicale di `assertUserPath` accettava una junction dentro un workspace con target esterno. È stata aggiunta `userPathSecurity.assertWorkspacePath`, che verifica il percorso canonico e l’antenato esistente per destinazioni nuove; i percorsi amministratore non cambiano.
- Microbenchmark Windows/Node 24.18.1, 12 letture per dimensione su file temporanei sintetici: ritardo event-loop mediano/p95 della sola lettura, sync 3 MB 2.291/2.610 ms vs async 0.066/0.119 ms; sync 20 MB 10.552/12.745 ms vs async 0.064/0.126 ms. Non include codifica base64, rete OAuth, persistenza o avvio completo dell’app.
- Matrice documentale: profili locali di `LOCAL_PROFILES_ROADMAP.md` non implementati (nessun archivio/versione o chooser `/profiles` rilevato); i permessi per pianeta sono predisposti ma inattivi come specificato; Tree Rocket, notifiche email per ambiente, Teams e Change Format hanno UI/servizi/test, mentre provider reali, hardware Phone e altri dispositivi non sono verificati dal test locale. I piani storici sono requisiti contestuali, non autorizzazione a introdurre funzioni nuove.
- Prova UI con fixture a 1280×720 e 640×800: Tree Rocket Folder/Apps, 12 card Apps raggiungibili scorrendo senza footer fisso; Show Files si chiude cliccando fuori e Add mostra la conferma mock; hover drag supera i 2 s e l’uscita anticipata lo annulla; layout dashboard Folders on Top/Three Columns navigabili. Nessun account, file utente o servizio live usato; fixture non dimostra avvio desktop, OAuth o trasferimenti reali.
- Un'osservazione della console durante la fixture `/tests/ui/workspace-smoke.html` ha rivelato che `ApplicationsWorkspace` veniva montato senza i props obbligatori `folders` e `onVirtualFilesAdd`, provocando un errore React prima di `folders.filter`. La fixture ora passa un array vuoto sintetico e un callback no-op; riaperta dopo la correzione, mostra Applications e le due app dimostrative senza il crash. Questo era un difetto della fixture, non del wiring di produzione (`src/App.tsx` passa entrambi i props).

## Decision Log

- (2026-10-03) Limitare le correzioni a difetti riproducibili e cambi circoscritti; non considerare la roadmap come autorizzazione a implementare nuove funzionalità.
- (2026-10-03) Usare `git status` iniziale come confine di proprietà e non modificare le aree già sporche salvo necessità inevitabile; prima cercare un intervento non conflittuale.
- (2026-10-03) Mantenere la ricerca completa oltre 1200 directory, cedendo però l’event loop durante le liste ampie; un limite strutturale potrebbe nascondere risultati e richiede un indicatore esplicito di risultati parziali.
- (2026-10-03) Applicare il controllo realpath ai soli utenti non amministratori; non cambiare la capacità di navigazione host dell’amministratore.
- (2026-10-03) Non comprimere o ridisegnare gli asset grandi basandosi solo sulla dimensione: manca una misura attendibile della loro influenza sul caricamento iniziale e una comparazione visuale.

## Outcomes & Retrospective

Tre correzioni prestazionali/privacy e una correzione di isolamento dei percorsi sono implementate con test mirati. È stata corretta anche la fixture UI che montava ApplicationsWorkspace senza props obbligatori. Validazione finale: build, lint, 63 test backend, 32 test helper, sintassi Node e `git diff --check` superati. Graphify è aggiornato (1955 nodi, 3778 archi). Le verifiche restano circoscritte a fixture e dati sintetici; le integrazioni live e l’avvio desktop non sono stati provati.

## Context and Orientation

Moduli nuovi/modificati per l’audit: `backend/services/searchService.js`, `backend/services/gmailService.js`, `backend/services/outlookService.js`, `backend/services/diagnosticsService.js`, `backend/services/userPathSecurity.js`, `src/diagnostics.ts`; test nuovi/estesi in `backend/test/` e `tests/diagnostics.test.mjs`.

Frontend React/TypeScript/Vite in `src/`, API comune in `src/api.ts`, backend Node/Express in `backend/`, processi e preload Electron in `desktop/`, estensione opzionale Gmail in `browser-extension/`, test backend in `backend/test/` e regressioni/helper/fixture UI in `tests/`. I package definiscono `npm run build` (TypeScript e Vite), `npm run lint`, `npm test` e `npm run graph:build`. `tests/README.md` descrive i test helper Node 24 e le fixture UI.

Per modifiche alla dashboard Tree Rocket si deve rispettare il worktree già modificato: `src/App.css`, `src/components/TreeRocket.tsx`, `backend/test/dashboardTreeRocketUi.test.js`, `tests/README.md` e `tests/ui/tree-rocket-smoke.tsx`.

## Plan of Work

Stabilire la baseline senza alterare i dati utente. Leggere tutte le note di progetto e i piani, quindi raggruppare i sorgenti/test per frontend, backend, Electron, extension e persistence. Cercare errori statici e comportamenti incoerenti e seguire i flussi nei sorgenti; usare gli esiti dei test e le fixture UI per confermare. Per ogni possibile problema annotare riproduzione, gravità, impatto e prove. Correggere soltanto cause confermate e a basso raggio; ogni cambiamento deve avere una verifica pertinente. Riferire le roadmap incomplete come stato e proposta separata.

## Concrete Steps

Dalla root `C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`:

    npm run build
    npm run lint
    npm test
    node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs

Se si modifica il backend, dalla directory `backend/` eseguire `node --check server.js`. Eseguire `npm run graph:build` solo se il grafo è mancante o più vecchio dei sorgenti rilevanti. Per la verifica UI usare `npm run dev` e le fixture indicate in `tests/README.md`, senza collegare account reali né accedere ai file personali.

## Validation and Acceptance

L'audit è concluso quando tutte le aree e i file tracciati sono stati inventariati e sottoposti a controlli proporzionati, i problemi sono separati tra confermati e rischi, le correzioni incluse hanno test/verifiche pertinenti e i risultati indicano limiti runtime o integrazioni non testate. La UI è verificata visivamente soltanto se è stata aperta la fixture o l'app. Il confronto prestazionale è valido solo se lo stesso scenario è misurato prima e dopo.

## Idempotence and Recovery

Le verifiche vanno eseguite su fixture e directory temporanee. Prima di qualsiasi comando che possa sovrascrivere output, verificare il relativo percorso e mantenere `backend/data/`, `backend/uploads/`, `.env` e tutti i file locali intatti. In caso di errore nei test, raccogliere l'output senza ripristinare o eliminare modifiche locali.

## Artifacts and Notes

Conservare in questo piano il riepilogo delle evidenze e le misure, senza inserire credenziali, stack trace che contengano dati personali o documenti utente.

## Interfaces and Dependencies

Nessuna API o dipendenza nuova prevista. I controlli usano script e strumenti già definiti nei `package.json`, `AGENTS.md`, `CODEX.md` e `tests/README.md`.

## Revision Notes

- 2026-10-03: creato il piano iniziale per registrare baseline, copertura, correzioni circoscritte e verifiche dell'audit richiesto.
- 2026-10-03: completato audit, aggiornato il grafo e registrate le correzioni e le verifiche finali; nessun commit o push creato. Le correzioni di file asincrono e ricerca hanno test di regressione; la misura temporale quantitativa riportata riguarda solo le letture, non una durata complessiva dell'app.
