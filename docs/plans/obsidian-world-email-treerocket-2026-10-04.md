# Obsidian vaults, planet email selection, and Tree Rocket origins

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Ogni pianeta potrà mantenere un vault Obsidian locale con note sincronizzate dai dati già collegati a quel pianeta. FolderRocket mostrerà un solo account email selezionato per pianeta, aprirà Conversation dal logo con una breve animazione e permetterà di scegliere le radici Computer/Desktop in Tree Rocket.

## Progress

- [x] (2026-10-04 11:00Z) Letti `AGENTS.md`, `CODEX.md`, `PLANS.md`, package manifests e prompt allegato; controllati `git status` e timestamp del grafo.
- [x] (2026-10-04 11:02:05Z) Analyzer: ricostruite le dipendenze e consegnato TaskState verificato con query Graphify e conferme nei sorgenti.
- [x] Implementare vault per pianeta, sincronizzazione sicura e plugin companion Obsidian.
- [x] Consolidare un account email per pianeta nei blocchi, Conversation e fonti backend compatibili.
- [x] Collegare animazione del logo a Conversation e aggiungere origini Computer/Desktop per Tree Rocket.
- [x] Aggiungere test mirati e completare build, lint e test automatici disponibili.
- [ ] Verificare manualmente il deep link in Electron con Obsidian installato; dipende da un ambiente desktop reale.

## Surprises & Discoveries

- Il grafo interno e la schermata Gmail Conversations sono già presenti nel worktree. `ChangeWorld.tsx` ha già “Enter planet” e “View graph” affiancati; conservare questo comportamento.
- Conversation e le route attuali sono Gmail-centriche. Outlook va incluso solo dove il provider attuale supporta davvero listing thread, detail e reply; non simulare funzionalità mancanti.
- Tree Rocket interroga già `/filesystem/tree-roots`, ma non dispone ancora di una preferenza persistente per Computer/Desktop.
- Il worktree contiene modifiche preesistenti non committate in più file e file non tracciati, inclusi il grafo e le conversazioni implementate nel passaggio precedente. Preservare tutto; un solo Writer per ciascun file sovrapposto.
- Le API ufficiali Obsidian documentano vault come cartelle, API plugin e protocollo URI per aprirli. Non risulta un’API ufficiale per incorporare l’intera app Obsidian nella UI di FolderRocket; la soluzione verificabile è creare un vault Markdown leggibile da Obsidian e un plugin companion eseguito dentro Obsidian.

## Decision Log

- (2026-10-04) Scrivere il vault attraverso i servizi locali FolderRocket e aprirlo con URI `obsidian://`; il plugin companion offre comandi dentro Obsidian. Non assumere un embedding di Obsidian nella finestra FolderRocket.
- (2026-10-04) Il vault e la selezione account sono associati a `worldId`; token OAuth restano nel catalogo account esistente e non vengono copiati nelle note o nelle impostazioni del pianeta.
- (2026-10-04) Non inferire una selezione quando le configurazioni esistenti sono ambigue; mostrare una scelta esplicita.
- (2026-10-04) Aggiungere Desktop/Computer come fonti autorizzate e caricate progressivamente, senza scansione ricorsiva automatica dell’intero computer.

## Outcomes & Retrospective

Implementato:

- Ogni pianeta ha impostazioni indipendenti per un account email attivo, modalità Computer/Desktop e vault Obsidian. Token OAuth restano nel catalogo condiviso. La migrazione seleziona soltanto una sorgente unica e lascia i casi ambigui senza scelta automatica.
- I blocchi Gmail/Outlook usano l'account scelto nelle impostazioni del pianeta; Conversation resta Gmail perché il client Outlook attuale non espone thread reali.
- Il vault protetto viene creato alla prima sincronizzazione manuale, contiene Markdown con metadati, ID stabili e relazioni verificate, conserva le modifiche manuali in caso di conflitto e non legge file/email negli altri pianeti. Il client aggiunge post-it, reminder e metadati di attività locali; il server aggiunge metadati del grafo e fino a 25 conversazioni Gmail recenti. Outlook e allegati non disponibili come file locali vengono segnalati, non simulati o scaricati automaticamente.
- Il plugin companion è isolato in `obsidian-plugin/`, non conserva segreti e richiede l'app desktop per richiedere il sync autenticato. I deep link del plugin possono focalizzare il pianeta indicato e aprire Conversation; la sync resta vincolata al pianeta attivo e abilitato. La UI espone stato, ultimo sync, Sync now e Open in Obsidian. Le impostazioni Obsidian remote sono ricaricate anche all'avvio dell'ambiente.
- Il logo FolderRocket apre Conversation con decollo, guardia contro doppi clic e `prefers-reduced-motion`. View graph resta accanto a Enter planet e non cambia il mondo attivo.
- Tree Rocket salva l'origine per pianeta, risolve il Desktop Windows reindirizzato e invia mondo/modalità anche alla ricerca; la ricerca ora valida e usa il medesimo contratto dell'endpoint delle radici.

Verifiche automatizzate: `npm run build` e `npm run lint` passano; la build segnala il chunk principale da circa 526 KB (>500 KB). `npm test`: 73/73 test backend passati nell'esecuzione isolata. `node --test tests/worldObsidianFrontend.test.mjs tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs`: 17/17 passati. Il test mirato Obsidian frontend è stato ripetuto anche dopo l'ultimo cambio di bootstrap e deep-link. `node --check` passa per backend/server ed i tre file Electron/IPC. `git diff --check` passa con soli avvisi di normalizzazione CRLF/LF. Un'esecuzione parallela di build/lint/backend-test ha esaurito timeout di test già presenti sotto contesa; l'esecuzione isolata successiva è passata.

Limiti: non è stata eseguita una prova visiva/manuale nell'app né una verifica con Obsidian o account OAuth reali. La build del plugin non è verificata: `esbuild` non è presente e l'installazione isolata delle dipendenze non ha prodotto output ed è stata interrotta; non ha lasciato `node_modules` o lockfile. Gmail è limitato ai 25 thread più recenti per sync; le conversazioni Outlook, l'auto-download degli allegati e l'inclusione di file studio raw non sono implementati. Gli allegati già locali si copiano soltanto se un chiamante fornisce percorsi autorizzati.

## Context and Orientation

- `src/worlds.ts`, `src/components/ChangeWorld.tsx`: modello pianeta, personalizzazione e selezione account.
- `src/App.tsx`, `src/App.css`: stato del pianeta attivo, header/logo, navigazione, sorgenti dashboard e passaggio dati a Conversation.
- `src/components/EmailConversations.tsx`, `backend/server.js`, `backend/services/gmailService.js`, `backend/services/outlookService.js`, cataloghi account in `backend/services/`: account e thread per Conversation.
- `src/components/TreeRocket.tsx`, `backend/services/treeRocketService.js`, route filesystem in `backend/server.js`: origini e navigazione cartelle.
- `src/components/PlanetGraph.tsx`, `backend/services/planetGraphService.js`: grafo interno già esistente, da collegare agli ID Markdown generati.
- Plugin Obsidian ufficiali: [Vault](https://docs.obsidian.md/Plugins/Vault), [Build a plugin](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin), [Obsidian URI](https://help.obsidian.md/Extending%2BObsidian/Obsidian%2BURI).
- Il grafo `graphify-out/graph.json` è stato aggiornato il 2026-10-03 23:29 UTC; i sorgenti pertinenti risultano più vecchi. Rinfrescare soltanto se Analyzer rileva modifiche successive o la query non trova relazioni pertinenti.

## Plan of Work

1. Confermare con Analyzer le dipendenze di mondo, account Gmail/Outlook, Conversation, Tree Rocket e file policy; verificare Graphify contro i sorgenti.
2. Implementare servizio locale per vault per utente/pianeta: cartella validata, Markdown deterministico, manifest, sincronizzazione idempotente, rilevazione conflitti e comando Obsidian URI. Esportare dati consentiti e allegati locali disponibili; proteggere le modifiche manuali. Costruire plugin companion in directory autonoma con dipendenze/build documentati e comandi Obsidian limitati.
3. Aggiungere stato/configurazione vault alle impostazioni del pianeta e comandi Sync/Open. Usare l’API desktop per aprire URI esterni; non modificare silenziosamente whitelist/plugin security.
4. Consolidare il riferimento provider/account nel modello di mondo; migrare le vecchie selezioni solo se non ambigue, mostrare conflitti altrimenti. Aggiornare dashboard, Conversation e indicizzazione graph/vault; mantenere i token nei servizi OAuth esistenti. Esaminare Outlook per provare solo le operazioni supportate.
5. Animare il logo e aprire Conversation del pianeta attivo, con reduced motion e navigazione idempotente. Aggiungere configurazione Computer/Desktop per pianeta e dimensionamento coerente delle tessere; riusare risoluzione Desktop di Windows/OneDrive e controlli path correnti.
6. Aggiungere test con provider mock e directory temporanee; eseguire i comandi di validazione richiesti e riportare quali prove richiedono un’installazione reale di Obsidian o account autorizzati.

## Concrete Steps

Dalla root:

    npm run graph:build  # solo se il grafo risulta mancante/obsoleto
    npm run build
    npm run lint
    npm test

Se il server cambia, dalla directory `backend/`:

    node --check server.js

Il plugin companion deve documentare e rendere eseguibili i propri comandi di installazione, compilazione e test senza introdurre dipendenze nel runtime principale dell’app.

## Validation and Acceptance

- Due pianeti hanno vault isolati e selezioni account indipendenti; sync ripetuta non duplica note/allegati.
- Note modificate manualmente non vengono sovrascritte in caso di conflitto.
- Solo l’account selezionato per il pianeta alimenta dashboard, Conversation, grafo e vault; conflitti preesistenti richiedono scelta.
- Il logo è attivabile da mouse/tastiera/touch, apre Conversation una volta e rispetta `prefers-reduced-motion`.
- View graph resta vicino a Enter planet e non cambia il pianeta attivo.
- Computer/Desktop resta per pianeta e rispetta accessi esistenti; l’apertura di una radice non avvia una scansione completa.
- Vault e note usano percorsi/URI codificati e test automatici usano dati sintetici; la compilazione del plugin e l'apertura con Obsidian reale restano non verificate per dipendenze non disponibili.

## Idempotence and Recovery

- Usare ID stabili world/item e manifest; non cancellare vault quando si disabilita sync.
- Le scritture note passano da un manifest e da un confronto hash; in conflitto preservare contenuto utente e copia generata prima del conflitto.
- Le migrazioni non eliminano blocchi account o token. Mantenere i vecchi campi leggibili finché tutte le selezioni ambigue sono state risolte.
- Validare ogni path di vault e radice con gli helper di sicurezza esistenti; non seguire symlink fuori dalle radici approvate.

## Artifacts and Notes

- `docs/plans/obsidian-world-email-treerocket-2026-10-04.md`.
- Output test esclusivamente sintetici e temporanei; nessun messaggio Gmail reale inviato.

## Interfaces and Dependencies

- Modello mondo: `graphEnabled` esistente più configurazione Obsidian e account provider-specific per mondo.
- Servizio backend locale per export/sync vault e stato ultimo sync, autenticato con sessione FolderRocket.
- Companion plugin Obsidian TypeScript con manifest/API ufficiali, build isolata nel suo workspace.
- IPC/preload Electron per apertura esterna URI; fallback browser con messaggio quando protocollo non disponibile.
- API tree roots con risoluzione Desktop di sistema e set di origini esplicite per mondo.

## Revision Notes

- (2026-10-04) Creato dopo la lettura del prompt completo; da finalizzare dopo TaskState Analyzer e risultati delle tappe.
- (2026-10-04) Completati UI/backend/desktop e test; corretta la ricerca Tree Rocket per usare pianeta e origine Computer/Desktop, il deep link di apertura del pianeta, e il caricamento delle impostazioni Obsidian all'avvio. Registrati i limiti di plugin build, Outlook e verifica manuale.
