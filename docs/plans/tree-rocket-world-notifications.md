# Refine Tree Rocket, dashboard, folder colors, and world email digests

Questo ExecPlan segue `PLANS.md`. È un documento vivo: aggiornare avanzamento, scoperte, decisioni e verifiche a ogni tappa.

## Purpose / Big Picture

Tree Rocket diventa una schermata spaziale senza toolbar a tutta larghezza, con un grafo gerarchico contenuto nei margini, zoom stabile al 90%, modalità Folder/Apps e inventario Windows basato su fonti locali affidabili. Folders on Top resta alto al massimo due tessere, raggruppato per zona di lavoro su sfondo bianco e utilizzabile con il trackpad. Folder Management e File Studio mantengono colori e strumenti coerenti.

Ogni pianeta potrà inoltre configurare riepiloghi/alert email opt-in con fonti selezionate, account e cadenza propri. Le credenziali restano condivise e non copiate. Nessuna email reale sarà inviata durante sviluppo e test. Invii programmati richiedono configurazione completa ed esplicita e funzionano solo mentre il backend è attivo; non vengono installati servizi o attività pianificate Windows.

## Progress

- [x] (2026-10-01 09:53Z) Letti integralmente `AGENTS.md`, `CODEX.md`, `PLANS.md`, `docs/GRAPHIFY.md`; controllato lo stato Git senza modificare le modifiche locali.
- [x] (2026-10-01 09:53Z) Rigenerato Graphify code-only (1859 nodi, 3587 archi) e interrogate le relazioni Tree Rocket, persistenza world-scoped e integrazioni email.
- [x] (2026-10-01 10:00Z) Confermati i vincoli: il job esistente controlla alert Gmail/Outlook ma non invia email; Daily Job e post-it sono in localStorage; il launcher Windows usa Start Apps senza un catalogo; Gmail compose è già richiesto, Outlook non richiede oggi Mail.Send.
- [x] (2026-10-01) Implementato il canvas Tree Rocket e l’inventario Apps asincrono da Windows Start Apps, senza scansione disco e con AppID ricontrollato all’avvio.
- [x] (2026-10-01) Rifiniti i gruppi Folders on Top, toolbar e righe Folder Management, e risoluzione colori condivisa in File Studio.
- [x] (2026-10-01) Aggiunti digest email per pianeta, snapshot minimizzati, preview e test esplicito, consenso separato Mail.Send, scheduler locale, deduplicazione e cronologia.
- [x] (2026-10-01) Eseguiti test mirati e regressioni, lint, TypeScript/build, controlli sintassi backend e prova in sola lettura del catalogo Windows.

## Surprises & Discoveries

- `backend/services/emailAlertScheduler.js` già controlla regole Gmail/Outlook ogni 30 secondi e conserva i risultati per pianeta; non invia notifiche in uscita.
- `DailyJob` e `StickyNotes` leggono la cronologia e i promemoria da localStorage, non dal backend. Il backend deve ricevere solo snapshot minimizzati e limitati, con `worldId` esplicito, per poterli includere nei digest.
- Il token Gmail attuale richiede `gmail.readonly` e `gmail.compose`; il token Outlook richiede `Mail.Read` e `Mail.ReadWrite`, ma non `Mail.Send`. La concessione Outlook per l'invio deve essere una scelta OAuth separata e manifesta.
- `backend/scripts/open-application.ps1` usa `Get-StartApps` per risolvere nomi/appId in avvio, ma Tree Rocket Apps non offre ancora una route di inventario.
- `folderProjects.ts` assegna una tinta di fallback ai gruppi, mentre l'interfaccia richiede di mantenere bianco lo sfondo dei gruppi e conservare i colori leggeri delle singole cartelle.

## Decision Log

- 2026-10-01: riusare `emailAlertScheduler.js` come unico ciclo backend, estendendolo con i digest per pianeta invece di introdurre un secondo scheduler concorrente.
- 2026-10-01: salvare impostazioni e runtime dei digest in `userPreferencesService` dentro `worlds[worldId]`; non salvare token nelle preferenze e non ricavare un pianeta dall'ambiente globale.
- 2026-10-01: limitare gli snapshot da localStorage a metadati selezionati (attività recenti, titolo/ora dei reminder e dati calendar sintetici), mai a contenuti email/documenti o token.
- 2026-10-01: invio Gmail solo con account selezionato e scope compose già disponibile; invio Outlook solo dopo un'azione esplicita di consenso Mail.Send. Nessun task Windows/background service nuovo.
- 2026-10-01: catalogo Apps dalla fonte Windows Start Apps, deduplicato e apribile solo tramite AppID presente nel catalogo; nessuna scansione ricorsiva del disco né logo remoto.

## Outcomes & Retrospective

Tree Rocket usa l’asset `src/assets/tree-rocket-logo.png`, un header compatto centrato, selettore Folder/Apps, zoom iniziale 90% e catalogo locale Start Apps. L’inventario è stato provato in sola lettura sul computer corrente: Windows ha restituito 5 collegamenti. Non sono state avviate applicazioni; Start Apps non espone in questa route i file icona, quindi la griglia usa l’icona locale generica senza download esterni.

Folders on Top ha gruppi bianchi con logo singolo, due righe massime e overflow verticale confinato ai gruppi; la navigazione orizzontale è nativa e non rimappa la rotella. File Studio usa `folderColourMap`, includendo fallback di gruppo per cartelle legacy senza colore esplicito.

Le email programmate sono disattivate di default e per pianeta; la pianificazione usa `emailAlertScheduler` ogni 30 secondi solo mentre il backend è attivo. Gmail riusa il compose scope già richiesto, Outlook richiede consenso Mail.Send esplicito. Frontend e backend limitano le snapshot alle sole categorie selezionate per il pianeta; i digest tengono cronologia limitata e redatta, prenotano la chiave prima dell’invio, riprovano solo throttling 429 definitivo e marcano errori di consegna ambigui senza retry per evitare duplicati.

Verifiche completate: `npm run lint`; `npm run build` (TypeScript e Vite); `npm test` (59/59); `node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs` (16/16); test mirati Tree Rocket/digest (26/26); `node --check` per server, scheduler, servizi digest e provider; `git diff --check`; catalogo Start Apps in sola lettura. Nessuna email è stata inviata e non è stata eseguita una prova visiva interattiva né un avvio OAuth/app reale. Queste prove restano manuali.

## Context and Orientation

La UI Tree Rocket è in `src/components/TreeRocket.tsx`, montata da `src/components/FolderManagement.tsx`; i relativi stili sono in `src/App.css`. Il servizio filesystem è `backend/services/treeRocketService.js` e le route sono in `backend/server.js`. Il launcher PowerShell è `backend/scripts/open-application.ps1`, eseguito da `backend/services/windowsTask.js`.

Folders on Top usa `src/App.tsx`, `src/folderProjects.ts`, `src/components/FolderScrollFrame.tsx` e regole CSS sovrapposte in `src/App.css`. Folder Management espone `ManagedFolder.appearance`; File Studio applica i colori tramite `src/components/FolderAppearanceStyles.tsx`.

Le preferenze server per pianeta sono JSON in `userPreferencesService.js` e `worlds[worldId]`. Gli alert inbox sono normalizzati da `emailAlertSettingsService.js` ed elaborati da `emailAlertScheduler.js`; provider OAuth e API sono in `gmailService.js`, `outlookService.js` e `googleCalendarService.js`. Daily activity e reminder sono lato frontend in `src/dailyActivity.ts` e `src/components/StickyNotes.tsx`; `DailyJob.tsx` ha già composizione email manuale in bozza, non invio automatico.

Il checkout contiene già modifiche locali in numerosi file e un ExecPlan non tracciato del lavoro precedente. Non sostituire né ripulire tali file; modificare solo i punti necessari e lasciare intatti gli altri cambiamenti dell'utente.

## Plan of Work

Rifinire il markup e il CSS Tree Rocket mantenendo ricerca, aggiunta, file panel e navigazione. Spostare controlli secondari in pulsanti/popover discreti. Reimpaginare il livello corrente in una colonna radice e figli a destra, contenuti nei margini e senza overflow orizzontale; inizializzare lo zoom al 90% solo quando non esiste una preferenza, preservandolo fra livelli. Aggiungere una route autenticata per l'elenco Apps proveniente da Start Apps e apertura tramite AppID verificato.

Correggere le regole Folder top per altezza di due tessere, gruppi bianchi, un logo per gruppo e scroll orizzontale esterno/verticale locale. Compattare la toolbar Folder Management e le righe file aperte; unificare la risoluzione colore delle cartelle fra Folder Management e File Studio senza migrazioni mutative.

Aggiungere una configurazione normalizzata e separata per mondo: mittente/provider/account, destinatario, timezone, frequenza, fonti, stato e runtime. Aggiungere route world-scoped, UI nel pannello impostazioni del pianeta, anteprima e invio di prova esplicito. Riutilizzare account esistenti. Gmail usa compose; Outlook richiede uno specifico flusso esplicito Mail.Send senza cambiare le normali autorizzazioni Outlook.

Estendere il ciclo scheduler esistente con digest giornalieri/intervallo, deduplicazione persistente e lock per utente/pianeta. Per Google Calendar leggere intervalli e blockId configurati nel dashboard del pianeta; per email/Teams riusare i provider già autorizzati e mantenere query limitate. Sincronizzare dal frontend snapshot minimizzati di Daily Job e reminder per il mondo che li possiede. Se un provider non è connesso o consentito, segnare la fonte indisponibile senza inventare eventi o chiedere scope automaticamente.

## Concrete Steps

Directory di lavoro: radice FolderRocket su Windows.

    npm run graph:build
    node --test backend/test/dashboardTreeRocketUi.test.js backend/test/treeRocketService.test.js
    npm --prefix backend test
    node --check backend/server.js
    node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs
    npm run lint
    npm run build

Durante i test dei digest iniettare trasporti/provider finti. Non spedire email reali; provare il preview e l'endpoint di send soltanto con mock locale. Non eseguire `npm run desktop:package` né cambiare account OAuth durante questa attività.

## Validation and Acceptance

Tree Rocket ha solo lo sfondo e il brand centrato con selettore Folder/Apps, usa il logo approvato più grande, mostra nodi contenuti, mantiene 90% e inquadratura, conteggi brevi e check accessibile. La modalità Apps elenca soltanto nomi realmente ottenuti da Windows e non scansiona dischi.

Folders on Top è alto al massimo due tessere, gruppi bianchi, badge gruppo singolo e scroll trackpad con delta X sopra tessere; delta Y resta locale al gruppo. Reorder/Add sono a destra di Folders e la lista file mostra più righe leggibili. I colori Folder Management/File Studio condividono la stessa regola e preservano record legacy.

La configurazione dei digest resta distinta tra due pianeti; non parte se manca qualunque abilitazione/account/destinatario/fonte; un solo invio per occorrenza/finestra; calendario today/tomorrow/week rispetta timezone; snapshot non contiene token o corpi completi. Test e riepilogo dimostrano questi punti; flussi reali OAuth e Outlook Mail.Send richiedono prova manuale separata.

## Idempotence and Recovery

I digest usano chiavi stabili basate su user, world, schedule e data locale. Prenotare un invio deve avvenire prima della chiamata provider; errori certi possono riprovare con backoff limitato, outcome incerto viene marcato per controllo manuale per evitare email duplicate. Disabilitare una pianificazione non cancella runtime o i log consegnati.

Configurazioni legacy senza sezione notifiche restano disabilitate. Le snapshot sono sovrascrivibili per singolo world e contengono un set limitato di dati sanitizzati. Nessuna modifica ai file utente/cartelle fisiche. In caso di regressione ripristinare solo gli helper e regole introdotti per questa feature senza usare reset/check-out distruttivi.

## Artifacts and Notes

- Graphify locale code-only in `graphify-out/`, ignorato da Git; le relazioni sono state confrontate con il sorgente.
- Non sono previsti dati di test email reali, credenziali o contenuti email nei nuovi file.

## Interfaces and Dependencies

Riusare `readDashboardPreferences/writeDashboardPreferences`, `emailTokenStore`, `gmailService`, `outlookService`, `googleCalendarService`, `emailAlertScheduler`, `windowsTask`, `treeRocketService`, `API_BASE_URL`, `folderProjectGroups`, `folderColourMap`, `readDailyActivities` e l'evento `folderrocket:sticky-notes-updated`. Non aggiungere dipendenze runtime se le API e le utility Node/Windows esistenti bastano.

## Revision Notes

- 2026-10-01: creato piano per la specifica allegata; integrati i vincoli reali trovati nel codice per scheduler, OAuth, storage renderer-only e inventario Windows.
- 2026-10-01: completati Tree Rocket, layout/colore cartelle e digest locali per pianeta; aggiunto filtro snapshot server/client basato sulle fonti selezionate; validazione finale 59 test backend, 16 regression helper, lint/build/sintassi e prova read-only Get-StartApps. Nessun invio o avvio esterno effettuato.
- 2026-10-01: Tree Rocket Apps apre tramite route autenticata che riverifica l’AppID Start senza usare la route amministrativa generale; ripetuti lint, build e `npm test` dopo questa correzione (59/59).
