# Planet Knowledge Network for Obsidian

Questo ExecPlan segue `PLANS.md`. È un documento vivo: requisiti, responsabili, avanzamento, decisioni ed evidenze vengono aggiornati a ogni tappa.

## Purpose / Big Picture

Trasformare le sorgenti scelte dentro un Planet in una rete locale e aggiornata di note Markdown utili. L’utente vedrà quali sorgenti sono autorizzate, quali documenti sono stati letti o esclusi e perché, quali note e relazioni sono state conservate, e potrà esplorare o interrogare localmente una vista limitata del grafo. Planet Graph e le note generate da FolderRocket devono derivare dalla stessa rete canonica. Nessun servizio AI esterno sarà chiamato da questo flusso.

Poiché il repository non contiene un modello locale o un motore di embeddings, la prima implementazione userà estrattori locali già installati e metodi deterministici basati sul testo; mostrerà esplicitamente quando una sorgente non è leggibile e non attribuirà capacità semantiche non presenti.

## Progress

- [x] (2026-10-11 UTC) Letti i requisiti allegati, `AGENTS.md`, `CODEX.md`, `PLANS.md`, lo skill di requirement traceability e verificato lo stato Git senza ripulire modifiche preesistenti.
- [x] (2026-10-11 UTC) Architect ha verificato gli attuali confini di selezione, graph, vault, query, autorizzazione e le capacità locali disponibili.
- [x] (2026-10-11 UTC) Concordati contratti e owner per intake locale, engine AI-free, manifest/persistenza, job scoped e pannello UI prima dell’implementazione.
- [x] (2026-10-11 UTC) P2: generare e aggiornare note/relazioni localmente da sorgenti autorizzate, con prove, esclusioni, protezione delle modifiche manuali e limiti.
- [x] (2026-10-11 UTC) P3: mostrare scope, stato, knowledge graph limitato, query locale e pacchetto di contesto copiabile.
- [x] (2026-10-11 UTC) P4: regressioni rappresentative, build/lint, documentazione e review finale indipendente; i rilievi concreti sono stati corretti con prove mirate.

### Requirement traceability

| ID | Criterio osservabile | Owner | Dipendenze | Evidenza |
|---|---|---|---|---|
| R1 | Intake risolve esclusivamente le cartelle, i file/type e thread/account selezionati sul Planet autenticato; esclusioni file stabili vengono persistite; nessun path arbitrario del client viene letto. | Backend + Frontend | selezione esistente, Architect | test autorizzazione/scope, route e selector |
| R2 | Estrazione, selezione, sintesi, relazioni, query e contesto della feature non importano né chiamano provider AI; limiti e formati non supportati sono espliciti. | AIEngineer + Backend | inventory parser locali | test spy/contract e audit imports |
| R3 | Metadati e limiti filtrano prima della lettura; duplicati, temporanei, contenuti vuoti/ripetitivi e formati non supportati hanno motivazioni registrate; gli originali non cambiano. | Backend + AIEngineer | R1, R2 | test fixtures e hash originali |
| R4 | Note stabili e compatte includono sorgenti/date/hash, link interni risolvibili, edge con tipo/provenienza/evidenza/confidenza e nessun collegamento inventato. | AIEngineer + Backend | contratto canonico | validatore link e test contenuto/edges |
| R5 | Sync idempotente elabora incrementi, protegge note modificate a mano, gestisce rimozioni/conflitti e offre job limitati con pausa/annullamento/refresh; auto update resta opt-in e app-active. | Backend + Frontend | R1, R4 | test hash, conflitto, cancellazione, resource caps |
| R6 | UI separa sorgenti autorizzate, conoscenza conservata e nodi mostrati; filtri, limiti e vicini progressivi leggono il grafo canonico condiviso col vault. | Frontend + Backend | R4, R5 | test grafici e controlli UI |
| R7 | Query e contesto sono locali, pertinenti, compatti, con citazioni verificabili e avvisi su lacune/contraddizioni; invio esterno resta un’azione separata. | AIEngineer + Frontend | R4, R6 | casi query e controllo contesto |
| R8 | I casi richiesti dal prompt sono coperti da prove automatizzate e dalla review read-only, con limiti runtime dichiarati. | Coordinator + Reviewer | R1–R7 | risultati test/build/lint/review |

## Surprises & Discoveries

- `graphRecords()` in `backend/services/obsidianVaultService.js` produce attualmente soprattutto metadati e collegamenti da edge già indicizzati; non estrae contenuti di file né crea conoscenza tematica.
- `backend/ai/reader.js` estrae localmente DOCX, PDF, TXT e XLSX. La selezione grafica include anche DOC/PPT/media, ma nel repository non è stato trovato un estrattore locale per quei formati, OCR, modello locale, embeddings o vector store.
- `backend/ai/analyzer.js` e altri servizi AI usano OpenAI; non devono essere riutilizzati dal nuovo percorso.
- La selezione sorgenti appartiene a `world.obsidian` e già contiene categorie, root, subfolder, estensioni e thread selezionati. Account Gmail è quello già associato esplicitamente al Planet; l’attuale export Outlook di conversazioni è non supportato.
- Sync Obsidian esistente mantiene un manifest con hash, scrive conflitti separati e non elimina note manualmente modificate. La sincronizzazione automatica è debounced e periodica solo finché l’app è attiva; non è un watcher persistente del server.
- La documentazione Obsidian conferma che Graph view rappresenta note come nodi e link interni fra note esistenti come linee; i wikilink a note in cartelle usano percorsi dalla root del vault con `/`. Le fonti sono citate nella risposta conclusiva.
- Il worktree era già molto modificato prima di questo task. Non attribuire tali differenze a questa implementazione e non rimuoverle.

## Decision Log

- (2026-10-11, Coordinator + Backend + Frontend) Trattare la selezione per Planet esistente come confine di autorizzazione: il backend risolve i percorsi e l’account, accetta esclusioni tramite ID stabili di file, senza ricevere percorsi locali arbitrari dal client.
- (2026-10-11, Coordinator + Architect) Usare un modulo di analisi locale deterministico, separato dai gateway AI; nessun pacchetto, modello o download nuovo senza necessità verificata.
- (2026-10-11, Coordinator) Non chiamare una sovrapposizione lessicale “comprensione semantica”: le relazioni inferite riportano termini/evidenze e confidenza, mentre i link di provenienza sono espliciti.
- (2026-10-11, Coordinator) Vault e Planet Graph devono consumare lo stesso set canonico di note ed edge; i file Markdown da soli non costituiscono prova di graph corretto.
- (2026-10-11, Coordinator) Conservare il writer/manifest Obsidian esistente per mantenere idempotenza, note manuali e gestione conflitti.

## Outcomes & Retrospective

- Il nuovo `planetKnowledgeService` legge solo fonti selezionate per il Planet autenticato, memorizza esclusioni per ID di file stabili e non accetta path locali arbitrari dal browser. L’interfaccia dei candidati mostra ID, nome, tipo e sorgente senza esporre path locali.
- L’engine `localKnowledgeEngine` è deterministico e non ha dipendenze da provider o rete. Usa gli estrattori già presenti per PDF, DOCX, TXT e XLSX; tipi non supportati diventano esclusioni per-file con motivazione.
- Gli originali non vengono conservati. Nuovi e modificati contenuti sono estratti in batch fino a 8; le fonti invariate riusano descrittori compatti versionati e firme con size/mtime/ctime. La ricostruzione globale delle relazioni legge descrittori bounded, non il corpus. L’indice incompleto conserva l’ultimo grafo completo.
- Note e collegamenti condividono un set canonico. I wikilink espliciti possono collegare note tra batch; i raggruppamenti lessicali dichiarano metodo, evidenza e confidenza e non vengono descritti come comprensione semantica. Il writer/manifest Obsidian continua a proteggere note modificate manualmente e gestire i conflitti.
- La query segnala possibili contraddizioni solo quando fonti distinte contengono frasi con contenuto lessicale quasi uguale e negazione esplicita opposta. Il messaggio dichiara che si tratta di un controllo euristico e invita a verificare le note citate.
- Planet Graph mostra inizialmente 100 nodi e li espande a gruppi di 100; il layout dei nodi knowledge resta dentro il viewBox anche al massimo di 500 nodi, nascondendo le etichette secondarie solo quando la vista è densa.
- Limiti correnti: fino a 250 file selezionati, 2 MB per file, 25 MB totali, 30 record di attività, 20 conversazioni Gmail con fino a 10 messaggi ciascuna, query/context bounded; job in batch con pausa/ripresa/annullamento cooperativi. La UI segnala candidati, selezionati, tetto ed eventuale lista oltre la finestra visibile.
- Evidenze finali: suite mirata `node --test backend/test/localKnowledgeEngine.test.js tests/planetGraphLayout.test.mjs tests/knowledgeCandidateSelection.test.mjs tests/worldObsidianFrontend.test.mjs` passata 19/19. `npm run build`, `npm run lint`, `node --check backend/server.js`, `node --check backend/services/planetKnowledgeService.js`, `node --check backend/services/localKnowledgeEngine.js` e `git diff --check` passano. Il build riporta il warning Vite non bloccante per chunk minificati oltre 500 kB.
- Suite completa `npm test`: 141/144 passati. I due test che avviano server locali non raggiungono l’endpoint loopback nonostante il messaggio di ascolto; il test di sicurezza symlink fallisce con `EPERM`. Sono limiti di rete/filesystem del sandbox, non regressioni osservate nei test mirati.
- La review read-only ha trovato tre difetti residui (riattivazione di file esclusi, segnalazione di conflitti, nodi knowledge fuori viewport); sono stati corretti e coperti dai test mirati. In base al limite di un solo ciclo di fix/review non è stata chiesta una seconda review dopo questi ultimi fix.
- Nessuna prova manuale con vault Obsidian reale, account Gmail personale o UI live è stata eseguita. I test di layout verificano le coordinate rispetto al viewBox, ma non sostituiscono la validazione visiva nell’app.

## Context and Orientation

- `src/worlds.ts` e `src/components/ChangeWorld.tsx`: selezione delle sorgenti e impostazioni per Planet.
- `backend/server.js`: `POST /worlds/:worldId/obsidian/sync` risolve scope/record/email; `GET /worlds/:worldId/graph` legge il grafo del Planet; `POST /worlds/:worldId/graph/index` accoda l’indicizzazione.
- `backend/services/planetGraphService.js`: persistenza atomica delle sorgenti e dei nodi del grafo per utente/Planet.
- `backend/services/obsidianVaultService.js`: selezione, filtri, proiezione Markdown, manifest, hash, conflitti, pruning controllato.
- `backend/ai/reader.js`: parser locali già presenti. Non usare `backend/ai/analyzer.js` per la nuova knowledge feature.
- `src/components/PlanetGraph.tsx` e `src/components/planetGraphQuery.ts`: grafo UI e query locale esistenti, attualmente limitati ai metadati.
- `.codex/agents/README.md`: coordinatore, Architect read-only, Backend, AIEngineer, Frontend e Reviewer read-only; contratti prima delle modifiche e un owner per file.

## Plan of Work

### P1 — Contratti e baseline

Architect è stato usato in sola lettura. Il contratto da concordare fra i writer è: l’intake Backend fornisce al motore solo documenti già risolti e autorizzati (`sourceId`, `sourceScopeId`, tipo, titolo, locator controllato, data, hash, testo estratto e formato); AIEngineer restituisce note candidate, argomenti, edge tipizzati con provenienza/evidenza/confidenza, esclusioni con ragione e riepiloghi compatti; Backend salva stato e note usando la manifest Obsidian esistente e restituisce la stessa rete alla UI. Query/context usano solo record conservati e citano i source ID; non leggono il vault intero.

### P2 — Intake, analisi e persistenza

Backend implementa l’orchestrazione e risolve fonti dal Planet autenticato usando i servizi di path/account già esistenti. Prima della lettura applica estensioni, dimensioni, temporanei, esclusioni e caps; estrae a lotti solo tipi supportati. AIEngineer possiede il solo modulo deterministico di analisi/recupero e non importa `openai`, gateway, rete o filesystem. Backend persiste il set canonico per user/Planet e la proiezione Markdown attraverso il writer esistente. Un hash e la metadata cache evitano rianalisi di sorgenti invariate; note manuali e sorgenti rimosse seguono il manifest/conflitti senza cancellazioni non dimostrate.

### P3 — Controlli e uso

Frontend separa selezione, stato/conoscenza mantenuta e nodi visualizzati; mostra motivi di esclusione e capacità/limiti. La vista applica filtri per sorgente/tipo/topic e limiti di nodi/edge, con espansione progressiva. Query locale e contesto copiabile citano note/fonti, segnalano scarsa evidenza e non preparano l’intero vault.

### P4 — Qualità

Il Coordinator aggiunge fixture sintetiche per isolamento, link, edge/provenienza, esclusioni, incrementi, conflitti, rimozioni, limiti e query; verifica che nessuna funzione del nuovo flusso chiami provider esterni. Reviewer ispeziona read-only tutte le modifiche, poi è consentito al massimo un ciclo mirato di correzione e review.

## Concrete Steps

Dalla root di FolderRocket:

    node --test backend/test/<targeted-knowledge-tests>.test.js
    npm run build
    npm run lint
    npm test
    git diff --check

Per i file server:

    Set-Location backend
    node --check server.js

Usare vault e contenuti sintetici sotto directory temporanee dei test. Non eseguire sync contro vault reali, account Gmail personali o documenti dell’utente.

## Validation and Acceptance

- Con più root e thread sintetici selezionati, i record risultanti contengono soltanto quegli scope e il grafo non incrocia account/Planet.
- DOCX/PDF/TXT/XLSX vengono elaborati solo quando selezionati e leggibili; formati non supportati, copie identiche, file temporanei e contenuti senza segnale hanno esclusioni con ragione.
- Un documento utile genera una nota concisa con hash/locator/date/evidenza; argomenti condivisi collegano documenti solo con termini testuali osservabili e provenienza. Ogni link Obsidian punta a una nota generata esistente.
- Secondo sync invariato non duplica o riscrive note; cambiamenti aggiornano le stesse identità; rimozioni e note editate manualmente rispettano manifest e conflitti.
- La visualizzazione applica limiti stabili e query restituisce riferimenti alle note/fonti senza includere un corpus completo.
- Nessuna chiamata a provider esterni è stata fatta da pipeline, query o context package; i test devono intercettare imports/adapter o invocazioni.
- `npm run build`, `npm run lint`, suite pertinente e sintassi server riportano esito reale. La validazione UI live/vault/account non si dichiara basandosi solo sui test.

## Idempotence and Recovery

Usare identificatori stabili basati su scope e ID sorgente o hash, non titoli visualizzati. Le scritture passano dal manifest e dal controllo hash esistente; in caso di modifica manuale, salvare il nuovo risultato nel percorso conflitti esistente e lasciare intatta la nota dell’utente. Aggiornare o cancellare record persistenti solo per scope completamente letto e corrente. Ripetere un sync dopo errore non deve creare copie aggiuntive. Cancellazione di un job interrompe solo il lavoro del Planet corrente e preserva gli ultimi risultati completi.

## Artifacts and Notes

- Prompt sorgente: `C:\Users\bonat\.codex\attachments\22c98a0b-1c06-4ce7-9398-9dae66c2907b\Testo incollato.txt`.
- Architect audit è stato read-only e non ha eseguito test.
- Risultati delle suite, diff e limiti live verranno riportati qui e nella risposta finale.

## Interfaces and Dependencies

- Config esistente `WorldObsidianSourceSelection` in `src/worlds.ts` e normalizer in `obsidianVaultService.js`.
- Intake server-side per documenti risolti e autorizzati; vietato passare raw path dal browser al motore.
- `sourceSelection.excludedFileIds` contiene solo ID di nodi file già indicizzati, massimo 500; la lista candidati UI contiene soltanto id/titolo/scope/estensione/stato e non il percorso locale.
- Job di conoscenza scoped a user/Planet: una coda attiva per scope, stato leggibile, pausa/ripresa ai confini dei batch e cancellazione cooperativa. Stato job in memoria; non equivale a watcher persistente quando l’app è chiusa.
- Interfaccia locale del motore: documenti già estratti + limiti/segnale → rete canonica (nodi, edge, note, esclusioni, contatori); funzione query/context riceve solo i record conservati.
- Il writer Obsidian attuale rimane proprietario di file generati e della manifest. Nessuna dipendenza nuova pianificata.

## Revision Notes

- (2026-10-11) Creato dopo verifica del prompt, delle istruzioni, dello stato Git e dell’audit Architect; stabilisce ID, owners, criteri, confini privacy e primi contratti prima dei cambiamenti.
- (2026-10-11) Aggiunta esclusione file via ID e job pausa/riprendi/annulla dopo conferma dei contratti Frontend/Backend; i raw path restano solo server-side.
- (2026-10-11) Implementato il motore locale, la cache incrementale a descrittori compatti, la proiezione canonica verso Obsidian, i conteggi di selezione e le prove visibili sugli archi. Dopo la review read-only sono stati corretti i tre difetti residui e sono passati i test mirati 19/19; la suite completa è 141/144 con tre errori sandbox. Build, lint, sintassi e diff check passano; nessun vault reale o UI live è stato provato.
