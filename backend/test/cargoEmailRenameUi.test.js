const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
function readSource(...segments) { return fs.readFileSync(path.join(root, ...segments), "utf8"); }

test("CargoRocket keeps saved notes out of the composer and switches between three creation modes", () => {
    const cargo = readSource("src", "components", "CargoShip.tsx");
    assert.match(cargo, /useState<CargoPostItMode>\("simple"\)/);
    assert.match(cargo, /postItMode === "simple"/);
    assert.match(cargo, /postItMode === "ai"/);
    assert.match(cargo, /postItMode === "reminder"/);
    assert.match(cargo, /setPostItMode\(current => current === "ai" \? "simple" : "ai"\)/);
    assert.match(cargo, /setPostItMode\(current => current === "reminder" \? "simple" : "reminder"\)/);
    assert.match(cargo, /type: "ai", storageScope, prompt: aiPrompt\.trim\(\)/);
    assert.match(cargo, /type: "reminder", storageScope, title: reminderTitle\.trim\(\), text: reminderText\.trim\(\), reminderAt/);
    assert.match(cargo, /noteDrafts\[storageScope\] \?\? readCargoNoteDraft\(storageScope\)/);
    assert.match(cargo, /localStorage\.setItem\(noteDraftKey\(storageScope\), JSON\.stringify\(currentNoteDraft\)\)/);
    assert.doesNotMatch(cargo, /cargoPostItList|No .*post-it in this planet|The draft stays in CargoRocket/);
});

test("email account pickers stay in Read attachments without the connected-account label", () => {
    const gmail = readSource("src", "components", "GmailSourcePanel.tsx");
    const outlook = readSource("src", "components", "OutlookSourcePanel.tsx");
    assert.match(gmail, /emailReaderHeaderMenu[\s\S]{0,1800}emailAccountPickerRow/);
    assert.match(gmail, /className="emailAccountChoices" role="listbox"/);
    assert.match(gmail, /onAccountBlockIdChange\?\.\(null\)/);
    assert.doesNotMatch(gmail, /<select aria-label=\{`Account Gmail/);
    assert.doesNotMatch(gmail, /Connected ·/);
    assert.doesNotMatch(outlook, /Account collegato|Collegato solo per questo pianeta|emailHeaderStatus/);
    assert.match(outlook, /emailReaderHeaderMenu[\s\S]{0,1500}emailAccountPickerRow/);
    assert.match(outlook, /onAccountBlockIdChange\?\.\(event\.target\.value === alertBlockId/);
});

test("File Studio Rename title opens the component menu and keeps its preview and template", () => {
    const studio = readSource("src", "components", "ProcessingWorkspace.tsx");
    assert.match(studio, /className="conversionRenameMenuButton"[^>]*aria-expanded=\{renameMenuOpen\}[^>]*aria-haspopup="menu"/);
    assert.match(studio, /<strong>Rename<\/strong>/);
    assert.match(studio, /className="conversionRenameMenu" role="menu"/);
    for (const option of ["Original name", "_converted", "Text", "Date"]) assert.ok(studio.includes(`label: "${option}"`));
    assert.match(studio, /addRenamePart\(option\.type\)/);
    assert.match(studio, /className="conversionRenamePreview"/);
    assert.match(studio, /folderrocket-conversion-rename-template/);
    assert.doesNotMatch(studio, /studioRenameSelect|Add block…|Add rename block/);
});
