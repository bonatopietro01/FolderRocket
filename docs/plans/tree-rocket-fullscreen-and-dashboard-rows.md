# Tree Rocket a schermo intero e cartelle dashboard in due righe

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Folders on Top occupa l'altezza effettivamente necessaria e dispone le tessere in una o due righe scorrevoli. Tree Rocket apre una schermata spaziale autonoma, con cartelle grafiche centrate, nomi leggibili, nessuno scorrimento orizzontale e le azioni esistenti funzionanti. Il ritorno conserva zoom e posizione della vista visitata.

## Progress

- [x] (2026-09-30 17:11Z) Verificati struttura, flussi di aggiunta, CSS e collegamenti statici con Graphify.
- [x] (2026-09-30) Riorganizzate le due viste dashboard e le sfumature condizionate dallo scorrimento.
- [x] (2026-09-30) Rifatti logo SVG e Tree Rocket fullscreen con cartelle centrate e pannello file.
- [x] (2026-09-30) Verificata la fixture locale su viewport ampio e stretto; completati test, lint e build.
- [x] (2026-09-30) Preparata una nuova proposta SVG Tree Rocket, ingranditi i nomi e resa adattiva la griglia senza scorrimento laterale.
- [x] (2026-09-30) Ripristinati posizione/zoom per cartella e corretta la cattura globale di Escape/Alt+Freccia sinistra/Backspace.
- [x] (2026-09-30) Ripetuti i controlli completi dopo le ultime modifiche: TypeScript/build, lint, 48 test backend e 16 test workspace passano.

## Surprises & Discoveries

- `src/App.css` assegna a Folders on Top una riga `minmax(225px,.72fr)` e rende i gruppi un unico elemento flex, spiegando altezza eccessiva e impilamento.
- Tree Rocket è montato sotto Folder Management. L'overlay `position:fixed` può restare subordinato allo stacking context della pagina; il portale su `document.body` darà una schermata indipendente.
- Le tessere Tree Rocket sono attualmente rettangoli con path visibile; `grid-template-columns:repeat(auto-fill,...)` sposta i pochi figli a sinistra invece di centrarli.
- La callback `TreeRocket → FolderManagement → App.addFolder` attende già l'esito booleano. Va conservata.
- Il primo controllo visivo ha mostrato che una griglia con una riga opzionale per errori lasciava il footer a metà schermo: il contenitore fullscreen ora usa flex e riempie tutta l'altezza.
- Con molte sottocartelle il grafo resta in una riga orizzontale scorrevole; l'apertura dei file non deve cambiare il nodo corrente, quindi la lista è caricata separatamente dal grafo.
- Le regole Tree Rocket sono state sovrascritte da una seconda sezione CSS più in basso: questa riattivava una griglia di puntini ripetuta e una larghezza minima di 820 px. La correzione va mantenuta nell'ultima regola effettiva, altrimenti la vecchia resa riappare.
- Dopo la navigazione il focus può lasciare il nodo portalizzato; un handler soltanto React non riceve più Escape. Un listener catturato sulla finestra, con stopPropagation, evita che una pressione arretri due volte.
- CSS `zoom` fa riadattare la griglia quando l'utente ingrandisce, mantenendola entro la larghezza della finestra, diversamente da `transform: scale()` che ingrandiva soltanto la resa.

## Decision Log

- (2026-09-30, Codex) Usare CSS grid con gruppi `display:contents` soltanto in Folders on Top. I membri del medesimo gruppo occupano entrambe le righe senza cambiare la vista Three Columns.
- (2026-09-30, Codex) Montare Tree Rocket con un portale e un nodo fullscreen; mantenere gli endpoint filesystem esistenti e lo sfondo spaziale già incluso nell'app.
- (2026-09-30, Codex) Aggiungere una fixture UI con dati fittizi per verificare viste e interazioni senza account, scansioni o modifiche ai file dell'utente.
- (2026-09-30, Codex) Per Tree Rocket usare una griglia responsive che va a capo in verticale, zoom di layout e camera (zoom più posizione relativa di scorrimento verticale) distinta per percorso. Il menu Radici azzera la posizione della root.
- (2026-09-30, Codex) Gestire i tasti di ritorno una sola volta in fase di capture; i clic destro sui nodi e sui loro comandi non devono attivare il ritorno sullo sfondo.

## Outcomes & Retrospective

Folders on Top usa una o due righe con scorrimento orizzontale e altezza del contenuto. Le sfumature seguono solo il lato ancora scorrevole; Three Columns mantiene il proprio scorrimento verticale. Tree Rocket è montato in `document.body`, con una proposta di logo SVG, nodi a forma di cartella e un pannello file indipendente. La griglia non ha scorrimento orizzontale: usa righe aggiuntive e il layout risponde anche allo zoom. La fixture ha verificato visualmente zero, una, due e dodici sottocartelle, schermate ampie e strette, ricerca, Show Files con icone PDF/DOCX/immagine, Escape, clic destro, ritorno con zoom/posizione e Radici. La callback Add a Folder Management nella fixture è simulata; il salvataggio reale resta coperto dal flusso applicativo esistente ma non è stato provato qui con cartelle reali. Hover e riduzione movimento sono coperti dal CSS/test statici, non da una verifica con impostazione OS reale. La nuova grafica SVG resta una proposta da valutare visivamente.

Confermati nell'ultima esecuzione TypeScript tramite `npm run build`, lint senza avvisi, 48 test backend, 16 test workspace e build di produzione. Nessun commit o push.

## Context and Orientation

`src/App.tsx` monta dashboard e Folder Management e passa `onAdd={addFolder}`. `src/components/FolderManagement.tsx` contiene il launcher e monta `TreeRocket`. `src/components/TreeRocket.tsx` usa `/filesystem/tree-roots`, `/filesystem/tree-children` e `/filesystem/tree-search`. `src/App.css` contiene regole dashboard e due generazioni di stili Tree Rocket; le regole più recenti dominano. `FileKindIcon` fornisce le icone già usate nell'app. `graphify-out/graph.json` è un artefatto locale ignorato da Git; le relazioni Graphify sono state confermate nei sorgenti.

## Plan of Work

Spostare lo scorrimento delle cartelle in una regione interna: il bordo esterno mantiene sfumature ferme, mostrate solo dove c'è contenuto oltre il bordo. Calcolare una/due righe da larghezza della regione e numero di cartelle; appiattire i gruppi nella sola vista superiore, preservando le etichette nella vista a colonne.

Rifare `TreeRocketMark` in SVG con chioma circolare, cartelle arancioni, tronco/razzo blu e radici/fiamme. Ingrandire il launcher e togliere Folder Map. Portare l'overlay in un portale fullscreen, usare carte a silhouette di cartella, centratura simmetrica dei figli e scorrimento orizzontale per livelli grandi. Il pannello file deve galleggiare sul grafo, senza modificarne l'ampiezza; ricerca, navigazione e aggiunta usano la logica attuale.

## Concrete Steps

Dalla radice `C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`:

    graphify query "TreeRocket FolderManagement App folderProjectGroups foldersContainer dashboardFoldersTop"
    node --test backend/test/dashboardTreeRocketUi.test.js backend/test/treeRocketService.test.js
    npm run lint
    npm test
    npm run build

## Validation and Acceptance

Con una sola tessera Folders on Top usa una riga; con più tessere della larghezza disponibile usa due righe, anche per membri dello stesso gruppo. La sfumatura appare solo sul lato dove si può ancora scorrere e non copre l'ultima tessera. In Three Columns la sfumatura segue lo scorrimento verticale del centro.

Tree Rocket deve nascondere l'intestazione di lavoro, conservare lo sfondo spaziale identico a Change World, mostrare una o due sottocartelle centrate, poi molte senza sovrapposizioni né scorrimento laterale. Cliccare il corpo della cartella naviga; le due azioni interne non navigano. File vuoti/presenti, ricerca, indietro (incluso zoom e posizione), Radici e aggiunta a Folder Management restano utilizzabili. Verificare finestra ampia e stretta e “riduci movimento”.

## Idempotence and Recovery

Nessuna migrazione o cancellazione di dati. Le modifiche sono a frontend/CSS e possono essere ripetute. Preservare file utente e stato Git; isolare eventuali errori con test mirati prima della suite completa.

## Artifacts and Notes

Il grafo Graphify resta in `graphify-out/`, ignorato da Git. Annotare risultati di test e limiti di controllo visuale in questo piano. Non salvare file personali, path dell'utente o dati di account. La proposta SVG si osserva nella fixture locale a `tests/ui/tree-rocket-smoke.html`.

## Interfaces and Dependencies

Riutilizzare `TreeRocketMark`, `FileKindIcon`, `FolderManagement.onAdd`, `App.addFolder` e gli endpoint `/filesystem/tree-*`. Per lo schermo dedicato usare `createPortal` da `react-dom`; nessuna dipendenza o route backend nuova.

## Revision Notes

- 2026-09-30 — Creato dopo l'analisi del layout e di Tree Rocket per documentare un cambiamento frontend che coinvolge più moduli.
- 2026-09-30 — Aggiornato per la revisione grafica e di navigazione Tree Rocket: griglia senza pan orizzontale, sfondo, zoom responsive e ritorno alla camera precedente.
