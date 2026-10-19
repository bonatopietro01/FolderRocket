# Rifinitura Dashboard, pianeti, Planet Graph, Folder Management e Tree Rocket

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Completare gli otto punti richiesti senza alterare dati, account o scope dei pianeti: rendere più chiara la navigazione Dashboard, uniformare i controlli delle schermate spaziali, correggere gli stili planetari, preservare le righe in modalità reorder e mostrare in Tree Rocket Folder soltanto cartelle/sottocartelle. Verificare inoltre che il grafo del pianeta e il vault Obsidian usino le stesse fonti filtrate e relazioni esplicite.

## Progress

- [x] (2026-10-07 09:00Z) Ispezionati istruzioni, stato git, sorgenti e piani esistenti; confermate lacune UI per R1–R4, R6–R8.
- [x] (2026-10-07 09:00Z) Analizzata la pipeline Planet Graph/vault in sorgente e test; nessuna relazione mancante è stata dimostrata finora.
- [x] (2026-10-07 09:00Z) Applicate le correzioni confermate a nav Dashboard, logo Change World, stile Black hole/Galaxy, Back Planet Graph, guida grafo, righe reorder e vista cartelle Tree Rocket; aggiunti test mirati.
- [x] (2026-10-07 09:00Z) `npm run graph:build`, due query Graphify, `npm run lint`, `npm run build`, test mirato UI (15/15) e suite backend (111/114) eseguiti.
- [ ] (2026-10-07 09:00Z) Verifica visuale manuale su browser/Electron: non effettuata in questa sessione.

## Surprises & Discoveries

- `TreeRocket.tsx` carica file nel modello della cartella per i conteggi e per il pannello esplicito Show Files, ma li renderizza anche come tessere nel grafo; la presentazione può essere corretta senza togliere file dall’indicizzazione Planet Graph/vault.
- Le regole CSS planetarie più recenti definiscono ancora box-shadow e pseudo-anello per `black-hole`, oltre a un fondo ovale scuro per `galaxy`.
- Le righe Folder Management cambiano template CSS quando `orderingFolder` è attivo, spiegando la variazione dimensionale.
- Il modello Graph/Vault usa filtri di fonte e `filterGraphBySources`; archi con endpoint assente vengono rimossi intenzionalmente. La verifica ulteriore confronterà selezione cartelle/tipi e serializzazione Markdown.

## Decision Log

- (2026-10-07) Conservare tutte le modifiche già presenti nel worktree; nessun reset o sostituzione wholesale.
- (2026-10-07) Non aggiungere archi semanticamente inferiti: cambiare il grafo soltanto con evidenza riproducibile.
- (2026-10-07) Tenere i file nell’indice e nel pannello Show Files esplicito di Tree Rocket; rimuovere soltanto le tessere file dalla vista Folder.
- (2026-10-07) R1: ritinta solo la nav pagina con gradiente azzurro; azioni e reset Dashboard invariati.
- (2026-10-07) R2: aumentato il box dell’asset originale `folderrocket-mark.png` a 390×93 desktop e 285×84 alle finestre strette, in linea col box del logo Dashboard.
- (2026-10-07) R3: Black hole mantiene il centro scuro e non disegna più un anello/alone esterno; Galaxy usa bracci colorati a spirale con maschera radiale trasparente, senza fondale ovale nero. Satellite e reduced-motion restano nelle regole esistenti.
- (2026-10-07) R4: Planet Graph riusa la classe `.worldBackButton` oltre a quella di layout `.planetGraphBack`.
- (2026-10-07) R6: la guida espansa usa titolo/testo in due colonne e passa a una colonna sotto 700px; il contenuto resta invariato.
- (2026-10-07) R7: riordinamento conserva gli slot; Style e handle restano disponibili, Insert ritorna fuori dalla modalità.
- (2026-10-07) R8: rimosse le tessere-file dal canvas Tree Rocket; Show Files e conteggi/metadati lato API restano attivi.

## Outcomes & Retrospective

L’implementazione è completa per le lacune confermate. Per R5 non è stata necessaria una patch: l’API filtra il grafo per pianeta/fonti/cartelle/tipi/thread prima di passarlo a `graphRecords`; PlanetGraph riceve il grafo filtrato. `filterGraphBySources` elimina archi con endpoint filtrati; `graphRecords` crea note per i nodi e note-relazione con WikiLinks derivati dagli stessi nomi Markdown stabili. I test esistenti confermano filtraggio grafico/vault per categorie e thread e selezione dell’account Gmail per pianeta. Nessun difetto riproducibile di collegamenti è emerso; relazioni non provate non vengono create. Restano non verificati visivamente i layout su finestre reali e i dati specifici dei vault utente.

## Context and Orientation

Il progetto è React/TypeScript/Vite, backend Node/Express e Electron. File rilevanti: `src/App.tsx`, `src/App.css`, `src/worlds.css`, `src/components/ChangeWorld.tsx`, `src/components/PlanetGraph.tsx`, `src/components/FolderManagement.tsx`, `src/components/TreeRocket.tsx`, `backend/services/planetGraphService.js` e `backend/services/obsidianVaultService.js`. L’indice Graphify è consultivo e va confermato nei sorgenti.

## Plan of Work

1. Verificare grafico/vault: selezione fonti e cartelle, filtri tipi/annidamento, endpoint degli archi, serializzazione Markdown e test. Correggere eventuali difetti soltanto se riproducibili.
2. Uniformare i cinque pulsanti nav della Dashboard con le azioni azzurre delle Sources; allineare dimensione visiva del logo in Fly To Another Planet a quello Dashboard.
3. Eliminare alone/aura non richiesti dal buco nero e disco scuro circostante alla galassia, mantenendo forma riconoscibile, colore selezionato, satellite e preferenze di movimento ridotto.
4. Riutilizzare lo stile del pulsante `worldBackButton` per Planet Graph senza cambiare azione.
5. Rendere la guida relazionale del grafo una riga compatta che si adatti allo spazio e si avvolga su viewport stretti.
6. Mantenere identiche le colonne della tabella durante reorder; sostituire nel controllo Path/Insert Path l’azione principale con Style e rendere disponibile il drag handle; fuori dal reorder ripristinare Insert Path.
7. In Tree Rocket Folder renderizzare esclusivamente nodi cartella; lasciare conteggi e file index invariati, preservare Show Files come azione separata e migliorare posizionamento della root e dei figli senza scroll orizzontale.
8. Aggiungere/aggiornare test pertinenti e validare build, lint e test documentati.

## Concrete Steps

Dalla radice, `npm run graph:build` ha aggiornato il grafo stale; sono state eseguite due query mirate su filtro grafo/vault e Tree Rocket folder/files, confermate nel sorgente/test. Validazioni: `npm run lint`, `npm run build`, `npm test`, `node --test backend/test/dashboardTreeRocketUi.test.js`. La build include TypeScript.

## Validation and Acceptance

- R1–R4: sorgenti JSX/CSS mostrano controlli accessibili, proporzioni coerenti e nessuna azione duplicata; regressione UI mirata 15/15.
- R5: filtri, nodi/archi e note Markdown descrivono gli stessi record selezionati; tutti gli archi hanno endpoint presenti; nessuna relazione non provata viene inventata.
- R6: testo leggibile in riga orizzontale su ampio viewport e disposto senza overflow su stretto.
- R7: ordine attivo mantiene gli slot delle colonne; Style e handle restano presenti e Insert ritorna fuori dalla modalità; verifica visiva non eseguita.
- R3 follow-up: il pseudo-elemento esterno del buco nero non genera più alcun anello; la galassia usa gradienti conici mascherati per simulare bracci a spirale. Lint e build rieseguiti dopo la correzione; resa visiva non verificata in browser.
- R8: nessuna tessera-file nella vista Folder; Show Files continua a caricare file e indice backend invariato.
- `npm run lint`: PASS. `npm run build`: PASS (TypeScript + Vite; warning bundle principale >500 kB). Test UI: 15/15 PASS. `npm test`: 111/114; falliti due test di avvio/bootstrap backend non raggiunto dopo log di listening e un test che richiede symlink bloccato da `EPERM`. Verifica visuale a viewport largo/stretto: non eseguita.

## Idempotence and Recovery

Le modifiche sono presentazionali, salvo i test. Conservare dati, configurazioni per pianeta e tutti i file già dirty. Se una prova UI non è disponibile, non simulare una verifica manuale; riportare il limite. Nessuna commit/push.

## Artifacts and Notes

Gli esiti dei controlli saranno aggiunti qui e nel checkpoint con gli ID R1–R8. Nessun dato utente reale sarà letto per test.

## Interfaces and Dependencies

Non sono previste nuove dipendenze o endpoint. Si riutilizzano i componenti `Planet`, `TreeRocketFolderNode`, il layout nav e il service Graph/Vault esistente.

## Revision Notes

- 2026-10-07: creato dopo l’analisi di Analyzer e l’ispezione del sorgente dirty corrente.
- 2026-10-07: aggiornato dopo le patch e le verifiche; tre limiti ambientali della suite completa restano aperti (due bootstrap timeout e symlink `EPERM`).
