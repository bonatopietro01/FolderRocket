// Carica le variabili presenti nel file backend/.env
require("dotenv").config();


// Importa la libreria OpenAI già installata nel backend
const OpenAI = require("openai");


// Crea il collegamento con OpenAI usando la stessa API key
// già utilizzata dal tuo analyzer.js
function getClient() {
    const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
    return apiKey ? new OpenAI({apiKey}) : null;
}


/**
 * Analizza il nome e il contenuto di un file
 * per cercare una vera data di scadenza.
 *
 * @param {string} fileName Nome del file
 * @param {string} content Testo estratto dal documento
 *
 * @returns {{
 *   expirationDate: string | null,
 *   source: "filename" | "content" | null,
 *   reason: string
 * }}
 */
async function analyzeDeadline(
    fileName,
    content
) {

    const client = getClient();
    if (!client) {
        return {expirationDate: null, source: null, reason: "AI deadline analysis is not configured"};
    }

    try {

        /*
            Evita che content sia null.

            Alcuni PDF non leggibili possono infatti
            restituire null oppure una stringa vuota.
        */

        const safeContent =
            typeof content === "string"
                ? content
                : "";


        /*
            Limita la quantità di testo inviata all'AI.

            In questo modo evitiamo di mandare documenti
            eccessivamente lunghi e riduciamo il costo API.
        */

        const limitedContent =
            safeContent.slice(
                0,
                20000
            );


        const response =
            await client.chat.completions.create({

                // Usiamo lo stesso modello leggero
                // già usato nel progetto
                model:
                    "gpt-4o-mini",


                // Mantiene la risposta il più stabile possibile
                temperature:
                    0,


                /*
                    Chiede al modello di produrre
                    un oggetto JSON valido.
                */

                response_format: {

                    type:
                        "json_object"

                },


                messages: [

                    {

                        role:
                            "system",

                        content:
                        `
                        Sei un sistema specializzato
                        nell'analisi delle scadenze
                        presenti nei documenti.

                        Devi analizzare:
                        1. il nome del file;
                        2. il testo contenuto nel file.

                        Cerca una vera data collegata a:
                        - scadenza;
                        - termine;
                        - validità;
                        - rinnovo;
                        - pagamento;
                        - consegna;
                        - expiration date;
                        - expiry date;
                        - due date;
                        - valid until;
                        - deadline.

                        Non considerare automaticamente
                        come scadenza:
                        - la data di creazione;
                        - la data di emissione;
                        - la data di una firma;
                        - una data storica;
                        - una data citata senza relazione
                          con una scadenza;
                        - la data presente nel nome del file
                          se rappresenta soltanto il giorno
                          in cui il file è stato creato.

                        Rispondi esclusivamente con
                        un oggetto JSON valido avente
                        esattamente questa struttura:

                        {
                            "expirationDate": null,
                            "source": null,
                            "reason": ""
                        }

                        Regole:

                        - expirationDate deve essere una data
                          nel formato YYYY-MM-DD;

                        - se non puoi individuare una vera
                          scadenza, expirationDate deve
                          essere null;

                        - source può essere soltanto:
                          "filename", "content" oppure null;

                        - reason deve spiegare brevemente
                          perché hai scelto quella data
                          o perché non l'hai trovata;

                        - non inventare mai una data.
                        `

                    },

                    {

                        role:
                            "user",

                        content:
                        `
                        Analizza questo documento.

                        NOME DEL FILE:
                        ${fileName}

                        CONTENUTO DEL FILE:
                        ${
                            limitedContent ||
                            "Nessun testo leggibile disponibile"
                        }
                        `

                    }

                ]

            });


        /*
            Recupera la risposta testuale prodotta dall'AI.
        */

        const rawResult =
            response.choices[0]
                ?.message
                ?.content;


        if (!rawResult) {

            throw new Error(
                "L'AI non ha restituito alcun risultato"
            );

        }


        /*
            Converte la risposta JSON in un oggetto JavaScript.
        */

        const parsedResult =
            JSON.parse(
                rawResult
            );


        /*
            Protegge il programma da eventuali campi mancanti.
        */

        return {

            expirationDate:
                typeof parsedResult.expirationDate === "string"
                    ? parsedResult.expirationDate
                    : null,

            source:
                parsedResult.source === "filename"
                ||
                parsedResult.source === "content"
                    ? parsedResult.source
                    : null,

            reason:
                typeof parsedResult.reason === "string"
                    ? parsedResult.reason
                    : ""

        };

    }

    catch (error) {

        console.log(
            "ERRORE ANALISI SCADENZA:",
            error
        );


        /*
            Se l'API fallisce, il programma non si blocca.

            Restituisce semplicemente una scadenza
            non determinata, che più avanti verrà
            colorata di azzurro nell'Excel.
        */

        return {

            expirationDate:
                null,

            source:
                null,

            reason:
                "Scadenza non determinata"

        };

    }

}


// Rende la funzione disponibile a server.js
module.exports =
    analyzeDeadline;
