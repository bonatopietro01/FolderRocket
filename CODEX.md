# CODEX.md — FolderRocket Project Context

## 1. Project identity

**Project name:** FolderRocket
**Current status:** Local prototype under active development
**Primary platform:** Windows
**Current stack:** React + TypeScript + Vite frontend, Node.js + Express backend
**Primary goal:** Organize, rename, classify, archive, monitor, move, and eventually search local files through a visual drag-and-drop interface.

FolderRocket is intended to become a real desktop application that works directly with files and folders on the user's computer. The current prototype runs locally through a Vite frontend and an Express backend.

---

## 2. Product vision

FolderRocket should help users organize files without repeatedly opening folders, renaming files manually, checking documents one by one, or maintaining Excel archives by hand.

The app should eventually support:

- drag-and-drop file organization;
- multiple destination folders;
- automatic file renaming;
- automatic document classification;
- automatic Excel archive generation;
- deadline extraction and monitoring;
- Gmail and Outlook attachment ingestion;
- intelligent search;
- safe file deletion through Fire Mountain;
- optional automatic file conversion;
- eventual packaging as an installable desktop application;
- possible cloud/account features in the future.

The product should remain visually simple, modular, and understandable to non-technical users.

---

## 3. Current repository assumptions

Expected project structure:

```text
VibingApp/
├── backend/
│   ├── ai/
│   │   ├── analyzer.js
│   │   ├── deadlineAnalyzer.js
│   │   └── reader.js
│   ├── database/
│   │   ├── excelManager.js
│   │   └── deadlineExcelManager.js
│   ├── services/
│   │   ├── archiveService.js
│   │   ├── deadlineService.js
│   │   └── other services
│   ├── server.js
│   ├── package.json
│   └── uploads/
├── src/
│   ├── assets/
│   │   └── folderrocket-logo.png
│   ├── components/
│   │   ├── FileDropZone.tsx
│   │   └── FireMountain.tsx
│   ├── App.css
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
└── CODEX.md
```

Before changing architecture, inspect the actual repository and adapt to the real structure.

---

## 4. Current frontend behavior

### 4.1 Main layout

The interface contains three columns:

#### Left column
Contains source panels for:

- Gmail
- Outlook
- Other

These panels are currently mostly placeholders. In the future they will display email attachments and other incoming files that can be dragged into destination folders.

#### Center column
Contains multiple dynamic `FileDropZone` blocks.

Users can:

- create a new folder block;
- select a folder block;
- delete a selected folder block;
- enter a destination path;
- drag one or more files into a folder block;
- remove files from the temporary queue;
- apply renaming rules;
- upload all queued files;
- enable archive generation;
- check deadlines;
- open urgent and watch lists.

#### Right column
Contains:

- Search placeholder;
- Results placeholder;
- Fire Mountain.

---

## 5. FileDropZone behavior

`src/components/FileDropZone.tsx` is the main destination-folder component.

### 5.1 Required capabilities

Each folder block should support:

- a user-defined display name;
- a destination path;
- multi-file drag-and-drop;
- queue preview;
- removing individual queued files;
- clearing the queue;
- upload of all queued files;
- automatic duplicate name handling on the backend;
- optional automatic renaming;
- archive activation;
- deadline monitoring;
- urgent and watch counters;
- clickable deadline result lists;
- closing menus when clicking outside.

### 5.2 Renaming system

Current rename parts:

- `fixed`
- `date`
- `company`

The rename rule is applied before upload.

Expected behavior:

```text
fixed + date + company + original extension
```

The original extension must be preserved.

Future renaming improvements may include:

- separators;
- original filename token;
- document type token;
- progressive counter;
- custom date formats;
- extracted company name;
- filename preview.

### 5.3 Multi-file upload

The frontend queues multiple `File` objects.

The backend currently receives one file per request through:

```text
POST /upload
```

The frontend loops over queued files and performs one request per file.

Do not change this behavior unless there is a clear reason to move to `multer.array()` or a batch upload endpoint.

### 5.4 Upload and archive interaction

When `archiveEnabled` is active, the frontend sends:

```text
archiveEnabled=true
```

inside the upload `FormData`.

The backend should then analyze the newly uploaded file and update `archivio.xlsx`.

If `archiveEnabled` is false, the file should still be saved, but the general archive analysis should not run automatically.

---

## 6. Archive system

### 6.1 Purpose

`archivio.xlsx` is the general document archive for a destination folder.

It should contain one row per real file.

Expected columns:

```text
Nome file
Azienda
Posizione
Tipo documento
Competenze
Esperienza
Data
```

The exact data model may evolve, but archive data and deadline data must remain separated.

### 6.2 Core files

```text
backend/database/excelManager.js
backend/services/archiveService.js
```

### 6.3 Manual archive synchronization

Each folder block has an archive button in the upper-right corner.

Expected behavior:

- inactive state: archive automation disabled;
- click while inactive:
  - validate folder path;
  - create or rebuild `archivio.xlsx`;
  - analyze every real file in the destination folder;
  - write one row per file;
  - activate automatic archive updates;
- click while active:
  - disable future automatic updates;
  - do not delete the existing archive.

Expected endpoint:

```text
POST /sync-archive
```

Expected body:

```json
{
  "path": "C:\\path\\to\\folder"
}
```

### 6.4 Archive synchronization rules

The archive scan must ignore:

```text
archivio.xlsx
scadenze.xlsx
FolderRocket_Trash
```

It should ignore subfolders unless recursive scanning is explicitly implemented.

The Excel file should be opened and written once per full synchronization, not once per scanned file.

When rebuilding manually, a clean workbook with one row per current file is acceptable and often preferable.

### 6.5 Important archive invariant

A full archive synchronization must never result in only the last processed file being visible.

If that happens, inspect:

- workbook lifecycle;
- sheet recreation;
- repeated `writeFile()` calls inside loops;
- incorrect export/import patterns;
- accidental overwriting of the workbook.

---

## 7. Deadline system

### 7.1 Purpose

`scadenze.xlsx` is dedicated only to deadline monitoring.

It must not contain the archive columns.

Expected columns:

```text
Nome file
Scadenza
Giorni rimanenti
Stato
Origine
Motivazione
```

### 7.2 Core files

```text
backend/database/deadlineExcelManager.js
backend/services/deadlineService.js
backend/ai/deadlineAnalyzer.js
```

### 7.3 Status model

Supported states:

```text
urgent
watch
ok
missing
```

Meaning:

- `urgent`: expired or within `urgentDays`;
- `watch`: beyond `urgentDays`, but within `watchDays`;
- `ok`: later than `watchDays`;
- `missing`: no valid deadline found.

### 7.4 Threshold rules

Required validation:

```text
watchDays > 0
urgentDays >= 0
urgentDays < watchDays
```

### 7.5 Critical deadline behavior

Changing `urgentDays` or `watchDays` must always recalculate:

- `daysRemaining`;
- `status`;
- Excel row color;
- urgent counter;
- watch counter.

It must not require the AI to re-read documents when a valid deadline is already stored.

The correct flow is:

1. read existing deadline from `scadenze.xlsx`;
2. if no deadline exists, read and analyze the file;
3. normalize the expiration date;
4. always recalculate status with the current thresholds;
5. always rewrite the Excel row;
6. always reapply row color;
7. return updated counters and results.

### 7.6 Row colors

Expected colors:

- urgent: light red;
- watch: yellow;
- missing: light blue;
- ok: white or neutral.

Before applying a new color, clear or overwrite the previous fill.

### 7.7 Deadline frontend

The deadline button appears in the upper-left corner of each folder block.

Expected display:

```text
[warning button] [red urgent count] [yellow watch count]
```

The urgent and watch counters should:

- appear only when greater than zero;
- be clickable;
- open a list of matching files;
- show filename, deadline, and remaining days.

Menus and result lists should close when the user clicks outside the deadline area.

The backend response should include:

```json
{
  "message": "Controllo completato",
  "urgentCount": 0,
  "watchCount": 0,
  "missingCount": 0,
  "okCount": 0,
  "totalFiles": 0,
  "results": []
}
```

---

## 8. Fire Mountain

### 8.1 Product behavior

Fire Mountain is a safe deletion queue.

The intended user flow is:

1. drag one or more files from Windows Explorer into Fire Mountain;
2. show every file in a temporary queue;
3. allow removing single files from the queue;
4. allow clearing the entire queue;
5. do not modify original files before confirmation;
6. press `Send it to Fire Mountain`;
7. move files into a selected FolderRocket trash directory;
8. remove originals only after a successful copy;
9. keep failed files visible in the queue.

### 8.2 Current component

```text
src/components/FireMountain.tsx
```

### 8.3 Browser limitations

The current web prototype relies on Chromium file-system APIs.

Potential APIs:

```text
DataTransferItem.getAsFileSystemHandle()
window.showDirectoryPicker()
FileSystemFileHandle.remove()
```

These APIs may be experimental, browser-dependent, permission-dependent, or unavailable in some environments.

Use Chrome or Edge for development.

Do not assume these browser APIs are a reliable final solution.

### 8.4 Final architecture recommendation

Because FolderRocket needs deep access to local files, the preferred final platform is a desktop application.

Recommended future packaging:

```text
Electron
```

or possibly:

```text
Tauri
```

Electron is the more direct choice for the current Node.js + React + Express architecture.

A desktop version should eventually replace browser-dependent deletion and folder access with native Node/Electron file APIs.

### 8.5 Future internal trash design

Recommended folder:

```text
FolderRocket_Trash/
```

Possible structure:

```text
FolderRocket_Trash/
├── 2026-08-05/
│   ├── old-document.pdf
│   └── duplicate.docx
└── trash-index.json
```

Possible metadata:

```json
{
  "originalName": "old-document.pdf",
  "originalPath": "C:\\original\\folder\\old-document.pdf",
  "trashPath": "C:\\FolderRocket_Trash\\2026-08-05\\old-document.pdf",
  "deletedAt": "2026-08-05T12:00:00.000Z"
}
```

Future functions:

- restore;
- permanent delete;
- empty trash;
- search trash;
- organize by original folder;
- organize by date;
- sync Excel after moving or restoring files.

---

## 9. Backend

### 9.1 Current server

Main file:

```text
backend/server.js
```

Expected endpoints:

```text
GET  /
POST /upload
POST /sync-archive
POST /check-deadlines
```

Other endpoints may exist depending on the current implementation.

### 9.2 Upload endpoint

Responsibilities:

1. validate uploaded file;
2. validate destination path;
3. create destination directory if needed;
4. resolve duplicate filename;
5. move uploaded temporary file to destination;
6. conditionally read and analyze document;
7. conditionally update archive;
8. return JSON.

The endpoint must always return JSON for frontend requests.

Avoid returning HTML error pages because the frontend expects JSON and otherwise reports errors such as:

```text
Unexpected token '<'
```

### 9.3 CORS

The local frontend commonly runs at:

```text
http://localhost:5173
```

The backend commonly runs at:

```text
http://localhost:3000
```

CORS must allow the frontend during development.

### 9.4 Reader behavior

`backend/ai/reader.js` should extract readable text when possible.

Supported formats may include:

- PDF;
- DOCX;
- XLSX;
- TXT;
- other text-based formats.

Unsupported or damaged files must not crash a complete folder scan.

Service functions should catch reader failures and continue with an empty string.

### 9.5 Analyzer behavior

`backend/ai/analyzer.js` returns general archive metadata.

Expected shape:

```json
{
  "azienda": "",
  "posizione": "",
  "tipoDocumento": "",
  "competenze": [],
  "esperienza": ""
}
```

Always normalize missing values before writing to Excel.

### 9.6 Deadline analyzer behavior

`backend/ai/deadlineAnalyzer.js` should return:

```json
{
  "expirationDate": "YYYY-MM-DD",
  "source": "",
  "reason": ""
}
```

If no date is found:

```json
{
  "expirationDate": null,
  "source": null,
  "reason": "..."
}
```

The service, not the AI, is responsible for calculating status.

---

## 10. CSS and UI conventions

Main stylesheet:

```text
src/App.css
```

### 10.1 Important button classes

Use separate classes for separate button types.

```text
.uploadFileButton
.archiveButton
.deadlineButton
.deadlineCheckButton
.fireMountainButton
```

Do not use broad selectors such as:

```css
.foldersContainer > div > button
```

for button sizing, because they can unintentionally resize archive and deadline controls.

### 10.2 Small control buttons

Archive and deadline buttons should be approximately:

```text
40 × 40 px
```

They must remain visually aligned.

Use SVG icons from `lucide-react` where practical instead of emojis, because emoji dimensions vary between platforms.

### 10.3 Upload button

`Send file to Sauron` should preserve its larger primary-action style.

### 10.4 Layout sizing

Main grid is controlled in:

```css
.dashboard {
    grid-template-columns: ...;
}
```

Column order:

```text
left | center | right
```

The center should remain visually central and sufficiently wide.

### 10.5 Responsive behavior

Desktop is the primary layout.

On smaller screens, stacking columns is acceptable.

Do not break the desktop layout while optimizing mobile behavior.

---

## 11. Coding rules for Codex

### 11.1 Before editing

Always:

1. inspect the real files;
2. identify current imports and exports;
3. inspect related service and database modules;
4. search for duplicate implementations;
5. verify package versions;
6. explain the intended change briefly.

### 11.2 Editing style

Prefer:

- complete, syntactically valid files;
- modular functions;
- explicit names;
- defensive validation;
- readable comments;
- predictable JSON responses;
- minimal changes outside the requested feature.

Avoid:

- partial snippets that depend on unknown surrounding code;
- duplicate event handlers;
- duplicate CSS rules;
- duplicated Express routes;
- mixing CSS inside `.tsx`;
- broad CSS selectors that affect unrelated buttons;
- placing `className` inside a `style` object;
- repeated workbook writes inside loops;
- silently removing existing features.

### 11.3 TypeScript style

Avoid fragile formatting such as split type assertions:

```tsx
const item =
    value
        as SomeType;
```

Prefer:

```tsx
const item = value as SomeType;
```

When browser APIs are experimental, use local interfaces instead of assuming every DOM type exists in the installed TypeScript version.

### 11.4 State updates

Prefer functional state updates where the new state depends on the previous state.

Example:

```tsx
setFiles(currentFiles => [
    ...currentFiles,
    ...newFiles
]);
```

### 11.5 Error handling

Frontend:

- parse backend response safely;
- show useful alerts;
- log detailed errors to the console;
- keep failed queued items visible.

Backend:

- catch file-level failures during folder scans;
- continue processing other files;
- return JSON errors;
- include actionable messages;
- detect Excel `EBUSY` errors and tell the user to close the workbook.

### 11.6 Destructive actions

For deletion, moving, or permanent changes:

- require explicit user confirmation;
- never delete before a verified copy when implementing internal trash;
- do not delete whole directories without explicit safeguards;
- block dangerous root paths;
- preserve recoverability where possible.

---

## 12. Development commands

### Frontend

From the project root:

```powershell
npm run dev
```

Expected local URL:

```text
http://localhost:5173
```

### Backend

From the backend folder:

```powershell
node server.js
```

Expected local URL:

```text
http://localhost:3000
```

### Typical Windows paths

Project root:

```text
C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp
```

Backend:

```text
C:\Users\bonat\OneDrive - University of Illinois Chicago\Desktop\VibingApp\backend
```

Do not hard-code user-specific absolute paths into committed application logic.

---

## 13. Known issues and technical debt

Potential current issues to verify:

- Fire Mountain browser compatibility;
- browser permission handling;
- reliability of deleting original files from browser handles;
- stale or malformed Excel structures from older versions;
- duplicate Express routes from previous edits;
- duplicate CSS rules;
- old references to single-file state after multi-file migration;
- archive state stored only by folder display name;
- folder blocks not persisted across reloads;
- folder paths not persisted;
- deadline settings not persisted;
- sequential upload may be slow;
- document analyzer may be called with empty content;
- PDF parser may fail on malformed XRef tables;
- Excel files may remain open and block writes;
- localStorage keys may collide when folder names repeat;
- deleting a visual folder block does not necessarily delete physical files;
- generated folder block keys may not remain stable.

Codex should verify these rather than assume they are already fixed.

---

## 14. Near-term roadmap

### Priority 1 — Stabilization

- inspect and clean current files;
- remove duplicate code;
- verify all endpoints;
- verify all imports and exports;
- make archive synchronization deterministic;
- make deadline recalculation deterministic;
- add loading and error states;
- add basic tests;
- add shared API base URL;
- add environment configuration.

### Priority 2 — Persistence

Persist:

- folder blocks;
- folder names;
- destination paths;
- archive enabled state;
- deadline enabled state;
- deadline thresholds;
- possibly selected trash directory metadata where supported.

Prefer stable unique folder IDs instead of using display names as storage keys.

### Priority 3 — Desktop application

Convert FolderRocket into an installable desktop application.

Preferred first evaluation:

```text
Electron
```

Goals:

- no manual localhost startup;
- launch from desktop/start menu;
- native file paths;
- native folder picker;
- native file moving;
- native internal trash;
- easier background backend startup;
- eventual installer generation.

### Priority 4 — Search

Add intelligent local search.

Potential features:

- search by filename;
- search by extracted text;
- search by company;
- search by document type;
- search by skills;
- search by deadline status;
- drag search results into destination folders;
- drag search results into Fire Mountain.

### Priority 5 — Email integrations

Add Gmail and Outlook integrations.

Potential flow:

```text
email attachment
→ source panel
→ preview
→ drag into destination folder
→ rename
→ upload/save
→ archive
→ optional deadline analysis
```

Do not store credentials insecurely.

### Priority 6 — File conversion

Treat conversion as a folder rule, not only a one-time action.

Possible folder settings:

```text
Keep original format
Convert compatible files to PDF
Images to JPG
Spreadsheets to CSV
```

Recommended processing order:

```text
rename
→ convert
→ save
→ analyze
→ archive
→ deadline check
```

Before implementation, define:

- supported input/output pairs;
- whether originals are preserved;
- failure behavior;
- conversion tools;
- metadata behavior;
- archive naming behavior.

---

## 15. Long-term architecture direction

Recommended future separation:

```text
frontend/
desktop/
backend-core/
shared/
```

Possible architecture:

```text
React UI
    ↓
Electron IPC
    ↓
Node services
    ↓
Local filesystem
    ↓
AI/document services
    ↓
Excel/database layer
```

For a mature version, consider replacing Excel as the primary internal database with SQLite, while continuing to export Excel reports for users.

Possible model:

```text
SQLite = internal source of truth
Excel = generated user-facing report
```

This would improve:

- consistency;
- updates;
- deletes;
- restores;
- search;
- indexing;
- deadline recalculation;
- file history;
- concurrency.

Do not perform this migration without a clear plan and user approval.

---

## 16. Security and privacy

FolderRocket handles private local documents.

Required principles:

- do not upload files externally without explicit consent;
- do not log full document contents by default;
- do not expose API keys in frontend code;
- use `.env` for backend secrets;
- exclude `.env` from version control;
- validate filesystem paths;
- sanitize generated filenames;
- prevent path traversal;
- confirm destructive actions;
- avoid permanently deleting by default;
- document what data is sent to AI providers.

---

## 17. Testing expectations

At minimum, manually test:

### Upload
- one file;
- multiple files;
- duplicate filenames;
- unsupported file;
- empty destination path;
- archive disabled;
- archive enabled;
- one failed upload among multiple files.

### Archive
- no existing archive;
- existing archive;
- multiple files;
- deleted file;
- renamed file;
- open Excel workbook;
- unreadable document.

### Deadlines
- no existing deadline workbook;
- existing deadline workbook;
- missing date;
- expired date;
- urgent date;
- watch date;
- ok date;
- changed thresholds;
- open Excel workbook;
- removed file.

### Fire Mountain
- one file;
- multiple files;
- remove one queued item;
- clear queue;
- duplicate file;
- denied permission;
- unsupported browser;
- copy failure;
- original deletion failure.

### UI
- clicking outside closes deadline menus;
- urgent count opens urgent files;
- watch count opens watch files;
- archive button remains 40×40;
- upload button retains primary styling;
- responsive layout remains usable.

---

## 18. Instructions for every Codex session

Before making changes:

1. Read this entire `CODEX.md`.
2. Inspect the current repository.
3. Do not assume previous chat snippets match the latest files.
4. Identify the smallest safe set of files to modify.
5. Preserve working behavior.
6. Explain the intended implementation briefly.
7. Apply changes.
8. Check syntax.
9. Run available tests or build commands.
10. Report:
   - changed files;
   - behavior added or fixed;
   - commands run;
   - remaining risks.

Use this default instruction:

```text
Read CODEX.md first. Inspect the actual repository before editing.
Preserve existing working features. Make the smallest coherent change.
Do not duplicate routes, handlers, styles, or services.
Run the relevant build or checks after editing.
Explain exactly which files were changed and why.
```

---

## 19. Current product decisions

The following decisions have already been made:

- archive and deadline data belong in two separate Excel files;
- archive updates can be manually triggered and optionally remain active;
- deadline thresholds must be configurable per folder block;
- deadline counters must be separated into urgent and watch;
- deadline counters must be clickable;
- multi-file drag-and-drop is required;
- queued files must be individually removable;
- Fire Mountain must use a confirmation queue;
- Fire Mountain should become a recoverable internal trash system;
- file conversion should be designed later as a folder-level rule;
- WordPress/domain usage is secondary to local desktop functionality;
- the likely final form is an installable desktop app.

---

## 20. Immediate recommended next task

Before adding another major feature, perform a stabilization pass:

```text
Audit the FolderRocket repository against CODEX.md.
Do not redesign the application.
Find syntax errors, duplicated code, stale single-file state,
duplicated routes, broad CSS selectors, and inconsistent exports.
Produce a concise report first, then fix only confirmed issues.
Run the frontend build and start/check the backend.
```
