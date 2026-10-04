# Workspace regression checks

Run the dependency-free unit tests with Node 24 or newer:

```sh
node --test tests/folderDragHover.test.mjs tests/applicationFiles.test.mjs
```

For interactive checks, run `npm run dev` and open
`/tests/ui/workspace-smoke.html` on the local Vite server. This page uses the
production components with fictitious files, a dedicated storage scope, and
mocked network requests. It never scans, opens, or moves real files and is not
included in the production build.

- Use **Hold dragged file for 2 seconds** twice to verify parent and nested
  folder navigation with drag events that the drop component stops bubbling.
- Use **Reset folders**, then **Leave folder before 2 seconds**, to verify
  cancellation. The folder should remain closed.
- Open the CAD demo file window; search for `gear`, combine with PDF, and
  search for `Machine` to match folder paths. Both the card and window share
  their filters. The music card has independent filters.
- Clear the search and check that the full list scrolls without clipping rows.
  Verify closing with the X button, Escape, and a click outside the window.
- **Show request counts** verifies that typing and reopening already-scanned
  results do not trigger further scans.

These checks simulate browser drag events; native Explorer-to-Electron dragging
still merits a manual check in the desktop application.

For the dashboard folder rows and Tree Rocket layout, open
`/tests/ui/tree-rocket-smoke.html` on the same local Vite server. This fixture
uses only fictitious folders and files plus a fixed list of sample application
names; it never reads installed applications. Switch between Folders on Top and Three
Columns, then choose 0, 1, 2, or 12 folders. Open Tree Rocket to inspect the
matching graph; click a folder, try Show Files, search, Back/Roots navigation,
and Add to Folder Management. Switch to Tree Rocket Apps to verify the sample
catalog and generic icon fallbacks. App tiles should contain only a centered
icon and name, remain the same size, and keep their header branding in place
while switching views. The folder/file search remains visible in Apps and
returns to folder results when submitted. Clicking a sample app is safely
mocked and does not launch a real program. Folders
on Top groups non-empty descriptions and keeps vertical scrolling inside the
group under the pointer while horizontal movement is reserved for horizontal
trackpad input. The add action reports the path only in this fixture and does
not save a real folder. Repeat at a narrow browser width.
