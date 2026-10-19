# Prompt migliorato: correzioni FolderRocket per pacchetti

Complessità: ALTA. Eseguire i pacchetti seguenti nell'ordine indicato, parallelizzando solo file e contratti indipendenti. Questo prompt conserva gli ID del primo allegato come A.R1–A.R4 e quelli del secondo come B.R1–B.R10. La suddivisione separa i difetti del backend dalle presentazioni UI e mantiene un solo writer per file.

## Contesto comune da includere in ogni pacchetto

Lavora sul checkout attivo di FolderRocket. Leggi `AGENTS.md`, `CODEX.md`, `PLANS.md`, `.codex/agents/README.md` e le fonti pertinenti. Controlla git status e conserva tutti i file modificati e non tracciati. Confronta i requisiti con il codice attuale e con `docs/plans/ui-header-planets-treerocket-graph-warnings-2026-10-09.md`: parti già implementate richiedono verifica attuale e correzione dei soli gap. Una voce storica completata non dimostra la geometria nel browser.

Il coordinatore mantiene un ExecPlan e il TaskState: ID originali, criteri, owner, file, dipendenze, stato, modifiche, evidenze e limiti. Usa i ruoli realmente richiamabili: Prompt Agent scrive il prompt in sola lettura; Architect esamina contratti e confini in sola lettura; Frontend/Backend implementano nei rispettivi file; Reviewer conclude in sola lettura. AppStarter e AIEngineer servono solo se emergono compiti propri di quei ruoli. Non ricreare agenti rimossi. I TOML configurano istruzioni, non provano l'effettivo dispatch. Assegna esplicitamente anche test, documentazione e asset; un solo writer per file. Correggi riferimenti di coordinamento obsoleti soltanto quando effettivamente trovati.

Conserva isolamento utente/pianeta/provider/account, ID stili, preferenze, colori, satellite AI, thread, sorgenti, selezioni e semantica copy/move. Non modificare dati personali, token o credenziali. Niente commit, push, installazione, distribuzione o riavvio dell'istanza attiva. Usa dati sintetici e una fixture separata. Graphify è facoltativo: consulta un indice pertinente e attuale, conferma nel sorgente; non generarlo senza necessità e autorizzazione.

## Prompt 1 — Contratti, account e indicizzazione (B.R1, B.R3, B.R9)

Architect ricostruisce il flusso selezione account → Dashboard → Conversation → Daily Jobs e selezioni → indicizzazione → snapshot → vault. Riporta contratti verificati e difetti riproducibili prima di assegnare Backend. Ogni pianeta usa il suo account esplicitamente selezionato; nessun fallback silenzioso al primo account o al pianeta precedente. Mostra identità effettiva, selezione assente o invalida e percorso di configurazione. Conserva migrazioni legacy solo se univoche. L'eventuale mittente recap separato dall'inbox deve essere dichiarato e limitato alle sorgenti configurate; il destinatario resta distinto. Non duplicare o revocare OAuth.

Per ogni sorgente del grafo identifica la causa: file/directory/profondità/nodi/archi, path, permessi, timeout, input o provider. Riproduci con fixture; non assumere dimensione e non nascondere l'avviso come soluzione. Riutilizza blocchi, paginazione e aggiornamenti incrementali presenti. Mantieni limiti espliciti e bounded scans, senza troncamenti silenziosi. Distingui limite globale da limite per sorgente, conserva cause multiple quando esistono, mostra stato completato/in corso/parziale/errore e progresso con totale sconosciuto esplicito.

Il fallimento di una sorgente non interrompe le altre. Retry della singola sorgente mantiene i dati validi; il grafo resta consultabile durante gli aggiornamenti. La deselezione esclude la sorgente dal prossimo snapshot. Grafo/vault condividono identificativi, selezioni e relazioni; applica la politica esistente alle note generate e proteggi quelle modificate manualmente. Se un limite necessario rimane, indica esattamente l'ambito omesso e come proseguire. Verifica due pianeti/account distinti e retry/fallimenti/selezioni con test sintetici.

## Prompt 2 — Conversation e contenuto MIME (B.R8, B.R9; dipende dai contratti del Prompt 1)

Mostra velocemente la lista e carica automaticamente una pagina limitata della conversazione scelta. Mantieni Load more, evita fetch completi di tutte le conversazioni e deduplica richieste ancora in corso, incluso polling. Cambi rapidi di pianeta/account/thread devono nascondere immediatamente dati precedenti e annullare o ignorare risposte obsolete, anche per ricerca, aggiunta, download e mutazioni. Eventuale cache deve essere bounded e separata per utente, pianeta, provider, account e conversazione.

Preferisci MIME text/plain, altrimenti estrai HTML in testo con paragrafi e ritorni a capo. Usa bolle con testo reale. Riconosci immagini inline, CID e allegati tramite metadati MIME e mantienili separati dal testo con azioni manuali di accesso. Gestisci anche immagini memorizzate direttamente nella parte MIME, senza attachmentId. Non caricare URL remoti automaticamente. Per email con sole immagini dichiara la mancanza di testo leggibile, senza fingere conversazione vuota. Le azioni devono usare il messaggio esatto dell'account autorizzato.

La ricerca presenta nome leggibile e indirizzo corretto; identità basata sull'indirizzo/account, senza fondere omonimi. Mantieni threadId e account provider. Verifica plain text, HTML, immagini inline, attachment, pagine successive, polling lento e rapidi cambi di contesto con test e fixture. Misura caricamento iniziale con stesso scenario prima/dopo; esplicita se manca baseline affidabile.

## Prompt 3 — Tree Rocket e Folder Management (A.R3, B.R5–B.R7)

Diagnostica Tree Rocket nel browser consentito prima di cambiare: bounding box, computed styles, antenati/flex/grid, height/min-height, overflow, zoom, trasformazioni, breakpoint e cascata completa. Lo screenshot utente è riferimento del difetto, non prova della build attuale. Consolida le regole concorrenti pertinenti; evita un altro override terminale o traslazione fissa. Mantieni logo/toolbar coerenti con Fly To Another Planet. Breadcrumb subito sotto toolbar, radice azzurra alta e centrata, figli ravvicinati e centrati, circa quattro colonne sulla finestra ampia e colonne adattive sulla stretta, tile uniformi. I figli scorrono internamente lasciando radice/controlli visibili. Collegamenti seguono nodi reali durante resize/zoom/scroll e non attraversano testi.

Nella card separa icona, titolo anche lungo, conteggi e azioni. See files vicino al conteggio apre sotto la cartella una tabella coerente: icona/nome, altre colonne solo utili, header leggibile, scroll interno, pagina progressiva, chiusura, loading/empty/error. Count e tabella descrivono gli stessi file diretti; niente nodi file nel grafo. See files non naviga e non aggiunge alla gestione. Mantieni Back/Roots, ricerca e Add to Folder Management.

Folder Management usa la stessa geometria delle colonne Name/Description/Path/azioni sia normale sia Reorder. Style sostituisce Insert path nello stesso slot, il drag handle resta nel proprio spazio, titoli/descrizioni/altezze non saltano. Mantieni nomi lunghi, ordine persistito, campi utilizzabili e niente overflow orizzontale involontario. Prova attivazioni ripetute, modifica stile/path e riordino.

Verifica 0/1/2/20 figli, nomi lunghi, file table aperta/chiusa, due larghezze, 85/90/100% se disponibili. Registra screenshot e misure. Build/test sorgente non provano geometria; dichiara ogni blocco senza aggirare policy o usare un browser alternativo.

## Prompt 4 — Grafica e navigazione (A.R1–A.R2, B.R2, B.R4; indipendente dai contratti backend)

Reference aggiornate sotto `C:/Users/bonat/AppData/Local/Temp/`: buco nero `codex-clipboard-41852bab-ffbd-42a4-b3aa-07d62addf333.png`; galassia `codex-clipboard-45126080-15fc-4dfd-adcd-720b818b1754.png`; blu `codex-clipboard-a3fdff29-2d00-4906-ad1c-fc33aebb3f52.png`; Saturno `codex-clipboard-eee80871-6141-4904-8bbd-10a9b896f7b8.png`; Tree `codex-clipboard-113c9272-baec-479b-9178-90b803427a9b.png`.

Buco nero: nucleo scuro, anelli sottili concentrici segmentati, senza glow. Galassia: spirale inclinata, nucleo luminoso, bracci blu; trasparenza esterna conserva highlights interni. Pianeta normale blu: superficie dettagliata, variazioni naturali e volume, niente rettangolo nero. Saturno: anelli proporzionati quasi orizzontali con fronte/retro della stessa geometria; crea illustrazione originale ispirata alla reference con watermark. Luminoso: sfera definita, sfumature e alone controllato, nessun overlap con nomi/pulsanti. Asset locali ottimizzati; stesso Planet per card, miniature, picker e transizione. Niente migrazioni di ID, colori o satellite.

Dashboard/Folder Management/File Studio/Applications/Daily Jobs e controlli equivalenti Fly/Tree/Graph: altezza comune, larghezza per etichetta, testi contenuti, icone riconoscibili, azzurro tenue coerente col +, active/hover/focus chiari. Logo centrato libero; controlli possono andare a capo. Analizza tutte le regole appNavigation/pageMenu/pageMenuItems, evita selettori ampi. Verifica finestra ampia/stretta e zoom salvato.

## Prompt 5 — Warning, verifica e review (A.R4, B.R10; dipende dai pacchetti modificati)

Mantieni un unico avviso compatto vicino ai controlli Graph; pannello con parzialità, sorgente, cause globali/locali, Retry solo ritentabile, stato/progresso, totale sconosciuto. Tastiera, focus, Escape, clic esterno e chiusura esplicita; dettagli lunghi scorrono entro viewport. Nessuna duplicazione durante polling e nessuna perdita dei record caricati. Esporre le diagnosi del Prompt 1 senza sostituirle con messaggi generici.

Test significativi per comportamenti modificati; niente test duplicati che replicano stringhe sorgente come prova runtime. Esegui build, lint, npm test e test helper pertinenti; se cambia server, node --check backend/server.js. Misura stessa sorgente sintetica grande e caricamento Conversation prima/dopo, metodo/risultati effettivi e baseline mancante esplicita. Reviewer read-only di tutti i file della sessione, massimo un fix/re-review. Chiudi ogni ID con evidenza o limite: separa sintetico, browser, Electron e provider reale. Conserva i fallimenti reali senza attribuirli all'ambiente senza prova.

## Copertura

| Originale | Pacchetto |
|---|---|
| A.R1 | 4 |
| A.R2 | 4 |
| A.R3 | 3 |
| A.R4 | 5 |
| B.R1 | Contesto + 1 |
| B.R2 | 4 |
| B.R3 | 1 |
| B.R4 | 4 |
| B.R5 | 3 |
| B.R6 | 3 |
| B.R7 | 3 |
| B.R8 | 2 |
| B.R9 | 1 + 2 |
| B.R10 | 5 |
