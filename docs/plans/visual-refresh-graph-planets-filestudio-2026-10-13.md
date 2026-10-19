# Rinnova grafo, pianeti e layout FolderRocket

Questo ExecPlan segue `PLANS.md`. È l’unico piano operativo per questa richiesta e conserva gli ID R1–R7 fino alla review.

## Purpose / Big Picture

Il Planet Graph deve rimanere leggibile e rispondere bene a pan, zoom e trascinamento; la navigazione Dashboard deve apparire ordinata; i sette stili planetari devono rappresentare con chiarezza il proprio tipo; le code File Studio devono mostrare i file e usare spazio proporzionato al contenuto; le pagine devono iniziare più in alto mentre il logo resta ancorato alla posizione attuale.

## Progress

- [x] (2026-10-13 14:12Z) Letti il prompt allegato, le istruzioni del repository, `PLANS.md`, il workflow agenti e le skill requirement-traceability e codebase-design; registrato il working tree iniziale, già ampiamente modificato.
- [x] (2026-10-13 14:12Z) Completato il checkpoint read-only Architect su renderer, scope Planet, identità degli stili, code File Studio e shell condivisa.
- [x] (2026-10-13 14:13Z) Registrata la misura baseline del solo helper `positionPlanetGraphNodes` con Node v24.18.1 e grafo misto sintetico. La prova non misura React, SVG o il frame visibile.
- [x] (2026-10-13 14:14Z) Completato l’audit mirato e accettati i contratti Architect. Il Frontend è owner unico dei file React/CSS condivisi; il coordinatore mantiene test e verifiche.
- [x] (2026-10-13) Implementati R1–R6 dal Frontend: gesture del grafo coalesced con frame, trasformazioni corrette attorno al centro/puntatore, navigazione adattiva, renderer CSS condiviso dei sette stili, code File Studio dimensionate sul contenuto e offset della pagina con logo fermo.
- [x] (2026-10-13) Aggiunti/aggiornati fixture e test mirati; ripetuta la misura del solo helper. La ricetta esatta e la distribuzione per tipo del baseline non erano registrate, quindi i risultati non sono presentati come confronto rigorosamente identico.
- [x] (2026-10-13) Eseguiti lint, build e test mirati; eseguito `npm test` completo e `npm run desktop`; raccolti i limiti di ambiente. Review read-only eseguita; le note stale sul lint sono state controllate contro l’ultima esecuzione (exit 0), mentre benchmark UI e avvio Electron restano limiti espliciti.

## Surprises & Discoveries

- Il working tree contiene modifiche precedenti in `App.tsx`, `App.css`, `PlanetGraph.tsx`, `ChangeWorld.tsx`, `ProcessingWorkspace.tsx`, `ChangeFormatPanel.tsx`, `worlds.css`, `worlds.ts` e molte aree backend/test/documentazione. Non usare reset, clean o restore globale; ogni patch deve essere valutata sul contenuto attuale.
- Planet Graph usa SVG, massimo 1.200 nodi visibili, massimo 900 edge, 100 nodi iniziali e un helper di layout radiale. Il pan aggiorna React state a ogni pointer move; lo zoom usa delta fisso. La misura baseline del puro helper è p50/p95: 100 nodi + 200 edge virtuali, 0,072/0,691 ms; 500 + 900, 0,202/0,484 ms; 1.200 + 900, 0,514/1,264 ms, 11 run misurate dopo 3 warm-up, stesso processo Node. I numeri non descrivono il rendering visibile né la latenza dei gesti.
- Il grafo legge i nodi/edge del pianeta attivo da `/worlds/:id/knowledge`; il grafo di stato e diagnostica è un endpoint distinto. Conservare l’identità per world e il contratto già attivo.
- `Planet` è un renderer condiviso per selettore, editor, header, overlay di viaggio e Conversations. Gli ID persistiti sono `planet`, `rocky`, `ringed`, `glowing`, `asteroid`, `black-hole`, `galaxy`; `glowing` è etichettato “Star”. Conservare colori configurati, selezione e satellite AI.
- File Studio tiene le code Local conversion e Change format nello stato di `ProcessingWorkspace`; la seconda lista le sorgenti/destinazioni in `ChangeFormatPanel`. Entrambe sono UI-only per questa richiesta; le operazioni esistenti creano copie.
- Logo è posizionato assolutamente in `.appHeader`, mentre contenuti seguono nel DOM. `App.css` ha override responsive stratificati per header e varie pagine: spostare solo il contenuto verificando il risultato per pagina, senza spostare il logo.

## Decision Log

- 2026-10-13: “Grafo come Obsidian” indica Planet Graph; il filtro file per tipo in ProcessingWorkspace è distinto dal pannello Change format.
- 2026-10-13: Un solo Frontend owner gestisce i file React/CSS condivisi, incluso `App.css`; il coordinatore possiede piano, fixture/test e verifiche. Architect e Reviewer sono read-only.
- 2026-10-13: Il benchmark prima/dopo deve chiamare lo stesso helper, usare dataset e runtime identici, ripetere run calde e riportare distribuzione p50/p95. La prestazione del grafo visibile va valutata separatamente e non dedotta dall’helper.
- 2026-10-13: Nessuna modifica backend/Electron finché una causa dimostrata non attraversa i relativi confini.

## Outcomes & Retrospective

- **R1 — parziale, implementazione completata:** Planet Graph usa un singolo SVG trasformato; pan e zoom sono coalesced, lo zoom resta centrato sul puntatore e il drag converte le coordinate includendo il pivot centrale. I test mirati verificano questi contratti. Il benchmark post-change dell’helper, Node v24.18.1, 3 warm-up e 11 misure: 100 nodi/200 edge metadata p50/p95 0,078/0,720 ms; 500/900 0,449/0,919 ms; 1.200/900 1,003/1,514 ms. Edge count è metadato, poiché `positionPlanetGraphNodes` non legge edge. La distribuzione esatta del baseline non era conservata e questi numeri non dimostrano un miglioramento prima/dopo. Rendering/gesti con 1.200 nodi non sono stati osservati perché Electron non resta avviato.
- **R2 — sorgente/test:** la navigazione Dashboard usa una barra coerente con spazio distribuito e stati attivi; i test statici verificano destinations/aria e i breakpoint previsti. Nessun controllo tastiera/viewport dal vivo è stato possibile.
- **R3 — sorgente/test:** i sette ID salvati restano invariati e il componente condiviso disegna le forme con CSS; test e fixture coprono tutti gli ID nelle varianti compatte e grandi. La resa visiva reale resta non verificata.
- **R4–R5 — sorgente/test:** Local conversion e Change format mantengono le code e le operazioni esistenti; card/queue sono compatte da vuote e crescono quando hanno file. Test automatici mirati passano; non sono stati osservati file caricati nell’app Electron.
- **R6 — sorgente/test:** il contenitore delle pagine è spostato verso l’alto di 8 px e il logo resta ancorato nell’header; il controllo è statico, senza misurazione visiva/geometrica nel runtime.
- **R7 — verifiche miste:** i test mirati passano 23/23; `npm run lint`, `npm run build` e `git diff --check` passano. `npm test` completo termina 138/166 pass, 27 fail: il runner incontra errori EPERM sulle rinomine/symlink in `%TEMP%`, timeout nell’avvio backend e due asserzioni statiche Tree Rocket non allineate alla sorgente già modificata nel working tree. `npm run desktop` completa la build ma Electron termina con exit 1; `npm exec -- electron --version` termina con `-2147483645`, senza finestra. Il browser di fixture non ha fornito una pagina visibile. La review finale read-only non ha trovato difetti concreti nel controllo mirato, ma resta bloccata dal requisito di evidenza runtime; il finding lint iniziale era basato su uno stato precedente, mentre l’ultima esecuzione completa dopo la correzione Frontend è exit 0. Nessun commit o push.

## Context and Orientation

`src/components/PlanetGraph.tsx` rende il Planet Graph e gestisce pan, zoom, nodi e filtri. `src/components/planetGraphLayout.ts` normalizza il payload e assegna coordinate. `src/App.tsx` ospita navigazione Dashboard, header e selezione pagina. `src/components/ChangeWorld.tsx` definisce il renderer condiviso `Planet`; `src/worlds.ts` contiene gli ID persistiti; `src/worlds.css` e `src/App.css` stilizzano i pianeti. `src/components/ProcessingWorkspace.tsx` gestisce File Studio e le code; `src/components/ChangeFormatPanel.tsx` mostra i file del pannello Change format. `tests/planetGraphLayout.test.mjs` copre il layout puro; gli altri test pertinenti si scelgono verificando il contenuto attuale.

Il baseline registrato è un microbenchmark CPU dell’helper con 100, 500 e 1.200 nodi sintetici misti. La dimensione edge è un metadato dello scenario, poiché il helper dispone nodi e non legge relazioni. Per misurare pan/zoom, re-render e resa grafica serve una prova UI separata.

## Plan of Work

1. Il coordinatore confronta i requisiti con la sorgente corrente, completa l’inventario mirato e allinea il Frontend alle raccomandazioni Architect. Il criterio è un set preciso di file e comportamenti con un solo owner per file condiviso.
2. Per R1 il Frontend interviene sul helper/rendering solo dove il baseline e l’ispezione confermano un collo di bottiglia. Pan, zoom, selezione e trascinamento devono funzionare insieme senza conflitti. La posizione di nodi, cap, edge, filtri e citation scope restano coerenti. Criterio: nessun nodo perso e latenza/eventi misurati sullo stesso scenario prima/dopo.
3. Per R2–R3 il Frontend riorganizza nav e stati attivi mantenendo destinations e accessibilità, poi ricrea nel renderer condiviso i sette stili planetari in base al loro significato, preservando colori, identità e satellite AI. Criterio: stessi ID e interazioni, stili distinguibili sia compatti sia grandi.
4. Per R4–R5 il Frontend riproduce il problema delle code, corregge il contenimento dei nomi/azioni e lega lo spazio di ciascuna card al proprio numero di file. Criterio: card vuota compatta; coda popolata mostra file e azioni; svuotare una coda compatta soltanto quella card.
5. Per R6 il Frontend riduce spazio sopra i contenuti per le pagine effettive mantenendo costante la posizione del logo. Criterio: confronto geometrico per viewport identiche e controlli/pannelli non coperti.
6. Per R7 il coordinatore aggiorna fixture/test appropriati, ripete benchmark e suite pertinenti, lancia lint/build/desktop e raccoglie prove visive. Reviewer controlla la patch in sola lettura; è permesso un solo ciclo mirato di correzione e nuova review.

## Concrete Steps

Dalla radice FolderRocket, in PowerShell:

    node --test tests/planetGraphLayout.test.mjs
    npm run lint
    npm run build
    npm test
    npm run desktop

Ripetere il microbenchmark baseline con gli stessi tipi, conteggi, warm-up e numero di run. Per i controlli UI usare dati sintetici: grafo da 100/500/1.200 nodi, tutti e sette i pianeti, code vuote e popolate, nomi lunghi, e pagine a larghezza ampia/ridotta. L’output della console o gli screenshot sono evidenze di controllo UI, non test automatici. Fermare l’avvio se Electron termina prima che la finestra sia verificabile e riportare il limite.

## Validation and Acceptance

- R1: pan, zoom, click e drag nodo funzionano senza conflitti; 100/500/1.200 nodi e fino a 900 relazioni sintetiche non perdono dati/posizioni; benchmark identico prima/dopo con Node version, p50/p95, run e warm-up espliciti; osservazioni visive separate dalle misure helper.
- R2: ogni pulsante Dashboard conduce alla pagina corretta, active state e tastiera restano funzionanti, niente taglio/overlap nei viewport verificati.
- R3: sette identità corrette e distinguibili a dimensioni card, editor, header e overlay; cambio pianeta non altera ID, colore, stato attivo o scope.
- R4–R5: code vuote compatte; aggiungere file mostra nome, formato e controlli; rimuovere gli ultimi file ricompatta la sola area svuotata; loading, errore, nomi lunghi, molti file e viewport strette sono leggibili e scrollabili.
- R6: posizione del logo identica a quella baseline a viewport invariata; contenuti di tutte le pagine interessate più in alto, nessun pannello/controllo coperto.
- R7: test mirati, lint, build e `npm test` con esito; `npm run desktop` e verifica visiva registrati come riusciti oppure motivati come non disponibili. Reviewer read-only completa review.
- Preservare le semantics copy/create degli strumenti File Studio e isolare tutti i dati al Planet selezionato.

## Idempotence and Recovery

Tutti i dati per le prove sono sintetici. Non ripristinare file interi da Git o cancellare asset preesistenti; in caso di fallimento correggere soltanto gli hunk del task. Nessuna operazione trasferisce o cancella file reali. Se la nuova grafica non è leggibile su tutte le dimensioni, tornare al renderer precedente usando una patch mirata, senza sovrascrivere gli altri cambiamenti già presenti. Non introdurre una dipendenza prima di verificarne peso, licenza e integrazione.

## Artifacts and Notes

- Richiesta allegata: `C:\Users\bonat\.codex\attachments\b6ae5866-7606-4bf9-bee4-98971e192833\Testo incollato.txt`.
- Unico ExecPlan di questa richiesta: `docs/plans/visual-refresh-graph-planets-filestudio-2026-10-13.md`.
- Baseline performance helper: 11 campioni dopo 3 warm-up per dimensione, Node v24.18.1; p50/p95 in `Surprises & Discoveries`.
- Baseline `git status --short` acquisito il 2026-10-13; checkout contiene modifiche pregresse numerose da preservare.

## Interfaces and Dependencies

R1 usa i tipi `PlanetGraphNode`, `PlanetGraphEdge` e `PlanetGraphData`; l’API di knowledge e il suo world ID restano invariati. R3 conserva `WorldPlanetStyle` e il componente condiviso `Planet`; non migra lo storage. R4–R5 riusano `queue` e `formatQueue` in `ProcessingWorkspace` e il contratto `ChangeFormatPanel({files, onRemove, onComplete})`; conversione e change-format mantengono l’attuale gestione a copia. R2 e R6 usano routing e shell esistenti. Nessuna dipendenza aggiuntiva è decisa in anticipo.

## Revision Notes

- 2026-10-13: Creato prima dell’implementazione per conservare R1–R7, stato dirty, contratti e benchmark baseline.
