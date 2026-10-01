# Tree Rocket, Folder Management and dashboard layout polish

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Rifinire Tree Rocket e il layout Folders on Top senza cambiare i flussi di gestione file. L’utente vedrà un’intestazione Tree Rocket coerente col marchio FolderRocket, una griglia centrata di cartelle e app, un ripristino mirato della tabella Folders, gruppi dashboard più compatti e un indicatore scrollbar discreto per Recent Files.

## Progress

- [x] (2026-10-01 15:01Z) Ispezionati stato Git, documentazione architetturale, componenti principali e grafo Graphify esistente.
- [x] (2026-10-01 15:01Z) Confermata la causa della regressione Folder Management: `88ec391` ha aggiunto gli override finali delle righe, impostando `font-size:9px` alle intestazioni, `11px` agli input e colonne minime più strette, a differenza della regola preesistente `.folderTableHead` (15px, grassetto). L’immagine Tree Rocket è già un asset separato; il riquadro bianco è applicato dal CSS di `.treeRocketBrandTitle`.
- [x] (2026-10-01 15:46Z) Corrette intestazione, griglia Folder/Apps, navigazione visiva, refresh e cache del catalogo, e ripristinata la tabella Folder Management.
- [x] (2026-10-01 15:46Z) Compattati i gruppi Folders on Top, accoppiate le cartelle senza descrizione e resa discreta la scrollbar Recent Files; aggiunti test di regressione.
- [x] (2026-10-01 15:46Z) Completati TypeScript/build, lint, test backend e verifica visiva della fixture a 1280×720.

## Surprises & Discoveries

- Il grafo locale esistente è disponibile e `graphify explain "TreeRocket"` conferma i legami tra `TreeRocket`, `FolderManagement`, `App.tsx` e i test UI. Le funzioni principali sono nel componente React; la geometria è in una lunga coda di override in `src/App.css`.
- `TreeRocket` carica Apps quando la scheda viene aperta e conserva la lista nello stato del componente; il catalogo viene quindi perso quando il componente si smonta. Il refresh attuale svuota la lista valida prima di una nuova richiesta.
- La dashboard usa `folderDescriptionGroups()` in Folders on Top e i gruppi CSS sono attualmente larghi circa 228/270 px, con etichetta e cornice visibili; va preservato lo scorrimento orizzontale esterno e verticale interno.
- Il repository parte pulito su `feature/desktop-foundation`; nessuna modifica preesistente da preservare è stata rilevata.
- Il confronto del CSS storico conferma che gli override compattati sono stati introdotti nell’ultimo commit (`88ec391`): non è una modifica JSX della tabella. Verranno ripristinati titoli e intestazioni nel solo pannello Folder Management, conservando la responsività.
- La prima prova visiva di Apps ha rilevato che la sua area scorrevole collassava a zero altezza: la body di Tree Rocket è un contenitore block e il flex-basis del pannello non bastava. È stato assegnato al pannello il 100% dell’altezza disponibile e verificata la griglia completa nel browser.
- Il comando Refresh ora è accanto al selettore Apps, come richiesto; la fixture mostra i nomi sintetici e il fallback generico, non legge né apre il catalogo reale del PC.

## Decision Log

- 2026-10-01: limitare gli interventi a `TreeRocket`, `FolderManagement`/`App.css`, `FolderScrollFrame` solo se necessario, e `RecentFilesSourcePanel`; File Studio e Daily Jobs sono esplicitamente fuori scope.
- 2026-10-01: cache del catalogo Apps solo in memoria di sessione, con refresh esplicito; non persistere o scandire più a fondo il computer.
- 2026-10-01: usare i componenti e le classi di pulsante già condivisi con Fly To Another Planet, invece di introdurre un secondo sistema visivo.
- 2026-10-01: tenere lo stato Apps in una cache di modulo session-only; gli errori di refresh non devono sostituire l’ultimo elenco valido.

## Outcomes & Retrospective

- Tree Rocket mostra il logo trasparente e ingrandito, brand tipografico coerente, selettori Folder/Apps sulla stessa riga, pulsanti entro i margini condivisi con Fly To Another Planet, e griglia centrata senza scrolling orizzontale. Le sottocartelle sono disposte attorno alla radice; Show Files è stato provato con PDF, DOCX e PNG della fixture.
- Apps riusa in memoria il catalogo valido tra visite, conserva i dati visibili durante il refresh, offre retry non distruttivo e fallback icona. La scheda non ha più la barra contenitore ridondante; l’aggiornamento è accanto ad Apps e lo scroll verticale resta attivo con scrollbar nascosta.
- Folder Management recupera gerarchia tipografica e grassetti; il controllo Path/Insert occupa meno spazio e la lista file aperta usa il font ridotto richiesto. Nessuna funzione di CRUD o riordino è stata cambiata.
- Folders on Top raggruppa descrizioni uguali, accoppia in ordine le cartelle senza descrizione (l’ultima dispari resta da sola), conserva scroll interno/esterno, rimuove superfici e cornici ridondanti e restringe le sfumature. Recent Files mantiene lo scroll con indicatore da 2 px.
- Verifiche: TypeScript incluso in `npm run build` superato; `npm run lint` superato; `npm test` superato (60/60); test mirati superati (18/18); `git diff --check` senza errori. Fixture visiva controllata a 1280×720 per dashboard, radice/sottocartelle, file con icone e griglia Apps/Refresh.
- Limiti: la fixture usa dati sintetici e non verifica l’elenco o le icone delle applicazioni installate su Windows né l’apertura di programmi reali. Non è stata effettuata una prova visiva su finestra stretta. File Studio e Daily Jobs non sono stati modificati. Nessun commit, push o installazione è stato eseguito.

## Context and Orientation

La UI principale è composta da `src/App.tsx`; `src/components/TreeRocket.tsx` crea una schermata fullscreen via portal e carica cartelle e app da API già esistenti. `src/components/FolderManagement.tsx` contiene la tabella, la toolbar e il launcher Tree Rocket. Le regole globali e responsive, incluse quelle di dashboard e Tree Rocket, sono in `src/App.css`. `src/components/FolderScrollFrame.tsx` gestisce i bordi e l’overflow dell’area centrale dashboard. Recent Files è un blocco sorgente implementato in `src/components/RecentFilesSourcePanel.tsx`.

I test di regressione testuali condivisi sono in `backend/test/dashboardTreeRocketUi.test.js`; i test UI documentati e gli altri test del backend si trovano sotto `tests/` e `backend/test/`. I comandi verificati nel `package.json` sono `npm run lint`, `npm test` e `npm run build`; la build include `tsc -b`. Graphify è locale e code-only, prodotto sotto `graphify-out/`.

## Plan of Work

Prima confrontare il CSS della tabella Folders con il commit che ha introdotto le ultime regole responsive e con lo stato parent, per attribuire la differenza a una regola concreta. Poi intervenire sulle sole regole finali in conflitto, ripristinando gerarchia tipografica e colonne e riducendo solo la larghezza del controllo path.

In Tree Rocket, semplificare l’intestazione e rendere trasparente l’asset senza modificarne i pixel se il file contiene già alpha. Usare una griglia centrata, a colonne responsive con tessere di misura stabile e scroll verticale; per la vista annidata tenere la gerarchia leggibile e centrata. Per Apps, conservare l’ultimo catalogo in cache di modulo durante la sessione e tenere i risultati precedenti visibili mentre il refresh è in corso; aggiungere un pulsante icona con feedback di caricamento e fallback/errore non distruttivo.

In Folders on Top, mantenere scorrimento orizzontale tra gruppi e verticale all’interno dei gruppi di lavoro, limitando l’altezza complessiva a due tessere e rimuovendo tag e cornici ridondanti senza perdere l’etichetta/logo di progetto. In Recent Files applicare una scrollbar sottile e layout che usa meglio la larghezza esistente, senza cambiare la struttura generale delle Sources.

Aggiornare test statici/regressione pertinenti, poi avviare l’app per verificare visivamente layout responsive, navigazione e refresh. Evitare File Studio, Daily Jobs, migrazioni, backend e dati utente.

## Concrete Steps

Dalla radice `C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`:

    npm run lint
    npm test
    npm run build

Per il grafo già presente, interrogare solo i collegamenti pertinenti con `graphify explain "TreeRocket"`; rigenerare con `npm run graph:build` solo se `graphify-out/graph.json` risulta più vecchio delle modifiche o delle fonti interessate.

## Validation and Acceptance

Accettazione osservabile: Tree Rocket usa logo senza riquadro bianco, brand e pulsanti coerenti con Fly To Another Planet, schede Folder/Apps entro margini con scroll solo verticale; il refresh Apps conserva il catalogo precedente fino al successo e ha fallback. Folder Management mantiene il grassetto e la gerarchia originale di titolo/intestazioni/campi, con campo path più compatto e lista file soltanto più piccola. Folders on Top mantiene i gruppi raggiungibili, massimo due altezze di tessera, indicatori che non coprono i nodi e scroll sia orizzontale che verticale. Recent Files conserva lo scroll con indicatore meno invadente.

Eseguire test mirati, linter, test backend e build/TypeScript. Provare UI su viewport ampio e stretto; se l’ambiente browser non è accessibile, dichiarare il limite e non presentare la verifica visiva come eseguita. La verifica visuale effettivamente disponibile è la fixture a 1280×720; la prova stretta resta da fare.

## Idempotence and Recovery

Le modifiche sono solo UI/CSS/test e non devono toccare storage o file utente. Conservare il catalogo Apps solo in memoria: un refresh fallito non rimuove i dati già visibili. In caso di regressione, annullare esclusivamente le righe CSS/componenti introdotte dal task; non ripristinare interi file o commit.

## Artifacts and Notes

Il grafo locale è un artefatto ignorato da Git in `graphify-out/`. Il piano corrente è `docs/plans/tree-rocket-folder-dashboard-polish.md`; non generare screenshot o dati personali aggiuntivi.

## Interfaces and Dependencies

Nessuna nuova dipendenza o endpoint. Riutilizzare le API `/filesystem/tree-roots`, `/filesystem/tree-children` e `/applications/catalog`, `TreeRocketMark`, le utility di griglia esistenti e le classi dei pulsanti di Fly To Another Planet. Se si introduce una cache di modulo, esporre solo funzioni locale al modulo con un refresh forzato esplicito.

## Revision Notes

- 2026-10-01: creato il piano dopo l’ispezione iniziale e la conferma dei collegamenti con Graphify; aggiornato dopo il confronto del commit responsabile della regressione tipografica.
- 2026-10-01: completati gli interventi e i controlli; la prova UI ha inoltre portato alla correzione dell’altezza collassata di Apps e allo spostamento del refresh accanto al selettore.
