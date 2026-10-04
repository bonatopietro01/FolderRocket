import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import test from "node:test";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("frontend diagnostics redact Windows paths that contain spaces", async () => {
    const sourcePath = path.join(projectRoot, "src", "diagnostics.ts");
    const source = fs.readFileSync(sourcePath, "utf8");
    const output = require("typescript").transpileModule(source, {
        compilerOptions: {
            module: require("typescript").ModuleKind.CommonJS,
            target: require("typescript").ScriptTarget.ES2022
        }
    }).outputText;
    const module = {exports: {}};
    let captured = null;
    const mockWindow = {
        location: {pathname: "/audit"},
        dispatchEvent(event) {
            if (event.type === "folderrocket:diagnostic-captured") captured = event.detail;
        },
        setTimeout
    };
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        require: id => id === "./api" ? {API_BASE_URL: "http://localhost"} : require(id),
        Map,
        Date,
        Promise,
        Event,
        CustomEvent,
        URL,
        Request,
        crypto: require("node:crypto").webcrypto,
        window: mockWindow,
        localStorage: {getItem: () => null, setItem() {}, removeItem() {}}
    });

    await module.exports.readLocalDiagnostics("synthetic-user");
    module.exports.captureDiagnostic("synthetic-user", {
        id: "synthetic-path",
        type: "runtime",
        message: "Failed at C:\\Synthetic User\\Workspace With Spaces\\private.pdf (EACCES)"
    });
    assert.equal(captured?.message, "Failed at [local path] (EACCES)");
});
