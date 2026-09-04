# Dashboard sources and Change format

## New sources

Use the + menu on either dashboard source column to add **Recent files** or
**Phone**. New source types are persisted with the existing dashboard settings.

- Recent files defaults to 24 hours (also 48 hours / 7 days). It scans Downloads,
  Desktop, Documents, OneDrive equivalents and physical dashboard folders,
  recursively. Locations accepts additional paths, one per line. Windows download
  metadata distinguishes recognized downloads from other newly created/copied
  files. This is not browser download history. Scans exclude system/dependency
  folders, do not follow symbolic links, and have time/entry/result limits; the UI
  explicitly labels partial scans. Refresh requests a fresh scan.
- Phone enumerates portable USB devices exposed by Windows Explorer. Unlock the
  phone and enable File Transfer / Trust this computer. Folders expand inline.
  Import a file with the download icon before dragging its local copy. The source
  phone is never modified. The format filter counts **loaded** folders, not the
  entire phone. iOS only exposes the folders Windows permits (typically photos),
  not unrestricted device storage. There is no wireless pairing in this version.
- Dashboard search now includes every physical dashboard folder and recursively
  searches its subfolders. Existing backend search limits still apply (up to 1,200
  inspected files per root and 100 returned matches).

## Folder projects

The same non-empty description groups folders, ignoring case and outer spaces.
Style → Join work folders overrides that description with an explicit project.
An explicitly empty work group separates a folder. Groups share a fill and one
badge with a light connector. Selecting a colour/symbol through Style updates
the group. Folder Management shows a much lighter version of that fill.

## File Studio

The green arrow retains Local conversion. The purple arrow queues files in
Change format. Choose one mother file; other queued files are children.

| Workflow | Implementation / limits |
|---|---|
| DOCX mother → DOCX children → DOCX | Direct local Open XML package editing; no Word or AI required. Transfers matching style IDs, font sizes/families, paragraph formatting, page setup, optional headers/footers and inline-image sizing. Child text, citation fields, media and numbering remain in their own package. |
| Word/PDF/RTF → DOCX or PDF | Local Microsoft Word automation. Word must finish first-run setup/sign-in and respond to automation. PDF reflow is best effort; scanned PDFs need OCR separately. |
| PNG/JPEG/BMP/TIFF → mother's image type | Windows image codecs. Matches pixel dimensions and DPI; preserves aspect ratio with padding. JPEG quality is explicitly chosen, not recovered from the mother. EXIF child orientation is respected. Metadata is not copied. Multi-page images are rejected instead of silently flattened. |

Outputs are new files in `Formatted/<operation-id>` within the account workspace.
The original mother and children are never overwritten. Renaming is optional and
uses the existing name builder. Completion always offers adding the **output
copies** to Fire Mountain; this queues them and does not delete anything.

Formatting is not a semantic document rewrite. Unstyled headings, custom
bibliography systems, complex tables, floating drawings and unavailable fonts
require review. Child references are not replaced with unrelated mother
references. Enlarging an image cannot reconstruct lost detail.

## Verification

- Production build and 17 regression tests passed.
- Native DOCX tests verify preserved source bytes/text/citations/emphasis,
  transferred style sizes/margins/header, optional header retention and refusal
  to overwrite an existing output.
- A Windows image conversion produced a verified 320×240 image at 144 DPI.
- Browser fixture verifies phone folder expansion/import, project grouping,
  coloured bars, purple queue action and the Fire Mountain confirmation.
- Windows device enumeration succeeded; **no phone was connected** for a live
  transfer test. Phone transfer is therefore not yet verified on actual hardware.
- The installed Word automation failed/timed out in this environment. The test's
  headless Word process was stopped. PDF/legacy-document formatting is implemented
  but is **not verified end to end** here; DOCX does not depend on that path.
- New modules pass targeted ESLint. Existing Folder Management / preview code
  has pre-existing effect-related lint errors; this does not prevent the build.

Run regression tests:

```sh
node --test tests/applicationFiles.test.mjs tests/folderDragHover.test.mjs tests/new-workflows.test.mjs tests/docx-format.test.mjs
```

The UI fixture is `/tests/ui/new-workflows.html` on the Vite development server.
It uses fake data and cannot reach the real backend. The optional Windows/Word
test is `node tests/format-integration.mjs --word`; omit `--word` to verify only
Windows image conversion. Both commands create only synthetic files.

Dashboard and reliability review (2026-08-31):

- Dashboard folder outlines stay solid; application file-window controls sit at the top left.
- Recent files accepts any finite positive hour value, including fractions and periods beyond seven days.
- Path-backed Fire Mountain items go directly to the OS recycle bin without the browser directory picker. Failed items stay queued, all mounted blocks share the sending state, and filenames are treated literally rather than as glob patterns.
- File previews share one cancellable hook. Folder listing and format inventory discard obsolete responses; the format selector is rendered by React rather than injected into the DOM.
- Removed redundant state effects and corrected email/calendar callback dependencies. Build, lint and all 22 automated tests pass.
- `/tests/ui/fire-mountain.html` tests partial failure, retry, shared queues and hour validation with mocked requests only; it never trashes real files.

Implementation references: [Microsoft Open XML styles](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-apply-a-style-to-a-paragraph-in-a-word-processing-document),
[Word style transfer](https://learn.microsoft.com/en-us/office/vba/api/word.document.copystylesfromtemplate),
[Windows portable-file copying](https://learn.microsoft.com/en-us/windows/win32/shell/folder-copyhere),
[JSZip package generation](https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html).
