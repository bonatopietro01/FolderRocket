# Folders on Top, Tree Rocket, and File Studio polish

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Rendere più chiari i gruppi di cartelle nel layout Folders on Top, proporre una nuova identità visiva Tree Rocket con una schermata coerente e completamente in inglese, e mantenere Local Conversion e Change Format utilizzabili a zoom ridotto senza cambiare i flussi di elaborazione.

## Progress

- [x] (2026-09-30 20:33Z) Ispezionati istruzioni, stato Git, moduli coinvolti e grafo Graphify aggiornato.
- [x] (2026-09-30 21:15Z) Implementare gruppi per descrizione e scorrimento indipendente tra gruppi e membri, senza cambiare Three Columns.
- [x] (2026-09-30 21:15Z) Rifinire proposta grafica, accessibilità, lingua e dimensioni full-screen di Tree Rocket.
- [x] (2026-09-30 21:15Z) Rendere adattivi i pannelli File Studio e rimuovere le intestazioni richieste solo quando applicabile.
- [x] (2026-09-30 21:15Z) Aggiornare test, eseguire verifiche statiche, build e fixture visive ampia/stretta.

## Surprises & Discoveries

- `folderProjectGroups()` usa attualmente `appearance.workGroup` prima della descrizione ed è condivisa con altre aree; cambiare la funzione esistente altererebbe comportamenti non richiesti. Folders on Top necessita quindi di una variante di raggruppamento circoscritta.
- `FolderScrollFrame` abilita per Folders on Top uno scorrimento orizzontale trasformando la gerarchia dei gruppi in `display: contents`; i gruppi non possono così contenere i propri membri in verticale.
- `TreeRocket.tsx` conserva diverse etichette e messaggi italiani e la testata mostra ancora il marchio FolderRocket; il pulsante del nome è inoltre l'unica area cliccabile del nodo.
- Local Conversion mostra sempre “Files to convert” e Change Format mostra “Files receiving the format”; entrambe le intestazioni sono renderizzate nel JSX, non solo dal CSS.
- Graphify aggiornato il 2026-09-30 ha confermato i collegamenti fra `App.tsx`, `folderProjects.ts`, `FolderScrollFrame.tsx`, `TreeRocket.tsx`, `FolderManagement.tsx`, `ProcessingWorkspace.tsx` e `ChangeFormatPanel.tsx`. Le conclusioni sono state verificate nel sorgente.

## Decision Log

- (2026-09-30, Codex) Aggiungere una funzione di raggruppamento per descrizione utilizzata soltanto da Folders on Top; mantenere `folderProjectGroups()` per Three Columns e le altre aree.
- (2026-09-30, Codex) Usare l'icona SVG Tree Rocket aggiornata come proposta visuale nel riquadro Folder Management e nella pagina dedicata, senza introdurre un editor di loghi o nuove preferenze.
- (2026-09-30, Codex) Mantenere la lista Local Conversion visibile e funzionale; nascondere la sua intestazione quando la coda è vuota e rimuovere soltanto la riga identificativa della coda Change Format.

## Outcomes & Retrospective

Completato. In Folders on Top le cartelle condividono ora il gruppo derivato dalla descrizione normalizzata; le descrizioni vuote restano isolate. I gruppi sono una fila orizzontale con scorrimento verticale interno, mentre la rotellina passa allo scorrimento orizzontale tra gruppi quando quello attivo non può più scorrere verticalmente. Le icone ripetute sono centrate verticalmente sui blocchi. Three Columns continua a usare `folderProjectGroups()`.

Tree Rocket usa il marchio SVG ramificato anche come proposta visibile, ha solo il titolo “Tree Rocket”, controlli e stati in inglese, azioni indipendenti dal clic di apertura sull'intera cartella e overlay a pieno schermo. File Studio nasconde la sola intestazione della coda conversione quando vuota, conserva righe Source/Target, rimuove l'intestazione ridondante di Change Format e riadatta le schede sotto 1050/720 px.

Verifiche: `npm run lint`, `npm run build`, `npm test` (49/49), `node --test backend/test/dashboardTreeRocketUi.test.js tests/new-workflows.test.mjs tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs` (31/31), `git diff --check`. Prova browser con fixture solo fittizie a 1280×720 e 640×800: controllati 0/1/2/12 cartelle, gruppi, scroll verticale e orizzontale, Three Columns, overlay Tree Rocket con 12 sottocartelle senza overflow orizzontale, e File Studio vuoto e con madre/target senza overflow. Non sono state usate cartelle reali, servizi live o file dell'utente.

## Context and Orientation

La dashboard è composta in `src/App.tsx`; `src/folderProjects.ts` fornisce i gruppi e `src/components/FolderScrollFrame.tsx` gestisce il viewport delle cartelle. Gli stili vivono in `src/App.css`. Tree Rocket è un overlay portal in `src/components/TreeRocket.tsx`, aperto dal launcher in `src/components/FolderManagement.tsx`. Local Conversion è in `src/components/ProcessingWorkspace.tsx`; Change Format è in `src/components/ChangeFormatPanel.tsx`.

Lo stato iniziale era pulito sul branch `feature/desktop-foundation`. `CODEX.md` è stato letto integralmente. Il grafo Graphify mancava di aggiornamento rispetto ad alcuni sorgenti; `npm run graph:build` lo ha rigenerato senza modificare file tracciati.

## Plan of Work

In `src/folderProjects.ts` aggiungere un helper che raggruppa descrizioni non vuote senza distinzione di maiuscole/minuscole, lasciando autonome le descrizioni vuote e restituendo colore/logo coerenti. In `src/App.tsx` selezionare questo helper soltanto per Folders on Top. In `FolderScrollFrame.tsx` e negli stili circoscritti in `App.css`, visualizzare gruppi adiacenti con membri in verticale, consentire scorrimento orizzontale fra gruppi e verticale all'interno di un gruppo troppo lungo, e mantenere centrata l'icona di progetto.

In `TreeRocket.tsx` aggiornare l'SVG come proposta visiva con ramificazione evidente; rimuovere marchio e nome FolderRocket dalla testata, lasciare il titolo Tree Rocket; rendere cliccabile l'intera superficie del nodo lasciando indipendenti le azioni interne; tradurre in inglese testi, stati, breadcrumb, tooltip ed errori. In `App.css` confrontare e allineare i bounds dell'overlay con Fly To Another Planet, aumentare leggibilità e mantenere tastiera, touch e reduced motion.

In File Studio rendere colonne, intestazioni, selettori, code e pulsanti capaci di restringersi o andare a capo senza sovrapporsi. Nascondere l'intestazione Files to Convert soltanto con la coda vuota e rimuovere l'intestazione Files Receiving the Format, mantenendo invariati madre, figli e azioni.

## Concrete Steps

Dalla radice del repository:

    npm run lint
    npm test
    node --test tests/new-workflows.test.mjs
    npm run build

Per l'interfaccia, eseguire `npm run dev` e aprire `/tests/ui/tree-rocket-smoke.html`; provare Tree Rocket e i layout Folders on Top/Three Columns con finestra ampia e stretta. Se la fixture non copre i controlli modificati, aggiornarla con dati fittizi e aggiungere asserzioni mirate.

## Validation and Acceptance

Accettare quando: descrizioni uguali non vuote sono in colonne/gruppi verticali separati da descrizioni differenti; descrizioni vuote non vengono fuse; i gruppi scorrono orizzontalmente e i membri verticalmente senza clipping; Three Columns mantiene helper e comportamento precedenti; Tree Rocket presenta solo il suo titolo, UI in inglese, logo ramificato, click sul corpo e pulsanti interni indipendenti; overlay e navigazione sono usabili su schermi stretti; Local Conversion nasconde l'intestazione soltanto a coda vuota e Change Format non mostra più la riga destinatari; code e conversioni restano operative.

Eseguire test mirati, `npm run lint`, `npm test` e `npm run build`. Annotare separatamente test su fixture e verifiche con dati reali; non usare cartelle o file personali nel test.

## Idempotence and Recovery

Le modifiche sono UI/helper e non migrano né eliminano dati. Ripetere build e test è sicuro. Se un layout peggiora, ripristinare solo le modifiche locali relative ai file modificati da questo task, preservando sempre eventuali modifiche dell'utente; non usare reset o checkout distruttivi.

## Artifacts and Notes

- Grafo statico aggiornato: `graphify-out/graph.json` (ignorato da Git).
- Fixture esistente: `tests/ui/tree-rocket-smoke.html` e `tests/ui/tree-rocket-smoke.tsx`.
- Nessuna chiamata esterna o dato diagnostico verrà inviato.

## Interfaces and Dependencies

Nessuna nuova dipendenza o API backend. Tipi esistenti `ManagedFolder` e `DashboardFolderLayout`; React/TypeScript e stili CSS attuali. Moduli primari: `src/App.tsx`, `src/folderProjects.ts`, `src/components/FolderScrollFrame.tsx`, `src/components/TreeRocket.tsx`, `src/components/FolderManagement.tsx`, `src/components/ProcessingWorkspace.tsx`, `src/components/ChangeFormatPanel.tsx`, `src/App.css` e test correlati.

## Revision Notes

- 2026-09-30: creato dopo verifica di repository, Graphify e codice esistente; fissato il perimetro per mantenere isolati i cambi Folders on Top e le funzioni di conversione.
