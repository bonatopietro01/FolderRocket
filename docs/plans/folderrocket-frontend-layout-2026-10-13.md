# Correggere layout e interazioni del frontend FolderRocket

Questo ExecPlan segue `PLANS.md`. È l’unico piano operativo di questo task e resta aggiornato con avanzamento, scoperte, decisioni ed esito.

## Purpose / Big Picture

Rendere leggibili e utilizzabili le superfici frontend di FolderRocket, riparando i problemi riproducibili senza alterare le operazioni sui file o lo scope dei pianeti. In TreeRocket, “See files” apre un’anteprima flottante vicina alla cartella selezionata; Folder Management mantiene accessibili le opzioni File format, i risultati e le azioni anche con molte righe e finestre ridotte.

## Progress

- [x] (2026-10-13 13:21Z) Letti AGENTS.md, CODEX.md, PLANS.md, routing e catalogo delle skill; catturato lo stato sporco iniziale e creata una copia temporanea di `src/` per distinguere i cambiamenti di questo task.
- [x] (2026-10-13 13:26Z) Completato l’inventario sorgente R1 e ricevuto il checkpoint read-only dell’Architect. I problemi di resa non misurabili dal sorgente restano etichettati come non riprodotti.
- [x] (2026-10-13 13:37Z) Frontend ha consegnato la preview TreeRocket flottante e le card più ampie. Il coordinatore ha aggiornato assertion/documentazione e preparato la fixture Folder Management con 24 cartelle, 96 file per cartella, molti formati e route mock.
- [x] (2026-10-13 13:39Z) Rimosso l’errore React Hooks nel file TreeRocket e stabilizzati i callback/dipendenze. `npm run lint` e `npm run build` passano; build mantiene l’avviso Vite già visibile per un chunk oltre 500 kB.
- [x] (2026-10-13 13:43Z) I 20 test mirati passano. La suite `tests/*.test.mjs` passa 79/79 escludendo il solo `applicationDiscovery.test.mjs`; l’esecuzione completa fa 79/80 perché Windows sandbox nega con `EPERM` il symlink temporaneo richiesto da quel test.
- [x] (2026-10-13 13:43Z) Tentato `npm run desktop`: la build termina, Electron esce con codice 1 senza finestra attiva o errore diagnostico nello stdout; CUA non espone app native e il browser locale ha dato timeout. Verifica visiva Electron, click/scroll del menu nativo e resa responsive restano non misurati.
- [x] (2026-10-13 13:51Z) Completato il ciclo mirato di review read-only: i due rilievi R4 sono stati corretti e verificati dal Reviewer. Resta un rilievo LOW sul focus perso quando lo scroll chiude automaticamente il preview perché la card esce dalla viewport; non è stato avviato un secondo ciclo di correzione. R6/R7 restano non riprodotti.
- [x] (2026-10-13 13:50Z) Dopo la correzione R4: `npm run lint`, `npm run build`, 20 test mirati, 79 test non vincolati al symlink e `git diff --check` passano. Ripetuto `npm run desktop`: la build passa ma `electron .` termina ancora con codice 1 senza finestra attiva o diagnostica.

## Surprises & Discoveries

- Il working tree all’avvio contiene modifiche tracked e file untracked in `src/`, `tests/`, `docs/`, `backend/` e nella configurazione degli agenti. Sono preesistenti e vanno preservati.
- `src/App.tsx` compone Dashboard, Folder Management, File Studio, Applications, Daily Job e Conversations; il Planet Graph e il selettore/gestore dei pianeti sono superfici sovrapposte allo stesso shell.
- `TreeRocket.tsx` già carica e pagina i file; oggi il markup usa un pannello file fratello del grafo. La richiesta corrente sostituisce quel pannello fisso con il popover ancorato.
- `FolderManagement.tsx` usa un elemento `<select>` nativo per File format e filtra i risultati attraverso `matchesFileFormat`. Il blocco dello scroll è una segnalazione da riprodurre, non ancora una causa accertata.
- L’Architect conferma che il file preview e il filtro possono restare UI-only. La richiesta TreeRocket include già sequence + AbortController e conserva `worldId`/root mode; Folder Management separa gli endpoint `/files/copy` e `/files/move`.
- Il CSS ha layout storici concorrenti per TreeRocket (pannello sinistro e colonna destra); l’override finale attualmente assegna spazio fisso a destra/sotto il grafo.
- Il primo test mirato pre-edit è **14/15**: `workspaceLayoutAndEmailPagination.test.mjs` cerca Planet Graph nell’ultimo blocco `@media(max-width:900px)`, che ora contiene override TreeRocket successivi. Le regole Planet Graph mobile esistono prima nel CSS; controllare/aggiornare il test senza introdurre un duplicato CSS.
- La tabella Folder Management ha override `overflow-x:hidden!important` nei breakpoint stretti. La regola è confermata; l’effetto di clipping a viewport ridotta è ancora da riprodurre.
- Il checkpoint Architect conferma: TreeRocket riusa `filesView`, sequence/AbortController e request scope già esistenti; Escape attualmente passa dal `back()` in capture. Il popover deve ripristinare focus senza intercettare Escape di controlli non correlati.
- Il checkpoint Architect non trova wheel handler che dimostrino una causa del select File format e raccomanda di riprodurre menu chiuso/aperto e lista risultati prima di cambiare controllo.
- L’implementazione TreeRocket è ora una preview `position:fixed` ancorata al pulsante See files, con listener scroll/resize/ResizeObserver, chiusura esterna/Escape e ripristino focus per i close intenzionali. Resta da verificare la resa Electron.
- La fixture Folder Management usa solo dati `C:\Synthetic\...` e blocca richieste non previste. Copia, spostamento, rename, inventory, ricerca e directory sono mockati per evitare accesso ai file reali.
- Primo controllo dopo le modifiche: build passata con il consueto warning chunk >500 kB; lint segnala un errore `react-hooks/refs` e quattro warning nel nuovo file TreeRocket. I test `node --test` sui file `tests/*.test.mjs` fanno 79/80: l’unico errore è `EPERM` nella creazione di un symlink temporaneo da `applicationDiscovery.test.mjs`, negata dal sandbox.
- La fixture browser Vite non è stata raggiunta dal browser integrato (timeout su localhost) e CUA non espone finestre native/Electron; il server temporaneo avviato dal coordinatore è stato chiuso. Quindi R6 e il clipping Folder Management restano `REPORTED_ONLY`, senza cambio speculativo del select/tabella.

## R1 Surface inventory (baseline)

| Superficie reale | Evidenza e stato iniziale | Soluzione e criterio osservabile |
|---|---|---|
| Dashboard, dashboard navigation/source columns/cards | È montata da `App.tsx`; fixture/test esistenti controllano responsive Applications/TreeRocket, menu sorgenti e righe cartella. Il reclamo generale non specifica un caso riprodotto. | Ispezionare la resa; intervenire soltanto su un difetto concreto. Nav, controlli source e cartelle restano visibili a viewport stretta. |
| TreeRocket, incluse radici, figli e ricerca | **Confermato staticamente:** anteprima è un aside permanente e i CSS di colonna la allontanano dalla cartella. Nuovo requisito richiede preview flottante. Le card condividono `TreeRocketFolderNode`; loading/paging/abort sono già presenti. | Ancorare la preview al pulsante che l’ha aperta, contenere/ricollocare entro viewport, chiudere con focus ripristinato; non riservare una colonna e mantenere gli stati/paginazione. |
| Folder Management, tabella, filtro, anteprime e queue | **Segnalazioni visuali non riprodotte.** `<select>` File format è nativo; le opzioni filtrano via `matchesFileFormat`. La tabella ha overflow X nascosto ai breakpoint stretti: regola verificata, clipping effettivo non ancora provato. Copy/move hanno endpoint distinti. | Riprodurre select chiusa/aperta, scroll, tastiera e risultati; verificare colonne e liste su viewport stretta. Nessuna nuova select/listbox finché la causa del blocco non è dimostrata. |
| File Studio | Componente dedicato montato da `App.tsx`; nessun sintomo specifico ancora riprodotto nell’audit. | Controllare toolbar, selezione, preview e scroll con fixture; nessuna modifica senza un difetto verificato. |
| Applications | Workspace dedicato con griglia/ricerca. I test esistenti verificano grid responsive e limiti di layout. Nessun malfunzionamento specifico riprodotto. | Confermare con viewport ampia/stretta e lista estesa; mantenere toolbar e righe raggiungibili. |
| Daily Job | Componente dedicato; CSS ha breakpoint per righe evento/attività. Nessun sintomo specifico riprodotto. | Verificare lista lunga e righe strette; correggere eventuali clipping concreto senza alterare i dati. |
| Conversations | Componente dedicato e shell a altezza viewport; test di sorgente coprono paginazione e cambio conversazione. Nessun difetto visuale riprodotto. | Conservare scope dell’account/pianeta e controllare scroll/toolbar con messaggi lunghi se emergono problemi in R8. |
| Planet Graph | Overlay da `App.tsx`, CSS ha layout dedicato per query/canvas/connessioni e mobile. Baseline contiene test responsive con selezione brittle del blocco media (fallisce 1 assertion prima degli edit). | Correggere l’assertion affinché segua il blocco che definisce Planet Graph; verificare che pannelli/canvas restino nella viewport e scrollino internamente. |
| Gestione pianeti / switcher | Overlay `ChangeWorld`; test esistenti controllano disclosure e stili. World workspace è keyed per user/world. Nessun difetto specifico riprodotto. | Verificare controlli/editor su viewport ridotta; preservare scope Planet e salvataggio. |
| Pannelli sorgenti condivisi e finestra CargoShip | Composizione condivisa via `DashboardSourceColumn`; CargoShip ha una finestra standalone. In questa fase nessun difetto specifico riprodotto. | Trattare come superfici distinte; intervenire solo per overflow/menu davvero osservati e verificare focus/livelli. |

## Decision Log

- 2026-10-13: Conservare R1–R8 come ID stabili; il coordinatore mantiene questo piano, TaskState, test e documentazione.
- 2026-10-13: Frontend possiede React/TypeScript/CSS; una sola persona modifica `src/App.css`. Architect e Reviewer sono read-only.
- 2026-10-13: Il popover TreeRocket sostituisce il pannello laterale fisso introdotto in un task precedente; riusare stato, caricamento e paginazione già presenti.
- 2026-10-13: Non ridisegnare superfici senza un difetto o una incoerenza verificata. L’inventario R1 determina l’estensione delle correzioni.
- 2026-10-13: Non modificare API/server/Electron senza prova che la causa attraversi quei moduli. Nessun commit o push.
- 2026-10-13: Dopo un ciclo mirato di correzione e re-review, non iniziare un ulteriore ciclo; annotare il residuo focus R4 e consegnare con limiti espliciti.

## Outcomes & Retrospective

**Stato per requisito.** R1: inventario sorgente completo per Dashboard, TreeRocket, Folder Management, File Studio, Applications, Daily Job, Conversations, Planet Graph, gestione pianeti, pannelli sorgenti e CargoShip; l’area TreeRocket è confermata staticamente, mentre i sintomi visuali sulle altre pagine restano distinti come non riprodotti. R2: rimossa la colonna per la preview See files e ampliate leggermente le card; nessuna riscrittura delle altre pagine senza una causa verificata. R3: l’azione See files resta separata dall’apertura normale della cartella; Escape dai controlli estranei non viene intercettato. R4: preview flottante, paginata e scope-aware implementata; Reviewer conferma viewport clamp e Escape contestuale, ma segnala focus perso se lo scroll chiude il pannello quando l’ancora esce dalla viewport. R5: card TreeRocket più larghe, nome/meta/azioni organizzati; assertion/build passano, ma manca osservazione visiva. R6: select nativa e filtro esistente; 19 formati/96 file sono nella fixture ma menu, rotella, trackpad, tastiera e filtro non sono stati azionati nella UI, quindi non si dichiara risolto. R7: fixture per molte cartelle e file; layout/clipping e scroll della pagina Folder Management non sono stati diagnosticati visivamente e il componente resta invariato. R8: lint/build e 20 test mirati passano; 79 test passano escludendo `applicationDiscovery.test.mjs`, bloccato da `EPERM` nella creazione di un symlink temporaneo; Electron esce con codice 1 dopo la build.

**Limiti residui.** Per R6 e R7 serve accesso all’interfaccia per provare il menu File format, la lista risultante e la tabella alle larghezze previste. Per R4–R5 il sorgente e le regression assertions sono verificati, ma posizionamento visivo, collisioni e focus reali non sono stati osservati; resta inoltre il rilievo Reviewer LOW sul focus durante la chiusura automatica per scroll. Il test symlink richiede una modalità Windows che consenta junction/symlink o una fixture che salti il requisito senza alterare la copertura.

## Context and Orientation

La directory di lavoro è la radice FolderRocket in Windows. `src/App.tsx` seleziona le pagine e collega le preferenze con scope per utente/pianeta. `src/components/TreeRocket.tsx` contiene navigazione gerarchica, ricerca e dati della preview file. `src/components/FolderManagement.tsx` contiene la tabella delle cartelle, i pannelli di anteprima e le azioni di copia/spostamento. `src/App.css` è il foglio condiviso con una cascata lunga e breakpoint stratificati; `src/worlds.css` contiene regole planet-specifiche.

All’avvio, i file frontend e molti documenti/test erano già modificati. La copia di confronto del sorgente preesistente è stata salvata in `%TEMP%\folderrocket-frontend-baseline-2026-10-13\src`; non usarla per sovrascrivere il working tree. I fixture sotto `tests/ui/` usano cartelle/file e risposte API sintetici. Le descrizioni storiche di `CODEX.md` sono contesto, non prova della UI corrente.

## Plan of Work

Per R1 il coordinatore e Frontend mappano le superfici effettivamente composte dall’app, gli handler e le regole responsive; per ogni problema annotano trigger, causa dimostrata e criterio osservabile, marcando separatamente i sintomi ancora da riprodurre. Architect controlla read-only i confini tra shell, scope Planet, preview TreeRocket e filtro Folder Management.

Per R2–R3 Frontend interviene solo sulle superfici dove l’inventario mostra un problema: gerarchia, vincoli di larghezza, overflow, livelli dei menu e scroll contenitori; mantiene gli handler e gli stati esistenti o li corregge solo quando la causa è provata. Le pagine condivise non ricevono una riscrittura generale.

Per R4–R5 Frontend sostituisce il pannello laterale con un’anteprima ancorata alla card, corretta su apertura, navigazione, scroll e resize. Il trigger di azione non attiva l’apertura normale della cartella; click esterno, Escape, chiusura e focus sono verificati. Le card restano accessibili anche a viewport stretta e i risultati async tardivi non sovrascrivono la selezione recente.

Per R6–R7 Frontend riproduce la segnalazione File format con molte estensioni e individua la causa tra select e contenitori. Verifica filtro e scroll della lista. Poi sistema layout, ricerca, tabella, preview e azioni in Folder Management senza modificare le semantiche di copia, spostamento o stato per pianeta.

Per R8 il coordinatore aggiorna la fixture sintetica/documentazione solo se necessario, esegue i test pertinenti, lint, build e prova desktop richiesta. Reviewer verifica in sola lettura il diff di questo task confrontato con la baseline, R1–R8 e le prove dichiarate.

## Concrete Steps

Eseguire dalla radice FolderRocket in PowerShell:

    node --test tests/treeRocketUiFixture.test.mjs tests/workspaceLayoutAndEmailPagination.test.mjs tests/planetStylesAndTreeRocketInteraction.test.mjs
    npm run lint
    npm run build
    npm test
    npm run desktop

Eseguire solo i test pertinenti dopo aver controllato i loro nomi e prerequisiti nella checkout corrente. `npm run desktop` compila e apre Electron; usare fixture o dati sintetici per verificare le interazioni, senza copiare/spostare file reali, inviare email o attivare integrazioni reali. Annotare ogni comando non eseguibile e perché.

## Validation and Acceptance

- **R1:** inventario per pagina/superficie con trigger, stato `REPRODUCED` o `REPORTED_ONLY`, causa provata o sconosciuta, file/funzione, soluzione e criterio.
- **R2:** superfici modificate leggibili a dimensione ampia e stretta; niente collisioni/tagli o controlli irraggiungibili; scrolling resta disponibile nell’area prevista.
- **R3:** per ogni interazione modificata, verificare input, stato loading/error/empty/success, chiusura e navigazione; non confondere sorgente statica o build con prova runtime.
- **R4:** aprire See files per una card, verificare posizionamento e confinamento, close/Escape/click esterno, scroll/resize, caricamento/paginazione e selezione rapida di un’altra cartella; normale click apre ancora la cartella.
- **R5:** leggere nomi lunghi, azioni allineate e card raggiungibili con molte card e viewport stretta; check compatto.
- **R6:** con molte estensioni tutte le opzioni sono selezionabili via mouse/rotella, trackpad e tastiera; il filtro mostra i file dell’estensione scelta e la lista continua a scorrere.
- **R7:** tabella, ricerca/filtri, preview, file e azioni sono visibili e utilizzabili; scroll indipendenti non bloccano la pagina o altri contenuti.
- **R8:** esiti reali di fixture/test/lint/build/Electron per le superfici modificate; riportare separatamente le misure visuali non eseguite.
- Verificare che i dati restino scoped al pianeta e che copia/spostamento rimangano invariati; il task non autorizza trasferimenti reali.

## Idempotence and Recovery

L’inventario e i controlli sintetici possono essere ripetuti senza modificare file utente. Prima degli interventi il sorgente corrente è stato copiato nella directory temporanea indicata sopra e lo status Git iniziale è stato registrato nella chat. Non ripristinare interi file da Git o dalla snapshot: se una correzione fallisce, il Frontend riporta il blocco e propone un hunk mirato, preservando il contenuto preesistente di ogni file condiviso. La fixture usa dati fittizi e non deve puntare a un backend reale.

## Artifacts and Notes

- Piano unico del task: `docs/plans/folderrocket-frontend-layout-2026-10-13.md`.
- Baseline iniziale: `git status --short`; i diff iniziali sono modifiche utente preesistenti.
- Snapshot frontend solo per confronto: `%TEMP%\folderrocket-frontend-baseline-2026-10-13\src`.
- La fixture TreeRocket corrente contiene già nomi lunghi, molte cartelle e oltre una pagina di file; confermare i suoi controlli effettivi prima di farne affidamento.

## Interfaces and Dependencies

L’interfaccia TreeRocket riceve `worldId`, cartelle gestite e callback di navigazione/aggiunta; i dati file passano per le route filesystem esistenti. Il nuovo popover deve consumare lo stato `filesView`/loader già posseduto da TreeRocket e mantenere le guardie contro risposte async fuori ordine. Folder Management conserva `fileFormat`, `fileTypeCounts` e `matchesFileFormat`; non è previsto un nuovo endpoint. `FolderManagement` riceve `worldId`; le preferenze restano separate per pianeta. Non introdurre dipendenze npm per risolvere un problema di layout.

## Revision Notes

- 2026-10-13: Creato il piano unico prima dell’implementazione; aggiunti lo stato iniziale verificato, ownership, limiti di scope e matrice R1–R8 per guidare l’audit.
- 2026-10-13: Chiuso il ciclo di review finale. Reviewer ha confermato i due fix richiesti e riportato un residuo LOW per il focus quando lo scroll chiude il preview; R6/R7 non sono stati dichiarati risolti senza prova UI.
