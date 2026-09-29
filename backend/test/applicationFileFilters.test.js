const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function loadApplicationFiles() {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", "src", "applicationFiles.ts"), "utf8");
    const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    const loaded = {exports: {}};
    vm.runInNewContext(output, {module: loaded, exports: loaded.exports});
    return loaded.exports;
}

test("application size filters include boundaries, exclude unknown sizes, and handle invalid ranges", () => {
    const {filterApplicationFilesBySize} = loadApplicationFiles();
    const files = [
        {name: "small.docx", path: "C:/small.docx", size: 512 * 1024},
        {name: "one-mb.pdf", path: "C:/one-mb.pdf", size: 1024 * 1024},
        {name: "large.zip", path: "C:/large.zip", size: 3 * 1024 * 1024},
        {name: "unknown.txt", path: "C:/unknown.txt"}
    ];
    assert.equal(filterApplicationFilesBySize(files, 1, 3).map(file => file.name).join(","), "one-mb.pdf,large.zip");
    assert.equal(filterApplicationFilesBySize(files, null, 1).map(file => file.name).join(","), "small.docx,one-mb.pdf");
    assert.equal(filterApplicationFilesBySize(files, 3, 1).length, 0);
    assert.equal(filterApplicationFilesBySize(files, Number.NaN, -1), files);
});
