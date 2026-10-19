# Correggere snapshot, diagnostica, conversazioni e layout

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Eliminare le richieste automatiche di snapshot quando la sorgente è disattivata, rendere diagnosticabile il caricamento delle conversazioni e confinare EPIPE al solo canale di logging quando verificabile. Rifinire i controlli e la gerarchia del Desktop in Tree Rocket, ridurre le intestazioni Name/Path/Description in Folder Management e mantenere il worktree locale intatto.

## Progress

- [x] (2026-10-06 06:08Z) Ricostruiti i flussi e aggiornato Graphify; confermato il difetto snapshot client/server.
- [x] (2026-10-06 06:19Z) Applicare gating snapshot, Retry conversazioni, stati UI e allineamento radice Tree Rocket; test frontend mirati.
- [x] (2026-10-06 06:21Z) Aggiungere codici diagnostici sanitizzati per errori provider e verifica mirata. EPIPE non riprodotto sul caso reale.
- [x] (2026-10-06 06:31Z) Aggiungere una protezione limitata agli errori EPIPE su stdout/stderr e test sintetici, lasciando propagare altri errori degli stream.
- [x] (2026-10-06 06:35Z) Completare i test mirati, lint, build, sintassi e suite backend; annotare i limiti del sandbox e della verifica visuale.

## Surprises & Discoveries

- Il frontend programmava snapshot iniziali, periodici e su eventi quando il grafo era attivo, senza verificare `sourceSelection.snapshots`; la route backend già risponde 409 quando la sorgente è esclusa.
- La diagnosi fornita per le conversazioni riporta solo `fetch failed` e un riferimento; il riferimento non è disponibile nel repository né nell'allegato. La causa runtime non è confermata.
- EPIPE è coerente con le pipe stdout/stderr del backend avviato da Electron, ma il caso runtime non è stato riprodotto. La protezione ora consuma solo `EPIPE` su stdout/stderr; gli altri errori degli stream continuano a propagarsi.
- Tree Rocket già implementa le radici Desktop personale/pubblica e la paginazione delle sottocartelle; concentrare gli interventi su disposizione e accessibilità, non sostituire la scansione.
- La suite backend completa passa 104/107 test. I due test di avvio avviano e registrano il server ma il client di test non raggiunge il loopback nel sandbox; il test dei link simbolici Windows riceve EPERM. La suite è stata ripetuta con una cartella temporanea effimera nel repository, poi rimossa.
- Il browser integrato non riesce ad aprire il server Vite locale (`ERR_CONNECTION_TIMED_OUT`); la verifica visuale reale resta da fare fuori dal sandbox.

## Decision Log

- (2026-10-06) Preservare tutti i cambi preesistenti nel worktree; nessun reset o riscrittura integrale.
- (2026-10-06) Non indovinare la causa del problema email o EPIPE senza riproduzione. Non registrare contenuti email, token o dati personali.
- (2026-10-06) Per email e sottocartelle mantenere il caricamento limitato e paginato esistente.

## Outcomes & Retrospective

Gating snapshot e Retry conversazioni sono implementati e testati. Il backend ora classifica errori di autenticazione, throttling e indisponibilità provider senza esporre testo dell’errore o contenuti email. La protezione EPIPE è testata con stream sintetici, ma il guasto originale non è stato riprodotto. Tree Rocket distingue chiaramente Desktop personale/pubblico e mantiene la paginazione; queste parti sono confermate da codice e test, non da una prova visuale con cartelle reali.

## Context and Orientation

Il frontend React è in `src/App.tsx` e `src/components/`; il backend Express e le route sono in `backend/server.js`; Electron inoltra i log del processo backend da `desktop/main.cjs`. Gli stili condivisi sono in `src/App.css`. `src/components/TreeRocket.tsx` usa le API Tree Rocket e la paginazione esistente. `backend/test/`, `tests/` e `tests/ui/` contengono i test pertinenti. Graphify è un aiuto statico per navigare le dipendenze del codice, non prova il comportamento runtime.

## Plan of Work

1. Frontend: condizionare pianificazione e richieste snapshot sia sul grafo sia sulla sorgente del pianeta corrente; interrompere o ignorare risposte obsolete; controllare gli status HTTP. Aggiungere Retry esplicito per i messaggi e la lista conversazioni senza duplicare invii né cambiare l’account per pianeta.
2. Backend/Electron: aggiungere solo protezioni EPIPE limitate agli stream di output e test controllabili; non sopprimere eccezioni generali o errori di avvio. Rendere gli errori email classificabili/correlabili senza dati sensibili, solo dove il flusso corrente lo consente.
3. UI: uniformare stati hover/focus/pressed blu per Add Source e navigazione, rispettando reduced motion; regolare la disposizione Desktop e cartelle in Tree Rocket senza rimuovere risoluzione personal/public, paginazione o zoom condiviso; ridurre solo le intestazioni di Folder Management.
4. Validazione: test mirati, suite backend, test helper frontend, lint e build; prova visiva se l’interfaccia è disponibile. Nessun commit/push.

## Concrete Steps

Directory: radice del repository `C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`.

    npm test
    node --test tests/snapshotSyncGating.test.mjs tests/worldObsidianFrontend.test.mjs tests/workspaceLayoutAndEmailPagination.test.mjs
    node --test --test-name-pattern="conversation fetch failures" backend/test/planetGraphAndConversation.test.js
    npm run lint
    npm run build
    Set-Location backend; node --check server.js

## Validation and Acceptance

- Con sorgente snapshot disattivata, non partono invii periodici o su evento e non si accumulano 409; riattivandola riprende la sincronizzazione solo per il pianeta attivo.
- Errori di conversazione mostrano Retry e non espongono email, token o stack sensibili; le richieste obsolete non aggiornano la chat selezionata.
- EPIPE del solo logging non abbatte il server; errori di bind/listen restano diagnosticabili.
- Le radici Desktop personale/pubblica restano distinte, le cartelle sono raggiungibili e ordinate; navigazione, caricamento successivo e zoom condiviso non regrediscono.
- I controlli hanno stati blu accessibili, e le intestazioni Name/Path/Description sono più compatte senza alterare contenuti delle righe.
- Esito automatico: test UI/helper mirati 14/14; test Tree Rocket ed EPIPE 14/14; test provider diagnostico 1/1; lint, build (incluso TypeScript), `node --check` e `git diff --check` superati. `npm test`: 104/107; due test HTTP locali non raggiungibili nel sandbox e uno richiede symlink Windows non consentiti.
- Verifica visuale tentata aprendo il fixture `tests/ui/tree-rocket-smoke.html` con Vite; il browser integrato non ha raggiunto `127.0.0.1:5173` (`ERR_CONNECTION_TIMED_OUT`). Non dichiarare la verifica visiva completata.

## Idempotence and Recovery

Le modifiche sono additive e i test usano stub/fixture, senza account reali o dati utente. Preservare ogni modifica preesistente; non ripristinare file tramite checkout/reset. Se un test fallisce, correggere solo la superficie posseduta o documentare l’impedimento.

## Artifacts and Notes

Il grafo Graphify aggiornato è in `graphify-out/` (ignorato da Git). L’allegato diagnostico fornito è incompleto e contiene un riferimento che non viene cercato in registri locali.

## Interfaces and Dependencies

Riutilizzare le API snapshot e conversazioni, lo stato selezione email per pianeta, i servizi di paginazione esistenti, le API Desktop di Tree Rocket, i CSS class già presenti e il logger diagnostico. Nessuna nuova dipendenza prevista.

## Revision Notes

- 2026-10-06: piano iniziale basato sull’analisi e sul prompt allegato; nessuna causa runtime non provata elevata a fatto.
- 2026-10-06 06:35Z: completata implementazione e validazione; aggiunto guard EPIPE strettamente circoscritto; precisati test bloccati dal sandbox e verifica visiva non disponibile.
