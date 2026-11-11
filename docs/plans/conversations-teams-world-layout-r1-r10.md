# Complete R1–R10 planet, Teams and layout changes

Questo ExecPlan segue `PLANS.md`. È un documento vivo. Il lavoro coordina modifiche UI, backend, Electron e OAuth, poi verifica i flussi nell’app Electron con dati sintetici.

## Purpose / Big Picture

Rendere coerenti i comandi Planet/Wiki, correggere il salvataggio del nome, migliorare la configurazione servizi e portare documenti Teams, chat e canali nei flussi FolderRocket richiesti. Rifinire i layout Dashboard, Conversations e TreeRocket, e modificare il comando di minimizzazione CargoRocket.

## Progress

- [x] (2026-11-10) Leggere istruzioni e skill catalog, verificare worktree pulito su `main` al commit `da9b6fb`.
- [x] (2026-11-10) Architect definisce i contratti Teams/OAuth, stato wiki, selezione cartelle, ownership e dipendenze.
- [ ] (2026-11-10) Frontend e Backend implementano i pacchetti concordati mantenendo R1–R10.
- [ ] (2026-11-10) Eseguire test mirati, lint, build, controlli server ed Electron sintetico.
- [ ] (2026-11-10) Reviewer esegue review finale read-only. Risolvere al massimo un ciclo di rilievi mirati.

## Requirement Traceability

| ID | Criterio osservabile | Owner | Evidenza / stato |
|---|---|---|---|
| R1 | Schede Planet hanno Apri wiki e Enter Planet affiancati; stati derivano da wiki completa, senza azioni automatiche. | Frontend | READY |
| R2 | Riprodurre il 404, identificare la route effettiva e correggere solo la causa dimostrata; nome/ID e altre impostazioni persistono. | Frontend (sequenza save); Backend (test/regressione) | DIAGNOSED: route `PUT /worlds/:id/obsidian` precede la creazione settings |
| R3 | Services guida alla configurazione dei provider supportati, mostra callback/permessi reali e preserva segreti locali. | Backend owner config; Frontend owner UI, contratto prima delle modifiche | READY |
| R4 | Teams mostra solo file per periodo e mittente, alert AI/sender opt-in e copia locale nella cartella, paginazione senza duplicati. La UI seleziona prima una chat o un canale; l'API legge una pagina Graph limitata e non enumera tutto il tenant. | Backend API/Graph + Frontend Teams UI | CONTRATTO DEFINITO; alert per-world/account e scheduler in implementazione |
| R5 | Conversations seleziona provider/account e mostra Gmail, Outlook, chat Teams e canali Teams con stato scoped al pianeta. | Backend provider routes + Frontend | CONTRATTO DEFINITO: `world.conversations.accounts` separa Conversations dall'account Dashboard |
| R6 | Conversations non mostra Planet Graph e header presenta titolo, pianeta e selettore provider senza sovrapposizioni. | Frontend | READY |
| R7 | Folder Management offre scelta cartella Electron con annullamento sicuro, preservando inserimento manuale e validazione. | Backend/Electron preload + Frontend | READY; contratto IPC Architect |
| R8 | Una sola scrollbar condivisa scorre le due colonne di blocchi, mantenendo accessibili intestazioni e contenuti. | Frontend | READY |
| R9 | Tab Folder e Apps, indicatore attivo e refresh restano dentro una riga allineata. | Frontend | READY |
| R10 | Il pulsante `_` minimizza alla bolla riapribile, l'occhio sparisce, la X resta close. | Frontend | READY |

## Surprises & Discoveries

- La baseline iniziale è pulita, branch `main`, commit `da9b6fb`.
- La route effettiva del 404 è `PUT /worlds/:id/obsidian` da `ChangeWorld.saveWorld`; precede `PUT /settings/worlds/:id` inviata da `onUpdate`. `readWorldRecord` riconosce i pianeti predefiniti implicitamente, ma per un ID custom senza record iniziale restituisce `null`; quindi la prima route rifiuta la modifica prima della creazione delle settings. Fix assegnato al Frontend: salvare prima le settings, attendere l'esito, poi salvare la configurazione Obsidian e mostrare chiaramente un eventuale errore parziale.
- `IntegrationSetup` e `desktopIntegrationConfigService` sono già usati per configurazione servizi. Il pannello dichiara permessi amministrativi locali.
- Le API Teams esistenti elencano chat, gruppi, canali e messaggi, ma il blocco Dashboard deve essere circoscritto ai file.

## Decision Log

- R4 importa una copia locale dei file Teams e non elimina l’originale remoto, come richiesto dal prompt.
- Gli alert AI per file/persone restano opt-in e riusano le preferenze esistenti.
- L'utente ha autorizzato l'aggiunta dello scope Graph `Files.ReadWrite` per risolvere link di condivisione e copiare localmente i file Teams; il flusso non deve modificare i file remoti. La UI spiega che il consenso Microsoft, eventualmente amministrativo, può essere richiesto.
- R4 Alerts restano risultati locali: regole AI e sender sono salvate per world e account Outlook; ogni regola conserva la chat/canale sorgente e viene eseguita solo se attiva e pianificata. Nessuna notifica email, scansione automatica dei contenuti dei file o download allegati nell'evaluator.
- R5 aggiunge una selezione provider/account separata in `world.conversations.accounts`; l'account `world.emailAccount` resta quello dei blocchi Dashboard. Il mapping è validato lato backend contro il catalogo collegato dell'utente per ogni pianeta/provider.
- Account reali, credenziali e operazioni sui portali Microsoft/Google non fanno parte della verifica. Electron userà dati sintetici e le chiamate di rete ai provider saranno isolate.
- Teams usa OAuth Microsoft Graph con i permessi minimi verificati in documentazione Microsoft aggiornata; niente API key Teams inventata.

## Context and Orientation

Punti di partenza verificati: `src/components/ChangeWorld.tsx`, `src/components/EmailConversations.tsx`, `src/components/TeamsSourcePanel.tsx`, `src/components/IntegrationSetup.tsx`, `src/components/FolderManagement.tsx`, `src/components/TreeRocket.tsx`, `src/components/CargoShip.tsx`, `src/components/DashboardSourceColumn.tsx`, `src/App.tsx`, `src/App.css`, `backend/server.js`, `backend/services/outlookService.js`, `backend/services/desktopIntegrationConfigService.js`, `desktop/main.cjs` e `desktop/preload.cjs`.

`ChangeWorld` richiede `/worlds/:worldId/graph?summary=1`; la wiki ha indice API e readiness propri. `EmailConversations` è Gmail-centric e include Add chat, Share e Remove from planet. `TeamsSourcePanel` interroga chat/canali/messaggi. `IntegrationSetup` salva configurazione condivisa tramite API admin. `CargoShip` associa Minus a `compactShip` e EyeOff a `minimizeShip`.

## Plan of Work

1. Architect traccia i contratti provider, scope pianeta/account, Graph, destinazioni locali, picker Electron e ownership. Contratto completato; fonti Microsoft verificate e Files.ReadWrite autorizzato dall'utente.
2. Frontend implementa R1–R10 UI, compreso ordine corretto di `saveWorld`, layout condiviso, Services, file Teams, Conversations multi-provider e picker. Include stati vuoto, caricamento, consenso, token scaduto, rete assente e paginazione.
3. Backend implementa contratti e regressioni per R2–R5 e R7, isolamento di account/provider/pianeta, riferimenti Teams verificati e import locale sicuro.
4. Coordinatore esegue verifiche pertinenti, lint, build, suite backend e prova Electron con dati sintetici. Nessun token di provider reale.
5. Reviewer esamina in sola lettura modifiche, R1–R10 e prove.

## Concrete Steps

Dalla radice del progetto, dopo l’implementazione eseguire i test pertinenti, `npm run lint`, `npm run build`, `npm test` e `node --check backend/server.js` se cambia il server. Per Electron usare `npm run desktop` solo dopo build e test. Non riutilizzare `backend/data`, vault Obsidian o mailbox reali nella prova.

## Validation and Acceptance

Usare test sintetici per pianeti distinti, wiki pronta/assente/errore, salvataggio e 404, provider/account distinti, chat, canali, messaggi con/senza file, mittenti, paginazione, consenso negato, file locale e copia, picker annullato, scroll condiviso e CargoRocket integrata/standalone. Verificare visivamente le dieci aree Electron a viewport desktop e stretto. Registrare separatamente prova sintetica e provider non verificato.

## Idempotence and Recovery

Le richieste di lettura Teams sono idempotenti. Le importazioni ripetute devono riconoscere il file già copiato senza alterare la copia remota. Un cambio account, pianeta o filtro invalida il cursore e le richieste client precedenti. Il picker annullato non salva. Gli aggiornamenti ai nomi mantengono ID stabili e non rinominano automaticamente vault o percorsi esistenti.

## Artifacts and Notes

Annotare output sintetici dei test, permessi Graph documentati, hash o manifest dei dati fixture se già supportati. Non salvare token, messaggi reali o documenti personali.

## Interfaces and Dependencies

Architect ha definito i contratti: chiave account `(userId, worldId, provider, blockId)`; `blockId` esplicito nelle richieste e reset dei dati UI al cambio chiave; file Teams tipizzati e importabili soltanto dopo verifica Graph; download autorizzato dal backend e copia locale; picker `folderrocket:select-folder` con `{ canceled, path? }` e dialog `openDirectory` limitato al mittente autorizzato. Il backend ha definito `GET /teams/files`, che richiede il pianeta, l'account Outlook assegnato e una chat/canale scelto, supporta periodo, mittente e cursore, e restituisce file verificati da una singola pagina Graph. Nessuna enumerazione globale nascosta. Gli alert AI/sender sono per world e account, con scope chat/canale per regola e risultati locali senza invio email; la route manuale controlla soltanto regole salvate e abilitate. Il consenso utente a `Files.ReadWrite` è registrato sopra.

## Revision Notes

- 2026-11-10: Piano iniziale per l’esecuzione completa di R1–R10. Baseline verificata pulita su `main` a `da9b6fb`.
- 2026-11-10: Contratti Architect completati, diagnosi R2 conclusa, Files.ReadWrite autorizzato, ownership Frontend estesa a R2–R10 UI.
