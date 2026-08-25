# FolderRocket

FolderRocket is a Windows-first visual workspace for organising local files, email attachments, conversion workflows, document archives and deadline monitoring.

The current version is a local prototype built with React, TypeScript, Vite, Node.js and Express. Its next major stage is a downloadable desktop application that keeps users' files on their own computers.

## Local development

Install dependencies once:

```powershell
npm install
Set-Location backend
npm install
```

Start the backend in one terminal:

```powershell
Set-Location backend
node server.js
```

Start the frontend in a second terminal:

```powershell
npm run dev
```

## Configuration and privacy

Copy `backend/.env.example` to `backend/.env` and complete only the integrations you choose to activate.

Never commit `backend/.env`, mail tokens, user data, generated files or update-signing keys. The repository `.gitignore` protects these local files.

FolderRocket is being designed local-first:

- file operations and application data remain on the user's PC;
- AI and mail integrations are optional connected features;
- when AI is disabled or the computer is offline, the app must clearly show that connected features are unavailable rather than sending anything automatically.

## Source control and releases

Development and release rules are documented in [docs/DEVELOPMENT_AND_RELEASES.md](docs/DEVELOPMENT_AND_RELEASES.md). The practical flow is:

```text
feature branch → tested commit → main → version tag → Windows installer
```

The first desktop releases will be private Windows installers for personal use. Automatic signed updates and public distribution come only after the local version is stable.

## Verification

Before committing a change, run:

```powershell
npm run build
Set-Location backend
node --check server.js
```

## Project context

Read [CODEX.md](CODEX.md) before changing the application architecture or file-management behavior.
