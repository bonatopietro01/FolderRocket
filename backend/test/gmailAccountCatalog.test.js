const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {buildGmailAccountCatalog, collectAccountAssociations} = require("../services/gmailAccountCatalog");

function loadEmailAccountHelpers() {
    const sourcePath = path.join(__dirname, "..", "..", "src", "emailAccounts.ts");
    const source = require("node:fs").readFileSync(sourcePath, "utf8");
    const output = require("typescript").transpileModule(source, {compilerOptions:{module:require("typescript").ModuleKind.CommonJS,target:require("typescript").ScriptTarget.ES2022}}).outputText;
    const module = {exports:{}};
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        require: id => id === "./api" ? {API_BASE_URL:"http://localhost"} : require(id),
        Map,
        Date,
        Promise
    });
    return module.exports;
}

test("Gmail account catalog groups duplicate mailboxes and reports connected and selected planets", () => {
    const preferences = {
        worlds: {
            work: {dashboard: {sourceBlocks: [{id: "gmail-work", type: "gmail"}] }},
            personal: {dashboard: {sourceBlocks: [{id: "gmail-personal", type: "gmail", accountBlockId: "gmail-work"}]}}
        }
    };
    const accounts = buildGmailAccountCatalog([
        {blockId: "gmail-work", email: "pietro@example.test", originWorldId: "work", originWorldName: "Lavoro"},
        {blockId: "gmail-personal", email: "PIETRO@example.test", originWorldId: "personal", originWorldName: "Personale"}
    ], preferences);

    assert.equal(accounts.length, 1);
    assert.deepEqual(accounts[0].blockIds, ["gmail-personal", "gmail-work"]);
    assert.deepEqual(accounts[0].originWorldIds, ["personal", "work"]);
    assert.deepEqual(accounts[0].associatedWorldIds, ["personal", "work"]);
});

test("Gmail account catalog preserves unknown legacy origin without inventing a planet", () => {
    const accounts = buildGmailAccountCatalog([{blockId: "gmail-legacy", email: "old@example.test", legacyShared: true}], {});
    assert.equal(accounts.length, 1);
    assert.deepEqual(accounts[0].originWorldIds, []);
    assert.deepEqual(accounts[0].associatedWorldIds, []);
    assert.equal(accounts[0].originUnknown, true);
    assert.equal(accounts[0].legacyShared, true);
});

test("Gmail account labels distinguish known origin, additional planet associations, and unknown origin", () => {
    const {emailAccountOptionLabel} = loadEmailAccountHelpers();
    assert.equal(emailAccountOptionLabel({
        blockId: "gmail-work",
        email: "pietro@example.test",
        label: "pietro@example.test",
        originWorldIds: ["work"],
        associatedWorldIds: ["work", "personal"]
    }, {work:"Lavoro", personal:"Personale"}), "pietro@example.test · collegato da Lavoro · selezionato in Personale");
    assert.equal(emailAccountOptionLabel({blockId:"legacy-id", email:"old@example.test", label:"old@example.test"}, {}), "old@example.test · origine non specificata");
});

test("existing Gmail tokens remain shared catalog entries and are not copied into the first planet read", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-gmail-token-test-"));
    t.after(() => fs.rm(directory, {recursive: true, force: true}));
    const tokenDirectory = path.join(directory, "tokens");
    const servicePath = path.resolve(__dirname, "../services/emailTokenStore.js");
    const script = `
        const assert = require("node:assert/strict");
        const store = require(${JSON.stringify(servicePath)});
        const userId = "test-user";
        store.saveConnection("gmail", userId, {email:"old@example.test", refreshToken:"preserve-me"});
        const catalog = store.listConnections("gmail", userId);
        assert.equal(catalog.length, 1);
        assert.equal(catalog[0].blockId, store.LEGACY_SHARED_GMAIL_ACCOUNT_ID);
        assert.equal(store.migrateLegacyConnectionToBlock("gmail", userId, "new-personal-block"), null);
        assert.equal(store.getConnection("gmail", userId, "new-personal-block"), null);
        assert.equal(store.getConnection("gmail", userId, store.LEGACY_SHARED_GMAIL_ACCOUNT_ID).refreshToken, "preserve-me");
        store.removeConnection("gmail", userId, "new-personal-block");
        assert.equal(store.listConnections("gmail", userId).length, 1);
        store.removeConnection("gmail", userId, store.LEGACY_SHARED_GMAIL_ACCOUNT_ID);
        assert.equal(store.listConnections("gmail", userId).length, 0);
        store.saveConnection("gmail", userId, {email:"work@example.test", refreshToken:"work-token"}, "work-block");
        assert.equal(store.migrateLegacyConnectionToBlock("gmail", userId, "personal-block"), null);
        assert.equal(store.getConnection("gmail", userId, "personal-block"), null);
        assert.equal(store.listConnections("gmail", userId).length, 1);
        assert.equal(store.getConnection("gmail", userId, "work-block").refreshToken, "work-token");
        store.removeConnection("gmail", userId, "personal-block");
        assert.equal(store.getConnection("gmail", userId, "work-block").refreshToken, "work-token");
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
        encoding: "utf8",
        env: {...process.env, FOLDERROCKET_TOKEN_DIR: tokenDirectory}
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("an explicit no-account choice is persisted and excluded from scheduled Gmail access", () => {
    const service = require("../services/emailAlertSettingsService");
    const scheduler = require("node:fs").readFileSync(path.join(__dirname, "..", "services", "emailAlertScheduler.js"), "utf8");
    const settings = service.normalizeProviderBlock({accountBlockId: null, rules: []});
    assert.equal(settings.accountBlockId, null);
    assert.match(scheduler, /providerSettings\.accountBlockId === null/);
});

test("Gmail account association discovery ignores blocks explicitly set to no account", () => {
    const associations = collectAccountAssociations({worlds: {
        work: {dashboard: {sourceBlocks: [{id: "gmail-work", type: "gmail", accountBlockId: null}]}}
    }});
    assert.equal(associations.has("gmail-work"), false);
});


test("Gmail picker keeps selection world-scoped, explicit, and race-isolated", () => {
    const root = path.join(__dirname, "..", "..");
    const app = require("node:fs").readFileSync(path.join(root, "src", "App.tsx"), "utf8");
    const panel = require("node:fs").readFileSync(path.join(root, "src", "components", "GmailSourcePanel.tsx"), "utf8");
    assert.match(app, /key=\{`\$\{world\.id\}-\$\{block\.id\}-\$\{block\.accountBlockId === null \? "none" : block\.accountBlockId \|\| "default"\}`\}/);
    assert.match(panel, /accountBlockId === null \? "" : accountBlockId \|\| alertBlockId/);
    assert.match(panel, /<option value="">Nessun account selezionato<\/option>/);
    assert.match(panel, /value=\{accountPickerValue\}/);
    assert.match(panel, /worldId, worldName/);
    assert.match(panel, /accountDataScope = `\$\{storageScope\}-gmail-\$\{credentialBlockId \|\| "none"\}`/);
});
