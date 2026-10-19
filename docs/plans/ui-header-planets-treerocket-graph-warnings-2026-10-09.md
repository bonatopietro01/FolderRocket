# Header, stili dei pianeti, Tree Rocket e avvisi del grafo

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Rendere i controlli di navigazione leggibili senza coprire il marchio, migliorare gli stili planetari senza cambiare preferenze persistite, correggere la geometria Tree Rocket e raccogliere gli avvisi del Planet Graph in un unico controllo accessibile. Nessun dato, account, percorso o stato persistito va migrato.

## Progress

- [x] (2026-10-09 11:40Z) Letto l’allegato, le istruzioni di progetto, CODEX.md, PLANS.md e il brief Frontend; registrati i requisiti R1–R4.
- [x] (2026-10-09 11:40Z) Analisi read-only e diff iniziale: confermate le aree interessate e le modifiche locali preesistenti da preservare.
- [x] (2026-10-09 11:44Z) Ampliata la fixture sintetica a 0/1/2/20 cartelle, nomi lunghi e tipo radice corretto per Desktop; test fixture mirato passato (1/1).
- [x] (2026-10-09) Correzioni UI per R1–R4 completate; corretto inoltre un difetto di migrazione degli ID legacy `rocky`/`asteroid` rilevato dal Reviewer.
- [x] (2026-10-09) Build e lint passati; test mirati finali 23/23 e test API stili 1/1 passati; `git diff --check` pulito. Suite completa `npm test` non verde per errori di permessi temporanei e timeout ambiente.
- [x] (2026-10-09) Review finale indipendente in sola lettura; il finding sulla migrazione degli stili è stato verificato come risolto, senza ulteriori regressioni concrete rilevate.

## Surprises & Discoveries

- R1: il menu pagine ha regole concorrenti e una larghezza forzata fino a 620px; a viewport di 1366px può invadere la zona centrale del logo largo 390px. Le regole generiche `.appNavigation button` includono anche i controlli post-it, quindi la correzione deve essere circoscritta al menu pagine.
- R2: gli ID grafici persistiti e i colori utente sono già usati da più schermate. La prima implementazione riscriveva `rocky`/`asteroid` durante la normalizzazione; è stata corretta per conservare gli ID originali, mentre `rocky` riusa la resa blu di `planet`.
- R3: `.treeRocketWindow` è una colonna flex, ma il breadcrumb conserva `flex: 1 1 auto`, si espande lungo l’asse verticale e spinge radice e grafo in basso. Il body compete per l’altezza e il grafo aperto nasconde overflow. La card usa un pulsante assoluto sovrapposto alla riga meta in flusso normale, causando l’overlap di titolo e conteggi.
- R3: il browser integrato ha bloccato l’URL della fixture locale. Non sono ancora disponibili `getBoundingClientRect()`, stili calcolati o screenshot pre/post; non tentare di aggirare la policy con un altro browser, protocollo o CDP.
- R4: i retry e gli stati per sorgente sono già presenti, ma la lista delle sorgenti è sopra il grafo e le stesse cause aggregate/parziali compaiono come avvisi separati sotto il grafo.
- Il worktree contiene molte modifiche e file non tracciati precedenti a questo task. Nessuna di queste modifiche è stata ripristinata o riscritta fuori dai requisiti assegnati.

## Decision Log

- 2026-10-09, coordinatore: R1 limiterà gli stili ai pulsanti del menu pagine per non alterare il menu post-it.
- 2026-10-09, coordinatore: R2 mantiene ID, nomi, colori e satellite; si interviene solo sul rendering condiviso e sugli stili, senza migrazioni. La reference Saturno è solo una guida (watermark); la reference blu ha sfondo nero e non va incorporata come asset.
- 2026-10-09, coordinatore: R3 corregge la causa flex e la struttura a righe della card, non aggiunge un override terminale o una traslazione fissa.
- 2026-10-09, coordinatore: R4 usa i dati/retry esistenti e un solo disclosure per avvisi e stati rilevanti, senza notifiche duplicate dal polling.
- 2026-10-09, coordinatore: Graphify non viene rigenerato o interrogato; i componenti sono verificati direttamente nel sorgente. Le prove visive resteranno non verificate se il blocco browser persiste.

## Outcomes & Retrospective

- R1: i controlli di navigazione sono stati ridisegnati in modo compatto e azzurro, con regole circoscritte al menu delle pagine. Test statici e build passano; l’assenza effettiva di sovrapposizioni a zoom e viewport reali resta da confermare visivamente.
- R2: la resa planetaria è stata aggiornata nel componente condiviso, mantenendo satellite e dati persistiti. Test mirati confermano che gli ID legacy `rocky` e `asteroid` non vengono riscritti; il Reviewer ha controllato il fix senza trovare regressioni concrete.
- R3: fixture sintetica copre 0/1/2/20 cartelle, etichette lunghe e più file nei figli; test del contratto fixture passato. Il browser ha bloccato l’URL locale, quindi non sono disponibili screenshot, bounding box o misure post-fix: la geometria reale non è dichiarata verificata.
- R4: avvisi di indicizzazione e stati delle sorgenti sono consolidati in un pannello accessibile con dettagli e retry specifico; test del pannello/retry e test mirati passano.
- `npm run build` e `npm run lint` passano. I test mirati finali passano 23/23 e la verifica API per gli stili passa 1/1. `npm test` completo resta non verde per `EPERM` su operazioni di rename/symlink nelle directory temporanee sandbox e timeout di avvio backend; non si attribuiscono tali errori a questo intervento senza evidenze.
- `git diff --check` non segnala whitespace error; Git ha emesso solo avvisi CRLF/LF per file già modificati.
- Non sono stati creati commit/push, né installate o riavviate versioni dell’app. Tutte le modifiche locali preesistenti sono state lasciate intatte.

## Context and Orientation

Il progetto usa React/TypeScript/Vite. Le aree di questo intervento sono `src/App.tsx` e `src/App.css` per il menu Dashboard; `src/components/ChangeWorld.tsx`, `src/worlds.ts` e `src/worlds.css` per la grafica dei pianeti; `src/components/TreeRocket.tsx` e gli stili locali in `src/App.css` per la gerarchia cartelle; `src/components/PlanetGraph.tsx` e `src/App.css` per gli avvisi; `tests/ui/tree-rocket-smoke.tsx` e `tests/README.md` per la fixture con dati inventati.

TaskState:

| ID | Criterio osservabile | Aree | Owner | Stato / evidenza |
|---|---|---|---|---|
| R1 | Nessun overlap tra menu e logo su larghezze/zoom richiesti; etichette e target leggibili, stile coerente col `+`. | App header/navigation CSS | Frontend | Correzione CSS/markup e controlli automatizzati; screenshot runtime non disponibile, quindi geometria non confermata. |
| R2 | Ringed con anello fronte/retro coerente; pianeta normale blu dettagliato senza rettangolo; glowing distinto e controllato; dati persistiti invariati. | ChangeWorld, worlds.ts, worlds.css | Frontend | Test componenti/API e Reviewer confermano che gli ID legacy non vengono migrati; prova visuale non disponibile. |
| R3 | Radice subito sotto breadcrumb; card non sovrapposte; griglia centrata e scorrevole; solo cartelle come nodi; See files espone la tabella. | TreeRocket, App.css, UI fixture | Frontend + coordinatore test | Fixture e test contratto passano su conteggi sintetici; misure browser richieste ma bloccate dalla policy. |
| R4 | Un unico avviso compatto apre dettagli accessibili, causa/sorgente/progresso chiari e Retry solo quando valido. | PlanetGraph, App.css | Frontend | Test statici del disclosure e retry passano; non eseguita verifica interattiva nel browser. |

Le configurazioni `.codex/agents/*.toml` sono istruzioni del progetto, non prova di disponibilità runtime. È stato richiesto il ruolo `analyzer`, non disponibile in questa sessione; la discovery read-only è stata svolta dal ruolo Explorer leggendo `.codex/agents/architect.toml`. Per il codice si usa il Worker seguendo `.codex/agents/frontend.toml`; Reviewer resta indipendente e read-only.

## Plan of Work

Il Frontend owner ha modificato i sorgenti UI dei requisiti. Il coordinatore ha ampliato la fixture fittizia a 20 cartelle e nomi lunghi, eseguito i controlli e integrato il fix circoscritto al difetto concreto segnalato dal Reviewer. La parte R3 runtime resta esplicitamente non verificata: la policy impedisce misure e screenshot nel browser.

R1 usa il pattern azzurrino del pulsante `+`, dimensioni compatte e un menu che può andare a capo restando separato dal logo. R2 continua a renderizzare tutti gli stili con il componente condiviso e controlla anche le miniature. R3 rende breadcrumb e toolbar non flessibili in verticale e assegna l’area espandibile con `min-height:0` al body; le righe di nome, conteggi/See files e azioni non si sovrappongono. R4 colloca l’aggregato e gli stati source in un solo pannello controllabile, mantenendo le funzioni di retry e polling.

## Concrete Steps

Dalla root:

    npm run build
    npm run lint
    npm test

Per la fixture sintetica, `tests/README.md` documenta `npm run dev` e `/tests/ui/tree-rocket-smoke.html`. La policy browser ha negato la navigazione verso l’URL locale e vieta tentativi di aggiramento: non avviare altri browser o protocolli. Se la policy cambia, raccogliere prima/dopo screenshot e bounding box a 85%, 90%, 100%, almeno due larghezze, e con 0, 1, 2 e 20 cartelle.

## Validation and Acceptance

- R1: test/build/lint più verifica screenshot sulle finestre/zoom richiesti; l’accettazione geometrica richiede separazione visiva reale tra logo e pulsanti.
- R2: build, test per identificativi/componenti e verifica visiva di card, miniature e satelliti; controllare in particolare continuità delle due metà dell’anello e trasparenza del pianeta blu.
- R3: fixture 0/1/2/20 cartelle, nomi lunghi, See files aperto/chiuso, viewport ampio/stretto; misurare breadcrumb, root, stage, child e card. Se il browser resta bloccato, riportare solo build e test e lasciare misure/screenshot come non effettuati.
- R4: verificare stato partial, limite aggregato, sorgente singola non indicizzabile, retry in corso, Escape, click esterno e focus da tastiera. Le sorgenti completate devono restare visibili durante i retry.
- Eseguire i comandi root `npm run build`, `npm run lint`, `npm test`, e i test sorgente pertinenti documentati. Nessun controllo automatico equivale a prova visuale.

## Idempotence and Recovery

Le modifiche sono presentazionali e non richiedono migrazioni o scritture a dati utente. Non ripristinare file già modificati; se una prova della fixture fallisce, isolare il difetto con i dati sintetici e mantenere le modifiche preesistenti. Un rollback deve riguardare solo gli hunk aggiunti per R1–R4, mai l’intero file o worktree.

## Artifacts and Notes

- Allegato requisiti originale: `C:\Users\bonat\.codex\attachments\1ecaf1cf-e4d6-4d2f-adea-ec8d70024599\Testo incollato.txt`.
- Screenshot TreeRocket di riferimento: `C:\Users\bonat\AppData\Local\Temp\codex-clipboard-f515d80e-dcd8-4bd2-bdc6-a1c28f334f9f.png`.
- Reference Saturno e pianeta blu: `C:\Users\bonat\AppData\Local\Temp\codex-clipboard-e11eb897-65ad-4050-a37b-2ec82d97ed44.png`; `C:\Users\bonat\AppData\Local\Temp\codex-clipboard-7d6a3c1b-c32a-4d31-b954-454b6eec8faa.png`.
- Nessuno screenshot pre/post del browser è stato creato; la fixture è stata tentata ma bloccata dalla policy locale del browser.

## Interfaces and Dependencies

Non sono previste nuove dipendenze, API o tipi persistiti. Si riutilizzano la mappa degli stili in `worlds.ts`, il componente planetario condiviso, il retry esistente in `PlanetGraph.tsx`, la lista sorgenti e il polling già implementato. La fixture resta deterministica e usa soltanto dati inventati.

## Revision Notes

- 2026-10-09 11:40Z — Creato il piano dopo analisi iniziale R1–R4 e identificazione dei limiti della verifica UI locale.
- 2026-10-09 — Completati R1–R4, aggiornati test fixture e regressione, corretta la preservazione degli ID legacy dopo finding Reviewer; build/lint/test mirati e review conclusi. Suite completa e verifica visiva restano limitate dall’ambiente.
