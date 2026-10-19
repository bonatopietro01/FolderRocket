# Eseguire e verificare le correzioni FolderRocket dei due prompt

Questo ExecPlan segue `PLANS.md`. È un documento vivo.

## Purpose / Big Picture

Rendere operativi i due prompt allegati, conservando tutte le richieste e correggendo solo difetti confermati nel codice attuale. Il primo prompt usa gli ID A.R1–A.R4, il secondo B.R1–B.R10: questi ID restano stabili per evitare collisioni. L'utente autorizza sia la riscrittura dei prompt sia l'esecuzione. Le cinque immagini correnti sono riferimenti grafici e un esempio di layout errato; non provano lo stato della build attuale.

## Progress

- [x] (2026-10-09) Letti gli allegati, git status e il piano del task precedente; avviati Prompt Agent e Architect in sola lettura.
- [x] Prodotto `docs/prompts/folderrocket-improved-execution-2026-10-09.md`, con cinque pacchetti e tutti gli ID originali.
- [x] Architect ha confermato contratti additivi per diagnostica e MIME; assegnati Frontend, Backend e Conversation.
- [x] Implementate correzioni e asset, preservando modifiche pregresse e ID degli stili.
- [x] Eseguiti build/lint, suite e test mirati; raccolte misure/screenshot sintetici e prima review indipendente.
- [x] Chiusa l'unica re-review DEEP e registrato il lifecycle intermittente: CHANGES_REQUIRED resta per B.R3/B.R10, non per i due finding corretti.

## Surprises & Discoveries

Il worktree contiene numerose modifiche e file non tracciati già presenti. Il task precedente ha cambiato header, pianeti, Tree Rocket e warning, ma non ha potuto misurarli nel browser. Le reference correnti sostituiscono i vecchi percorsi temporanei. Gli agenti di progetto sono effettivamente disponibili nella sessione corrente.

## Decision Log

- 2026-10-09, coordinatore: preservare A/B come namespace degli ID originali. Non riscrivere parti valide senza difetti o gap osservati.
- 2026-10-09, coordinatore: nessuna modifica ai dati personali o OAuth; usare fixture e servizi mock. Nessun riavvio dell'istanza attiva, commit, push o installazione.
- 2026-10-09, coordinatore: un solo writer per file. Prompt Agent produce testo read-only; il coordinatore salva prompt, piano, test e artefatti. Architect definisce contratti; Frontend e Backend implementano nelle proprie aree; Reviewer legge le modifiche finali.

## Outcomes & Retrospective

Prompt migliorati prodotti ed eseguiti. Le correzioni principali riguardano la cascata CSS di Tree Rocket, l'allineamento delle intestazioni Reorder, gli asset condivisi dei pianeti, le cause globali/locali dell'indicizzazione e l'isolamento delle richieste Conversation. Il backend Gmail riconosce anche immagini inline con dati MIME diretti e senza attachmentId. Le prove browser usano esclusivamente fixture sintetiche, senza dati personali o provider live.

Il benchmark Graph confronta il servizio salvato prima delle patch con il servizio attuale: 4000 file in memoria, 40 sottocartelle, warmup e cinque campioni alternati. Mediana 263,32 ms prima / 227,48 ms dopo; entrambi 4000 file, 41 directory, 41 aggiornamenti. La variabilità è alta e non permette una promessa di velocità sul filesystem reale. Non è stata misurata la latenza Conversation prima/dopo: il miglioramento verificato riguarda isolamento, MIME e deduplicazione, non una percentuale di accelerazione.

### TaskState finale per requisito

| ID | Criterio / risultato | Cambi ed evidenze | Stato e limite |
|---|---|---|---|
| A.R1 | Header compatto/blu e logo libero | Audit Frontend: regole page navigation già dedicate; test UI/statici passano | Conservato; geometria Dashboard e zoom 85/90/100 non verificati |
| A.R2 | Saturno/blu/luminoso senza migrare preferenze | ChangeWorld/worlds.css; tre PNG originali con alpha, `planets-wide.jpg`, test style ID | Verificato in card/miniature sintetiche; app Electron non verificata |
| A.R3 | Radice alta e figli con scroll interno | App.css/TreeRocket; `tree-measurements.json`, `tree-20-wide.jpg`, `tree-20-narrow.jpg`, `tree-files-wide.jpg` | 0/1/2/20 a 1280x720, 20 a 650x780; zoom e app reale non verificati |
| A.R4 | Unico pannello warning accessibile con retry | PlanetGraph/layout; `graph-diagnostics.jpg`, test diagnostica | Pannello e dettagli verificati; provider live non verificati |
| B.R1 | Ruoli reali, un owner per file, review | Prompt Agent/Architect read-only, Frontend/Backend/Conversation e Reviewer effettivamente usati | Completato; nessun ruolo legacy ricreato |
| B.R2 | Buco nero/galassia secondo reference | SVG con nucleo nero e archi circolari; galaxy PNG trasparente, gallery screenshot | Verificato nella fixture; ID rocky/asteroid preservati |
| B.R3 | Cause source/global, retry parziale, snapshot/vault | planetGraphService issues[] additivo; 2 nuovi test; snapshot gating e normalizzazione | Cause e last-good data verificati con mock; cause delle sorgenti personali non diagnosticate |
| B.R4 | Navigazione Dashboard leggibile | Come A.R1; CSS scoped esistente e test aggiornato alla griglia corrente | Conservato; prova visiva del Dashboard completo pendente |
| B.R5 | Reorder senza spostare colonne | App.css: track nascosto conservato, stesso grid/gap prima/dopo; `reorder-measurements.json`, wide/narrow screenshot | Finding risolto, confermato dalla re-review DEEP |
| B.R6 | Tree Rocket adattivo e collegamenti coerenti | Rimossi override/connector nth-child concorrenti; SVG dinamico, intestazione opaca, nomi lunghi | Misure sopra; nessun confronto geometrico prima/dopo né zoom reale |
| B.R7 | See files vicino al conteggio e pagina inline | Conteggi distinti/files action; fixture root 3 e figli 205, test backend/frontend | Root aperta verificata; paging esistente verificato nei test, non flusso completo live |
| B.R8 | MIME, contatti leggibili, pagine, stale/dedup | EmailConversations/scope/groups; gmailService/server; 4 helper test, 3 MIME/paging test; `conversation-switched.jpg` | Cambio alpha→beta non mostra corpo alpha; inline manuale testato con mock; latenza/provider live non misurati |
| B.R9 | Account esplicito per pianeta | Architect ha confermato world.emailAccount / selezione backend / DailyJob; test selezione e source guard | Contratto conservato, mock verificati; OAuth reale non verificato |
| B.R10 | Evidenze, test, screenshot e Reviewer | Evidence directory, benchmark e log; build/lint passano, 53/53 mirati | Suite completa 125/126; lifecycle indicizzazione fallisce anche isolato, in analisi; limiti visuali sopra |

### Verifiche riproducibili e review

- `npm run build`: PASS; resta il normale avviso chunk superiore a 500 kB.
- `npm run lint`: PASS.
- Test mirati: `node --test tests/planetGraphLayout.test.mjs tests/emailConversationGroups.test.mjs tests/snapshotSyncGating.test.mjs tests/worldObsidianFrontend.test.mjs tests/treeRocketUiFixture.test.mjs backend/test/dashboardTreeRocketUi.test.js backend/test/gmailConversationPagination.test.js backend/test/gmailInlineParts.test.js backend/test/planetGraphIndexingDiagnostics.test.js backend/test/planetGraphAndConversation.test.js`: 53/53 PASS fuori sandbox. Il primo run sandbox falliva anche per EPERM rename dei file temporanei; non confondere questi errori con regressioni.
- `npm test` fuori sandbox, due run finali: 125/126 PASS. Il lifecycle fallisce anche con deadline 10s: stato `error`, progress processed3/total2, warning interno generico, sorgenti ancora indexing. Un run isolato passa 1/1 in 2,2s e un altro precedente fallisce. Il test ora conserva una deadline 10s e riporta stato/progress/warnings/status sorgenti nell'assert. La deadline breve non è la spiegazione completa; causa interna non identificata, nessun fix produzione applicato alla cieca. Il catch e la persistenza precedono questa sessione. Log completi in `node_modules/.cache/followup-full-final.log` e `followup-lifecycle.log` (ignorati da Git).
- `node --check backend/server.js` e `git diff --check`: PASS (soli avvisi di normalizzazione line ending).
- Prima review DEEP, CHANGES_REQUIRED: intestazioni Reorder slittate e TaskState finale incompleto. Corretti track/padding e questo registro. Unica re-review DEEP conferma entrambi risolti; resta CHANGES_REQUIRED per l'errore intermittente lifecycle B.R3/B.R10. Nessun ulteriore ciclo di fix/re-review, come richiesto dalle istruzioni di progetto. Non dichiarare piena validazione dell'indicizzazione sotto carico della suite.
- Misure Tree wide: radice y211/h142 stabile; area figli y405/h303, quattro colonne da 220px, overflow con 20 figli. Narrow: viewport 650x780, area figli y455,81/h312,19, scrollHeight1527. Le acquisizioni sono a zoom browser 100%.
- Folder Management: sei tracce stabili durante Reorder; il fix conserva il track Delete nascosto, evitando che Name/Path slittino a sinistra. A 650px le intestazioni sono nascoste dal layout responsivo; wide post-fix mostra Name, Path e Description separati.
- Nessun Graphify generato, installazione, commit, push o riavvio dell'app attiva.

## Context and Orientation

`src/components/ChangeWorld.tsx` contiene il rendering Planet condiviso. `src/worlds.css` contiene gli stili dei pianeti. `src/App.css`, `src/App.tsx`, `FolderManagement.tsx` e `TreeRocket.tsx` governano header, righe e layout. `PlanetGraph.tsx`, `backend/services/planetGraphService.js` e `obsidianVaultService.js` governano grafo e vault. `EmailConversations.tsx`, Gmail/Outlook e i servizi di selezione governano i messaggi e gli account. Le fixture sotto `tests/ui/` usano dati inventati.

TaskState iniziale:

| ID | Risultato richiesto | Owner | Stato |
|---|---|---|---|
| A.R1, B.R4 | Pulsanti compatti, leggibili, logo libero a viewport/zoom richiesti | Frontend | Audit |
| A.R2, B.R2 | Saturno, pianeta blu, luminoso, buco nero e galassia fedeli ai riferimenti, senza migrare ID | Frontend + coordinatore asset | Audit |
| A.R3, B.R6 | Tree Rocket radice alta, figli ordinati e scroll interno, collegamenti coerenti | Frontend | Audit |
| B.R7 | See files vicino al conteggio, tabella paginata, eventi indipendenti | Frontend/Backend | Audit |
| A.R4 | Warning grafo unificati, accessibili, retry e dettagli | Frontend | Audit |
| B.R3 | Cause indicizzazione esplicite, dati parziali preservati, snapshot/vault coerenti | Backend/Frontend | Audit Architect |
| B.R5 | Colonne Folder Management stabili durante Reorder | Frontend | Audit |
| B.R8 | Conversation veloce, MIME reale, ricerca contatti, paginazione e stale guards | Backend/Frontend | Audit Architect |
| B.R9 | Account esplicito e isolato per pianeta in Dashboard, Conversation, Daily Jobs | Backend/Frontend | Audit Architect |
| B.R1 | Ruoli correnti reali, ownership chiara, documentazione coerente | Coordinatore | In corso |
| B.R10 | Test, prove visive, misure ripetibili, review e limiti dichiarati | Coordinatore/Reviewer | In corso |

## Plan of Work

Il Prompt Agent propone un contesto comune e pacchetti ordinati con gli ID originali. Architect controlla grafo, Conversation e account prima di assegnare patch. Frontend analizza la cascata CSS e i componenti, corregge difetti circoscritti e integra gli asset preparati dal coordinatore. Backend mantiene contratti esistenti, aggiunge solo correzioni riproducibili. Il coordinatore amplia le fixture solo quando serve, registra misure e controlli, poi consegna i file della sessione al Reviewer.

## Concrete Steps

Dalla root eseguire `npm run build`, `npm run lint`, `npm test`, test mirati e `git diff --check`. Per il server usare `node --check backend/server.js`. La fixture usa un Vite separato senza backend reale. Provare il browser disponibile secondo la sua policy; un blocco di accesso non va aggirato cambiando browser o protocollo.

## Validation and Acceptance

Controllare geometria a due larghezze, zoom 85/90/100%, 0/1/2/20 figli e nomi lunghi, See files aperto/chiuso e Reorder ripetuto. Controllare gli asset a dimensione card e miniatura. Test sintetici devono coprire isolamento account, risultati obsoleti, MIME/paginazione, errore di una sorgente senza perdere le altre e selezioni grafo/vault. Misurare la stessa sorgente grande e caricamento Conversation prima/dopo se il comportamento viene cambiato; dichiarare ogni misura non disponibile. Build e stringhe sorgente non sono prove visuali.

## Idempotence and Recovery

Usare solo dati sintetici e directory temporanee del task. Non ripristinare interi file modificati. Gli eventuali fix della review riguardano solo hunk di questa sessione, con al massimo un ciclo di fix e re-review.

## Artifacts and Notes

Gli allegati originali sono sotto `.codex/attachments/9dc47b81-0ae2-40ef-b2fd-237571b1cd8b/` e `851815dd-b654-486f-b927-376579417c65/` nel profilo utente. Il piano precedente è `docs/plans/ui-header-planets-treerocket-graph-warnings-2026-10-09.md`.

## Interfaces and Dependencies

Mantenere ID stili, colori, satellite AI, paginazione, selezione esplicita account e identificativi sorgente. Nessuna nuova dipendenza prevista. Graphify non rigenerato; confermare relazioni nei sorgenti.

## Revision Notes

- 2026-10-09: piano iniziale e registro dei requisiti prima dell'implementazione.
- 2026-10-09: prompt eseguiti, evidenze sintetiche raccolte, fix mirato Reorder e re-review conclusi; errore lifecycle e verifiche live/zoom mancanti mantenuti espliciti.
