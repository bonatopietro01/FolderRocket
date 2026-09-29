# Diagnostica e misure di prestazione

## Flusso

Il frontend React installa la raccolta prima del gate di autenticazione. Le richieste API ricevono un identificativo diagnostico generato dal client, oltre alla schermata e al pianeta attivi; il backend convalida e riutilizza l’identificativo, registra metodo, endpoint, stato e durata, senza leggere i corpi delle richieste. Gli errori HTTP visibili al browser e quelli registrati dal backend possono così essere collegati. Gli errori di rete senza risposta mantengono l’identificativo client e vengono associati al backend se la richiesta era già arrivata.

React segnala gli errori di render e il relativo stack dei componenti; il listener globale raccoglie errori JavaScript, Promise rifiutate e un numero limitato di avvisi. Electron registra separatamente gli errori di renderer, caricamento e processo desktop. La persistenza diagnostica usa scritture asincrone e accodate; se non è disponibile, FolderRocket continua a funzionare, mantiene gli eventi in memoria e mostra un avviso.

## Posizione e conservazione

- Browser/Electron renderer: IndexedDB, database `folderrocket-diagnostics`, separato per utente; massimo 120 eventi e 30 giorni. Gli eventi legacy in `localStorage` vengono importati quando necessario.
- Backend: `diagnostics/<sha256-utente>.json` dentro la directory dati runtime (default `backend/data`, oppure `FOLDERROCKET_DATA_DIR`); massimo 800 eventi e 30 giorni per default. Si possono impostare `FOLDERROCKET_DIAGNOSTICS_MAX_EVENTS` (50–10000) e `FOLDERROCKET_DIAGNOSTICS_RETENTION_DAYS` (1–365).
- Electron main: `app.getPath("userData")/diagnostics-electron.json`; massimo 200 eventi e 30 giorni.

I log vengono ripuliti alla lettura e a ogni scrittura. Il backend e Electron sostituiscono i file tramite scritture temporanee asincrone. Gli export JSON sono creati localmente e non vengono inviati all’esterno.

## Privacy e prestazioni

Il collector non registra corpi di richieste, email, token, cookie o contenuti di documenti. Filtra bearer token, chiavi note, email e percorsi locali da messaggi e stack. Le richieste di autenticazione non vengono associate a un utente non autenticato. Gli ID sono UUID e non contengono dati personali.

Il Centro diagnostico raccoglie il tempo di caricamento iniziale, i task UI da almeno 300 ms, il cambio pianeta, gli errori di rete e un campione al minuto per metodo/percorso delle risposte API riuscite. Queste misure consentono un confronto futuro su installazioni e dispositivi controllati; non sostituiscono un benchmark “prima/dopo” su una base di codice e hardware identici.

Le impostazioni di agente/skill e l’aspetto dei pianeti sono browser-locali. I permessi per pianeta restano un campo inerte `{schemaVersion: 1, configured: false}`: non definisce ruoli e non cambia l’autorizzazione attuale.
