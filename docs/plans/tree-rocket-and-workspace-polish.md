# Tree Rocket and workspace polish

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Rendere Tree Rocket una schermata spaziale di esplorazione delle cartelle realmente interattiva, integrarla nella colonna sinistra di Folder Management e correggere il collegamento dei percorsi. Rifinire inoltre il layout Folders on Top, Rename e i blocchi File Studio, la selezione Gmail per pianeta e Daily Job. Il lavoro conserva le funzioni e i dati esistenti, senza commit o push.

## Progress

- [x] (2026-09-29 20:45Z) Ispezionati struttura e vincoli della repository, istruzioni `AGENTS.md`/`PLANS.md`, modifiche locali preesistenti e specifica precedente allegata.
- [x] (2026-09-29 20:45Z) Mappare i flussi effettivi e confermare le relazioni rilevanti con Graphify; identificare le cause del collegamento Tree Rocket e i limiti di invio email/Teams.
- [x] (2026-09-29 21:24Z) Migliorare Tree Rocket, logo, ricerca, grafo, file iconografici, aggiunta e punto d’accesso in Folder Management.
- [x] (2026-09-29 21:24Z) Verificare Folders on Top e rifinire Rename e presentazione Local Conversion/Change Format.
- [x] (2026-09-29 21:24Z) Rendere Gmail un singolo account visibile per pianeta e migliorare Daily Job con bozze manuali.
- [x] (2026-09-29 21:24Z) Integrare la source Teams read-only, con scope opzionali e filtri, e rendere espliciti temi AI Alert.
- [x] (2026-09-29 21:24Z) Eseguire test mirati, lint, suite, type-check/build e annotare i limiti di consenso/verifica live.

## Surprises & Discoveries

- Il layout `Folders on Top` mette i gruppi di progetto in elementi da 228px; i membri di uno stesso gruppo sono renderizzati dentro lo stesso wrapper. La regola attuale spiega perché possano impilarsi verticalmente.
- Tree Rocket era un overlay chiaro con schede, non un canvas ad albero con ricerca; il pannello file era a destra e mostrava un’icona generica.
- L’aggiunta da Tree Rocket chiama `onAddFolder` senza attenderne esito: non fornisce conferma di salvataggio né stato di errore. Il flusso usa la callback dashboard esistente e va verificato nel dettaglio.
- Daily Job aggrega eventi di calendario, reminder e cronologia attività locale. È riutilizzabile l’endpoint autenticato che crea una bozza Gmail/Outlook; l’invio può restare esplicitamente manuale.
- L’utente ha specificato: riepilogo solo manuale e Teams completo ma filtrabile/selezionabile. La lettura dei messaggi Teams richiede permessi Microsoft Graph distinti da quelli mail già richiesti; l’utente dovrà concedere il consenso nell’app Microsoft.
- I permessi Teams ora sono richiesti solo con il pulsante esplicito nella source Teams. Il flusso Outlook ordinario conserva soltanto gli scope mail; i messaggi Teams si caricano a pagine e i continuation link restano vincolati a Microsoft Graph.
- Dopo il chiarimento dell’utente (“tutto, si può scegliere”), anche chat/team/canali hanno paginazione esplicita; i post nei canali includono le risposte e offrono il caricamento dei reply oltre la pagina Graph iniziale. Le richieste Teams sono invalidate al cambio di account/ambiente.
- La ricerca Tree Rocket è limitata a profondità 8, 1.500 directory e 100 risultati per evitare una scansione illimitata; l’interfaccia segnala i risultati troncati.

## Decision Log

- (2026-09-29) Mantenere Tree Rocket locale e progressivo: non introdurre una scansione totale del computer o dipendenze grafiche pesanti; verificare i path attraverso le API esistenti.
- (2026-09-29) Daily Job crea solo una bozza su richiesta manuale, indirizzata all’account scelto, con anteprima e invio manuale dalla mailbox.
- (2026-09-29) Teams consente selezione fra chat e canali e categorie messaggi, menzioni, file condivisi; riusare la connessione Microsoft per pianeta e richiedere consenso per gli scope Graph necessari. Non leggere contenuti/file al di fuori del pannello esplicitamente selezionato.
- (2026-09-29) Gli scope Teams vengono richiesti solo dall’azione esplicita del pannello Teams e salvati nella connessione cifrata selezionata; non fanno parte dell’accesso Outlook ordinario.
- (2026-09-29) Tutte le modifiche preesistenti nella working tree appartengono al lavoro dell’utente: preservarle e non ripristinarle.

## Outcomes & Retrospective

Completato localmente. Tree Rocket è una vista a schermo intero con brand dedicato, albero navigabile, ricerca limitata, file panel a sinistra con icone coerenti, copia path e inserimento confermato in Folder Management. Gmail espone un solo account corrente nel menu Read attachments e una selezione esplicita a schede, mantenendo la preferenza per pianeta. Daily Job evidenzia reminder in scadenza oggi e crea, solo su richiesta, una bozza riepilogativa da rivedere/inviare manualmente. Teams è una source facoltativa con selezione chat/canale, filtri messaggi/menzioni/file, paginazione per directory e messaggi e risposta ai thread con paginazione dei reply; gli scope Graph sono richiesti separatamente dalla mail. I risultati Teams sono isolati al pianeta/account selezionato. Folders on Top mantiene i membri dei gruppi affiancati nello scorrimento orizzontale e le Sources sotto; Rename resta compatto e Local Conversion/Change Format hanno una gerarchia grafica più leggibile. AI Alert mantiene il modello `gpt-4.1-mini` già configurato e chiarisce l’inserimento di topic/istruzioni.

Verifiche: `npm run lint`, `npm run build` (TypeScript + Vite), `npm test` (47 test), `node --check server.js`, `node --check services/outlookService.js` e `git diff --check` superati. Non è stato fatto un test interattivo con account Microsoft/Gmail reali né un controllo visuale nell’app; Teams richiede che l’app Microsoft registrata permetta gli scope delegati e i messaggi di canale possono richiedere consenso amministratore. La vista file Teams espone i file/link condivisi presenti nei messaggi, non un browser completo di SharePoint/OneDrive. Non sono stati creati commit o push.

## Context and Orientation

La cartella di lavoro conteneva modifiche non committate preesistenti in `src/App.tsx`, `src/App.css`, `src/components/FolderManagement.tsx`, `src/components/GmailSourcePanel.tsx`, `backend/server.js` e altri file; sono state preservate. `FolderManagement` riceve `onAdd` dalla callback `addFolder` di `App.tsx`; il pannello sinistro include il launcher Tree Rocket e le preview. `DailyJob.tsx` legge attività, reminder ed eventi salvati localmente. `GmailSourcePanel.tsx` usa la selezione account per pianeta e mostra ora il solo account corrente con cambio esplicito a schede.

`Tree Rocket` è la navigazione locale delle cartelle e non Graphify, che serve esclusivamente ad analizzare il codice. La schermata dei pianeti offre già l’identità visiva spaziale riutilizzabile. I comandi di progetto sono `npm run lint`, `npm test` e `npm run build`; i test mirati helper usano Node `node:test` secondo le istruzioni in `AGENTS.md`.

## Plan of Work

Prima seguire la callback Tree Rocket → Folder Management → App → persistenza, leggere il servizio filesystem e confrontare con il comportamento atteso usando Graphify e sorgenti. Poi aggiungere ricerca e navigazione grafo a nodi connessi, file panel a sinistra con le icone del sistema, brand Tree Rocket SVG/wordmark e ingresso nel riquadro preview, facendo attendere e riportando l’esito di aggiunta. Mantenere caricamento progressivo, navigazione accessibile e path reali.

Successivamente disporre orizzontalmente ogni membro dei gruppi nel layout Folders on Top e sfumare i bordi dell’area scorrevole. Adeguare lo spazio Rename affinché il controllo composer occupi la larghezza utile senza ingrandire il blocco; dare una gerarchia visiva più leggibile a Local Conversion/Change Format evitando override conflittuali.

Per Gmail mostrare in modo predefinito il solo account corrente del pianeta e mantenere scelta esplicita per cambiare/collegare account con schede, non un menu a tendina persistente né token duplicati. In Daily Job evidenziare la data odierna e le scadenze del giorno, quindi creare una bozza email soltanto su richiesta, da rivedere e inviare manualmente. Integrare una sorgente Teams read-only, riutilizzando la connessione Outlook/Microsoft del pianeta attivo e rendendo selezionabili chat, canali e categorie di messaggio; indicare quando il consenso Graph deve essere aggiornato.

## Concrete Steps

Dalla radice `C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`:

    npm run graph:build
    graphify query "FolderManagement TreeRocket addFolder filesystem tree children"
    node --test backend/test/treeRocketService.test.js backend/test/dashboardTreeRocketUi.test.js
    npm run lint
    npm test
    npm run build

Le prove di Graphify sono indizi statici e vanno confermate nei sorgenti e nei test. Se la generazione Graphify non è disponibile, continuare con `rg`/sorgenti e annotare la limitazione.

## Validation and Acceptance

Tree Rocket deve aprirsi dal riquadro sinistro, filtrare cartelle e file per nome, mostrare nodi folder con collegamenti visibili, progredire su selezione e mostrare i file nel pannello laterale con gli stessi `FileKindIcon` dell’app. “Add to Folder Management” deve prevenire duplicati, invocare una sola volta la callback per path, confermare il successo e mostrare errori senza chiudere la schermata o perdere il contesto.

Nel layout Folders on Top due o più cartelle dello stesso progetto devono essere adiacenti in riga e scorribili orizzontalmente; Sources restano sotto. Rename e i due pannelli File Studio restano utilizzabili e stabili con lista vuota/piena. Gmail rende visibile un solo account attivo del pianeta e conserva selezioni diverse fra pianeti. Daily Job distingue oggi e scadenze.

Eseguire test pertinenti, `npm run lint`, `npm test` e `npm run build`. Le funzioni OAuth/Teams e le verifiche visive richiedono prova UI manuale. La ricerca Tree Rocket è intenzionalmente limitata e può non trovare directory oltre i limiti dichiarati.

## Idempotence and Recovery

Le prove di lettura non modificano i dati. Le modifiche UI non migrazioni automatiche; non eliminare selezioni Gmail salvate o token OAuth. Un’azione di collegamento deve essere idempotente per percorso canonicale. Se test o build falliscono, isolare le regressioni nei soli file modificati in questa attività e preservare tutti gli altri cambiamenti della working tree.

## Artifacts and Notes

Grafo locale in `graphify-out/` (ignorato da Git). Conservare soltanto nel repo log brevi di test pertinenti; non includere dati Gmail, file utente, token o credenziali.

## Interfaces and Dependencies

- Riutilizzare `TreeRocketMark`, `FileKindIcon`, `API_BASE_URL`, `/filesystem/tree-roots`, `/filesystem/tree-children` e `FolderManagement`/`App.addFolder`.
- Riutilizzare `folderProjectGroups`, `GmailSourcePanel`, la selezione `accountBlockId` per pianeta e le attuali API autenticazione Gmail.
- Per riepiloghi email usare `/cargo-ship/email-sources` e `/cargo-ship/email-draft`; non inviare email automaticamente.
- Teams riusa la connessione Outlook/Microsoft selezionata nel blocco e pianeta attivi. La normale autorizzazione mail resta invariata; solo “Connect / grant Teams access” chiede `Chat.Read`, `Channel.ReadBasic.All` e `ChannelMessage.Read.All`. Chat, team, canali, messaggi principali e reply sono paginati; le continuation URL sono accettate solo da `graph.microsoft.com`. La feature tratta `403`/scope mancanti come richiesta di riconnessione/consenso, senza compromettere Gmail o Outlook.

## Revision Notes

- 2026-09-29 — Implementate le rifiniture richieste e aggiornati limiti/consensi. Teams include paginazione per le liste e i reply dei canali. Build, lint e 47 test superati; restano consenso Graph e test manuali con account reali.
