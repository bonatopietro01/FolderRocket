# Riordina TreeRocket, Dashboard, File Studio e pianeti

Questo ExecPlan segue `PLANS.md`. È l'unico piano per l'esecuzione dell'allegato R1–R14; i piani già presenti restano intatti. Aggiornare avanzamento, scoperte, decisioni ed evidenze durante il lavoro.

## Purpose / Big Picture

Rendere TreeRocket, Dashboard, File Studio e le viste planetarie leggibili e utilizzabili, preservando navigazione, operazioni sui file, account e dati separati per pianeta. L'utente vedrà card TreeRocket senza rami animati, anteprima file ancorata, controlli compatti, menu stabili, pagine allineate, editor Rename ordinato e pianeti coerenti.

## Progress

- [x] (2026-10-13 20:44Z) Letti l'allegato, AGENTS.md, CODEX.md, PLANS.md, le mappe degli agenti/skill e il working tree iniziale, già molto modificato.
- [x] (2026-10-13 20:47Z) Architect ha verificato i contratti read-only. Il conteggio diretto manca nella search response, mentre Gmail resta su un percorso account per pianeta; R5 già usa un overlay floating.
- [x] (2026-10-13 20:47Z) Frontend ha completato l'audit read-only di R1–R14 e ha iniziato i soli interventi UI indipendenti; nessun file modificato nella fase d'audit.
- [x] (2026-10-13 20:48Z) Backend aggiunge directFolderCount opzionale alle cartelle tree-search, con massimo 80 cartelle e letture parallele limitate; fixture backend sintetica passa 17/17 e `node --check` passa.
- [x] (2026-10-13 21:01Z) Frontend ha completato R1–R14; R14 riusa il renderer/stile condiviso già presente e la fixture copre sette stili in dimensioni piccole e grandi.
- [x] (2026-10-13 21:02Z) Il coordinatore ha eseguito `npm run desktop`: Vite completa la build, Electron termina exit 1 senza diagnostic né finestra. Il browser fixture locale è irraggiungibile dalle superfici abilitate e non sono state svolte verifiche visive.
- [x] (2026-10-13 21:10Z) Il Reviewer ha richiesto due correzioni mirate: ripristino dell'intestazione visibile delle colonne Dashboard e gestione del focus quando l'anteprima TreeRocket si chiude per anchor fuori schermo. Frontend le ha corrette; il re-review read-only finale è PASS.
- [x] (2026-10-13 21:10Z) Dopo la correzione: test mirati 21/21, `npm run lint`, `npm run build` e `git diff --check` passano. La build segnala un bundle Vite oltre 500 kB.
- [x] (2026-10-13 21:10Z) La suite backend completa (`node --test --test-reporter=tap` da `backend/`) termina exit 1: 139/167 passano e 27 falliscono. Tra i fallimenti osservati: EPERM su rename Windows, attesa del server scaduta nonostante il log “Backend attivo”, asserzioni TreeRocket legate al markup precedente e test di persistenza. Non è stata dimostrata un'unica causa comune.
- [x] (2026-10-13 21:10Z) `npm run desktop` compila ma termina exit 1 senza aprire una finestra; la UI Electron e il comportamento visivo non sono verificati. Nessun commit o push.

## Surprises & Discoveries

- Il working tree iniziale contiene ampie modifiche non committate in backend, frontend, test, configurazione agenti e documentazione. Ogni modifica deve partire dai file correnti. Non eseguire reset, clean o ripristini globali.
- Il piano `visual-refresh-graph-planets-filestudio-2026-10-13.md` documenta un lavoro precedente su grafo, pagine, pianeti e code File Studio. È contesto storico: verificare ogni criterio nella sorgente corrente senza dichiararlo già risolto per il solo fatto che il piano lo riporti.
- L'ispezione iniziale trova ancora nel sorgente TreeRocket il pulsante testuale “Add to Folder Management” e in File Studio il messaggio “Add blocks to compose the new name” insieme a “Reset template”; ciò prova la presenza di questi elementi, non tutti i difetti visivi segnalati.
- Frontend conferma che TreeRocket già usa un'anteprima in portal fixed, con sequence/abort per risposte tardive, riposizionamento e chiusura Escape/pulsante. Il click esterno non ripristina esplicitamente il focus; i limiti di geometria richiedono controllo visuale.
- Frontend conferma che l'ultima regola CSS della Dashboard rende `.pageMenu` orizzontalmente scrollabile (inclusi i breakpoint stretti), in conflitto con R6. Il picker `+` è inline in uno scroller `overflow-y:auto`; Architect ha verificato il rischio concreto di clipping per R7.
- Backend `tree-children` conta solo directory immediate e limita le letture con `MAX_TREE_FOLDER_COUNTS`; `tree-search` non arricchisce le cartelle. Estendere solo la risposta di ricerca con conteggio opzionale; non modificare il contratto tree-children.
- Il percorso Gmail è account-per-pianeta e l'API usa il blockId selezionato. Non c'è prova di una causa backend; il componente può però rendere “No account selected” prima della fine dell'hydration. Verificare lo stato UI prima di nascondere quel messaggio.
- Frontend trova che R3 ha regole CSS terminali concorrenti (misure per grid e mobile); non dichiarare la dimensione card risolta senza controllare il selettore finale e il risultato.
- Il rendering browser non è stato osservato: `npm run desktop` produce bundle ma esce prima della finestra; la navigazione browser verso la fixture su loopback va in timeout e la richiesta locale PowerShell è negata dalle autorizzazioni socket. Il server Vite temporaneo del tentativo è stato arrestato.
- Frontend implementa il menu AddBlock come portal fuori dallo scroller e ne aggiorna posizione su scroll/resize con Escape, click esterno e focus; la fixture source/UI automatica passa, ma il menu non è stato provato con input reale.
- La prima review finale ha trovato la perdita dei titoli Dashboard e la gestione incompleta del focus dopo auto-chiusura dell'anteprima. Nel solo ciclo di correzione ammesso, Frontend ha ripristinato `{title}` e sposta il focus al tab Folder quando il portal perde il focus sul body; il focus già trasferito altrove resta invariato. Il Reviewer ha confermato entrambe le correzioni in sola lettura.
- La UI Gmail distingue hydration in corso, account assente e errore di caricamento; route e blockId per pianeta restano invariati. La suite focalizzata non usa account reali.
- `graphify-out/` esiste ed è ignorato da Git. Non è stato rigenerato o consultato: le sorgenti e le chiamate interessate sono ispezionabili direttamente e la data/allineamento dell'indice non è stata dimostrata.

## Decision Log

- 2026-10-13: mantenere gli ID del prompt allegato esattamente: R1 rami TreeRocket, R2 pulsante +, R3 card, R4 contatore diretto, R5 anteprima, R6 navigazione Dashboard, R7 menu, R8 altezza contenuti, R9 controlli superiori/Planet Graph, R10 selezione Gmail, R11 titolo sottocartella, R12 icone AddBlock, R13 Rename, R14 stile pianeti.
- 2026-10-13: R4 conta esclusivamente le sottocartelle contenute direttamente. Non includere discendenti.
- 2026-10-13: Frontend è owner unico dei file React/TypeScript/CSS condivisi. Architect e Reviewer sono read-only. Backend viene coinvolto solo se la causa accertata attraversa API, persistenza o Electron.
- 2026-10-13: nessun commit o push; usare solo dati sintetici per fixture e verifiche delle integrazioni.
- 2026-10-13: Architect conferma Backend necessario solo per R4: aggiungere conteggio diretto opzionale e bounded ai risultati tree-search. Frontend resta unico owner di TreeRocket, incluso il rendering.
- 2026-10-13: nessun intervento Backend per Gmail senza riproduzione/prova di una risposta API o risoluzione account errata; la prima ipotesi è la fase di hydration UI.

## Outcomes & Retrospective

- **R1–R5 e R11 — TreeRocket:** rimossi i collegamenti decorativi animati; l'azione Folder Management è un `+` compatto accanto allo stato check; card e spaziature sono state adattate; i contatori indicano soltanto sottocartelle dirette; il titolo delle sottocartelle resta visibile. L'anteprima file è un portal flottante ancorato e gestisce chiusura, risposta tardiva e focus. Prove: fixture TreeRocket, test di perdita dell'anchor/focus, test service TreeRocket 17/17 e suite UI mirata complessiva 21/21. **Limite:** nessuna osservazione visiva con molte card o finestra ridotta.
- **R6–R9 e R12 — Dashboard/Planet Graph:** navigazione senza scroll interno, contenuto rialzato con logo fisso, menu `+` portato fuori dal clipping con titolo della colonna ripristinato, icone uniformate e toolbar superiori organizzate. Prove statiche/UI mirate 21/21, lint e build passano. **Limite:** uso reale con mouse/tastiera, resize e apertura dei menu non osservato nella UI.
- **R10 — Gmail:** la UI distingue hydration, account assente e errore, mantenendo la selezione account per pianeta e senza cambiare API. Prova: test frontend mirati passano. **Limite:** nessun account o mailbox reale usato.
- **R13 — File Studio:** rimosso il suggerimento vuoto “Add blocks to compose the new name”, Delete last affiancato al selettore Rename e Reset template rimosso. Prova: test frontend mirati 21/21.
- **R14 — Pianeti:** riusato il sistema condiviso di stili, con il pianeta ad anelli come riferimento per gli altri stili già disponibili; fixture automatica copre sette stili su superfici compatte e grandi (inclusa nella suite 21/21). **Limite:** resa e animazioni non osservate visivamente.
- **Verifiche complessive:** `npm run lint` PASS; `npm run build` PASS con warning bundle >500 kB; suite mirata 21/21 PASS; `backend` `node --test test/treeRocketService.test.js` 17/17 PASS; suite backend completa 139/167 PASS e 27 failure, exit 1; `git diff --check` exit 0 con soli avvisi di conversione CRLF/LF; `npm run desktop` exit 1 dopo build, nessuna finestra. La review read-only finale è PASS dopo un ciclo mirato. Le prove automatiche non sostituiscono la verifica visiva Electron, qui non riuscita.

## Context and Orientation

Il progetto usa React/TypeScript in `src/`, servizi locali in `backend/` ed Electron in `desktop/`. Punti d'ingresso attesi, da confermare sul sorgente corrente: `src/components/TreeRocket.tsx` e `src/App.css` per TreeRocket; `src/App.tsx`, `src/App.css` e `src/components/DashboardSourceColumn.tsx` per shell e menu Dashboard; `src/components/GmailSourcePanel.tsx` e il provider/account state per Gmail; `src/components/ProcessingWorkspace.tsx` e `src/components/FileDropZone.tsx` per Rename; `src/components/ChangeWorld.tsx`, `src/worlds.css` e gli asset planetari per pianeti; `src/components/PlanetGraph.tsx` per il grafo.

Il checkout è già dirty. La differenza Git dalla HEAD comprende lavoro preesistente e non identifica il delta di questo task; Frontend deve adattarsi ai file in working tree senza sovrascriverli. Test e smoke fixture esistenti possono anch'essi includere modifiche pregresse.

## Plan of Work

1. **Contratti e baseline.** Architect ha tracciato in sola lettura conteggio, anteprima e selezione Gmail; Frontend ha mappato i componenti e i conflitti CSS. Criterio raggiunto: cause staticamente verificate e sintomi da provare distinti, interfacce R4/R5 confermate e un owner per file.
2. **TreeRocket — R1–R5 e R11.** Backend estende solo `SearchFolder` nella risposta tree-search con `directFolderCount` limitato; Frontend rimuove la grafica di collegamento, compatta l'azione, sistema card/titolo, mostra il valore diretto o lo stato non disponibile e conserva la preview flottante con focus/chiusura/risposte tardive. Criterio: zero solo se directory letta e vuota, nessun conteggio ricorsivo o overflow; navigazione e paginazione intatte.
3. **Dashboard e Gmail — R6–R10 e R12.** Frontend rimuove lo scorrimento nav, porta il menu “+” fuori dal clipping, regola disposizione verticale, controlli superiori e icone. Verifica e corregge eventuale messaggio Gmail prematuro durante hydration; coinvolgere Backend solo se il percorso corrente smentisce il contratto confermato. Criterio: interazioni raggiungibili, account corretto e stati di errore veritieri.
4. **File Studio e pianeti — R13–R14.** Frontend ripulisce Rename. R14 usa il renderer/stile condiviso già presente, verificato dal test fixture dei sette stili in dimensioni piccole/grandi; non riscrive asset/styles già validi. Criterio automatico R14 verificato nel sorgente/test; resa visuale resta aperta.
5. **Integrazione, prove e review.** Coordinatore ha eseguito 21 test UI mirati, lint, build, full `npm test` e `npm run desktop`; usa solo fixture sintetiche. Il full test e l'avvio Electron terminano con errori nell'ambiente corrente. Il Reviewer ha completato la review in sola lettura e un solo ciclo mirato di correzione. Criterio: risultati e limiti registrati per tutti gli ID.

## Concrete Steps

Dalla radice di FolderRocket, usare PowerShell:

    node --test <test pertinenti individuati nelle istruzioni e nel sorgente>
    npm run lint
    npm run build
    npm test
    npm run desktop

Individuare prima i test mirati effettivamente presenti; non copiare letteralmente il segnaposto del primo comando. Il comando desktop esegue build e avvio Electron. Se Electron esce prima che la finestra sia disponibile, registrare codice e output come limite runtime; una build riuscita non prova le interazioni.

## Validation and Acceptance

- R1–R5, R11: fixture con molte cartelle, nomi lunghi, conteggi zero/misti e livelli profondi; preview aperta/chiusa, scorrimento, resize e cambio selezione rapido. Verificare contatore limitato ai figli diretti.
- R6–R9, R12: Dashboard e controlli Planet Graph a larghezze/altezza diverse; menu usati con mouse e tastiera; logo stabile; nessun menu tagliato o che si chiude mentre si usa.
- R10: account selezionato, cambio account, nessun account, autenticazione e caricamento simulati. Nessun accesso a account o email reali; non sopprimere errori veri.
- R13: editor Rename vuoto, con blocchi, dopo Delete last e con template iniziali; verificare che “Reset template” e messaggio vuoto non siano mostrati e che le operazioni restanti continuino a funzionare.
- R14: tutte le identità planetarie nelle card/selettore, vista di viaggio e vista attiva; controllare forma, leggibilità, selezione e isolamento del pianeta.
- Risultato coordinator dopo l'ultimo ciclo: `node --test tests/planetStylesAndTreeRocketInteraction.test.mjs tests/worldObsidianFrontend.test.mjs tests/workspaceLayoutAndEmailPagination.test.mjs tests/treeRocketUiFixture.test.mjs` passa 21/21; `npm run lint` passa; `npm run build` passa con warning Vite per bundle oltre 500 kB; la suite backend completa passa 139/167 e fallisce 27 test (exit 1); `npm run desktop` compila e poi esce 1 senza mostrare finestra.
- La UI Electron non è stata osservata. Non inferire la resa visiva dalla sola suite o dal codice; non sono state raccolte misure di prestazione.

## Idempotence and Recovery

Le fixture usano dati sintetici, senza alterare documenti personali, account reali o vault utente. Evitare cancellazioni o ripristini ampi; correggere solo gli hunk assegnati. Preservare semantica copia/move già esistente. Fermare un test d'integrazione se esce dal perimetro sintetico. Nessun commit o push.

## Artifacts and Notes

- Specifica di questa esecuzione: allegato `Testo incollato.txt` fornito dall'utente.
- Registro R1–R14 e prove: TaskState del coordinatore; nessun dump di dati personali.
- Piani già presenti consultabili come contesto ma non riscritti: `docs/plans/visual-refresh-graph-planets-filestudio-2026-10-13.md` e `docs/plans/folderrocket-frontend-layout-2026-10-13.md`.

## Interfaces and Dependencies

Prima di modificare, verificare la fonte autorevole del conteggio diretto nella risposta di TreeRocket e come UI risolve l'account selezionato per il pianeta. Mantenere invariati gli ID dei pianeti e gli scope world/account. L'anteprima usa l'attuale caricamento/lista/paginazione. Rename mantiene semantica e validazioni esistenti. Non introdurre nuove dipendenze o API senza prova di necessità e decisione del coordinatore.

## Revision Notes

- 2026-10-13: creato il piano operativo per il prompt allegato R1–R14; censito il working tree preesistente e fissati scope, ownership e prove.
