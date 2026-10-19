# FolderRocket — correggere View graph e apertura del vault Obsidian

Analizza e correggi gli errori osservati aprendo **View graph** e il vault Obsidian del pianeta. Prima leggi `AGENTS.md` e individua i componenti, i servizi e i test coinvolti. Riutilizza la logica esistente e conserva dati, account e note dell’utente. Non creare commit o push.

## 1. Crash di View graph

Il rapporto diagnostico del 4 ottobre 2026 contiene errori React ripetuti: `Cannot read properties of undefined (reading 'x')`. Nel codice attuale di `src/components/PlanetGraph.tsx`, `positionNodes` assegna coordinate soltanto ai primi 900 nodi di ciascun anello, mentre `visibleNodes` può includere 1.200 nodi. Il rendering usa `positions.get(node.id)!` e legge le coordinate senza verificare che esistano.

Correggi questa incoerenza: ogni nodo effettivamente visualizzato deve ricevere coordinate valide. Gestisci anche più nodi di tipo `world`, attualmente posizionati soltanto per il primo elemento. Aggiungi una protezione nel rendering per eventuali coordinate mancanti, senza limitarti a nascondere i nodi che oggi provocano il crash. Mantieni ricerca, selezione, collegamenti, zoom, trascinamento e isolamento tra pianeti.

Aggiungi una regressione con almeno 1.200 nodi dello stesso tipo, verificando coordinate finite per tutti i nodi visibili, più nodi world e assenza di crash durante ricerca e aggiornamento del grafo.

## 2. Conversazioni Gmail e sincronizzazione

In `backend/server.js` è importata `listInboxThreads`, ma tre flussi richiamano `listGmailInboxThreads`: sincronizzazione Obsidian, indicizzazione del grafo e lista delle conversazioni. Il rapporto registra `listGmailInboxThreads is not defined`.

Allinea l’import e le chiamate all’esportazione reale di `backend/services/gmailService.js`, usando un alias coerente se necessario. Verifica tutte e tre le route con un provider simulato: devono recuperare i thread dell’account del pianeta corretto. Non inviare email reali per i test. Un errore del provider deve produrre uno stato comprensibile; una sincronizzazione parziale deve indicare quali fonti sono state saltate.

## 3. Vault esistente e apertura in Obsidian

Nel vault gestito del pianeta Lavoro sono stati trovati 2.000 file Markdown nella sottocartella `FolderRocket`. Questo conferma la presenza delle note sul disco, ma non conferma che siano complete o che Obsidian stia mostrando quel vault.

Verifica creazione, sincronizzazione e apertura del vault esistente. Non rigenerarlo distruttivamente e non cancellare o sovrascrivere note modificate manualmente. Controlla che il percorso appartenga al pianeta e all’utente corretti e che lo stato mostrato rifletta il risultato reale della sincronizzazione.

Il successo di `shell.openExternal` indica soltanto che il comando è stato passato al sistema: non presentarlo come prova che Obsidian abbia aperto il vault. Consulta la documentazione ufficiale degli Obsidian URI e gestisci chiaramente il primo accesso, quando può essere necessario usare **Open folder as vault**. Mostra il percorso copiabile e istruzioni brevi, senza modificare silenziosamente i file di configurazione di Obsidian.

Distingui chiaramente **View graph**, che apre il grafo interno di FolderRocket, da **Open in Obsidian**, che apre l’app Obsidian. Non introdurre in questa correzione un’interfaccia Obsidian incorporata o un nuovo lettore di note non richiesto.

## 4. Avvisi Gmail e Google Calendar

Il rapporto contiene anche richieste Gmail e Google Calendar terminate con HTTP 400 e messaggio `fetch failed`. Indaga separatamente richieste, configurazione di rete, risposte e gestione degli errori. Non attribuire automaticamente il problema a token o credenziali. Correggi soltanto cause confermate e preserva le connessioni esistenti.

Se si tratta di indisponibilità temporanea, mantieni utilizzabile l’interfaccia e mostra un errore locale con possibilità di riprovare. Conserva identificativi di correlazione e dettagli diagnostici utili, oscurando credenziali e dati privati. Non usare contenuti email o documenti in servizi AI durante l’indagine.

## 5. Verifiche e consegna

Usa Graphify con poche query pertinenti, se disponibile e aggiornato, confermando le relazioni nei sorgenti. Per interventi significativi segui le regole di aggiornamento del grafo in `AGENTS.md`.

La baseline comprende 10 test mirati passati, che non coprono il difetto di layout né il nome errato della funzione Gmail. Aggiungi test significativi per questi difetti, con directory temporanee e provider simulati. Esegui:

- `node --test backend/test/planetGraphAndConversation.test.js backend/test/obsidianAndWorldSettings.test.js` e i nuovi test pertinenti;
- `npm run build`, che include TypeScript;
- `npm run lint`;
- `npm test`;
- `node --check server.js` dalla cartella `backend/`.

Se possibile, verifica visivamente View graph con molti nodi, ricerca e ricaricamento, oltre all’apertura del vault esistente in Obsidian. Distingui prove simulate, verifiche locali e test con account reali. Nel riepilogo indica cause confermate, correzioni, controlli eseguiti e limiti ancora aperti. Non dichiarare risolti gli avvisi di rete se non ne hai verificato la causa.
