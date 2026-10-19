# Compact Dashboard, Planet Graph layout, and cartoon planets

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

La Dashboard mostra i suoi pulsanti di navigazione in una sola fila. Planet Graph presenta la consultazione locale a sinistra e il grafo più ampio a destra, senza i blocchi informativi richiesti da rimuovere; i dettagli d'indicizzazione si aprono soltanto su richiesta. Le illustrazioni dei pianeti hanno uno stile cartoon coerente, e il logo è allineato al titolo Fly to Another Planet.

## Progress

- [x] (2026-10-12) Letti il prompt confermato, le istruzioni del progetto, `PLANS.md`, gli skill di tracciabilità e patch, lo stato Git e le implementazioni UI interessate.
- [x] (2026-10-12) Analizzare i layout e definire gli owner per R1–R8; proteggere le modifiche preesistenti nei file target.
- [x] (2026-10-12) Implementare layout, toolbar, consultazione, pianeti e intestazione con owner Frontend; applicare una correzione mirata R1 dopo la review iniziale.
- [x] (2026-10-12) Eseguire build, lint, test pertinenti e review read-only; registrare i limiti della verifica visiva.

## Surprises & Discoveries

- La working tree era già modificata in tutti i file UI principali e contiene molte modifiche non correlate; i loro contenuti vanno preservati.
- `PlanetGraph.tsx` attualmente mostra sia `planetKnowledgeQuery` (query locale con citazioni/context) sia `planetGraphChat` (ricerca di etichette); il comportamento di consultazione utile va consolidato senza introdurre provider esterni.
- La toolbar di Planet Graph contiene già Type, Depth, Update knowledge e Indexing details; il controllo dei dettagli è mostrato quando esistono avvisi, con il pannello di dettaglio chiudibile.
- Il sorgente Planet Graph stampa header e blocchi `Authorized sources`, `Retained knowledge` e `Displayed nodes` da rimuovere dalla presentazione.
- Baseline dei test pertinenti con Node 24: 24/25 passano; `workspaceLayoutAndEmailPagination.test.mjs` ha già un test che si aspetta un’introduzione e istruzioni chat assenti dal componente attuale. Rivedere il criterio/test contro R5 dopo l’implementazione.
- Le regole CSS concatenate a fine `App.css` includono override più recenti: la navigazione Dashboard usa due righe nonostante l’override precedente a cinque colonne. Un test esistente asserisce esplicitamente quel vecchio layout e va aggiornato.
- Le azioni pausa/riprendi/annulla del job knowledge sono nel blocco `Retained knowledge`; rimuoverlo senza ricollocarle renderebbe un job già avviato incontrollabile.
- La baseline mirata ha 24 test superati su 25: l’unico errore preesistente è un’aspettativa di testo introduttivo che il componente attuale non contiene; i test della navigazione si aspettano inoltre la disposizione a due righe da sostituire con R1.
- La prima review ha rilevato che i pulsanti fissi da 128 px attivavano lo scroll anche su desktop. Il fix porta la larghezza minima equa a 76 px per pulsante, con una soglia di barra di 456 px, espandendoli in modo uniforme sopra la soglia e lasciando lo scroll locale al menu sotto soglia.
- La review mirata ha confermato R1 risolto: cinque pulsanti a larghezza equa, nessuno scroll se la barra dispone di almeno 456 px e overflow confinato al menu sotto soglia.
- Il controllo supplementare `backend/test/planetKnowledgeService.test.js` ha superato 3/5 casi; due hanno ricevuto `EPERM` sul rename atomico nella directory temporanea gestita dal sandbox. Nessun file backend è stato modificato per questo prompt.
- Verifica visuale non eseguita: non era disponibile una scheda browser/fixture locale autorizzata. Build e test del sorgente non provano la geometria renderizzata.

## Decision Log

- 2026-10-12, utente: su desktop il chatbot va a sinistra e il grafo a destra; il grafo è il pannello più ampio.
- 2026-10-12, utente: la famiglia dei pianeti deve avere stile cartoon.
- 2026-10-12, utente: `Indexing details` resta un controllo compatto che espande/richiude i dettagli.
- 2026-10-12, coordinatore: R5 conserva le API locali esistenti e vieta nuove chiamate a provider AI; R3 cambia la presentazione senza rimuovere conoscenza o configurazioni.
- 2026-10-12, Frontend: mantenere i comandi dei job attivi e i retry per-sorgente nella disclosure Indexing details, rendendoli disponibili soltanto quando applicabili.
- 2026-10-12, Frontend: usare illustrazioni SVG inline per le varianti planetarie esistenti, conservando gli ID invece di cambiare lo schema persistito.
- 2026-10-12, coordinatore: test pertinenti e piano restano a carico del coordinatore; i test vanno aggiornati alle nuove condizioni R1/R5 mantenendo la baseline identificata.
- 2026-10-12, Reviewer: R1 non soddisfatto con 128 px fissi, perché la larghezza desktop disponibile è circa 505 px; coordinatore richiede un solo fix mirato e nuova review secondo R8.
- 2026-10-12, Frontend: navigazione equa con 76 px minimi e crescita flessibile fino alla larghezza disponibile; sotto 456 px lo scroll resta interno a `.pageMenu`.
- 2026-10-12, Reviewer: la review mirata ha confermato la correzione R1 e non ha richiesto un altro fix.

## Outcomes & Retrospective

R1–R7 implementati nella UI. Il Reviewer ha richiesto un fix mirato per R1 (larghezza fissa dei pulsanti); la seconda review lo ha confermato risolto. Build, lint e i cinque file di test mirati passano (25/25). `git diff --check` non ha trovato errori di whitespace; sono rimasti solo avvisi di normalizzazione LF/CRLF. Un test backend supplementare ha avuto 2 errori `EPERM` nel rename atomico sotto Temp sandbox (3/5 superati), senza modifiche backend in questo task. Nessuna verifica visuale è stata possibile, quindi responsive e proporzioni sono verificati nel sorgente, non tramite screenshot o misure renderizzate. Nessun commit o push.

## Context and Orientation

Il frontend è React/TypeScript e gli stili principali sono in `src/App.css` e `src/worlds.css`. La navigazione Dashboard è montata in `src/App.tsx`; Planet Graph in `src/components/PlanetGraph.tsx`; la pagina di selezione pianeti in `src/components/ChangeWorld.tsx`. `src/worlds.ts` contiene gli identificativi persistiti degli stili: devono restare compatibili. Il branch corrente è `feature/desktop-foundation`; non creare commit o push.

## Plan of Work

1. Owner Frontend esamina i selettori CSS attivi e preserva gli override e le modifiche già presenti nei file target. Implementa R1 e R7 con stili circoscritti alle rispettive intestazioni.
2. Lo stesso owner riordina Planet Graph per R2–R5: consultazione knowledge a sinistra, grafo più ampio a destra; filtri in un solo punto; rimozione dei blocchi richiesti; dettagli d'indicizzazione richiudibili; un solo flusso locale con citazioni.
3. Owner Frontend adatta gli stili planetari per R6 mantenendo dimensioni, identificativi `rocky`/`asteroid`, preferenze e selezioni compatibili.
4. Coordinatore esegue le verifiche pertinenti e sintetizza evidenze per ciascun requisito. Reviewer ispeziona read-only i file cambiati e i risultati. È consentito un ciclo mirato di correzione/review.

## Concrete Steps

Directory di lavoro: `C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp`.

Comandi previsti dalla root: `npm run build`, `npm run lint`, i test Node pertinenti a Dashboard/Planet Graph/pianeti e `git diff --check`. Nessuna istanza Electron o server attivo viene riavviato. La prova visuale verrà eseguita solo se gli strumenti browser autorizzati sono disponibili.

## Validation and Acceptance

| ID | Criterio e responsabile | Evidenza finale | Stato |
|---|---|---|---|
| R1 | Navigazione Dashboard su una riga; Frontend | Regole CSS/test aggiornati e review mirata conferma crescita equa sopra 456 px e scroll locale sotto soglia | PASS (source review) |
| R2 | Consultazione a sinistra, grafo più largo a destra; Frontend | Test e selettori responsive verificati; geometria visiva non misurata | SOURCE CHECKED |
| R3 | Togliere pannelli e menu solo dalla UI; Frontend | Test sorgente conferma etichette/blocchi assenti; impostazioni e dati backend preservati | SOURCE CHECKED |
| R4 | Filtri/action distinti e dettagli richiudibili; Frontend | Test sorgente verifica toolbar unica e disclosure; retry e comandi job preservati | SOURCE CHECKED |
| R5 | Una query locale con citazioni/context; Frontend | Markup unico e `/knowledge/query`; suite mirata 25/25; backend supplementare 3/5 per errore sandbox | PASS (UI) |
| R6 | Stile cartoon con ID persistiti intatti; Frontend | Test controlla SVG per gli stili e gli ID `rocky`/`asteroid`; resa non verificata visivamente | SOURCE CHECKED |
| R7 | Logo/titolo allineati; Frontend | CSS responsive e build; allineamento visivo non verificato | SOURCE CHECKED |
| R8 | Build, lint, test, review e limiti dichiarati; Coordinatore + Reviewer | Build/lint/test pertinenti passano; review R1 risolta; verifica visiva non disponibile | PASS WITH VISUAL LIMIT |

- R1: una sola fila di pulsanti; su viewport stretti scorre soltanto la barra e nessun controllo è tagliato o sovrapposto.
- R2: su desktop chatbot a sinistra e grafo più ampio a destra; viewport stretto impilato senza overflow esterno.
- R3: menu di configurazione sorgenti, `Retained knowledge` e `Displayed nodes` assenti dalla UI; dati e impostazioni persistiti conservati.
- R4: Type, Depth, Source e Topic in una sola toolbar senza duplicati; Update knowledge chiaro; dettagli si aprono/chiudono da pulsante, senza contenitori nulli.
- R5: un solo pannello di domande usa il flusso locale esistente, mantiene citazioni/context e può portare ai nodi citati.
- R6: pianeti in stile cartoon coerente; identificativi e preferenze salvate restano leggibili.
- R7: logo/testo allineati senza deformazione, tagli o sovrapposizioni.
- R8: build, lint e test pertinenti con esito riportato; la verifica automatica non viene descritta come prova visiva.

## Idempotence and Recovery

Modifiche solo di presentazione e frontend. Non cambiare API, scope di sorgenti, persistenza o dati. Se un intervento UI crea una regressione, ripristinare soltanto le righe introdotte per quel criterio, preservando il contenuto preesistente e gli altri ID.

## Artifacts and Notes

La working tree iniziale era già dirty; le modifiche finali saranno distinte rispetto allo stato iniziale tramite il riepilogo del lavoro e il diff esaminato dal Reviewer.

## Interfaces and Dependencies

Interfacce esistenti: `planetKnowledgeQuery` e `askKnowledge` per risposte/citazioni/context; `planetGraphChat` e `askGraph` per ricerca locale delle etichette; `world.obsidian.sourceSelection` per configurazione delle sorgenti; `WorldPlanet` e `WorldPlanetStyle` per illustrazioni e preferenze. La UI può consolidare la consultazione, senza cambiare le route o chiamare provider esterni.

## Revision Notes

- 2026-10-12: creato e aggiornato il piano per il prompt UI approvato dall'utente, registrando owner, baseline test e decisioni emerse nel chiarimento.
- 2026-10-12: prima review ha identificato overflow desktop per i 128 px fissi; il fix ha ridotto la larghezza minima equa a 76 px e la review mirata ha confermato la correzione.
- 2026-10-12: completati build, lint, test mirati (25/25), review e registrazione del limite visuale; il test backend supplementare ha fallito 2 casi per `EPERM` sul rename in Temp sandbox.
