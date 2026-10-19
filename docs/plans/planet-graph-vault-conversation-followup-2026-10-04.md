# Grafo del pianeta, vault configurabile e conversazioni email

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Correggere il crash di View graph, rendere coerenti il grafo interno e le note Markdown del vault, permettere di scegliere le fonti per pianeta, riparare la selezione/visualizzazione delle conversazioni email e completare gli aggiustamenti di navigazione richiesti per Change World e Tree Rocket.

## Progress

- [x] (2026-10-04 13:53Z) Letti i requisiti allegati, `AGENTS.md`, `CODEX.md`, `PLANS.md` e la documentazione Graphify; verificato `git status`.
- [x] (2026-10-04 13:59Z) Analyzer: mappa aggiornata di componenti, route, persistenza e test; confermate capacità Gmail/Outlook e limiti correnti.
- [x] (2026-10-04 13:57Z) Aggiornato Graphify (`2157` nodi, `4152` archi) e consultato per i flussi delle impostazioni pianeta, vault, conversazioni e Tree Rocket; relazioni confermate nei sorgenti.
- [x] (2026-10-04 14:00Z) Corretto il layout del grafo e aggiunto un test mirato (>1200 nodi, più pianeti e payload malformati): 3/3 passati.
- [x] Correggere l’import Gmail mancante con regressioni.
- [x] Allineare le categorie selezionate e le conversazioni Gmail esplicitamente selezionate fra sincronizzazione del vault e grafo; proteggere le note esistenti e segnalare i limiti.
- [x] Correggere identità account e conversazioni secondo le capacità effettive dei provider; Outlook rimane esplicitamente non supportato per i thread.
- [x] Rifinire impostazioni pianeta, logo/navigazione, Tree Rocket Desktop/Apps; aggiunta paginazione dei contenuti Desktop oltre 250 cartelle.
- [x] Eseguire i controlli automatici; la verifica visiva con account Gmail/Calendar reali e Desktop personale non è stata eseguita.

## Surprises & Discoveries

- Nel sorgente attuale `PlanetGraph.tsx` può esporre 1.200 nodi ma assegna coordinate solo ai primi 900 per alcuni gruppi; il rendering forza la posizione con `!`.
- `backend/server.js` importa `listInboxThreads`, mentre alcuni flussi chiamano `listGmailInboxThreads`.
- Nel vault locale del pianeta Lavoro sono presenti 2.000 note Markdown sotto `FolderRocket`. Non cancellare, sovrascrivere o spostare l’archivio esistente senza migrazione verificabile.
- Sono già presenti le pagine interne per grafo e Gmail Conversations e la configurazione Obsidian, account per pianeta e Tree Rocket; riutilizzarle invece di crearne duplicati.
- Il grafo Graphify locale risulta datato 2026-10-03 e vi sono sorgenti del 2026-10-04: rigenerarlo prima di query operative, se disponibile.
- Graphify aggiornato: warning di collisione del nodo esterno `typescript` tra i package root e plugin; non influisce sulle relazioni dei moduli FolderRocket, confermate nei sorgenti.
- Analyzer conferma che l’indice del grafo e la sync vault leggono Gmail separatamente, e Outlook conversation restituisce 501. Il vault salva esito/lastSync, ma non supporta selezione fonti.
- Il caricamento Apps Tree Rocket è lazy e mantenuto in memoria di modulo; la discovery file applicazioni è un flusso distinto con cache incrementale.
- Outlook non va presentato come supportato per le conversazioni se route/provider non espongono thread reali.

## Decision Log

- (2026-10-04) Usare una sola selezione esplicita di fonti per pianeta come base sia per sync del vault sia per il grafo; non includere categorie deselezionate.
- (2026-10-04) La vista grafo interna è FolderRocket, ispirata a Obsidian; `Open in Obsidian` apre l’app esterna e il suo esito non prova che il vault sia stato caricato.
- (2026-10-04) Non cancellare note manuali né credenziali per risolvere duplicati UI. Distinguere le connessioni per provider e identità autenticata.
- (2026-10-04) Sincronizzare in automatico solo quando abilitato esplicitamente e con batching; mantenere sempre Sync now.

## Outcomes & Retrospective

Completato senza commit o push.

- Il grafo assegna coordinate finite a ogni nodo visualizzato, compresi oltre 1.200 nodi, più pianeti e payload malformati; la chat locale usa solo label/metadati e relazioni effettive, con citazioni cliccabili, filtro per tipo, profondità e connessioni del nodo selezionato.
- Le categorie di fonti sono versionate e persistite per pianeta; il grafo e il vault filtrano le stesse categorie e le conversazioni Gmail selezionate. Il filtro del grafo esclude anche i dati Gmail in cache provenienti da un account diverso da quello attualmente selezionato. Gli account con la stessa email sono raggruppati mostrando provenienze note, senza copiare o revocare token.
- La sincronizzazione Obsidian conserva il vault legacy e lo copia solo dopo verifica del marcatore; il vault canonico usa il nome sanificato del pianeta. Sync riporta ultimo successo, conteggi, conflitti, sorgenti assenti e limiti; oltre 2.000 note candidate, l’omissione è esplicitamente segnalata. Note manuali e note generate deselezionate non vengono eliminate automaticamente; il sync avvisa che le vecchie note generate restano nel vault.
- La sincronizzazione automatica resta esplicitamente opt-in, debounced, serializzata per pianeta e limitata al backend locale. Le risposte obsolete non cambiano impostazioni di un altro pianeta.
- Gmail usa il selettore singolo per pianeta e la vista conversazione usa thread reali, allegati per draft/reply e condivisione esplicita dei riferimenti. **Add chat** ricerca e pagina l’inbox autenticata, salva i riferimenti per pianeta, mantiene rimovibili le selezioni più vecchie e raggruppa nuovi thread dello stesso mittente normalizzato, conservando l’ID del thread per risposta. Conversation mostra solo contatti/conversazioni selezionati esplicitamente e riferimenti condivisi con il pianeta. Outlook è dichiarato non supportato come vista conversazione perché l’integrazione attuale non espone thread reali; non è stata simulata compatibilità.
- Tree Rocket usa Desktop reindirizzato di Windows via API di sistema; le directory dirette oltre 250 sono raggiungibili tramite pagine da 250. Catalogo Apps mantiene la cache in memoria già esistente, offre retry/refresh quando il caricamento fallisce. Nessun benchmark su un inventario reale è stato eseguito.
- La build riporta ancora il warning Vite già presente per il bundle principale oltre 500 kB (circa 549 kB non compressi); non è stato modificato il code splitting perché non era collegato a un collo di bottiglia misurato in questa richiesta.

Verifiche completate dopo l’ultima modifica: `npm run build` (passa; chunk principale da 557.38 kB e asset grafici pesanti generano l’advisory Vite), `npm run lint` (passa), `npm test` (86/86), test mirati grafo/query/frontend/Conversation e helper UI documentati (26/26), `node --check server.js` (passa), `git diff --check` (passa con soli avvisi di conversione CRLF/LF). Un primo `npm test` eseguito in parallelo a build e lint ha avuto un timeout nel test del lifecycle backend; ripetuto da solo è passato. Nessuna verifica visuale nell’interfaccia FolderRocket con Gmail/Calendar reali, vault Obsidian installato o Desktop personale è stata eseguita; gli HTTP 400 riportati in diagnostica precedente non sono stati attribuiti a una causa senza credenziali e risposta riproducibili.

Limiti rimasti: selezione granulare di singole cartelle non implementata (le cartelle sono selezionabili per categoria e le conversazioni Gmail individualmente); file allegati scaricati possono essere copiati nel vault solo se forniti dal chiamante, ma il sync automatico non scarica allegati email né li riceve dal flusso attuale; Daily Job/File Studio/post-it vengono esportati solo dai dati locali che il client passa al sync. Outlook threads non disponibili. Conversation è verificato con test helper/sorgente e build, ma non con fixture browser dedicata né account OAuth reale; le prestazioni Apps/Tree Rocket sono state verificate con fixture/test e non con un inventario end-to-end sul computer dell’utente.

## Context and Orientation

- `src/components/PlanetGraph.tsx` e `backend/services/planetGraphService.js`: grafo per utente/pianeta e layout SVG.
- `backend/services/obsidianVaultService.js` e route in `backend/server.js`: note Markdown, manifest, sync e fonti.
- `src/components/ChangeWorld.tsx` e persistenza in `src/worlds.ts`: pianeti, impostazioni e controlli.
- `src/App.tsx` e `src/App.css`: logo, navigazione, schede, Conversation e disposizione principale.
- `src/components/EmailConversations.tsx`, `backend/services/gmailService.js`, `outlookService.js`, `worldEmailAccountService.js`: account e conversazioni.
- `src/components/TreeRocket.tsx`, `backend/services/treeRocketService.js`, `applicationDiscoveryService.js` e `applicationDiscoveryCache.js`: radici file, Desktop e inventario Apps.
- Test esistenti: `backend/test/planetGraphAndConversation.test.js`, `backend/test/obsidianAndWorldSettings.test.js`, altri test di persistenza account/Tree Rocket da confermare nei sorgenti.
- Graphify descrive relazioni statiche del codice, non la correttezza runtime.

## Plan of Work

1. Analyzer aggiorna la mappa dei flussi, conferma contratti API e localizza le prove per ogni richiesta.
2. Correggere il layout del grafo affinché ogni nodo visibile abbia coordinate finite, quindi correggere i nomi/import Gmail. Coprire entrambi con test sintetici.
3. Definire e persistere un modello versionato di fonti selezionate per pianeta. Usare lo stesso modello per la produzione dei record Markdown e per l’indice del grafo. Migrare configurazioni esistenti con default compatibili espliciti, preservando manifest, note manuali, account e dati utente.
4. Rendere il sync incrementale, con stato/ultimo sync riuscito, avvisi parziali e retry. Il sync automatico è facoltativo e limitato alle fonti scelte.
5. Correggere account/conversazioni con identità verificata per provider e selezione per pianeta; aggiungere supporto solo dove l’API attuale lo consente davvero.
6. Rifinire sezioni a tendina, controlli e logo in Change World, accesso laterale Conversation e riga Browse/Computer/Desktop/Folder/Apps/search di Tree Rocket. Completare Desktop reale e caching Apps solo con misure verificabili.
7. Eseguire test pertinenti, build, lint, suite backend, sintassi server e prove UI/Electron disponibili. Aggiornare questo ExecPlan con risultati e limiti.

## Concrete Steps

Dalla root del repository:

    npm run graph:build
    node --test backend/test/planetGraphAndConversation.test.js backend/test/obsidianAndWorldSettings.test.js
    npm run build
    npm run lint
    npm test

Per modifiche backend, da `backend/`:

    node --check server.js

Usare `git diff --check` e controllare `git status --short`. Non eseguire test contro il vault reale: usare directory temporanee e provider mock.

## Validation and Acceptance

- Il grafo non va in errore con oltre 900 nodi dello stesso tipo e ogni nodo visibile ha coordinate finite.
- Vault e grafo usano la stessa selezione fonti per pianeta; la deselezione esclude nuovi dati senza cancellare note manuali.
- Sync mostra timestamp dell’ultimo successo, stato, conteggi, errori parziali e retry.
- L’identità provider/account mostrata corrisponde al servizio realmente interrogato; pianeti differenti non si sovrascrivono.
- Conversation e azioni disponibili corrispondono al supporto Gmail/Outlook effettivo.
- Le impostazioni e le viste richieste restano leggibili e accessibili su finestre strette.
- TypeScript/build, lint e test pertinenti passano; i flussi non verificabili sono elencati.

## Idempotence and Recovery

Le migrazioni usano identificativi stabili e scritture atomiche o manifest versionati; ripetere sync deve aggiornare le stesse note. Conservare backup/versioni delle note generate in conflitto secondo il comportamento corrente. Non spostare o cancellare vault reali durante test. In caso di migrazione fallita lasciare il vault originale integro e rendere esplicito lo stato di errore.

## Artifacts and Notes

Conservare fixture e risultati diagnostici sintetici; non includere indirizzi email reali, token, contenuti di messaggi o percorsi personali negli artifact.

## Interfaces and Dependencies

Riutilizzare React/TypeScript, Express/CommonJS, persistenza locale e icone già dipendenti dal progetto. Prima di aggiungere dipendenze o introdurre plugin/API Obsidian, verificarne necessità e compatibilità. Nessuna nuova dipendenza è assunta in questo piano.

## Revision Notes

- (2026-10-04) Creato il piano per le estensioni richieste dopo la precedente fase vault/grafo; il piano precedente rimane consultabile come storico e contesto.
