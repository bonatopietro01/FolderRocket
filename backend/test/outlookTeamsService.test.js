const assert = require("node:assert/strict");
const test = require("node:test");
const {getAuthorizationUrl, isSafeTeamsNextLink, listTeamsDirectoryNextPage, listTeamsNextPage, shapeTeamsMessage, shapeTeamsMessages} = require("../services/outlookService");

test("Teams messages are normalized to safe text and do not expose arbitrary links as downloadable files", () => {
    const message = shapeTeamsMessage({
        id: "message-1",
        createdDateTime: "2026-09-29T10:00:00Z",
        from: {user: {displayName: "Pietro"}},
        body: {contentType: "html", content: "<div>Hello&nbsp;<at>Pietro</at></div><script>ignored()</script>"},
        mentions: [{mentionText: "Pietro"}],
        attachments: [
            {name: "report.pdf", contentUrl: "https://contoso.example/report.pdf"},
            {name: "unsafe.txt", contentUrl: "javascript:alert(1)"}
        ]
    });

    assert.equal(message.sender, "Pietro");
    assert.equal(message.text, "Hello Pietro");
    assert.deepEqual(message.mentions, ["Pietro"]);
    assert.deepEqual(message.attachments, [
        {id: "", name: "report.pdf", url: ""},
        {id: "", name: "unsafe.txt", url: ""}
    ]);
    assert.deepEqual(message.files, []);
    assert.equal(Object.hasOwn(message, "accessToken"), false);
});

test("Teams downloadable file references require a supported Microsoft share host", () => {
    const supported = shapeTeamsMessage({attachments:[{
        id:"attachment-1",
        name:"report.pdf",
        contentType:"reference",
        contentUrl:"https://tenant.sharepoint.com/sites/team/Shared%20Documents/report.pdf"
    }]});
    const unsupported = shapeTeamsMessage({attachments:[{
        id:"attachment-2",
        name:"report.pdf",
        contentType:"reference",
        contentUrl:"https://contoso.example/report.pdf"
    }]});

    assert.equal(supported.files.length, 1);
    assert.equal(supported.files[0].id, "attachment-1");
    assert.equal(supported.attachments[0].url, "https://tenant.sharepoint.com/sites/team/Shared%20Documents/report.pdf");
    assert.deepEqual(unsupported.files, []);
    assert.equal(unsupported.attachments[0].url, "");
});

test("Teams message summaries bound text and attachment metadata", () => {
    const message = shapeTeamsMessage({body: {content: "x".repeat(1600)}, attachments: Array.from({length: 25}, (_, index) => ({name: `file-${index}.pdf`}))});
    assert.equal(message.text.length, 1200);
    assert.equal(message.attachments.length, 25);
    assert.equal(message.mentions.length, 0);
});

test("Teams channel replies are flattened with their thread parent and safe reply pagination", () => {
    const replyCursor = "https://graph.microsoft.com/v1.0/teams/team/channels/channel/messages/message/replies?$skiptoken=next";
    const messages = shapeTeamsMessages([{
        id: "root-1",
        body: {content: "Root"},
        "replies@odata.nextLink": replyCursor,
        replies: [{id: "reply-1", body: {content: "Reply"}}]
    }]);

    assert.equal(messages.length, 2);
    assert.equal(messages[0].id, "root-1");
    assert.equal(messages[0].repliesNextLink, replyCursor);
    assert.equal(messages[1].id, "reply-1");
    assert.equal(messages[1].parentMessageId, "root-1");
    assert.equal(shapeTeamsMessage({id: "reply-2", replyToId: "root-2"}).parentMessageId, "root-2");
});

test("Teams consent is opt-in and normal Outlook authorization does not request Teams scopes", () => {
    const previousId = process.env.OUTLOOK_CLIENT_ID;
    const previousSecret = process.env.OUTLOOK_CLIENT_SECRET;
    process.env.OUTLOOK_CLIENT_ID = "folderrocket-test-client";
    process.env.OUTLOOK_CLIENT_SECRET = "folderrocket-test-secret";
    try {
        const mailUrl = new URL(getAuthorizationUrl("user-test", "outlook-block", {origin: "http://localhost:3000"}));
        assert.match(mailUrl.searchParams.get("scope"), /Mail\.Read/);
        assert.doesNotMatch(mailUrl.searchParams.get("scope"), /Chat\.Read|ChannelMessage/);
        const teamsUrl = new URL(getAuthorizationUrl("user-test", "teams-block", {origin: "http://localhost:3000", includeTeams: true}));
        assert.match(teamsUrl.searchParams.get("scope"), /Chat\.Read/);
        assert.match(teamsUrl.searchParams.get("scope"), /ChannelMessage\.Read\.All/);
        assert.match(teamsUrl.searchParams.get("scope"), /Files\.ReadWrite/);
        assert.equal(teamsUrl.searchParams.get("prompt"), "consent");
    } finally {
        if (previousId === undefined) delete process.env.OUTLOOK_CLIENT_ID; else process.env.OUTLOOK_CLIENT_ID = previousId;
        if (previousSecret === undefined) delete process.env.OUTLOOK_CLIENT_SECRET; else process.env.OUTLOOK_CLIENT_SECRET = previousSecret;
    }
});

test("Teams paging accepts only Microsoft Graph continuation URLs", async () => {
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/chats/chat-id/messages?$skiptoken=abc", {kind:"chat",id:"chat-id"}), true);
    assert.equal(isSafeTeamsNextLink("https://example.com/v1.0/chats"), false);
    await assert.rejects(listTeamsNextPage("https://example.com/steal", "user-test", "block-test"), /Invalid Teams message continuation link/);
    await assert.rejects(listTeamsDirectoryNextPage("https://example.com/steal", "chats", "user-test", "block-test"), /Invalid Teams directory continuation link/);
    await assert.rejects(listTeamsDirectoryNextPage("https://graph.microsoft.com/v1.0/me/chats", "other", "user-test", "block-test"), /Choose a valid Teams directory/);
});

test("Teams message continuations stay bound to the selected chat or team channel", () => {
    const chatSource = {kind:"chat",id:"chat-1"};
    const channelSource = {kind:"channel",teamId:"team-1",id:"channel-1"};
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/chats/chat-1/messages?$skiptoken=next", chatSource), true);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/chats/chat-2/messages?$skiptoken=next", chatSource), false);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/teams/team-1/channels/channel-1/messages?$skiptoken=next", channelSource), true);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/teams/team-2/channels/channel-1/messages?$skiptoken=next", channelSource), false);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/teams/team-1/channels/channel-2/messages?$skiptoken=next", channelSource), false);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next", chatSource), false);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/users/user-1/messages?$skiptoken=next", chatSource), false);
});

test("Teams directory continuations stay bound to the directory and selected team", () => {
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/me/chats?$skiptoken=next", {directoryKind:"chats"}), true);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/me/joinedTeams?$skiptoken=next", {directoryKind:"teams"}), true);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/teams/team-1/channels?$skiptoken=next", {directoryKind:"channels",teamId:"team-1"}), true);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/teams/team-2/channels?$skiptoken=next", {directoryKind:"channels",teamId:"team-1"}), false);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next", {directoryKind:"chats"}), false);
    assert.equal(isSafeTeamsNextLink("https://graph.microsoft.com/v1.0/users/user-1/chats?$skiptoken=next", {directoryKind:"chats"}), false);
});
