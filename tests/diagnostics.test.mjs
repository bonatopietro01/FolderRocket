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
    const sourcePath = path.join(projectRoot, "src", "components", "diagnostics", "diagnostics.ts");
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
        require: id => id === "../../api.ts" ? {API_BASE_URL: "http://localhost"} : require(id),
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

test("expected startup session and incomplete-wiki responses do not become diagnostic errors", async () => {
    const sourcePath = path.join(projectRoot, "src", "components", "diagnostics", "diagnostics.ts");
    const source = fs.readFileSync(sourcePath, "utf8");
    const output = require("typescript").transpileModule(source, {
        compilerOptions: {
            module: require("typescript").ModuleKind.CommonJS,
            target: require("typescript").ScriptTarget.ES2022
        }
    }).outputText;
    const module = {exports: {}};
    const captures = [];
    const mockWindow = {
        location: {pathname: "/", href: "http://localhost/"},
        __folderRocketDiagnosticsInstalled: false,
        dispatchEvent(event) {
            if (event.type === "folderrocket:diagnostic-captured") captures.push(event.detail);
        },
        addEventListener() {},
        setTimeout,
        async fetch(input) {
            const url = new URL(typeof input === "string" ? input : input.url, this.location.href);
            if (url.pathname === "/auth/me") return new Response(JSON.stringify({message: "Sign in required."}), {status: 401, headers: {"Content-Type": "application/json"}});
            if (url.pathname === "/worlds/work/obsidian/sync") return new Response(JSON.stringify({code: "KNOWLEDGE_INCOMPLETE", message: "Rebuild the wiki."}), {status: 409, headers: {"Content-Type": "application/json"}});
            return new Response("{}", {status: 200});
        }
    };
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        require: id => id === "../../api.ts" ? {API_BASE_URL: "http://localhost"} : require(id),
        Map,
        Date,
        Promise,
        Event,
        CustomEvent,
        URL,
        Request,
        Response,
        Headers,
        performance: {now: () => 1, getEntriesByType: () => []},
        document: {readyState: "loading", addEventListener() {}},
        console: {warn() {}},
        crypto: require("node:crypto").webcrypto,
        window: mockWindow,
        localStorage: {getItem: () => null, setItem() {}, removeItem() {}}
    });

    await module.exports.readLocalDiagnostics("startup");
    module.exports.installDiagnostics("startup");
    const startupAuth = await mockWindow.fetch("http://localhost/auth/me");
    assert.equal(startupAuth.status, 401);
    assert.equal(captures.length, 0, "pre-login session discovery is expected during startup");

    await module.exports.readLocalDiagnostics("synthetic-user");
    module.exports.installDiagnostics("synthetic-user");
    const authenticatedAuth = await mockWindow.fetch("http://localhost/auth/me");
    assert.equal(authenticatedAuth.status, 401);
    assert.equal(captures.at(-1)?.status, 401, "a later session failure must remain diagnosable");

    captures.length = 0;
    const wikiPrecondition = await mockWindow.fetch("http://localhost/worlds/work/obsidian/sync", {method: "POST"});
    assert.equal(wikiPrecondition.status, 409);
    assert.equal(captures.length, 0, "an actionable wiki readiness response is shown in the sync UI, not repeated as a diagnostic failure");
});
