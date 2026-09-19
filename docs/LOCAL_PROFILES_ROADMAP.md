# FolderRocket local profiles roadmap

## Product decision

FolderRocket remains local-first and does not require a cloud account. The current email-and-password accounts will become local profiles used to separate contexts such as University, Work, Personal, Leisure, or a custom context.

Each installation owns its profiles. No profile, password, file index, OAuth token, preference, or activity history is uploaded to a FolderRocket server.

## Target experience

On every application launch, show a compact profile chooser before loading the dashboard.

Each profile displays:

- custom name;
- category and icon;
- accent colour;
- optional avatar or initials;
- optional local password lock;
- last-used date without exposing private activity details.

Primary actions:

- open a profile;
- create a profile;
- edit name, category, icon, and colour;
- switch profile from the account menu;
- lock the active profile without closing FolderRocket;
- archive or delete a profile through a deliberate confirmation flow;
- export and restore a local profile backup.

## Profile categories

Provide presets without restricting custom names:

| Category | Suggested icon | Example |
| --- | --- | --- |
| University | Graduation cap | UIC, Thesis |
| Work | Briefcase | Bayer, Freelance |
| Personal | User | Pietro |
| Leisure | Game controller | Photography |
| Custom | Shapes | Any user-defined context |

The category only controls the initial appearance. It must not change permissions or file access.

## Local data model

Replace the email-centred user record with a versioned profile record:

```json
{
  "version": 2,
  "profiles": [
    {
      "id": "uuid",
      "name": "University",
      "category": "university",
      "icon": "graduation-cap",
      "color": "#6f55a5",
      "passwordDigest": null,
      "workspacePath": "...",
      "createdAt": "ISO date",
      "updatedAt": "ISO date",
      "lastOpenedAt": "ISO date"
    }
  ]
}
```

Keep stable profile IDs. Existing localStorage keys, dashboard settings, activity data, Gmail tokens, Outlook tokens, and Calendar tokens are already separated by user ID and can continue using that ID.

## Migration of existing installations

Migration must be automatic and reversible during the first version that supports profiles:

1. Back up the existing `users.json` before changing it.
2. Convert every current account into a local profile with the same ID and workspace path.
3. Use the email prefix as the proposed profile name, while allowing the user to rename it immediately.
4. Preserve the current password as an optional profile lock.
5. Preserve dashboard preferences and OAuth connections because their owner ID does not change.
6. Record the schema version so migration never runs twice.
7. If migration fails, keep the original file and show a recovery action instead of creating an empty installation.

## Authentication changes

Replace the current flows:

- email registration;
- email login;
- invitation codes;
- administrator password reset;
- recovery codes.

With local profile operations:

- `GET /profiles` — list safe profile summaries;
- `POST /profiles` — create a local profile;
- `POST /profiles/:id/open` — open it, checking a password only when configured;
- `PATCH /profiles/:id` — update appearance or password lock;
- `POST /profiles/:id/lock` — end the active local session;
- `POST /profiles/:id/export` — create an encrypted or plain backup chosen by the user;
- `POST /profiles/import` — inspect and restore a backup.

Sessions should last only for the current application run. Closing FolderRocket returns to the chooser on the next launch. A future preference may allow `Open the last profile automatically`, disabled by default.

## Password behaviour

Passwords are optional local locks:

- never require an email address;
- use the existing `scrypt` password hashing;
- never store the plain password;
- allow adding, changing, or removing a password after verifying the current one;
- add a short delay after repeated failures;
- clearly explain that a profile password does not encrypt arbitrary files outside FolderRocket.

There is no email-based recovery in local-only mode. When adding a password, offer a one-time recovery key or an encrypted backup and explain that losing both means the lock cannot be recovered.

## Data separation audit

Before release, verify every persisted feature uses the active profile ID:

- dashboard layout and source blocks;
- managed folders and imaginary folders;
- AI mode and display settings;
- Daily Jobs and undo history;
- Fire Mountain and CargoRocket;
- sticky notes and reminders;
- application-search indexes;
- Gmail and Outlook OAuth tokens;
- Google Calendar OAuth tokens;
- archives and deadlines;
- audit events and temporary files.

Clear in-memory data when switching profiles. Components that retain state must remount with `key={profile.id}` so information from the previous profile cannot remain visible.

## Profile management improvements

After the core chooser works, add:

1. Profile duplication with settings only, excluding files and connected accounts.
2. Per-profile default folders for downloads, conversions, and Fire Mountain.
3. Per-profile dashboard templates such as Study, Office, and Personal.
4. Optional automatic locking after inactivity.
5. Profile backup with a manifest, version, checksum, and optional encryption.
6. Import preview showing what will be restored before writing anything.
7. Storage usage and cleanup tools for indexes, previews, and temporary files.
8. A profile-specific privacy panel listing every connected external service.

## Implementation phases

### Phase 1 — Core profiles

- Add the versioned profile store and migration.
- Add create, list, open, lock, and edit operations.
- Build the startup chooser.
- Make password optional.
- Add profile switching to the existing account menu.

Acceptance criteria:

- a fresh installation can create and open a profile without email or password;
- the chooser appears after restarting the desktop app;
- two profiles show different dashboard settings and folders;
- the existing installation migrates without losing data.

### Phase 2 — Complete isolation

- Audit every localStorage key and backend store.
- Remount the application when switching profiles.
- Separate indexes, temporary files, notes, activities, and integrations.
- Add automated migration and isolation tests.

Acceptance criteria:

- switching profiles never displays data from the previous profile;
- Gmail, Outlook, and Calendar connections remain attached to the correct profile;
- background jobs stop when their profile is locked.

### Phase 3 — Management and recovery

- Add profile editing and deletion.
- Add recovery keys for password-protected profiles.
- Add export, import, and backup verification.
- Add storage usage and cleanup.

Acceptance criteria:

- destructive operations require a clear confirmation;
- a backup restores into a new installation with the same profile identity;
- an invalid or incomplete backup cannot overwrite a working profile.

### Phase 4 — Release readiness

- Remove obsolete invitation and email-account UI.
- Update privacy text and onboarding.
- Test fresh install, upgrade, uninstall, and reinstall.
- Confirm installers contain no user data, tokens, or configuration secrets.
- Package a prerelease for user testing.

## First task for the next session

Implement Phase 1 vertically: migrate one existing account, display it in the chooser, create a second passwordless profile, switch between them, and prove that each one retains a different dashboard layout after restarting FolderRocket.
