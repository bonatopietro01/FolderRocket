# Skill disponibili e flusso coordinato degli agenti FolderRocket

Questo ExecPlan segue PLANS.md. Riguarda configurazioni e documentazione del kit, senza modifiche al comportamento dell'app.

## Purpose / Big Picture

Il coordinatore carica le skill pertinenti, avvia i ruoli necessari e conserva requisiti ed evidenze fino alla review. Tutte le 14 skill sono accessibili ai sette ruoli entro scope e permessi, con invocazione implicita abilitata e trigger discriminanti.

Il follow-up del 13 ottobre rende il caricamento un gate obbligatorio a ogni invocazione: il ruolo legge le procedure selezionate prima del lavoro e restituisce `skill_usage`. Prompt Agent legge sempre writing-for-agents e grilling e controlla la frontiera prima di READY. La mappa in AGENTS.md distingue configurazioni dei ruoli, procedure e rimando legacy.

## Progress

- [x] 2026-10-12 20:37Z: inventario di 14 skill e sette TOML; baseline Git molto modificata preservata.
- [x] 2026-10-12 20:37Z: audit Architect in sola lettura.
- [x] 2026-10-12 20:37Z: routing/handoff centralizzati, puntatori condivisi nei ruoli, metadati coerenti e verifica allineata ad AGENTS.md.
- [x] 2026-10-12 20:37Z: parsing YAML/TOML, 35 link Markdown locali e sei riferimenti diretti alle skill, senza errori.
- [x] 2026-10-12 20:39Z: sette casi di routing esaminati dal Reviewer in sola lettura; APPROVED, nessun rilievo azionabile.
- [x] 2026-10-13 20:17Z: baseline del follow-up conservata byte per byte in `logs/agent-skill-activation-07e4faba/baseline.json`; Architect read-only ha definito il contratto R1-R5, integrato con R6 per la mappa dei percorsi.
- [x] 2026-10-13 20:17Z: gate obbligatorio nei sette TOML, nel catalogo e nei brief; Prompt Agent legge entrambe le procedure e controlla le decisioni prima del checkpoint. Hook aggiornato senza cambiare eventi, definizioni o trust.
- [x] 2026-10-13 20:17Z: 42/42 test di routing passati, sintassi Node valida, sette TOML validi con modello/sandbox invariati, 14 metadati implicit=true e nessun link locale rotto nei cinque README/istruzioni controllati.
- [x] 2026-10-13 20:17Z: prove reali con ruoli senza cronologia e senza nomi skill nel brief: Prompt Agent ha letto/applicato entrambe le procedure in un caso aperto e uno completo; Frontend ha letto/applicato investigate-first e codebase-design.
- [x] 2026-10-13 20:23:01Z: Reviewer finale read-only del follow-up: APPROVED, review STANDARD, nessun rilievo azionabile e nessun ciclo di correzione necessario.

## Surprises & Discoveries

Retro era esclusa dall'invocazione implicita. Quattro skill non avevano metadati UI. Gli elenchi dei TOML sembravano whitelist. README e owner subordinavano le verifiche a una richiesta separata, in conflitto con AGENTS.md. Handoff/retro presumevano uno strumento Skill inesistente: ora indicano la lettura del file. Python non ha PyYAML: usare js-yaml già installato nel progetto per YAML e tomllib del Python incluso per TOML. La creazione delle quattro cartelle agents ha richiesto esecuzione autorizzata oltre il sandbox; approvata automaticamente.

Follow-up: le policy implicit=true permettevano la scelta ma non definivano un gate di lettura prima del lavoro. Il vecchio hook riconosceva gia "fammi il prompt", ma mancavano varianti come "fai prompt per..." e "fammi un prompt" e poteva confondere una segnalazione che citava la frase con una richiesta. La prima esecuzione dei nuovi test ha trovato soltanto un'asserzione case-sensitive su "Do not execute"; la verifica ora ignora il case e la suite completa passa. Il sandbox ha bloccato il primo snapshot temporaneo; il backup e stato salvato in logs, ignorata da Git, e le scritture alle istruzioni protette sono state approvate automaticamente.

## Decision Log

- Coordinatore: usare i README esistenti come fonti uniche di routing e catalogo, con puntatori nei TOML e in AGENTS.md.
- Coordinatore: invocazione implicita abilitata per tutte le skill; retro/handoff intervengono sulla richiesta del relativo risultato e grilling sulle decisioni materiali aperte.
- Coordinatore: preservare modelli, sandbox e ownership, senza ricreare ruoli legacy.
- Coordinatore: verifiche proporzionate incluse nell'implementazione autorizzata; ruoli read-only restituiscono proposte/evidenze.
- 2026-10-13, coordinatore/Architect: fonte unica del protocollo obbligatorio in `.agents/skills/README.md`, puntatore vincolante nei sette TOML e gate del coordinatore su skill_usage; nessun precaricamento indiscriminato delle 14 procedure.
- 2026-10-13, coordinatore: Prompt Agent legge writing-for-agents e grilling a ogni incarico; il controllo della frontiera e sempre applicato, mentre le domande sono limitate alle decisioni materiali aperte. Nessuna domanda decorativa quando la fixture e completa.
- 2026-10-13, coordinatore: la mappa operativa in AGENTS.md indica `.codex/agents/*.toml` per i ruoli e `.agents/skills/*/SKILL.md` per le procedure; `.codex/skills/README.md` e solo compatibilita. Il pack upstream e provenienza/importazione, non una seconda fonte operativa a ogni task.

## Outcomes & Retrospective

Esito dell'audit precedente, 2026-10-12:

R1 soddisfatto nella configurazione: 14 frontmatter/metadati validi e riferimenti locali risolvibili. R2 soddisfatto: sette TOML con accesso comune e permessi/modelli preservati. R3 soddisfatto a livello delle istruzioni: sette casi derivati dal Reviewer senza conflitti. R4 soddisfatto: gate di verifica coerente con AGENTS.md e review APPROVED. Architect e Reviewer sono stati realmente chiamati per questo task; gli altri ruoli non sono stati eseguiti soltanto per validarli. I controlli statici e i casi di routing non dimostrano l'attivazione in una futura sessione; l'esposizione nel runtime resta distinta dai file validi.

Esito del follow-up, 2026-10-13: gate applicato alle configurazioni dei sette ruoli; due checkpoint Prompt Agent osservati con skill_usage reale e frontiera rispettivamente aperta/vuota; un checkpoint Frontend osservato con procedure pertinenti realmente lette/applicate. Routing sintetico 42/42. Nessuna prova universale di ogni combinazione ruolo/skill o del trust degli eventi hook nativi in una sessione nuova. Reviewer finale APPROVED: baseline dei 15 file distinta dalle altre modifiche, modelli e sandbox preservati, nessun rilievo azionabile.

## Context and Orientation

R1: 14 skill con metadati validi e riferimenti risolvibili. R2: sette TOML collegati al catalogo comune, con scope e permessi preservati. R3: dispatch, dipendenze, ownership e handoff verificabili. R4: verifiche coerenti con AGENTS.md. Il coordinatore è l'unico writer; Architect e Reviewer lavorano in sola lettura.

TaskState separato del follow-up `mandatory-skill-activation-2026-10-13`, con ID locali alla nuova richiesta: R1 gate automatico all'avvio dei sette ruoli; R2 letture obbligatorie e frontiera del Prompt Agent; R3 richieste italiane di prompt riconosciute senza scambiare citazioni/negazioni/report per richieste; R4 baseline, personalizzazioni e permessi preservati; R5 prove e review; R6 mappa dei percorsi. Il coordinatore resta unico writer e mantiene il registro; Architect propone contratti e Reviewer esamina in sola lettura.

## Plan of Work

Aggiornare .codex/skills/README.md e .codex/agents/README.md; inserire puntatori condivisi nei sette TOML. Adattare trigger e policy rilevanti, completare metadati mancanti e conservare risorse/provenienza. AGENTS.md attiva il router all'ingresso del task. requirement-traceability e lo schema del Prompt Agent conservano skill_usage e handoffs.

## Concrete Steps

Dalla radice, leggere gli entrypoint e i TOML. Dopo le modifiche caricare frontmatter/metadati con Node e js-yaml, i TOML con Python tomllib. Risolvere link Markdown locali e riferimenti nelle istruzioni; eseguire git diff --check. Il Reviewer valuta i file e casi rappresentativi.

## Validation and Acceptance

R1: 14 frontmatter validi, nomi unici e 14 policy allow_implicit_invocation=true. R2: sette TOML validi con puntatori al catalogo/flusso e sandbox/modelli preservati. R3: il Reviewer deriva dalle sole istruzioni percorsi coerenti per prompt-only, UI semplice, API/UI, diagnosi difficile, handoff read-only e retrospettiva. R4: assenza del vecchio gate separato sui test e nessuna scrittura richiesta ai ruoli read-only. Sono controlli del kit, non test dell'app o benchmark della pipeline.

## Idempotence and Recovery

Ripetere i controlli non modifica file. Preservare la baseline: per recuperare ripristinare soltanto le modifiche di questo task, senza reset/cleanup generale. Le fonti canoniche upstream e la configurazione personale restano fuori scope.

## Artifacts and Notes

Follow-up: snapshot `logs/agent-skill-activation-07e4faba/baseline.json` e patch preparata nello stesso percorso permettono al Reviewer di separare gli interventi attuali dallo stato Git molto dirty. Gli artefatti in logs sono locali e ignorati. I confronti TOML preservano name, model, model_reasoning_effort e sandbox_mode. Nessun codice applicativo, dato, provider, account o file reale modificato.

Skill del coordinatore: agent-configuration per la revisione minima dei ruoli, writing-for-agents per puntatori/gate, requirement-traceability per R1-R6 e handoff, grilling per il contratto della frontiera. Architect ha letto/applicato requirement-traceability, codebase-design, writing-for-agents e grilling. Prompt Agent ha riportato writing-for-agents e grilling APPLIED in entrambe le fixture; Frontend investigate-first e codebase-design APPLIED. OpenAI Docs ha verificato la distinzione tra invocazione implicita, lettura delle procedure e trust degli hook.

Audit Architect: confermati gap di accesso, routing e verifiche. Node/js-yaml: 14 frontmatter e 14 metadati validi, invocazione implicita consentita; 35 link locali e sei riferimenti diretti validi. Python/tomllib: sette ruoli validi con puntatori condivisi; modelli e sandbox preservati. git diff --check: nessun errore, soltanto avvisi LF/CRLF già presenti. La ricerca del vecchio gate trova soltanto l'esempio di documentazione sul flag e la condizione intenzionale del Prompt Agent. Nessun commit/push richiesto.

Review STANDARD: APPROVED, nessun rilievo azionabile. Casi esaminati: prompt chiaro senza implementazione; piccola modifica UI con review; UI/API con Architect e contratti condivisi; bug backend intermittente con indagine/diagnosi; handoff Architect con salvataggio del coordinatore; retrospettiva con proposte; prompt con decisioni materiali su privacy/fonti e grilling. Le conclusioni sono una review delle istruzioni, non un benchmark eseguito della pipeline.

## Interfaces and Dependencies

TaskState conserva requirement_coverage, work_packages, decisions, validation e blockers; skill_usage e handoffs sono campi facoltativi. Il runtime deve esporre skill/ruoli: i file configurano istruzioni, non un nuovo motore di esecuzione.

## Revision Notes

2026-10-12: piano iniziale e aggiornamento al routing, accesso e metadati.
2026-10-12: registrati parsing, riferimenti e review finale; nessun ciclo di correzione necessario.
2026-10-13: aggiunto il follow-up obbligatorio richiesto dall'utente, varianti del router e mappa dei percorsi; preservati audit precedente e baseline corrente.
2026-10-13: registrata review finale STANDARD/APPROVED; Reviewer ha letto/applicato requirement-traceability, verify-and-stop, writing-for-agents, codebase-design e grilling. R1-R6 soddisfatti entro i limiti di verifica dichiarati.
