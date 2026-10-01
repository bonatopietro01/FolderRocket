# Refine dashboard scrolling, Tree Rocket, File Studio, and folder controls

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Rifinire i flussi richiesti nel prompt del 2026-10-01: scrolling Folders on Top, pagina Tree Rocket con modalità Folder/Apps, layout compatto File Studio, controlli Folder Management e uso dell'account Gmail attivo in Cargo Rocket. Le modifiche devono riusare servizi e configurazioni presenti, senza cambiare credenziali o alterare file utente. Le proposte grafiche alternative del logo saranno solo anteprime, non una sostituzione automatica dell'asset.

## Progress

- [x] (2026-10-01 08:14Z) Letti `CODEX.md`, `PLANS.md`, `docs/GRAPHIFY.md`, il prompt allegato e verificato lo stato Git pulito.
- [x] (2026-10-01 08:14Z) Rigenerato il grafo Graphify e confermati in sorgente i componenti Tree Rocket, Folder Management, Applications e i pannelli di conversione.
- [x] (2026-10-01 08:14Z) Implementati scrolling, schermata Tree Rocket Folder/Apps, compattazione File Studio e toolbar Folder Management.
- [x] (2026-10-01 08:14Z) Verificata la selezione Gmail per pianeta nella Cargo Rocket e aggiunti test mirati.
- [x] (2026-10-01 08:14Z) Eseguiti i controlli automatici, verificata visivamente la fixture a 1280×720 con dodici sottocartelle e prodotte tre proposte logo non applicate. La finestra stretta non è stata verificabile con i controlli del browser disponibili in questa sessione.

## Surprises & Discoveries

- La pagina Applications gestisce profili di estensioni e scansioni file. Esiste anche un helper Windows che risolve e apre un'app per nome tramite App Paths o Start Apps, ma non espone un catalogo completo delle applicazioni con icone. Tree Rocket Apps non deve quindi presentare i profili come app installate né avviare scansioni arbitrarie del disco.
- `TreeRocket.tsx` è un overlay full-screen con elenco directory live e ricerca file/cartelle; l'azione Add corrente chiude l'overlay e il conteggio file non è mostrato.
- La navigazione Folder Tree e l'elenco dei file dipendono da `backend/services/treeRocketService.js`; i test backend ne coprono limiti di scansione e directory autorizzate.
- Le istruzioni aggiornate specificano di non convertire la rotellina verticale in movimento orizzontale tra gruppi Folders on Top.

## Decision Log

- 2026-10-01: mantenere Tree Rocket Apps onesto e sicuro: riusare soltanto cataloghi/configurazioni esistenti se individuati; in assenza di un inventario Windows implementato, mostrare una spiegazione chiara invece di inventare app o scansionare tutto il disco.
- 2026-10-01: usare il conteggio diretto dei file per le cartelle quando i dati sono già caricati; non aggiungere scansioni ricorsive all'apertura/render.
- 2026-10-01: Add to Folder Management deve rimanere nell'overlay e dare feedback locale; Add folders deve aggiungere le directory esistenti del livello esplorato, senza creare directory fisiche.

## Outcomes & Retrospective

Scorrimento: eliminata la conversione della rotellina verticale in scroll orizzontale; Folders on Top mantiene gruppi descrittivi con una sola etichetta per gruppo e scorrimento verticale locale. Sono state assottigliate le barre, mantenendo le aree scrollabili. La fixture desktop mostrava solo 38 px di overflow orizzontale con dodici cartelle e altezza interna stabile; la schermata Three Columns resta invariata.

Tree Rocket ora ha una pagina dedicata con schede Folder/Apps, un unico header, conteggio file diretti leggibile, Add folders per directory del livello corrente, feedback persistente in pagina e chiusura del pannello file con clic fuori. I conteggi sono una sola lettura diretta e limitata a 80 sottocartelle per navigazione (mai ricorsiva); oltre il limite l'interfaccia lo segnala. La fixture locale ha mostrato dodici sottocartelle senza overflow orizzontale (larghezza grafo 1270 px sia client sia scroll) e ha verificato selezione, file con icone, aggiunta e callback Apps. L'helper Windows esistente risolve e lancia un'app per nome da Start Apps/App Paths, ma non fornisce un catalogo completo con icone: Tree Rocket Apps dichiara il limite e rimanda all'Applications workspace senza inventare risultati o scandire il disco.

File Studio elimina testi e intestazioni vuote richieste e tinge lievemente le cartelle con il colore già salvato. Folder Management colloca riordino e aggiunta sopra la lista; descrizioni restano editabili su CSS mobile. Gmail/Cargo Rocket continua a leggere soltanto le preferenze e gli account selezionati del pianeta attivo; se manca una casella, Cargo Rocket ora indica che l'utente deve configurarla nel blocco Gmail del pianeta corrente. Non è stata cambiata o revocata alcuna credenziale.

Verifiche finali: `npm run lint` superato; `npm test` superato (52/52; un timeout transitorio nell'avvio del backend durante altri processi è stato risolto rilanciando i test isolati); regressioni frontend superate (16/16); `npm run build` superato (`tsc -b` + Vite). Verifica visiva limitata alla fixture locale e a 1280×720; la finestra stretta e account/file reali non sono stati testati. Nessun benchmark affidabile prima/dopo è disponibile: i limiti diretti e la concorrenza dei conteggi evitano scansioni ricorsive, ma non vengono presentati come un guadagno cronometrico misurato. Tre proposte di logo sono state generate solo come anteprime fuori dal repository; l'asset applicativo non è stato cambiato. Nessun commit o push.

## Context and Orientation

La dashboard è in `src/App.tsx`; le cartelle raggruppate sono in `src/folderProjects.ts`, `src/components/FolderScrollFrame.tsx` e `src/App.css`. Tree Rocket è in `src/components/TreeRocket.tsx`, montato dal portale in `src/components/FolderManagement.tsx`, con accesso alle directory tramite `backend/services/treeRocketService.js` e route `backend/server.js`. La pagina Application corrente (`src/components/ApplicationsWorkspace.tsx`) tratta profili file, non software installato. File Studio usa `src/components/ProcessingWorkspace.tsx` e `src/components/ChangeFormatPanel.tsx`; Cargo Rocket e Gmail vivono in `src/components/CargoShip.tsx` e `src/components/GmailSourcePanel.tsx`.

## Plan of Work

Aggiornare la semantica wheel/trackpad di `FolderScrollFrame` affinché `deltaX` scorra la fila e `deltaY` rimanga al gruppo sotto il puntatore; rendere sottili e consistenti le scrollbar senza rimuovere accessibilità. Aggiornare titolo di Change World. Riorganizzare Tree Rocket in una sola intestazione e schede Folder/Apps, mantenere ricerca/path/zoom nella modalità cartelle, implementare Add folders usando i percorsi esistenti al livello esplorato e un feedback senza chiusura, conteggio diretto affidabile e chiusura file panel con click fuori; correggere contest menu di ritorno e preservare selezione Gmail indipendente per pianeta nel Cargo Rocket. Aggiungere Apps con catalogo realmente disponibile e fallback informativo se il repository non dispone di inventario sicuro. Compattare le righe copy ridondanti di File Studio e applicare tinta configurata alle cartelle con contrasto invariato. Riordinare toolbar folder controls sopra le righe e adattare a viewport stretti. Aggiungere test helper/unit/UI fixtures e verificare tutto il set automatico richiesto.

## Concrete Steps

Directory di lavoro: radice FolderRocket su Windows.

    npm run graph:build
    npm run lint
    npm test
    node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs
    npm run build

Aprire `tests/ui/tree-rocket-smoke.html` e `/tests/ui/workspace-smoke.html` nel browser Vite per provare desktop e finestra stretta con fixture fittizie. Non usare dati reali o OAuth per la fixture.

## Validation and Acceptance

Le barre non richieste sono sottili, lo scrolling orizzontale è guidato da input orizzontale e quello verticale resta locale al gruppo. Tree Rocket è full-screen con navigazione distinta Folder/Apps; file list e aggiunte hanno esito leggibile; niente applicazioni inventate. Gmail in Cargo Rocket rispetta l'account del pianeta attivo e non mostra account globali alternativi. File Studio non mostra testi o contatori vuoti rimossi dal prompt; tinte file-folder non alterano impostazioni. Toolbar Folder Management resta visibile senza overflow orizzontale. Eseguire lint, test backend, regression test documentati e build/type-check. Verifica UI distinta dai test con dati simulati; l'uso di cartelle e account OAuth reali non è parte della fixture.

## Idempotence and Recovery

Le modifiche sono solo UI/logica locale e nuove verifiche; non cambiano il filesystem degli utenti, token OAuth, database o preferenze salvate. I controlli possono essere ripetuti. Non eseguire commit o push. Se una modifica di layout causa regressioni, ripristinare soltanto il blocco CSS/componente modificato preservando eventuali cambi dell'utente.

## Artifacts and Notes

- Il grafo corrente è in `graphify-out/` (locale e ignorato da Git); viene usato solo per orientamento e verificato contro il codice.
- Le proposte Tree Rocket saranno immagini di anteprima esterne al bundle applicativo; non sostituiranno il logo corrente.

## Interfaces and Dependencies

Riutilizzare `API_BASE_URL`, `tree-children`, `tree-roots`, `tree-search`, `folderDescriptionGroups`, l'handler `onAddFolder` e i componenti locali `FileKindIcon`/`ApplicationLogo`. Nessuna nuova dipendenza runtime prevista. Un endpoint Windows per app installate non è attualmente disponibile e non sarà inventato senza una fonte locale affidabile già presente.

## Revision Notes

- 2026-10-01: piano iniziale dopo lettura del prompt e ispezione del codice; chiarita l'assenza di un inventario installato applicazioni riutilizzabile.
