# Refine Tree Rocket header, application catalog, and folder branches

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Rendere Tree Rocket più leggibile e coerente con FolderRocket e Fly To Another Planet: marchio più grande, selettori Folder/Apps accanto al titolo, comandi entro margini condivisi, ricerca vicino ad Add folders, icone applicazione quando Windows le rende disponibili, nessuna barra inferiore che sottragga spazio, zoom globale condiviso e gerarchia cartelle con radice fissa e rami scorrevoli.

## Progress

- [x] (2026-10-01 11:52Z) Ispezionati `CODEX.md`, `PLANS.md`, `docs/GRAPHIFY.md`, il componente Tree Rocket, i servizi di catalogo e lo stato Git; rilevate e preservate modifiche preesistenti non committate.
- [x] (2026-10-01 12:16Z) Aggiornata intestazione e navigazione; rimosso lo zoom locale e la barra inferiore; radice stabile a sinistra e sottocartelle scorrevoli separatamente, con dimensioni uniformi e contatore centrato.
- [x] (2026-10-01 12:16Z) Aggiunte icone da scorciatoie o manifest AppX con fallback; catalogo reale locale verificato con 5 applicazioni e 5 icone estratte.
- [x] (2026-10-01 12:16Z) Superati TypeScript/build, lint, test backend (60/60), regressioni helper (16/16), test Tree Rocket (13/13), parser PowerShell e smoke test del catalogo.

## Surprises & Discoveries

- La lista Apps proviene da `Get-StartApps` tramite `backend/scripts/open-application.ps1`; attualmente gli elementi restituiti includono solo nome e AppID e l’interfaccia assegna la stessa icona generica a ogni app.
- Il titolo, i tab e la ricerca sono oggi raggruppati al centro; il pulsante Add folders è a destra e il footer occupa una riga fissa in fondo.
- Il grafo conserva già scroll progress per cartella, ma applica un proprio zoom iniziale al 90% e il pannello radice/figli scorre come area unica.

## Decision Log

- 2026-10-01: conservare il catalogo sicuro Start Apps e non scandire il disco per inventariare software; estrarre icone dalle scorciatoie Start menu quando è disponibile un eseguibile valido, altrimenti usare un fallback UI.
- 2026-10-01: usare la zoom factor globale della finestra e mantenere soltanto la memoria della posizione di scorrimento per cartella.

## Outcomes & Retrospective

Tree Rocket ora eredita lo zoom globale della finestra e non mantiene un controllo/scala locale. Il marchio Tree/Rocket usa colori distinti su un fondino ad alto contrasto; Folder e Apps sono a destra, Back e Add rispettano la larghezza centrata di Fly To Another Planet e la ricerca si trova accanto ad Add folders. La barra inferiore e il link “Open Applications workspace” sono stati rimossi. Nella navigazione cartelle, la radice resta ferma mentre l’area dei rami scorre indipendentemente; il contatore è centrato e le schede mantengono una larghezza uniforme.

Il catalogo Apps continua a usare il menu Start, senza scansione indiscriminata del disco. Le icone PNG da manifest AppX o scorciatoie sono facoltative: se non vengono recuperate o non si caricano, l’interfaccia mostra l’icona generica. Sul computer di sviluppo lo smoke test reale ha elencato 5 applicazioni e ricavato 5 icone.

Verifica: `npm run lint`, `npm test` (60/60), regressioni helper `node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs` (16/16), test mirato Tree Rocket (13/13), parser PowerShell e `npm run build` superati. Non è stata fatta una verifica visiva interattiva nell’app installata; il catalogo locale è stato provato in sola lettura. Nessun commit, push o installazione.

## Context and Orientation

`src/components/TreeRocket.tsx` crea la schermata full-screen, le schede Folder/Apps e la navigazione. Gli stili applicativi sono in `src/App.css`; il catalogo e l’avvio delle app passano per `backend/server.js` e `backend/scripts/open-application.ps1` tramite `backend/services/windowsTask.js`. I test di regressione Tree Rocket sono in `backend/test/dashboardTreeRocketUi.test.js`. La working copy era già sporca: le modifiche preesistenti in altri file e quelle già presenti in questi file devono rimanere intatte salvo le righe strettamente necessarie.

## Plan of Work

Aggiornare il componente e gli override CSS finali per un header centrato entro margini coerenti con Fly To Another Planet, brand dimensionato come quello principale, titolo Tree/Rocket con colori distinti, selettori a destra del titolo e ricerca a fianco di Add folders. Eliminare lo zoom locale e il footer inferiore; mantenere lo scroll per livello e rendere fisso il nodo principale mentre il solo ramo delle sottocartelle scorre. Rendere coerenti dimensioni dei nodi e badge.

Arricchire il catalogo PowerShell con icone ridimensionate dalle scorciatoie quando recuperabili. Restituire dati opzionali e non bloccanti: ogni elemento senza immagine valida usa l’icona generica React. Migliorare lo stato di caricamento e rendere la griglia Apps l’area scrollabile raggiungibile. Aggiornare regressioni statiche e verificare la sintassi PowerShell oltre ai comandi standard.

## Concrete Steps

Directory di lavoro: radice FolderRocket su Windows.

    npm run lint
    npm test
    node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs
    npm run build

Validare inoltre `backend/scripts/open-application.ps1` con il parser PowerShell e controllare `git status --short` per mantenere integro il lavoro preesistente.

## Validation and Acceptance

Il marchio è grande e leggibile, con “Tree” scuro e “Rocket” blu; Folder/Apps sono accanto al titolo. Back to FolderRocket e Add folders rispettano i margini dell’altra schermata spaziale; ricerca è vicino ad Add folders. Apps mostra icone vere quando disponibili e fallback in caso di errore. Nessun footer fissa una riga e blocca lo scroll. Il nodo radice rimane visibile mentre il solo ramo destro scorre; nodi e badge hanno misure stabili. Zoom e navigazione non cambiano le preferenze globali. I controlli automatizzati passano; la prova con il catalogo reale dipende dalle app e scorciatoie Start menu presenti su questa macchina.

## Idempotence and Recovery

Le modifiche sono additive e non modificano file utente, credenziali, percorsi o preferenze dei pianeti. Un errore nella lettura delle icone deve soltanto far usare il fallback, senza interrompere la risposta del catalogo. Se i test di rendering falliscono, ripristinare la sola modifica UI specifica e mantenere i dati opzionali compatibili con la vecchia risposta.

## Artifacts and Notes

La risposta del catalogo resta retrocompatibile: `iconDataUrl` è opzionale. Nessun dato diagnostico o contenuto del disco viene esportato; l’estrazione si limita alle scorciatoie Start menu.

## Interfaces and Dependencies

`InstalledApplication` aggiunge un campo opzionale `iconDataUrl`. `open-application.ps1` continua a restituire `name` e `appId` e può aggiungere l’icona PNG inline; il frontend non necessita di nuove dipendenze o route.

## Revision Notes

- 2026-10-01: piano creato per la richiesta di rifinitura Tree Rocket; scelta icone opzionali con fallback per non rendere fragile il catalogo.
