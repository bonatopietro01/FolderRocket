const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {invokeWorldAssistant} = require("../services/stickyNoteAiService");

test("world assistant calls the shared AI with only selected profile instructions and user prompt", async () => {
    const requests = [];
    const sharedClient = {responses: {create: async request => { requests.push(request); return {output_text: "Risposta di prova"}; }}};
    const result = await invokeWorldAssistant({
        worldName: "Lavoro",
        kind: "skill",
        name: "Revisione",
        instructions: "Controlla la coerenza del testo fornito.",
        prompt: "Verifica questo riepilogo.",
        clientOverride: sharedClient
    });
    assert.deepEqual(result, {text: "Risposta di prova", matchedFiles: []});
    assert.equal(requests.length, 1);
    assert.equal(requests[0].store, false);
    const transmitted = JSON.stringify(requests[0]);
    assert.match(transmitted, /Controlla la coerenza del testo fornito/);
    assert.match(transmitted, /Verifica questo riepilogo/);
    assert.doesNotMatch(transmitted, /Personal|gmail|other-world|email body|document contents/i);
    assert.match(transmitted, /non ricevi contenuti dei file, email o dati di altri pianeti/i);
});

test("world assistant uses only its explicitly allowed model and searches filenames in supplied planet folders", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-agent-world-"));
    try {
        await fs.writeFile(path.join(root, "Budget_Report_Q3.docx"), "private document body must not be sent");
        const requests = [];
        const sharedClient = {responses: {create: async request => { requests.push(request); return {output_text: "Ho trovato il rapporto."}; }}};
        const result = await invokeWorldAssistant({
            worldName: "Lavoro", kind: "agent", name: "Ricerca", instructions: "Trova file pertinenti.",
            prompt: "trova budget report", model: "gpt-4.1", capabilities: ["search-files"], folders: [root], clientOverride: sharedClient
        });
        assert.deepEqual(result, {text: "Ho trovato il rapporto.", matchedFiles: ["Budget_Report_Q3.docx"]});
        assert.equal(requests[0].model, "gpt-4.1");
        const sent = JSON.stringify(requests[0]);
        assert.match(sent, /Budget_Report_Q3\.docx/);
        assert.doesNotMatch(sent, /private document body must not be sent/);
    } finally {
        await fs.rm(root, {recursive: true, force: true});
    }
});

test("world assistant rejects empty requests without calling the shared AI", async () => {
    let called = false;
    await assert.rejects(() => invokeWorldAssistant({
        worldName: "Lavoro", kind: "agent", name: "Aiuto", instructions: "", prompt: " ",
        clientOverride: {responses: {create: async () => { called = true; return {output_text: ""}; }}}
    }), /Indica un nome e una richiesta/);
    assert.equal(called, false);
});
