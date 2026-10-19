# Applications, Tree Rocket, planet settings, and email pagination

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Completare il seguito UI richiesto: Applications usa l'area disponibile senza scrolling della pagina esterna; i controlli Tree Rocket restano compatti e allineati; le sezioni di personalizzazione del pianeta si possono comprimere senza perdere modifiche; Planet Graph presenta le istruzioni della chat in una fascia compatta; le conversazioni Gmail si aprono subito e caricano dati a pagine limitate.

## Progress

- [x] (2026-10-04 15:05Z) Riletti `AGENTS.md`, `CODEX.md`, `PLANS.md`, piano precedente e stato locale; verificato che il piano precedente resta intatto.
- [x] (2026-10-04) Correggere e testare i layout Applications, Tree Rocket, Change World e Planet Graph.
- [x] (2026-10-04) Limitare il recupero Gmail a batch iniziali e pagine esplicite di messaggi/conversazioni; verificare account, pianeta e richieste obsolete.
- [x] (2026-10-04) Eseguire build, lint, test mirati e test backend; aggiornare esito e limiti.

## Surprises & Discoveries

- Gmail thread detail precedentemente chiamava `getGmailThread` e recuperava la risposta `format=full`, che contiene tutti i messaggi del thread. Il servizio non espone paginazione nativa dei messaggi: l'implementazione usa `format=metadata` per gli ID e recupera `format=full` soltanto per i messaggi della pagina richiesta.
- L'endpoint `graph/chats` già pagina l'inbox Gmail fino a 100 messaggi per pagina, ma fa richieste metadata per tutti i 100 prima di deduplicare i mittenti. La richiesta di iniziare dalle ultime 20 email richiede limitare la pagina iniziale a 20.
- Applications ha `min-height` ma nessuna altezza vincolata del viewport; il documento esterno può crescere con la griglia.
- Change World ha il pannello Sources già nativo `<details>`, ma sezioni account, Obsidian, agenti, skill, digest e permessi restano sempre espanse.

## Decision Log

- (2026-10-04) Mantenere la paginazione Gmail per ID messaggio sullo stesso thread; non usare il conteggio del thread come proxy del numero di messaggi già caricati.
- (2026-10-04) Mantenere l'ordinamento cronologico crescente nel batch mostrato e chiedere esplicitamente altri messaggi precedenti.
- (2026-10-04) Non aggiungere supporto Outlook per conversazioni: il provider attuale dichiara le thread conversation non supportate.

## Outcomes & Retrospective

Applications ora usa l'altezza disponibile della finestra e mantiene lo scrolling nei contenitori interni; Tree Rocket usa una riga responsiva per Browse, Folder/Apps e ricerca; le sezioni del personalizzatore restano montate mentre vengono compresse; Planet Graph presenta titolo e testo richiesto in una fascia introduttiva compatta.

Add chat limita la lista Gmail iniziale a 20 email inbox e supporta altre pagine e ricerca. La selezione apre subito il thread. I corpi dei messaggi vengono caricati in pagine applicative da 10 e si possono richiedere messaggi precedenti; token di generazione e remount per pianeta impediscono che risposte obsolete aggiornino un ambiente diverso. Outlook rimane esplicitamente non supportato per questa vista.

Verifiche finali: `npm run build` superato (warning sul chunk principale >500 kB); `npm run lint` superato; i test mirati UI/Gmail passano (5/5, inclusa la paginazione dei corpi Gmail); `node --check server.js` superato; `git diff --check` senza errori di whitespace (solo avvisi Git CRLF/LF). Una prima esecuzione completa di `npm test` ha avuto un singolo fallimento transitorio in `backend/test/backendLifecycle.test.js` (attesa del completamento dell'indicizzazione); il test isolato è poi passato e una seconda esecuzione completa è passata (87/87). Non è stata effettuata una prova live Gmail né una verifica visiva manuale.

Limite API Gmail: `threads.get(format=metadata)` restituisce gli ID e metadata di tutti i messaggi del thread, senza cursore di paginazione; il servizio ordina gli ID per data e recupera i corpi `format=full` soltanto per il batch richiesto. Il trasferimento dei corpi è limitato, ma i metadata restano proporzionali alla lunghezza del thread. Non è stata effettuata una prova live Gmail né una verifica visiva manuale.

## Context and Orientation

Il frontend è React/TypeScript. `src/App.tsx` monta Applications dentro `applicationsView`; `src/components/ApplicationsWorkspace.tsx` contiene griglia e filtri. `src/components/TreeRocket.tsx` presenta Browse, modalità computer/desktop, schede Folder/Apps e ricerca. `src/components/ChangeWorld.tsx` contiene l'editor del pianeta e i pannelli di configurazione. `src/components/PlanetGraph.tsx` contiene fascia chat e conversazioni selezionate. `src/components/EmailConversations.tsx` visualizza thread e modale Add chat. `backend/server.js` espone le route e `backend/services/gmailService.js` parla con Gmail.

## Plan of Work

1. Dare ad Applications una catena di altezza viewport `min-height:0`/`overflow:hidden`; lasciare liste e griglia con scrolling interno e verificare la pagina su viewport bassi.
2. Allineare Tree Rocket Browse e select computer/desktop, schede e ricerca alla stessa altezza, con wrap responsivo.
3. Rendere espandibili sezioni account, Obsidian, agenti, skill, digest e permessi in Change World, mantenendo i controlli nel DOM e i valori di editing.
4. Accorpare la fascia introduttiva di Planet Graph e fare della chat/storico un'area interna con altezza vincolata.
5. Limitare Add chat a 20 messaggi inbox per pagina iniziale, con pagine ulteriori e ricerca Gmail paginabile; selezione idempotente apre la thread automaticamente.
6. Aggiungere `maxResults`/`pageToken` al caricamento thread Gmail, recuperando metadati ID e dettagli completi solo per un piccolo batch. La route e il client espongono cursore e stato has-more; azioni reply continuano ad avere i metadati più recenti necessari.

## Concrete Steps

Dalla root:

    npm run build
    npm run lint
    npm test
    node --test backend/test/planetGraphAndConversation.test.js backend/test/emailConversationSelectionService.test.js

Se `backend/server.js` cambia, da `backend/`:

    node --check server.js

## Validation and Acceptance

- Applications non espande il body; griglia, ricerca, modal e ultimi risultati restano raggiungibili tramite i rispettivi contenitori.
- Browse, root mode, Folder/Apps e Search hanno medesima altezza e nessun valore persistito cambia.
- Ogni sezione Change World apre/chiude con tastiera e conserva un draft unsaved fino a Salva/Annulla.
- Planet Graph mostra titolo e tre righe di testo richiesta, senza ripeterle nello stato vuoto.
- Add chat carica inizialmente al massimo 20 messaggi inbox; un thread selezionato è immediatamente aperto.
- Dettagli thread caricano solo batch limitati, sono cronologici e `Load more` ottiene i precedenti senza ricaricare tutto il contenuto.
- Cambi di pianeta/thread non mostrano risposte obsolete e thread identiche non vengono duplicate.

## Idempotence and Recovery

Le nuove route riusano l'account Gmail selezionato per il pianeta, non cambiano credenziali o selezioni salvate e non inviano email. I test Gmail sono mock. Se la paginazione per ID non è supportata dalla risposta provider, esporre il limite senza scaricare l'intero thread come fallback silenzioso.

## Artifacts and Notes

Usare fixture e dati sintetici; non registrare account, corpi email reali, token o percorsi personali.

## Interfaces and Dependencies

Riutilizzare Gmail API `threads.get(format=metadata)` per gli ID e `messages.get(format=full)` solo per il batch corrente, con `pageToken`/offset applicativo verificando i limiti dell'API. Nessuna nuova dipendenza.

## Revision Notes

- (2026-10-04) Creato un piano distinto per il seguito; non riscrive né ripete il piano precedente.
