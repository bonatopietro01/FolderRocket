# Automatic Planet Graph and Gmail Conversations

Questo ExecPlan segue PLANS.md. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

L’utente può attivare un grafo automatico per ciascun pianeta, consultarlo dalla scheda del pianeta o da una conversazione Gmail, e leggere thread Gmail in una pagina conversazionale accessibile dal logo FolderRocket. Il grafo è interno all’app e ispirato alla navigazione di Obsidian; non richiede Obsidian installato né un vault.

Il grafo include solo dati locali e fonti configurate per quello specifico pianeta. La ricerca e le conversazioni restano circoscritte all’account Gmail già selezionato per il pianeta. Le risposte a email avvengono come normali messaggi Gmail nello stesso thread. Collegare una conversazione a un secondo pianeta condivide un riferimento locale senza duplicare o reinviare le email.

## Progress

- [x] (2026-10-03 20:35Z) Inventario iniziale, lettura di AGENTS.md, CODEX.md e PLANS.md, verifica dello stato Git e analisi preliminare dei punti di ingresso.
- [x] (2026-10-03 20:50Z) Creato il servizio di persistenza/indicizzazione per utente e pianeta: ID stabili, traversal limitato alle cartelle configurate, no-follow per symlink, metadati Gmail senza corpi, conversione di note/calendario/attività, scritture atomiche e upsert idempotente degli eventi.
- [x] (2026-10-03) Accessi al grafo dalle schede pianeta e vista interattiva condivisa: stato persistente `graphEnabled`, azione scheda e componente SVG con caricamento/stato indicizzazione, ricerca, pan/zoom e selezione; integrato in App.
- [x] (2026-10-03 21:10Z) Esteso il servizio Gmail per elencare thread inbox in modo limitato, caricare i messaggi completi on-demand (RFC Message-ID e metadati allegati) e creare/inviare reply draft con Gmail threadId, In-Reply-To e References. Il provider assegna il nuovo Message-ID; i test restano mock e senza invio reale.
- [x] (2026-10-03 21:25Z) Aggiunte le route autenticate per leggere/indicizzare il grafo, registrare attività, elencare e aprire thread Gmail, salvare/inviare risposte e condividere/rimuovere riferimenti tra mondi. Le verifiche d’integrazione usano backend isolato, dati temporanei e nessuna credenziale Gmail.
- [x] (2026-10-03 22:30Z) Integrata la navigazione: “View graph” non cambia pianeta, “Create planet graph” persiste per mondo, il logo apre Email Conversations e il viewer può aprire un thread nel mondo attivo. Aggiunti aggiornamenti periodici/su eventi con userId/worldId espliciti; gli aggiornamenti dei nodi e degli snapshot ora preservano cartelle, thread e attività, e l’upsert rimuove snapshot scaduti senza cancellare altre fonti.
- [x] (2026-10-03 22:30Z) Implementata l’associazione esplicita dei riferimenti thread, con rimozione locale al pianeta; il viewer evidenzia/apre un thread in contesto. Il riferimento sopravvive a una reindicizzazione.
- [x] (2026-10-03) Test mirati, controlli TypeScript/build, lint, test backend, controllo sintassi server e refresh/query Graphify completati.
- [ ] Verifica visiva browser/Electron e test con un account Gmail OAuth reale restano da fare; nessun invio Gmail reale è stato eseguito.

## Surprises & Discoveries

- Il repository contiene già preferenze e workspace separati per pianeta tramite worldId e activeWorldStorageScope; la configurazione backend dei mondi è salvata in settings.worlds[worldId].
- Daily Job e activity snapshot forniscono riepiloghi e attività, non un archivio completo di email/thread o eventi. Non usarli come fonte autorevole senza identificativi e provenienza.
- Gmail esiste già come integrazione per account/blocco: il servizio offre list/detail, allegati, invio e bozze. Il flusso di invio corrente non realizza ancora una risposta thread-safe; il supporto alle bozze con allegati esiste.
- src/dailyActivity.ts emette eventi globali senza worldId nel payload. I produttori e i listener da collegare al grafo devono attribuire ogni operazione al pianeta esplicitamente.
- Sono già presenti modifiche e file non tracciati di altri interventi. Non ripristinarli, rimuoverli o inglobarli nella nuova funzione.

## Decision Log

- (2026-10-03) Il grafo è una vista interna FolderRocket ispirata a Obsidian. Non si incorporano Obsidian, vault o dipendenze di rete.
- (2026-10-03) Un grafo per utente e pianeta usa solo cartelle, blocchi, account e collegamenti configurati in quel pianeta. La visualizzazione di un pianeta inattivo non cambia il pianeta attivo.
- (2026-10-03) L’indicizzazione e i collegamenti iniziali sono deterministici. Nessun modello AI o agente è richiesto; nessun dato viene inviato a un provider AI per costruire o visualizzare il grafo.
- (2026-10-03) Le email condivise tra pianeti sono riferimenti espliciti agli identificativi Gmail/account/thread, con associazioni locali indipendenti. Rimuovere un’associazione locale non elimina né inoltra email.
- (2026-10-03) Inviare un reply è un’azione esplicita. Creare o salvare una bozza non deve inviarla.

## Outcomes & Retrospective

Consegnato il grafo locale per utente/pianeta, attivabile nelle impostazioni e apribile dalla scheda senza cambiare il pianeta attivo; il logo apre Email Conversations, che mostra thread Gmail come chat e supporta bozza/risposta con allegati, invio esplicito e condivisione/rimozione locale dei riferimenti tra pianeti. Il grafo si può aprire anche da una conversazione. Non usa Obsidian, server di chat o AI; condividere un riferimento non duplica né inoltra un messaggio.

Fonti: cartelle configurate e autorizzate, metadati Gmail dell’account selezionato per il pianeta e snapshot locali già disponibili di attività, calendario, note e reminder. Limiti: filesystem massimo 400 directory, 3000 file e profondità 8; massimo 100 messaggi inbox per account nell’indice e 40 per richiesta nella lista conversazioni. La UI non ha paginazione Gmail successiva e l’indice non riceve nuove mail in tempo reale. Corpi di file/email non sono indicizzati; il contenuto email viene caricato su richiesta.

Verifiche: `npm test` (68 test), `npm run lint`, `npm run build`, `node --check server.js` da `backend/`, `npm run graph:build`, query Graphify mirata e `git diff --check` passati. La build segnala un bundle principale di circa 511.93 kB, oltre la soglia Vite di 500 kB (warning). Test con fixture e provider mock; non sono stati svolti controllo visivo browser/Electron, OAuth Gmail reale o invii reali. Nessun commit o push.

## Context and Orientation

- src/worlds.ts definisce il modello client dei pianeti e lo scope di persistenza locale.
- src/App.tsx contiene WorldWorkspace, navigazione principale, logo appLogo e cambio pianeta.
- src/components/ChangeWorld.tsx contiene WorldGrid e il pannello di personalizzazione.
- src/dailyActivity.ts e src/worldActivitySnapshot.ts gestiscono dati attività e snapshot.
- backend/server.js implementa autenticazione, settings.worlds, attività del mondo e route email.
- backend/services/gmailService.js gestisce account, chiamate Gmail, messaggi, allegati, bozze e invii.
- Test esistenti vicini alla modifica: backend/test/worldPersistence.test.js, worldAssistant.test.js, worldActivityEmailService.test.js, gmailAccountCatalog.test.js e emailDraftAsyncIo.test.js. Verificare i nomi e fixture reali prima di aggiungere test.
- Graphify è un grafo statico della codebase, non dati utente. È stato aggiornato con `npm run graph:build`; una query mirata ha individuato i percorsi tra route, servizi e componenti e i risultati sono stati confermati nei sorgenti e nei test.
- L’indicizzazione Gmail è limitata ai primi 100 messaggi inbox per account selezionato; l’elenco conversazioni legge fino a 40 messaggi per account per richiesta e non espone ancora paginazione successiva.
- La scansione filesystem è limitata alle cartelle configurate e autorizzate, a 400 directory, 3000 file e profondità 8. I nodi file contengono metadati, non contenuti. Le nuove email non vengono aggiornate in tempo reale; attività e snapshot locali invece aggiornano il grafo in background.

Il lavoro è partito da una cartella di lavoro con modifiche preesistenti, tutte preservate. La feature è stata aggiunta senza commit o push.

## Plan of Work

1. Modellare e persistere lo stato di attivazione del grafo per ogni mondo, più record, nodi e relazioni indicizzati. Riutilizzare l’identità autenticata e il sistema di persistenza più vicino; non introdurre una migrazione invasiva se una struttura locale isolata può soddisfare requisiti di atomicità e deduplica. Gli endpoint devono verificare utente, worldId e configurazione.
2. Collegare i produttori delle attività pertinenti con worldId e operationId espliciti. Aggiungere un processo di indicizzazione iniziale per le fonti di quel mondo già configurate, con paginazione/limiti visibili e progressi persistenti. Aggiornare in modo incrementale e idempotente; una disattivazione interrompe l’indicizzazione ma conserva i dati derivati.
3. Aggiungere “Create graph” alle impostazioni del pianeta e “View graph” alle schede, senza attivare il pianeta inattivo. Creare una vista di grafo interna riutilizzabile, navigabile e accessibile, con ricerca, zoom, trascinamento, filtri, selezione dei nodi e collegamenti alla fonte.
4. Aggiungere una pagina Email Conversations raggiungibile dal logo centrale FolderRocket. Elencare thread Gmail del blocco/account selezionato nel mondo attivo; mostrare i messaggi in sequenza, dettagli mittente/data, risposta, composizione e allegati. Implementare risposte nel thread usando gli identificativi e header Gmail corretti, riutilizzando le funzioni di bozza/invio senza trasformare il salvataggio bozza in un invio.
5. Aggiungere associazioni locali e indipendenti che permettano di condividere un riferimento conversazione con un altro mondo. Salvare account, provider e thread/message ID senza duplicare messaggi. Distinguere rimozione dal mondo dalla cancellazione sul provider. Dalla pagina conversazioni, aprire il grafo del mondo corrente focalizzato sul thread quando richiesto.
6. Aggiungere test con utenti, mondi, messaggi e fonti sintetiche; verificare errori e richieste concorrenti. Eseguire build, lint e suite di test previste. Provare manualmente le viste nel browser/Electron se l’ambiente disponibile lo permette.

## Concrete Steps

Dalla root del repository:

- `npm run graph:build` solo se la verifica dimostra che graphify-out/graph.json manca o è obsoleto.
- Implementazione e test circoscritti nei file del piano.
- `npm run build`, `npm run lint`, `npm test`.
- Se cambia backend/server.js: da backend/, `node --check server.js`.
- Eseguire i test di regressione documentati in tests/README.md se pertinenti.
- Esiti: `npm run build` PASS (warning bundle Vite ~511.93 kB); `npm run lint` PASS; `npm test` PASS (68 test); `node --check server.js` PASS; `npm run graph:build` PASS (2040 nodi, 3970 archi, 124 comunità); query Graphify mirata PASS; `git diff --check` PASS.

I test Gmail devono usare provider mock; non inviare messaggi reali. I test sui file devono usare directory temporanee e percorsi sintetici. Nessuna pulizia o migrazione deve puntare ai dati personali locali.

## Validation and Acceptance

- Un mondo può attivare/disattivare il proprio grafo senza modificare altri mondi; il grafico inattivo mostra stato chiaro e un’azione di configurazione.
- “View graph” su un pianeta inattivo apre i suoi dati senza cambiare l’ambiente corrente.
- Eventi, nodi, relazioni e cache sono sempre associati a utente e worldId; cambio pianeta e richieste obsolete non contaminano dati o UI.
- Reindicizzazione e sincronizzazioni sono idempotenti, con riferimenti e provenienza ai dati sorgente. Il limite dell’indicizzazione non viene presentato come copertura completa.
- Il grafo usa relazioni deterministiche e resta utilizzabile con AI disattivata.
- Email Conversations mostra i thread reali dell’account configurato nel pianeta, non dati di altri account.
- La risposta si collega allo stesso thread usando gli ID e header originali; l’ID del nuovo messaggio è distinto. Gli allegati mantengono controlli di percorso e dimensione.
- Bozze, risposte e associazioni a mondi diversi non inviano duplicati. “Remove from this planet” non cancella l’email Gmail.
- La stessa vista del grafo apre dal pianeta e dalla conversazione, con thread focus opzionale.
- La build, lint e test mirati passano; eventuali test falliti preesistenti o limiti di integrazione sono riportati separatamente.

## Idempotence and Recovery

- Ripetere l’indicizzazione non deve duplicare nodi/eventi o relazioni. Usa identificativi stabili della fonte e una chiave di deduplicazione; usa operationId per operazioni locali.
- Conservare i dati originali e non cancellare dati derivati alla disattivazione. Se una scrittura incompleta o una migrazione fallisce, mantenere la versione precedente e segnalare l’errore.
- Se un provider o una fonte è disconnesso, mantenere i dati derivati esistenti, segnare la sincronizzazione come parziale e consentire un nuovo tentativo dopo riconnessione.
- Per ritirare o recuperare modifiche durante il lavoro, usare diff mirati sui soli file della feature; mai resettare l’intera cartella di lavoro.

## Artifacts and Notes

- Questo ExecPlan.
- Test unitari e di integrazione con fixture sintetiche.
- Nessun invio Gmail reale e nessun dato personale incorporato nei test.

## Interfaces and Dependencies

- API autenticata per stato/attività del grafo e query paginata per worldId; verificare owner del mondo sul server.
- API Gmail esistente per thread, messaggi, dettagli, allegati, bozze e invio; estendere in modo compatibile il contratto di reply.
- Modello eventi versionato con userId, worldId, sourceType/sourceId, sourceItemId, operationId, timestamp, titolo/summary, sourceRef, dedupeKey e stato.
- Persistenza locale scoping per utente e mondo; scegliere il modulo effettivo dopo aver esaminato store e pratiche di scrittura atomica già presenti.
- Frontend: pannello impostazioni pianeta, WorldGrid, schermata Email Conversations e componente GraphView riutilizzabile.
- Non aggiungere librerie del grafo senza verificare prima dipendenze già installate e una breve prova di compatibilità.

## Revision Notes

- (2026-10-03) Creato il piano iniziale dopo ricognizione del repository e conferma che la feature attraversa UI, stato pianeta, servizi backend, persistenza e Gmail.
- (2026-10-03) Implementati grafo e vista conversazioni, condivisione esplicita dei riferimenti e verifiche automatizzate; restano le verifiche manuali documentate sopra.

