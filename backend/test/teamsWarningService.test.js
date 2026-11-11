const assert = require("node:assert/strict");
const test = require("node:test");
const {filterTeamsAlertMessages, evaluateTeamsSourceRules} = require("../services/conversations/teamsWarningService");

test("Teams alert filtering keeps only the selected date range and bounded message metadata", () => {
    const localDateTime = value => {
        const date = new Date(value);
        const pad = part => String(part).padStart(2,"0");
        return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    const start = new Date("2026-10-01T10:00:00Z");
    const end = new Date("2026-10-01T12:00:00Z");
    const messages = [
        {id:"old",createdAt:"2026-10-01T09:59:00Z",sender:"Earlier",text:"outside"},
        {id:"inside",createdAt:"2026-10-01T10:30:00Z",sender:"Ari",senderEmail:"ari@example.test",text:"x".repeat(1400),attachments:[{name:"private.pdf"}]},
        {id:"future",createdAt:"2026-10-01T12:01:00Z",sender:"Later",text:"outside"}
    ];
    const selected = filterTeamsAlertMessages(messages,{mode:"range",startAt:localDateTime(start),endAt:localDateTime(end)},new Date("2026-10-01T12:00:00Z"));

    assert.equal(selected.length,1);
    assert.equal(selected[0].id,"inside");
    assert.equal(selected[0].sender,"Ari ari@example.test");
    assert.equal(selected[0].text.length,1200);
    assert.deepEqual(Object.keys(selected[0]).sort(),["id","receivedAt","sender","subject","text","webLink"].sort());
    assert.equal(selected[0].subject,"");
    assert.equal(selected[0].webLink,"");
});

test("Teams alert evaluation reads one selected chat and excludes disabled or foreign account rules", async () => {
    const calls = [];
    const rules = [
        {id:"chat-rule",enabled:true,accountBlockId:"outlook-a",source:{kind:"chat",id:"chat-1"}},
        {id:"other-chat",enabled:true,accountBlockId:"outlook-a",source:{kind:"chat",id:"chat-2"}},
        {id:"other-account",enabled:true,accountBlockId:"outlook-b",source:{kind:"chat",id:"chat-1"}},
        {id:"disabled",enabled:false,accountBlockId:"outlook-a",source:{kind:"chat",id:"chat-1"}}
    ];
    const result = await evaluateTeamsSourceRules({
        rules,
        userId:"synthetic-user",
        blockId:"outlook-a",
        source:{kind:"chat",id:"chat-1"},
        listMessages:async (source,userId,blockId) => {
            calls.push({source,userId,blockId});
            return [{id:"message-1",createdAt:"2026-10-01T10:30:00Z",sender:"Ari",text:"deadline"}];
        },
        evaluate:async ({rules:scopedRules,messages}) => {
            calls.push({ruleIds:scopedRules.map(rule=>rule.id),messages});
            return [{ruleId:scopedRules[0].id,newCount:1}];
        }
    });

    assert.deepEqual(result,[{ruleId:"chat-rule",newCount:1}]);
    assert.equal(calls.length,2);
    assert.deepEqual(calls[0],{source:{kind:"chat",id:"chat-1"},userId:"synthetic-user",blockId:"outlook-a"});
    assert.deepEqual(calls[1].ruleIds,["chat-rule"]);
    assert.equal(calls[1].messages.length,1);
});
