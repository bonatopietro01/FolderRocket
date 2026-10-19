# Complete Tree Rocket, graph, email, and dashboard follow-up

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Completare le richieste dell'utente relative alla navigazione Desktop di Tree Rocket, alla visualizzazione delle conversazioni e delle nuove email, alle fonti granulari del grafo/vault, allo stile Asteroid e ai layout delle pagine interessate. I cambiamenti devono rispettare l'isolamento per pianeta e conservare le modifiche e i dati già presenti.

## Progress

- [x] (2026-10-05 00:00Z) Ispezionati stato Git, istruzioni del repository, piani preesistenti e aree già modificate.
- [x] (2026-10-05) Estesa la selezione granulare fonti/cartelle e allineati grafo e vault alla stessa configurazione per pianeta; gli aggiornamenti ignorano le impostazioni di altri pianeti e preservano note manuali.
- [x] (2026-10-05) Aggiunto il badge locale per nuove email, il supporto ai root Desktop Windows autorizzati e lo stile Asteroid.
- [x] (2026-10-05) Secondo controllo puntuale del prompt originale: riparate le lacune nella risoluzione Desktop, cambio conversazione, layout del grafo responsive, filtraggio fonti, persistenza Asteroid e stato del badge email.
- [x] (2026-10-05) Rilanciati build, lint, controlli sintattici e suite pertinenti; la verifica visiva della fixture è stata tentata ma il browser non ha potuto raggiungere il server locale.

## Surprises & Discoveries

- Il worktree contiene già ampie modifiche locali non committate e due ExecPlan precedenti. Tutti i cambiamenti saranno preservati.
- La selezione delle fonti del grafo/vault è al momento per categoria e thread Gmail; manca la selezione per cartella e tipo.
- Le route delle conversazioni non applicano completamente il flag `sourceSelection.email`; il reindex non parte automaticamente dopo il salvataggio della selezione.
- Tree Rocket attualmente autorizza Desktop solo entro la workspace privata. Per la richiesta Desktop occorre aggiungere i soli root Desktop risolti dal sistema Windows, senza allentare gli altri controlli.
- Outlook non offre ancora conversazioni/thread nell'integrazione corrente.
- (2026-10-05, seconda verifica) Il primo riepilogo dichiarava completamento, ma l'ispezione sorgente ha trovato root Desktop inaccessibili filtrati prima di poter riportare `partial`; root collegati Folder Management mescolati nel Browse Desktop; messaggi del thread precedente visibili mentre il nuovo è in caricamento; scrolling esterno del Planet Graph su layout stretti; nodi `search` ricondotti alla categoria di default invece della sorgente corretta; colore/stile pianeta non persistiti/validati sul backend; errori del badge nascosti e provider non supportati rappresentati come zero.
- (2026-10-05, chiusura) Il badge ora è scoped per pianeta, provider e account (senza email/token nel client key); aprire la pagina non azzera la inbox. Solo il thread Gmail locale aperto e caricato viene riconosciuto localmente; una conversazione solo condivisa non azzera il badge del pianeta destinatario. Outlook è dichiarato non supportato invece di simulare zero.
- (2026-10-05, chiusura) Il registro notifiche usa retry brevi e limitati solo per lock temporanei Windows durante la sostituzione atomica; non usa fallback non atomici e non elimina il registro precedente.

## Decision Log

- (2026-10-05) Mantenere gli stati già persistiti e introdurre migrazioni additive/default compatibili per cartelle, tipi e stile Asteroid.
- (2026-10-05) Il grafo e il vault usano la stessa selezione salvata per pianeta; le note manuali o modificate dall'utente non vengono cancellate.
- (2026-10-05) Il badge Conversations si basa su identificativi messaggio e checkpoint locale; non cambia il read-state Gmail.

## Outcomes & Retrospective

- Fonti del grafo/vault versionate v2: cartelle, sottocartelle e tipi di file si selezionano per pianeta; il cambio avvia reindex scoped e il grafo legge la stessa selezione. Il vault non elimina note manuali.
- Desktop Tree Rocket risolve Desktop personale reindirizzato e Desktop pubblico, deduplica percorsi canonici, segnala root non accessibili e mantiene i limiti di profondità/paginazione. La navigazione verso cartelle del Desktop reale non è stata provata in questa sessione.
- Nuovo badge Conversations: osservazione iniziale silenziosa, nuove email deduplicate per utente/pianeta/account/thread, acknowledgment locale solo dopo il caricamento riuscito di una conversazione Gmail del pianeta; nessuna mutazione dello stato letto in Gmail.
- Aggiunti stile Asteroid, ritocchi UI richiesti e test di regressione per i layout e le interazioni.
- Verifiche finali: `npm run build` PASS (TypeScript incluso; warning Vite: bundle principale circa 567 kB supera la soglia informativa 500 kB); `npm run lint` PASS; `node --check server.js` e sul servizio notifiche PASS; test frontend mirati PASS (35/35); test del servizio notifiche PASS (8/8).
- `npm test` in directory temporanea nel repository: 102/105 test PASS. Restano due test d'integrazione che avviano il backend ma non raggiungono `/auth/bootstrap` su loopback nel runner e un test di sicurezza che non può creare un symlink (`EPERM`) in questo ambiente Windows isolato.
- Tentata la fixture UI locale sia su `127.0.0.1` sia su `localhost`: il browser in-app ha restituito `ERR_CONNECTION_TIMED_OUT`, quindi non è stata possibile una prova visuale. Nessun account Gmail reale usato; Desktop personale/pubblico va verificato sul computer dell'utente.

## Context and Orientation

Frontend: `src/App.tsx`, `src/App.css`, `src/worlds.ts`, `src/components/ChangeWorld.tsx`, `TreeRocket.tsx`, `PlanetGraph.tsx`, `EmailConversations.tsx`, `DashboardSourceColumn.tsx`, `FolderManagement.tsx`, `ProcessingWorkspace.tsx`, `ApplicationsWorkspace.tsx`.

Backend: `backend/server.js`, `backend/services/treeRocketService.js`, `obsidianVaultService.js`, `planetGraphService.js`, `gmailService.js`, `emailAlertScheduler.js`. Test seams principali: `backend/test/treeRocketService.test.js`, `obsidianAndWorldSettings.test.js`, `planetGraphAndConversation.test.js`, `worldActivityEmailService.test.js`, `dashboardTreeRocketUi.test.js` e regressioni helper in `tests/`.

## Plan of Work

1. Definire uno schema versionato per cartelle selezionate e tipi file, con default retrocompatibili. Applicare la selezione alle route di lettura, all'indice e all'esportazione vault.
2. Dopo le modifiche alla selezione, aggiornare l'indice del pianeta interessato e ignorare le richieste obsolete; preservare note manuali e riferire i conflitti generati.
3. Aggiungere badge email basato su nuovi ID messaggio e checkpoint per utente/pianeta/account/thread, riusando il polling presente.
4. Autorizzare i root Desktop locali/reindirizzati/OneDrive/pubblici effettivi tramite risoluzione Windows, mantenendo ACL e paginazione.
5. Aggiungere stile Asteroid a modelli, salvataggio, rendering e transizioni.
6. Applicare gli aggiustamenti UI richiesti senza cambiare i comportamenti esistenti.
7. Verificare backend, test mirati, lint e build; provare visivamente i flussi se l'interfaccia è disponibile.

## Concrete Steps

Dalla root:

    npm run build
    npm run lint
    npm test

Per modifiche backend, da `backend/`:

    node --check server.js

Prima delle verifiche controllare `git diff --check` e `git status --short`.

## Validation and Acceptance

- Fonti/cartelle/tipi deselezionati scompaiono dal grafo e dai risultati chat dopo aggiornamento; il vault non elimina note manuali.
- Desktop effettivo espone tutte le cartelle accessibili anche oltre la prima pagina e senza cicli da link.
- Selezionare una conversazione carica un batch limitato; badge non duplica gli stessi messaggi e resta scoped.
- Asteroid è salvabile e distinguibile, mantenendo pianeti esistenti.
- Pagine e controlli restano raggiungibili e coerenti a finestre strette e larghe.
- Build, lint e test pertinenti passano; prove reali non eseguite sono dichiarate.

## Idempotence and Recovery

Aggiornamenti del grafo sono idempotenti e scoped per utente/pianeta. Migrazioni additive non cancellano valori salvati. Non eliminare contenuti del vault né modificare account/email durante i test. In caso di conflitto con note manuali, preservarle e segnalare il conflitto.

## Artifacts and Notes

Usare fixture e dati sintetici. Non registrare credenziali, messaggi email reali o percorsi personali.

## Interfaces and Dependencies

Riutilizzare API locali, schema world corrente, OAuth già configurato, React/TypeScript e moduli CommonJS. Nessuna nuova dipendenza assunta.

## Revision Notes

- (2026-10-05) Creato piano follow-up separato senza modificare i due piani preesistenti.
