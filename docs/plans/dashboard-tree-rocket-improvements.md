# Dashboard e Tree Rocket

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Aggiornare il layout Dashboard selezionabile per pianeta, aggiungere una navigazione ad albero delle cartelle host in Folder Management, rendere effettivi altri filtri di Application e sistemare le richieste UI per Rename, Services, Cargo Rocket e Read attachments.

## Progress

- [x] (2026-09-29 15:23Z) Ispezione iniziale: confermati React/TypeScript/Vite, backend Express, stato dashboard già persistito per pianeta; Graphify esistente ma antecedente all'ultimo commit.
- [x] (2026-09-29 15:23Z) Mappare impatti Graphify e definire integrazione server sicura per navigazione cartelle incrementale.
- [x] (2026-09-29 16:04Z) Implementare layout dashboard, Tree Rocket e filtri Application con test mirati.
- [x] (2026-09-29 16:04Z) Applicare rifiniture a Rename, Services, Cargo Rocket e Gmail; eseguire lint, test e build.

## Surprises & Discoveries

- Esiste `POST /list-folder-files`, che restituisce file e sottocartelle ma applica la validazione dei percorsi autorizzati dell'utente; può essere riutilizzato per cartelle già registrate. Tree Rocket deve aggiungere una navigazione radice/host dedicata, rispettando quella validazione e senza enumerare l'intero disco.
- `Application` possiede già ricerca testuale, intervallo date, origine e dimensione; la UI combinata richiede aggiunte allo stato e al predicato dei risultati.
- `graphify-out/graph.json` è del 28 settembre mentre il repository è stato aggiornato il 29 settembre; rigenerarlo prima del refactor e confermare i nodi nei sorgenti.
- Il contenitore Gmail è una lista scorrevole: alzare solo lo `z-index` non basta a mostrare tutto il menu. Il menu Read attachments ora viene renderizzato in portal e riposizionato rispetto al pulsante durante scroll e resize.
- La provenienza sincronizzata non è un metadato attendibile nei risultati correnti; il filtro usa `location` solo se esplicitamente presente, altrimenti distingue percorso locale/UNC e lascia gli altri casi come sconosciuti.

## Decision Log

- 2026-09-29: il cambio layout vive nella configurazione dashboard del `worldId` attivo; non introdurre una seconda persistenza locale.
- 2026-09-29: Tree Rocket carica una directory alla volta e si appoggia alle API host autenticate; non fare scansioni ricorsive al momento dell'apertura.
- 2026-09-29: click destro ed Esc navigano indietro; click sinistro/Invio entrano nella cartella, come descritto nel prompt allegato.
- 2026-09-29: le radici computer complete sono mostrate soltanto agli amministratori; gli altri profili restano nel workspace privato, con controllo del percorso canonico per impedire fughe tramite link simbolici.
- 2026-09-29: Tree Rocket mostra al massimo 250 directory e 200 nomi di file diretti per richiesta; il contenuto dei file non viene letto.

## Outcomes & Retrospective

Implementati layout Dashboard per pianeta con impostazioni legacy compatibili; Tree Rocket con radici e navigazione autorizzata, lista file rapida, copia percorso, aggiunta senza duplicati e limite per livello; filtri Application combinabili con risultati contati e categorie sincronizzate basate solo su metadati espliciti; AI/Services nel menu Workspace Control; servizi con descrizioni sotto i titoli; Rename a larghezza piena; ritorno Simple Post-it giallo; testo mailbox semplificato in Cargo Rocket; menu Gmail portaled e responsive.

Verifiche locali completate: `npm test` (36/36), test helper documentati (16/16), lint, `npm run build` (include `tsc -b`), `node --check backend/server.js` e `git diff --check`. Non è stata fatta una prova visiva end-to-end con account Gmail autorizzato o con i dischi effettivi del computer; i flussi sono coperti da test di servizio e regressione sorgente. Nessun commit o push.

## Context and Orientation

`src/App.tsx` carica e salva `/settings/dashboard?worldId=...` e assembla le tre colonne. `DashboardSourceColumn` e `FileDropZone` gestiscono Sources e cartelle. `FolderManagement.tsx` legge una cartella con `/list-folder-files`; `backend/server.js` valida percorsi tramite `assertUserPath` e ha accesso al filesystem host. `ApplicationsWorkspace.tsx` scansiona tipi configurati e filtra risultati già in memoria. Le altre aree coinvolte sono `AuthGate.tsx`/`IntegrationSetup.tsx`, `GmailSourcePanel.tsx`, `CargoShip.tsx` e `ProcessingWorkspace.tsx`.

## Plan of Work

Rigenerare il grafo code-only e consultare solo le dipendenze dei moduli interessati; confermare ogni relazione nei sorgenti. Estendere in maniera retrocompatibile il tipo e il salvataggio della dashboard per includere il layout, quindi usare classi CSS del layout senza rimontare blocchi o cambiare array e identificativi. Per Tree Rocket aggiungere API radici e listing incrementale autenticate, con limiti, gestione accessi negati e collegamenti simbolici; riutilizzare il listing esistente ove il percorso è già autorizzato. Implementare grafo navigabile con selezione, percorso copiabile, anteprima nomi file e azione di aggiunta che passa dal callback Folder Management. Estendere i filtri Application combinando testo/nome, iniziale, estensione, tipo e metadati disponibili; non inferire stato cloud da stringhe di percorso. Infine applicare le rifiniture dei quattro flussi UI indicati e testare i comportamenti.

## Concrete Steps

Dalla radice del progetto:

    npm run graph:build
    graphify query "Dashboard world settings layout source blocks FolderManagement list folders Gmail read attachments"
    npm run lint
    npm test
    npm run build

Durante l'implementazione eseguire anche i test Node dei moduli interessati documentati in `tests/README.md` e i nuovi test aggiunti. Risultato atteso: dashboard cambia disposizione senza perdere blocchi; il grafo parte dalle radici e naviga una cartella per richiesta; filtri riducono i risultati in modo componibile; pulsanti UI risultano visibili e operativi.

## Validation and Acceptance

Verificare salvataggio indipendente del layout su almeno due pianeti; layout a tre colonne e cartelle in riga con Sources sotto; navigazione indietro/avanti, radici, file, copia percorso e aggiunta da Tree Rocket, compresi percorso non accessibile e cartella vuota; combinazioni e reset dei filtri Application; apertura del menu Gmail e dei Services in viewport stretta; modalità note gialla; pulsante Rename a larghezza completa. Eseguire lint, test e build. La build include TypeScript. Riportare verifiche d'interfaccia non eseguite.

## Idempotence and Recovery

La lettura del grafo è incrementale e senza mutazioni. L'aggiunta a Folder Management deve riusare la callback corrente e rifiutare i duplicati. Il layout deve migrare con default al layout esistente quando il campo manca. Evitare migrazioni distruttive, cancellazioni o commit. In caso di errore, lasciare intatti dati utente e impostazioni, correggere la tappa fallita e ripetere i comandi di verifica pertinenti.

## Artifacts and Notes

Grafo locale ignorato da Git in `graphify-out/`; eventuali test usano fixture temporanee e non cartelle personali dell'utente.

## Interfaces and Dependencies

Riutilizzare React, TypeScript, `lucide-react`, Express e API locali esistenti. Estendere le impostazioni già esposte da `/settings/dashboard`; API Tree Rocket devono essere autenticate e limitare i percorsi alle radici host consentite. Non aggiungere dipendenze finché le capacità SVG/CSS e filesystem esistenti sono sufficienti.

## Revision Notes

2026-09-29: piano iniziale scritto dopo l'ispezione di `AGENTS.md`, `PLANS.md`, struttura repository, script e moduli toccati. Aggiornato dopo implementazione e verifiche finali.
