# FolderRocket development and release plan

## Decisions

- FolderRocket is local-first and Windows-first.
- GitHub stores source code, documentation and version history only.
- Personal documents, user workspaces, OAuth tokens, API keys, generated Excel files and installers never enter Git.
- The first release is a private, downloadable desktop build for the owner. It does not need an online service.
- AI is an optional capability. The baseline application must remain useful with AI disabled and while offline.

## Repository workflow

Use `main` only for tested, usable versions. New work happens in a short-lived branch:

```text
main
  └─ feature/<short-description>
```

Before merging or committing a meaningful feature:

1. run the frontend build;
2. check backend syntax;
3. manually test the changed workflow;
4. review `git status` and confirm no local data or secret is staged;
5. commit a small, descriptive change.

Examples:

```powershell
git switch -c feature/file-studio-layout
git add src/App.tsx src/App.css
git commit -m "Improve File Studio layout"
git switch main
git merge feature/file-studio-layout
```

## Versioning

Use semantic versions:

```text
0.1.0  first local desktop alpha
0.1.1  bug fix with no new capability
0.2.0  new backwards-compatible capability
1.0.0  first stable public release
```

Every released installer is associated with a Git tag, for example:

```powershell
git tag -a v0.1.0 -m "First private desktop alpha"
```

## Desktop path

The existing React UI and Express logic will be preserved. The first wrapper is Electron because it can run the existing Node.js and Express backend locally without a rewrite. It will:

1. launch the local backend automatically;
2. open the FolderRocket window without a manual `node server.js` command;
3. use native Windows file and folder access;
4. store per-user application data under the Windows application-data directory;
5. create a Windows installer (`.msi` and/or `.exe`).

The first installer is manually downloaded and installed. Automatic updates are not required at this stage. Run `npm run desktop:package` to build it. The generated installer is written outside OneDrive, in `%LOCALAPPDATA%\\FolderRocket\\releases` by default, to avoid Windows file-lock conflicts during packaging. Set `FOLDERROCKET_RELEASE_DIR` only when a different output directory is required.

The desktop launcher sets `FOLDERROCKET_DATA_DIR`, `FOLDERROCKET_UPLOADS_DIR` and `FOLDERROCKET_TOKEN_DIR`. This keeps users, workspace settings, temporary uploads and encrypted email tokens in the Windows application-data directory, not in the installed program folder.

Connected-service credentials are never bundled. The installed app reads the optional local file `%APPDATA%\\FolderRocket\\config.env`; use `desktop/config.env.example` as the template. Only OpenAI, Gmail, Outlook and the optional token-encryption key are accepted from that file. It is preserved when FolderRocket is updated and is never committed to Git.

## AI mode

The application will expose an explicit state, rather than silently using AI:

```text
AI: OFFLINE / DISABLED
AI: CONNECTED / ENABLED
```

When disabled or offline, local functions continue to work and AI actions explain why they are unavailable. When enabled, the app must identify the provider, obtain the user's explicit consent before document text leaves the computer, and show errors and cost-related connection status.

Never bundle a personal OpenAI key inside a downloadable installer. A future public version must either let each user provide their own key locally or use an authenticated server-side AI gateway with usage controls.

## Future online distribution

When FolderRocket is ready for public use:

1. publish the installer and release notes from a stable HTTPS download location;
2. sign installers and update packages;
3. retain the update-signing private key securely outside Git;
4. make the app check a signed update manifest;
5. let users confirm the update before restart.

The WordPress site can be the product and download page. It should not contain private credentials or become the local-file backend.
