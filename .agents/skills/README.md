# Skills

La fonte operativa delle procedure e questa cartella `.agents/skills`; gli agenti sono configurati separatamente in `.codex/agents/*.toml`. La [mappa canonica dei percorsi](../../AGENTS.md#canonical-paths-for-agents-and-skills) distingue ruoli, procedure e rimando legacy. Il pack upstream e una fonte di importazione/provenienza, non viene riletto a ogni incarico.

Questo progetto espone 14 skill locali. Codex le rileva da `.agents/skills`; sono selezionabili in base a nome e descrizione e richiamabili esplicitamente, per esempio con `$handoff` o «usa la skill handoff». La scoperta rende le procedure disponibili, ma non avvia gli agenti: il coordinatore applica il [flusso degli agenti](../../.codex/agents/README.md) e avvia i ruoli pertinenti.

## Accesso e attivazione

Ogni agente può leggere e applicare tutte le 14 skill compatibili con il proprio incarico. La tabella indica gli owner tipici, non una lista di accesso esclusiva. Architect, Reviewer e Prompt Agent restano in sola lettura: per una procedura che richiede scrittura consegnano testo, rilievi o proposta al coordinatore/owner autorizzato. AppStarter in modalità RUNNING mantiene l'analisi in sola lettura.

Quando l'utente nomina una skill, individua il relativo SKILL.md e leggilo prima di applicarla. Se il nome non compare nel catalogo del runtime, usa il percorso locale della tabella; se manca anche il file, segnala la dipendenza. Per la selezione implicita scegli solo le skill i cui trigger cambiano utilmente il lavoro corrente. Leggi il corpo e le risorse pertinenti con gli strumenti di file disponibili: non presupporre uno strumento chiamato Skill.

Nei task con più requisiti registra in TaskState `skill_usage` con nome, percorso letto e motivo. Il coordinatore comunica le attivazioni pertinenti all'utente e passa al destinatario gli stessi riferimenti. Una skill nominata viene usata nel proprio ambito: non è una richiesta di eseguire tutte le procedure del catalogo.

## Protocollo obbligatorio a ogni invocazione

Ogni ruolo invocato, prima di analisi, piano o implementazione, esegue questo protocollo senza aspettare che l'utente nomini le skill:

1. Legge questo catalogo e confronta l'incarico, i trigger e le istruzioni del ruolo.
2. Seleziona le procedure pertinenti; gli elenchi dei TOML sono esempi e tutte le 14 skill restano accessibili entro i permessi. Non carica l'intero catalogo di procedure.
3. Legge il `SKILL.md` locale di ogni skill selezionata e le risorse necessarie, quindi la applica nel proprio scope. Una lettura del solo catalogo o un nome nell'elenco non conta come attivazione della procedura.
4. Nel checkpoint/handoff restituisce `skill_usage` con nome, percorso effettivamente letto, trigger e stato `READ` o `APPLIED`. Una skill soltanto letta non viene dichiarata applicata. Se nessuna procedura e pertinente, esplicita il motivo; se una dipendenza necessaria manca, segnala il limite prima del lavoro dipendente.

Per ogni incarico del Prompt Agent sono obbligatorie le letture di [writing-for-agents](writing-for-agents/SKILL.md) e [grilling](grilling/SKILL.md), con applicazione del controllo della frontiera decisionale prima della stesura finale. Frontiera vuota: `READY`, senza domande decorative. Decisioni materiali ancora aperte: `DECISION_PENDING` e round gestiti dal coordinatore. I fatti reperibili nelle fonti sono compito degli agenti. Per prompt articolati aggiunge [requirement-traceability](requirement-traceability/SKILL.md).

Il coordinatore include il protocollo in ogni delega e verifica `skill_usage` prima di accettare il risultato; un checkpoint senza tale evidenza torna al ruolo per completare il gate. Le istruzioni funzionano anche senza hook: gli hook forniscono promemoria, non leggono procedure al posto dell'agente.

## Catalogo

| Skill | Quando usarla | Owner tipico e applicazione |
|---|---|---|
| [agent-configuration](agent-configuration/SKILL.md) | Creare o aggiornare istruzioni di un ruolo. | Coordinatore salva; gli altri ruoli possono preparare o revisionare la proposta. |
| [requirement-traceability](requirement-traceability/SKILL.md) | Conservare ID, criteri, ownership, dipendenze ed evidenze nei task articolati. | Tutti i ruoli coinvolti. |
| [project-graph-context](project-graph-context/SKILL.md) | Ricostruire relazioni rilevanti e verificarle nelle fonti correnti. | Ruoli che necessitano di contesto tra moduli. |
| [pipeline-benchmark](pipeline-benchmark/SKILL.md) | Definire casi, rubriche e confronti ripetibili per una pipeline. | Coordinatore o owner assegnato; non c'è un Evaluation Agent configurato. |
| [grilling](grilling/SKILL.md) | Richiesta di grilling o decisione sostanziale aperta che non emerge dai file. | Coordinatore, Prompt Agent o specialista; le domande agli utenti sono raccolte dal coordinatore. |
| [handoff](Handoff/SKILL.md) | Richiesta di passaggio a una nuova chat/agente o riepilogo per continuare. | Ogni ruolo prepara il contenuto; il coordinatore salva il documento se il mittente è read-only. |
| [writing-for-agents](writing-for-agents/SKILL.md) | Scrivere o aggiornare prompt, istruzioni di agenti e skill. | Ogni ruolo nel proprio incarico; i ruoli read-only restituiscono testo o review. |
| [codebase-design](codebase-design/SKILL.md) | Definire confini di moduli, interfacce e testabilità. | Architect, AppStarter, Backend, Frontend e AIEngineer. |
| [diagnosing-bugs](diagnosing-bugs/SKILL.md) | Diagnosticare regressioni difficili o intermittenti dopo aver raccolto prove. | Owner dell'area interessata. |
| [retro](retro/SKILL.md) | Richiesta di retrospettiva o miglioramenti del workflow. | Coordinatore o owner incaricato presenta proposte; l'applicazione richiede un task autorizzato. |
| [investigate-first](investigate-first/SKILL.md) | Raccogliere prove prima di modificare per una causa incerta. | Owner dell'area interessata. |
| [surgical-patch](surgical-patch/SKILL.md) | Correggere il punto responsabile limitando cambi collaterali. | Owner implementatore. |
| [safe-refactor](safe-refactor/SKILL.md) | Pianificare o attuare un riordino preservando comportamento e compatibilità. | AppStarter e owner autorizzati; Architect resta read-only. |
| [verify-and-stop](verify-and-stop/SKILL.md) | Controllare criteri richiesti e fermarsi al perimetro concordato. | Owner della verifica e Reviewer in sola lettura. |

## Integrazione FolderRocket

Le configurazioni di ruolo sono definite dai TOML in [agents](../../.codex/agents/README.md). Le skill rispettano scope e permessi del ruolo. La verifica pertinente fa parte di un'implementazione autorizzata secondo AGENTS.md; accessi a servizi esterni, invii, migrazioni, riavvio, deploy, commit e push seguono le autorizzazioni del task.

Per cause incerte inizia con investigate-first; usa diagnosing-bugs quando servono riproduzione e un ciclo di diagnosi per casi difficili, intermittenti o prestazioni. Per una correzione mirata usa surgical-patch; per un riordino richiesto che preserva il comportamento usa safe-refactor. Non caricare automaticamente entrambe le alternative. codebase-design e project-graph-context sono supporti quando interfacce o relazioni aiutano il task; verify-and-stop conclude la verifica pertinente.

Il Prompt Agent legge sempre grilling e applica il controllo della frontiera; i round di domande intervengono solo su decisioni materiali ancora aperte o su una richiesta esplicita di intervista. L'agente ricava prima i fatti dai file. Dopo una decisione già risolta riprende il lavoro autorizzato; non ripete domande per attivare la procedura. Handoff e retro si selezionano anche da frasi naturali che chiedono il loro risultato; la disponibilità implicita non le trasforma in un passaggio obbligatorio di ogni task.

pipeline-benchmark è una procedura soltanto. FolderRocket non configura un Evaluation Agent né un AgentOptimizer; quando una valutazione è richiesta, il coordinatore assegna esplicitamente l'ownership e raccoglie misure. Non dichiarare miglioramenti da esempi isolati.

Handoff mantiene il percorso con maiuscola già presente nel progetto. Ogni skill ha metadati `agents/openai.yaml` con `allow_implicit_invocation: true`. Il template `diagnosing-bugs/scripts/hitl-loop.template.sh` richiede Bash e va adattato prima di un eventuale uso. I ruoli read-only possono consultarlo, non eseguirne azioni di scrittura.

## Provenienza

Il Full_stack_pack è un'esportazione; la fonte canonica resta il repository PROMPT_AGENTI e le copie non si aggiornano automaticamente. Le copie locali mantengono le personalizzazioni FolderRocket. L'audit del 12 ottobre 2026 adatta invocazione, routing, handoff read-only e verifiche; i relativi dettagli sono nel [piano dell'audit](../../docs/plans/agent-skill-workflow-2026-10-12.md). Gli SHA-256 in [agents/README.md](../../.codex/agents/README.md) identificano le fonti fornite, non le copie locali successivamente adattate.

Le skills di origine esterna mantengono i riferimenti forniti dal pack a Matt Pocock e Caveman. Le risorse incluse comprendono DEEPENING.md e DESIGN-IT-TWICE.md per codebase-design, SKILL-MECHANICS.md per writing-for-agents e lo script Bash di diagnosing-bugs.
