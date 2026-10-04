const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("Gmail and Outlook draft attachments are read asynchronously without changing their content", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "folderrocket-email-draft-"));
    t.after(() => fs.rm(directory, {recursive: true, force: true}));
    const attachmentPath = path.join(directory, "synthetic-attachment.bin");
    const secondAttachmentPath = path.join(directory, "synthetic-second-attachment.bin");
    const content = Buffer.from([0, 1, 2, 42, 127, 128, 255]);
    const secondContent = Buffer.from("second synthetic attachment");
    await fs.writeFile(attachmentPath, content);
    await fs.writeFile(secondAttachmentPath, secondContent);

    const script = String.raw`
    (async () => {
        const assert = require("node:assert/strict");
        const fs = require("node:fs");
        const store = require("./services/emailTokenStore");
        const gmail = require("./services/gmailService");
        const outlook = require("./services/outlookService");
        const attachmentPath = __ATTACHMENT_PATH__;
        const secondAttachmentPath = __SECOND_ATTACHMENT_PATH__;
        const content = Buffer.from([0, 1, 2, 42, 127, 128, 255]);
        const secondContent = Buffer.from("second synthetic attachment");
        const userId = "synthetic-audit-user";
        const gmailBlockId = "audit-gmail";
        const outlookBlockId = "audit-outlook";
        const expiresAt = Date.now() + 60 * 60 * 1000;
        store.saveConnection("gmail", userId, {accessToken:"synthetic-gmail-token", refreshToken:"synthetic-gmail-refresh", expiresAt, scopes:"https://www.googleapis.com/auth/gmail.compose"}, gmailBlockId);
        store.saveConnection("outlook", userId, {accessToken:"synthetic-outlook-token", refreshToken:"synthetic-outlook-refresh", expiresAt, scopes:""}, outlookBlockId);
        assert.equal(gmail.getStatus(userId, gmailBlockId).connected, true);
        assert.equal(outlook.getStatus(userId, outlookBlockId).connected, true);

        const requests = [];
        global.fetch = async (url, options = {}) => {
            requests.push({url: String(url), options});
            const payload = String(url).includes("/me/messages") && !String(url).includes("/attachments") ? {id:"synthetic-outlook-draft"} : {id:"synthetic-draft"};
            return {ok:true, status:200, json:async () => payload};
        };

        const originalReadFileSync = fs.readFileSync;
        fs.readFileSync = () => { throw new Error("Synchronous file reads are forbidden in this test."); };
        try {
            const attachments = [{path:attachmentPath, name:"sample.bin"}, {path:secondAttachmentPath, name:"second.bin"}];
            await gmail.createDraft({to:"user@example.test", subject:"Synthetic", text:"Gmail body", attachments}, userId, gmailBlockId);
            await outlook.createDraft({to:"user@example.test", subject:"Synthetic", text:"Outlook body", attachments}, userId, outlookBlockId);
        } finally {
            fs.readFileSync = originalReadFileSync;
        }

        const gmailRequest = requests.find(request => request.url.includes("gmail.googleapis.com") && request.url.endsWith("/drafts"));
        assert.ok(gmailRequest, "Gmail draft request should be sent");
        const gmailRaw = Buffer.from(JSON.parse(gmailRequest.options.body).message.raw, "base64url").toString("utf8");
        assert.ok(gmailRaw.includes(content.toString("base64")), "Gmail MIME draft should preserve the attachment bytes");
        assert.ok(gmailRaw.includes(secondContent.toString("base64")), "Gmail MIME draft should preserve later attachments in order");

        const outlookRequests = requests.filter(request => request.url.includes("graph.microsoft.com") && request.url.endsWith("/attachments"));
        assert.equal(outlookRequests.length, 2, "Outlook should attach every selected file");
        assert.deepEqual(Buffer.from(JSON.parse(outlookRequests[0].options.body).contentBytes, "base64"), content);
        assert.deepEqual(Buffer.from(JSON.parse(outlookRequests[1].options.body).contentBytes, "base64"), secondContent);
    })().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
    `;
    const result = spawnSync(process.execPath, ["-e", script
        .replace("__ATTACHMENT_PATH__", JSON.stringify(attachmentPath))
        .replace("__SECOND_ATTACHMENT_PATH__", JSON.stringify(secondAttachmentPath))], {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        env: {...process.env, FOLDERROCKET_TOKEN_DIR: path.join(directory, "tokens")}
    });
    assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
});
