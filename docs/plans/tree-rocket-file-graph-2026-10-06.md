# Ripristinare il grafo navigabile di Tree Rocket

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Tree Rocket deve mostrare cartelle, sottocartelle e file con nodi posizionati in modo leggibile e collegamenti di contenimento reali. L’utente deve poter navigare, cercare, paginare, visualizzare file e aggiungere cartelle a Folder Management senza che i contenuti spariscano o si sovrappongano.

## Progress

- [x] (2026-10-06 07:49Z) Letto il prompt allegato, verificato che la cartella di lavoro contiene molte modifiche preesistenti da conservare e avviata l’analisi read-only.
- [x] (2026-10-06 07:56Z) Confermare il flusso API, le cause layout e l’assenza di nodi-file; rigenerare Graphify e verificare le relazioni pertinenti.
- [x] (2026-10-06 08:10Z) Aggiungere paginazione file, nodi-file, archi di contenimento, layout responsive e invalidazione richieste obsolete; preservare API e funzioni esistenti.
- [x] (2026-10-06 08:15Z) Superare i test mirati 40/40, lint, build, `node --check backend/server.js` e `git diff --check`; tentare la fixture visuale.

## Surprises & Discoveries

- Il prompt richiede nodi-file e archi cartella-file, mentre Tree Rocket finora potrebbe mostrare solo cartelle nel grafo. Verificare questa distinzione nei sorgenti prima di progettare la modifica.
- Il worktree contiene numerose modifiche frontend e backend già presenti, incluse modifiche nei file Tree Rocket e relativi test. Nessuna di esse va ripristinata o sovrascritta.
- Confermato: `TreeRocket.tsx` visualizza file solo in Show Files e risultati di ricerca; i collegamenti attuali sono pseudo-elementi CSS tra cartelle. `tree-children` restituisce al massimo 200 file diretti e non supporta file offset.
- Confermato: lo stage del ramo aperto cambia `justify-content` ma resta con `align-items:center`, e gli override Tree Rocket sono stratificati in più sezioni di `App.css`; la radice perciò non si allinea in alto a sinistra.
- Confermato: esistono request guards per alcuni caricamenti, ma il cambio modalità/root non invalida in modo esplicito tutte le richieste children pendenti.
- La nuova vista produce ID distinti e canonici per cartelle/file, con archi per cartella-sottocartella e cartella-file; il servizio restituisce i file a pagine e non legge il loro contenuto.
- La fixture Vite non è stata raggiungibile dal browser integrato: `127.0.0.1:5173` e `localhost:5173` hanno restituito `ERR_CONNECTION_TIMED_OUT`, anche se Vite risultava in ascolto nel terminale.

## Decision Log

- (2026-10-06) Mantenere le protezioni di accesso ai percorsi del filesystem e l’enumerazione Windows esistente; non scansionare contenuti dei file.
- (2026-10-06) Modellare solo relazioni verificabili: cartella-sottocartella e cartella-file contenuto direttamente. Nessuna relazione file-file dedotta senza dati espliciti.
- (2026-10-06) Mantenere Graphify come orientamento del codice; validare sempre i risultati nei sorgenti e nei test.

## Outcomes & Retrospective

Tree Rocket ora include i file diretti nel ramo selezionato, con paginazione, nodi e linee misurabili su scroll e resize. La radice è allineata in alto a sinistra e azzurra; i figli scorrono nell’area a destra, che si impila su finestre strette. Test, lint, build e sintassi server sono passati. Resta una prova visiva manuale: il browser integrato non raggiunge il server locale in questo ambiente.

## Context and Orientation

La vista è in `src/components/TreeRocket.tsx`; gli stili condivisi sono in `src/App.css`. Le API filesystem e il servizio relativo si trovano in `backend/server.js` e `backend/services/treeRocketService.js`. I controlli disponibili includono `backend/test/treeRocketService.test.js`, `backend/test/dashboardTreeRocketUi.test.js` e la fixture sintetica `tests/ui/tree-rocket-smoke.html` con guida in `tests/README.md`.

La struttura del grafo deve essere derivata dai percorsi e dai metadati restituiti dal backend. Gli ID dei nodi vanno resi stabili con normalizzazione dei path coerente con Windows. Gli archi devono avere estremi effettivamente presenti e rispettare paginazione e filtri. Le radici Desktop personale/pubblica e l’eventuale percorso reindirizzato non vanno confusi né duplicati.

## Plan of Work

1. Esaminare le modifiche locali dei file coinvolti e mappare la catena UI-route-servizio per radici, sottocartelle, file e ricerca. Graphify aggiornato: 2.328 nodi, 4.476 archi; tre query pertinenti hanno confermato solo riferimenti statici.
2. Riprodurre con la fixture i casi di griglia iniziale, apertura cartella, una/molte sottocartelle, paginazione e schermi stretti. Confermare separatamente se un elemento manca nella risposta backend o viene omesso dalla UI.
3. Implementare nodi file e archi cartella-file con ID path stabili e paginazione file diretta, senza scansioni ricorsive. Stabilizzare layout, radice, sottocartelle e navigazione; proteggere da risposte asincrone obsolete e duplicati.
4. Aggiungere test di regressione per il modello nodi/archi, paginazione, navigazione e disposizione. Provare la fixture interattiva su finestra ampia e stretta; eseguire i controlli progetto.

## Concrete Steps

Dalla radice del repository:

    npm run graph:build
    node --test backend/test/treeRocketService.test.js backend/test/dashboardTreeRocketUi.test.js tests/workspaceLayoutAndEmailPagination.test.mjs
    npm run lint
    npm run build
    Set-Location backend; node --check server.js

Se cambia `backend/server.js`, eseguire anche `node --check server.js` dalla cartella `backend/`. Per la prova visuale, seguire `tests/README.md`: avviare `npm run dev` e aprire `/tests/ui/tree-rocket-smoke.html`.

## Validation and Acceptance

- Le radici Computer e Desktop distinguono chiaramente cartelle personali, pubbliche e percorsi disponibili; errori e radici parziali non appaiono come liste vuote senza spiegazione. Coperto dai test backend preesistenti e UI statici.
- Cartelle, sottocartelle e file sono nodi distinti con ID stabili; gli archi cartella-sottocartella e cartella-file sono deduplicati e non restano pendenti dopo ricerca, filtri o paginazione.
- Non vengono creati archi file-file senza una relazione esplicita nei dati.
- La radice selezionata resta allineata in alto a sinistra; i figli si dispongono alla sua destra e scorrono nell’area dedicata, senza clipping o sovrapposizioni.
- Back, Roots, breadcrumb, Escape, tasto destro, Show Files, Add to Folder Management, ricerca e carica-altri funzionano nei casi verificati.
- Risposte obsolete dopo un cambio cartella non sostituiscono i nodi della selezione attuale.
- Esito automatico: test mirati 40/40; `npm run lint`, `npm run build` (TypeScript incluso), `node --check server.js` e `git diff --check` passati. Il diff check riporta solo avvisi di conversione CRLF/LF.
- Prova visuale tentata su `/tests/ui/tree-rocket-smoke.html` a `127.0.0.1:5173` e `localhost:5173`; entrambe non raggiungibili dal browser integrato. Nessuna prova manuale con cartelle reali effettuata.

## Idempotence and Recovery

Non effettuare operazioni sui file reali durante i test; usare fixture e directory temporanee. Conservare le modifiche locali e patchare solo le righe necessarie. Se l’enumerazione backend o un permesso impedisce la prova di una radice, documentare il caso senza ampliare accessi o cancellare impostazioni.

## Artifacts and Notes

Graphify, se rigenerato, resta in `graphify-out/` ignorata da Git. Nessun file utente o credenziale deve essere incluso negli artefatti.

## Interfaces and Dependencies

Riutilizzare API filesystem e `treeRocketService.js` quando forniscono i dati necessari. Estendere API o tipi soltanto se manca un endpoint sicuro per l’elenco dei file diretti o per la paginazione. Non aggiungere dipendenze senza necessità dimostrata.

## Revision Notes

- 2026-10-06: creato il piano per la correzione del grafo e del layout Tree Rocket, con attenzione alle modifiche locali già presenti.
- 2026-10-06 08:15Z: completate paginazione file, nodi/archi, layout e verifiche automatiche; registrato il limite della fixture visuale locale.
