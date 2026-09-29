# Permessi per pianeta: punto di estensione

Change World mantiene su ogni pianeta un campo `permissions` con `schemaVersion: 1` e `configured: false`. È solo un punto di estensione compatibile con future migrazioni: non rappresenta utenti, ruoli, livelli di accesso o regole e non viene usato per autorizzare o negare operazioni.

La definizione dei permessi resta intenzionalmente rinviata. Prima di attivarla occorrerà concordare chi può accedere a ciascun pianeta, come vengono gestiti i file e le integrazioni condivise, e come migrare i dati senza modificare l’attuale comportamento. Fino a tale decisione, l’autenticazione e le autorizzazioni esistenti di FolderRocket restano invariate.

## Confini di persistenza attuali

- Blocchi e impostazioni dashboard: salvati dal backend sotto `worlds[worldId].dashboard`.
- Preferenze di avvisi Gmail/Outlook: salvate dal backend sotto `worlds[worldId].emailAlerts`; i token di autenticazione restano nel deposito condiviso già esistente e non vengono duplicati.
- Nome, colore, stile, AI toggle, agenti e skill: salvati nel browser per utente in `folderrocket-world-state-v1-*`; non sono sincronizzati tra dispositivi.
- Chiave e connessione AI: condivise, mai copiate nel profilo del pianeta.
- `permissions`: struttura locale per-pianeta, inerte e senza effetti sull’accesso.

Le impostazioni che dipendono dal browser richiedono una migrazione server-side separata se in futuro si desidera sincronizzarle tra dispositivi. Tale migrazione non fa parte dell’attivazione dei permessi.
