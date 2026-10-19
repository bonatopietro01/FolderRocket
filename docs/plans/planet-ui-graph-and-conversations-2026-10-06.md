# Planet views, graph relationships, and conversations

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Completare in FolderRocket gli interventi richiesti su Fly To Another Planet, Planet Graph e vault Obsidian, Tree Rocket, Folder Management, navigazione Dashboard e Conversations. L'utente deve vedere stili planetari aggiornati, relazioni verificabili uguali nel grafo e nel vault, una vista Tree Rocket ordinata, un ripristino Dashboard non distruttivo e conversazioni Gmail per mittente senza caricare l'intera casella. Tutti i dati e le preferenze restano isolati per pianeta.

## Progress

- [x] (2026-10-06 08:44Z) Letti prompt allegato e istruzioni `AGENTS.md`, `CODEX.md` e `PLANS.md`; registrato il worktree preesistente come dirty senza ripristinare file.
- [x] (2026-10-06 08:44Z) Rigenerato Graphify dopo gli aggiornamenti sorgente; il grafo statico contiene 2.335 nodi e 4.487 archi. Eseguite tre query mirate; i risultati sono orientativi e saranno verificati nel codice.
- [x] (2026-10-06 08:44Z) Avviata l'analisi read-only e acquisita la TaskState; confermate lacune in migrazione stili, archi snapshot/alert/email verso il pianeta, reset Dashboard e caricamento Gmail per mittente.
- [x] Implementare i punti mancanti verificabili mantenendo tutte le modifiche preesistenti e aggiungendo regressioni mirate.
- [x] Eseguire lint, suite backend, build e sintassi backend; la verifica grafica locale è rimasta bloccata dal browser di test.

## Surprises & Discoveries

- La cartella di lavoro era già fortemente modificata: 25 file tracciati modificati e numerosi nuovi servizi, test e piani. Queste modifiche sono da preservare e non vanno rimpiazzate da una copia pulita.
- Il backend ha già relazioni per radici di cartelle e per thread/messaggi/persona; non è corretto ricostruire tutto da zero. La lacuna confermata è che `snapshotGraphItems()` restituisce archi vuoti, gli alert non sono collegati al pianeta e i nodi email non hanno un arco diretto al pianeta.
- L'header Change World usa ancora l'icona Lucide `Rocket`; la validazione TypeScript, CSS e backend ammette ancora `rocky`, `ringed`, `glowing`, `asteroid`.
- Dashboard mantiene il pulsante circolare di reset separato e il secondo clic su Dashboard non ripristina il layout.
- Il rail Conversations esiste con polling/badge, ma non con il popover richiesto. La lista email è basata su conversazioni selezionate, non su tutti i messaggi ricevuti da un mittente negli ultimi 30 giorni.
- `npm test` sul worktree iniziale ha riportato 96/110 test superati. La maggior parte dei fallimenti deriva da `EPERM` su rename/symlink nei temp path protetti del sandbox; anche il test lifecycle backend e due test diagnostici falliscono e vanno isolati prima di attribuirli alla richiesta.
- Tree Rocket ha già radici Desktop personale/pubblica e deduplica i percorsi canonici. Il layout va verificato nell'interfaccia e corretto solo tramite selettori circoscritti.
- La verifica visiva della fixture non è stata possibile: il browser in-app ha restituito `ERR_CONNECTION_TIMED_OUT` sul server locale. Ho quindi lasciato invariati i CSS di Tree Rocket e Folder Management, senza inventare una correzione a layout non riprodotto.
- La route delle impostazioni conserva in ingresso `rocky` e `asteroid` per compatibilità, ma scrive e restituisce il valore canonico `planet`; colori, ID e preferenze restano intatti.
- Il test backend autenticato e quello di lifecycle continuano a vedere il log “Backend attivo” ma non ricevono `/auth/bootstrap` entro la finestra; il test di sicurezza symlink fallisce con `EPERM` anche usando temp autorizzata nel workspace.

## Decision Log

- (2026-10-06) Conservare il worktree e i file non tracciati già presenti; aggiungere solo patch mirate.
- (2026-10-06) Considerare Graphify solo una mappa statica del codice; i comportamenti e le relazioni sono confermati dai sorgenti e dai test.
- (2026-10-06) Aggiungere nel grafo solo relazioni ricostruibili da dati espliciti e mantenere identici i nodi/archi filtrati esportati nel vault.
- (2026-10-06) Caricare email per mittente con query limitata agli ultimi 30 giorni e paginazione, usando soltanto l'account Gmail del pianeta attivo.
- (2026-10-06) Non creare commit o push; non modificare credenziali, token o dati utente.

## Outcomes & Retrospective

Completati i cinque stili con migrazione legacy, il marchio FolderRocket nell'header di Fly To Another Planet, relazioni esplicite pianeta→record e attività→file per path esatto nel Planet Graph, spiegazione del modello grafo/vault e marchio Obsidian dedicato, reset layout tramite secondo clic su Dashboard, navigazione principale grigio chiaro leggermente più leggibile e popover di stato sul rail Conversations. Conversations usa l'altezza disponibile e carica thread del mittente negli ultimi 30 giorni con paginazione e messaggio esplicito per il caso senza thread aggiuntivi. Sono state aggiunte regressioni per le nuove regole.

Tree Rocket e il riquadro Folders di Folder Management non sono stati modificati in questo passaggio: il browser locale non ha caricato la fixture e la sola lettura del CSS sovrapposto non consente di stabilire quale regola produca il difetto visivo. La UI e le integrazioni reali Gmail/Desktop restano da verificare manualmente.

## Context and Orientation

Il frontend è React/TypeScript in `src/`. Gli entrypoint coinvolti sono `src/components/ChangeWorld.tsx`, `PlanetGraph.tsx`, `TreeRocket.tsx`, `FolderManagement.tsx`, `EmailConversations.tsx`, `src/App.tsx`, `src/App.css`, `src/worlds.ts` e `src/worlds.css`. Le relazioni del grafo e la serializzazione Obsidian sono in `backend/services/planetGraphService.js`, `obsidianVaultService.js` e nelle route di `backend/server.js`; email Gmail usa `backend/services/gmailService.js`; radici filesystem usano `backend/services/treeRocketService.js`.

Test interessati: `backend/test/obsidianAndWorldSettings.test.js`, `planetGraphAndConversation.test.js`, `treeRocketService.test.js`, `dashboardTreeRocketUi.test.js`, `gmailConversationPagination.test.js`, più gli helper in `tests/planetGraphLayout.test.mjs`, `planetGraphQuery.test.mjs`, `worldObsidianFrontend.test.mjs` e `workspaceLayoutAndEmailPagination.test.mjs`.

## Plan of Work

1. Mappare i difetti confermati sui file già dirty e assegnare file univoci ai writer. Non duplicare servizi, route o selettori CSS.
2. Aggiornare i cinque stili planetari e migrare i valori persistiti `rocky` e `asteroid` a stili validi senza perdere colore o impostazioni; sostituire l'icona Rocket con l'asset di marchio.
3. Correggere il modello grafo aggiungendo archi di appartenenza/relazioni supportate per snapshot, alert e email. Far consumare a grafo e vault lo stesso modello dopo selezioni/filtri; mantenere edge endpoints validi e ID stabili.
4. Riprodurre e rifinire Tree Rocket, Folder Management e navigazione Dashboard. Il secondo click su Dashboard ripristina solo posizione/dimensioni di layout; eliminare il controllo reset separato.
5. Aggiungere popover accessibile al rail Conversations e vista a tutta altezza. Estendere la query Gmail per mittente e finestra mobile di 30 giorni, con account planet-scoped, risultati/thread limitati, paginazione, ricerca e stati di caricamento/errore/vuoto corretti.
6. Aggiungere regressioni mirate, aggiornare questo piano a ogni tappa e validare con test, lint, build e verifica UI possibile.

## Concrete Steps

Dalla radice del repository:

    npm run graph:build
    npm run lint
    npm test
    npm run build

Se `backend/server.js` cambia:

    Set-Location backend
    node --check server.js

Eseguire prima test mirati per stili/migrazione, relazioni grafo-vault, layout, reset Dashboard e query Gmail. Se `npm test` incontra permessi temp del sandbox, ripetere con una directory temporanea autorizzata e riportare entrambe le condizioni. Non usare account reali o dati email privati durante i test.

## Validation and Acceptance

- L'header mostra il marchio FolderRocket e il titolo; i cinque stili Pianeta, Con anelli, Luminoso/stella, Buco nero e Galassia sono distinguibili e i valori legacy vengono normalizzati.
- Il nodo pianeta è presente e raggiungibile; archi cartella, file, email e snapshot sono espliciti, deduplicati e con estremi presenti. Filtri e selezioni producono le stesse relazioni nel grafo interno e nelle note Markdown del vault.
- Tree Rocket usa lo spazio senza vuoti verticali sproporzionati; conserva roots Desktop personali/pubbliche, dedup e stati non accessibili.
- Folder Management mantiene il suo funzionamento ma il riquadro Folders risulta coerente; la Dashboard non mostra reset separato e il secondo clic ripristina solo il layout.
- Conversations mostra il popover via mouse/tastiera/touch e la pagina usa l'area disponibile. La query restituisce solo email ricevute negli ultimi 30 giorni del mittente e dell'account del pianeta attivo; risultati ulteriori sono paginati.
- `npm run lint`, `npm run build` e `node --check server.js` passano. La suite completa riporta 110/113: due test di avvio/bootstrap non ricevono la risposta HTTP benché il backend stampi che è attivo; un test di sicurezza non può creare un symlink (`EPERM`). La suite focalizzata riporta 49/50 per lo stesso test bootstrap.
- Test mirati finali: 15/15 superati; build TypeScript/Vite e lint superati (resta l'avviso Vite per il bundle principale >500 kB); `node --check backend/server.js` e `git diff --check` superati.
- La prova CUA sulla fixture è fallita per `ERR_CONNECTION_TIMED_OUT`; non è stata fatta verifica visiva desktop/mobile, né accesso a Gmail reale o scansione di cartelle Desktop reali.

## Idempotence and Recovery

Le migrazioni devono essere deterministiche e reversibili a livello di configurazione: non eliminare pianeti o preferenze, normalizzare solo il campo style legacy e preservare colore e ID. Non toccare database locali, vault dell'utente, token o email reali. Le modifiche dei writer vanno controllate rispetto al diff iniziale; niente `reset`, checkout o sostituzione wholesale. In caso di test fallito, riprodurre con fixture temporanea e lasciare intatti i dati reali.

## Artifacts and Notes

Graphify aggiornato in `graphify-out/` (cartella ignorata da Git): 2.335 nodi e 4.487 archi. Il run iniziale `npm test` ha dato 96/110; fallimenti dettagliati saranno ricontrollati dopo aver indirizzato `TEMP` a una directory scrivibile del workspace, senza cambiare la configurazione persistente del sistema.

## Interfaces and Dependencies

Riutilizzare lo schema `WorkspaceWorld` e la persistenza esistente in `src/worlds.ts` / backend preferences. Riutilizzare `planetGraphService` per nodi/archi stabili e `obsidianVaultService` per note/link; non aggiungere un'altra fonte di verità. Estendere l'interfaccia Gmail service/router esistente per ricerca sender/date e paginazione, mantenendo i controlli di account del pianeta. Non introdurre dipendenze runtime nuove.

## Revision Notes

- 2026-10-06 08:44Z: creato il piano operativo dopo aver verificato l'allegato, le istruzioni, lo stato dirty e la suite baseline.
- 2026-10-06: implementate le lacune verificabili; aggiunti SVG Obsidian e messaggio esplicativo del grafo/vault; corretto il messaggio vuoto del caricamento per mittente e aggiornate regressioni. Lint/build/sintassi backend e diff-check passano; test mirati 15/15; suite completa 110/113 con due bootstrap timeout e un symlink `EPERM`; verifica visiva bloccata dal browser locale.
