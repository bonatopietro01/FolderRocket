# ExecPlans per FolderRocket

Un ExecPlan è un documento operativo per una funzionalità complessa o un refactor significativo. Deve consentire a un agente privo della cronologia della chat, o a una persona nuova nel repository, di completare il lavoro e dimostrare che funziona. `AGENTS.md` stabilisce quando usarlo; ogni piano concreto vive in `docs/plans/<nome-breve>.md`.

## Come usare un ExecPlan

Prima di scrivere o eseguire un piano, leggere questo file per intero. Il coordinatore crea il documento, lo mantiene aggiornato a ogni tappa e assegna ai ruoli Frontend, Backend/Electron e Qualità/Graphify solo le parti indipendenti. Un solo agente modifica il piano; gli altri gli trasmettono prove, scoperte e decisioni. Se il lavoro cambia direzione, aggiornare prima il piano con il motivo.

Il piano deve essere autonomo e concreto. Aprire con il risultato visibile per l'utente, spiegare lo stato iniziale e i termini non comuni, nominare i file con percorsi relativi alla radice del repository e dare i comandi esatti dalla radice di FolderRocket. Descrivere cosa si deve osservare dopo ogni tappa. Non affidarsi a conversazioni precedenti, a un grafo non incluso nel piano o a documenti esterni per spiegare passaggi essenziali. I risultati di Graphify possono orientare il piano, ma riportare solo le relazioni pertinenti e confermate nei sorgenti.

Usare prosa chiara; le caselle di controllo servono nella sezione `Progress`. Quando un ExecPlan è salvato come file Markdown, scriverlo direttamente, senza racchiuderlo in una recinzione di codice. Lasciare una riga vuota dopo ogni titolo. Per comandi o brevi prove dentro il piano usare blocchi indentati. Ogni revisione deve lasciare il documento coerente e autosufficiente.

## Tappe, sicurezza e prove

Dividere il lavoro in tappe con un effetto verificabile. Per ogni tappa indicare risultato, file da modificare, comandi e criterio di accettazione osservabile. Se una libreria o un approccio è incerto, inserire una tappa di prova limitata con criteri per adottarla o scartarla. Se si mantiene temporaneamente un vecchio percorso accanto al nuovo, indicare come testare entrambi e quando ritirare quello vecchio.

Le istruzioni devono poter essere ripetute senza perdere dati. Spiegare come riprendere dopo un errore e prevedere una via di recupero per migrazioni o operazioni rischiose. Preservare le modifiche già presenti nella cartella di lavoro. Non creare commit o push senza richiesta dell'utente, anche quando il piano richiede molte tappe.

Includere verifiche proporzionate: test interessati, `npm run lint`, `npm test` e `npm run build` quando pertinenti. La build esegue anche TypeScript. Se cambia un comportamento visibile, descrivere come provarlo nell'interfaccia; se cambiano le prestazioni, misurare lo stesso scenario prima e dopo. Riportare output o diff brevi che dimostrino il risultato. Una compilazione riuscita, da sola, non prova un flusso reale dell'app.

## Struttura richiesta per ogni piano

Usare tutte le sezioni dello scheletro seguente. `Progress`, `Surprises & Discoveries`, `Decision Log` e `Outcomes & Retrospective` sono sezioni vive: aggiornarle dopo ogni tappa e prima di fermarsi. Registrare in `Progress` data e ora delle tappe completate e delle parti ancora aperte. In fondo al piano annotare ogni revisione sostanziale con il motivo.

```md
# <Risultato da realizzare>

Questo ExecPlan segue `PLANS.md`. È un documento vivo: avanzamento, scoperte, decisioni ed esito vengono aggiornati durante il lavoro.

## Purpose / Big Picture

Descrivere cosa potrà fare l'utente e come lo vedrà funzionare.

## Progress

- [ ] (AAAA-MM-GG HH:MMZ) Prima tappa, con risultato verificabile.
- [ ] (AAAA-MM-GG HH:MMZ) Seconda tappa; separare la parte completata da quella restante se necessario.

## Surprises & Discoveries

Annotare comportamento inatteso, bug o vincoli emersi, con una prova breve.

## Decision Log

Per ogni scelta importante indicare decisione, motivo, data e autore.

## Outcomes & Retrospective

Confrontare il risultato effettivo con lo scopo iniziale; indicare ciò che resta aperto.

## Context and Orientation

Spiegare lo stato iniziale, i moduli e i file coinvolti, i termini tecnici necessari e le assunzioni verificabili.

## Plan of Work

Descrivere in prosa le tappe e le modifiche, con percorsi e funzioni specifici. Ogni tappa deve essere verificabile da sola.

## Concrete Steps

Indicare la directory di lavoro, i comandi esatti e un breve esempio dell'output atteso. Aggiornare questa sezione quando cambiano i passi.

## Validation and Acceptance

Indicare test e verifica manuale appropriati. Formulare l'accettazione come comportamento osservabile, con input e output.

## Idempotence and Recovery

Spiegare come ripetere i passi in sicurezza e come recuperare dopo un errore.

## Artifacts and Notes

Conservare pochi output, log o estratti di diff che dimostrino il risultato.

## Interfaces and Dependencies

Nominare API, tipi, funzioni, librerie e dipendenze da creare o cambiare; specificare perché servono.

## Revision Notes

Data, modifica al piano e motivo.
```
