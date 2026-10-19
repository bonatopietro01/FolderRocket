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
Columns, then choose 0, 1, 2, or 20 folders. The 20-folder case includes long names. Open Tree Rocket to inspect the
matching graph; click a folder card to open it, then use **See files** to show a
floating preview anchored near that card. Confirm it stays inside the window and
tracks the folder while scrolling the graph; when there is no room above, it
uses the available nearby space. Close with the preview button or Escape and
verify focus returns to **See files**; an outside click should close the preview
while leaving focus on the outside target. Use **Load next page of files** to
verify pagination and list scrolling without reserving a permanent side column.
Also try search, Back/Roots navigation, and Add to Folder Management. Switch to Tree Rocket Apps to verify the sample
catalog and generic icon fallbacks. App tiles should contain only a centered
icon and name, remain the same size, and keep their header branding in place
while switching views. The folder/file search remains visible in Apps and
returns to folder results when submitted. Clicking a sample app is safely
mocked and does not launch a real program. Folders
on Top groups non-empty descriptions and keeps vertical scrolling inside the
group under the pointer while horizontal movement is reserved for horizontal
trackpad input. The add action reports the path only in this fixture and does
not save a real folder. Repeat at a narrow browser width.

For Folder Management, open `/tests/ui/followup-smoke.html` and select
**folders**. Its 24 synthetic folders include long labels; opening one exposes
96 fictitious files across many formats and five synthetic subfolders. Use the
File format menu, search, result-list resize, selection, and mocked copy or move
controls at a narrow viewport. Filesystem, search, rename, and transfer
responses come from the fixture; unexpected requests fail instead of reaching
the backend.

The fixture contract can also be checked without a browser using
`node --test tests/treeRocketUiFixture.test.mjs`; this validates only the
synthetic scenarios, not rendered geometry or visual behavior.

For the latest Dashboard, planet header, Gmail account catalog and Tree Rocket
checks, open `/tests/ui/prompt-run-smoke.html`. All files, folders, worlds and
accounts are synthetic, all network calls are mocked, and unrecognized requests
throw. Check the dashboard at wide and narrow widths; then open **Fly to Another
Planet**, edit a planet to see which synthetic Gmail account is selected or
available, and inspect the glowing planet beside the other styles. Use the
**Account state** selector to cover multiple, one, none, loading, and error
states; close and reopen the planet editor after changing the state so it fetches
the synthetic catalog again. Open Tree Rocket to check the compact folder cards
and anchored file preview. In the 20-folder listing, open **See files** on Project
20 and immediately open another folder; its delayed synthetic response should
not replace the newer folder or file preview. This fixture does not connect to
Gmail, read real files, or open an Obsidian vault.

For planet artwork, Folder Management reorder, scoped Conversation and graph
diagnostics, open `/tests/ui/followup-smoke.html`. All API requests are mocked;
unrecognized requests throw instead of reaching a backend. Use **art** to compare
cards and thumbnails, **folders** to toggle Reorder repeatedly, **email** and
**Switch planet** to verify that alpha/beta synthetic inboxes never overlap,
and **graph** to inspect distinct global and source diagnostics. Downloads in
this fixture are not implemented; provider download tests use mocked Gmail.
