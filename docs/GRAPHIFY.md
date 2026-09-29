# Graphify per il codice di FolderRocket

Questa integrazione crea un grafo **di analisi del codice**, non una nuova funzione
dell'app installata. Non modifica frontend, backend, file utente o configurazioni AI.
Il comando usa solo il codice sorgente (`--code-only`); l'analisi AST e locale e
non richiede API key. I risultati restano in `graphify-out/`, esclusa da Git.

## Prima configurazione (Windows)

Installa `uv` se non e gia disponibile, seguendo la sua documentazione ufficiale.
Poi installa **Graphify-Labs/graphify** dal pacchetto ufficiale `graphifyy`
(doppia `y`; il comando eseguibile si chiama `graphify`):

```powershell
uv tool install graphifyy
graphify --version
```

Il comando di analisi non installa skill, hook Git, estensioni di Codex o servizi.
Queste integrazioni sono opzionali e vanno valutate separatamente prima di
attivarle, perche modificano il comportamento dell'ambiente di sviluppo.

## Generare e consultare il grafo

Dalla radice di FolderRocket:

```powershell
npm run graph:build
```

Graphify legge il repository rispettando `.gitignore` e `.graphifyignore`, ma il
comando forza anche `--code-only` per evitare l'estrazione semantica di documenti,
PDF e immagini. Lo script esegue **sia** `extract` **sia** `export html`: il primo
produce `graphify-out/graph.json`, il secondo `graphify-out/graph.html`. Apri
quest'ultimo nel browser per la mappa interattiva. `graphify-out/GRAPH_REPORT.md`
non e prodotto dall'estrazione code-only; richiede un passaggio separato di
`cluster-only`, quindi non e necessario per consultare il grafo. I file generati
possono contenere nomi, percorsi, struttura e frammenti del codice: non
condividerli senza revisarli.

Esempi, dopo aver generato il grafo:

```powershell
graphify query "Come si collega il frontend alle route del backend?"
graphify explain "server"
graphify path "App" "server"
```

I nomi dei nodi dipendono dal risultato: se `path` non trova un nodo, cercane il
nome esatto in `graph.html` o con `query`. Il grafo mostra relazioni statiche;
non dimostra che un flusso funzioni a runtime. Verifica sempre le conclusioni
nel codice e con i test.

## Quando rigenerarlo

Esegui `npm run graph:build` dopo modifiche importanti o prima di un refactor.
Il comando non e collegato a build, avvio dell'app, commit o push. Il primo avvio
richiede Graphify installato nel PATH; se manca, lo script termina con un
messaggio e non cambia il progetto.

Fonti: [Graphify ufficiale](https://github.com/Graphify-Labs/graphify),
[installazione di uv](https://docs.astral.sh/uv/getting-started/installation/).
