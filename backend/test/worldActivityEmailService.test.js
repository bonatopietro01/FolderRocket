const assert = require("node:assert/strict");
const test = require("node:test");
const {appendDigestHistory, buildWorldActivityDigest, dueDigestKey, nextDigestAt, normalizeWorldActivityNotifications, sanitizeActivitySnapshot, selectActivitySnapshotSources, validForEnable} = require("../services/worldActivityEmailService");
const {runWorldActivityDigest} = require("../services/emailAlertScheduler");

const baseConfig = {
    enabled:true,
    senderProvider:"gmail",
    senderBlockId:"work-mail",
    recipient:"person@example.com",
    everyDays:1,
    time:"08:00",
    timeZone:"UTC",
    sources:["dailyActivities", "reminders", "calendar", "gmailAlerts"],
    anchorDate:"2026-10-01"
};

test("world digest snapshots retain only selected activity metadata, not arbitrary content", () => {
    const safe = sanitizeActivitySnapshot({
        activities:[{at:"2026-10-01T07:30:00Z",kind:"recent",summary:"Added report.pdf token=secret",body:"private document body",token:"secret"}],
        reminders:[{at:"2026-10-01T09:00:00Z",title:"Prepare meeting",body:"private note"}],
        calendarEvents:[{start:"2026-10-01T10:00:00Z",title:"Review",description:"private"}]
    });
    assert.deepEqual(safe.activities[0], {at:"2026-10-01T07:30:00.000Z",kind:"recent",summary:"Added report.pdf token=[redacted]"});
    assert.deepEqual(safe.reminders[0], {at:"2026-10-01T09:00:00.000Z",title:"Prepare meeting"});
    assert.deepEqual(safe.calendarEvents[0], {start:"2026-10-01T10:00:00.000Z",title:"Review",end:""});
    const digest = buildWorldActivityDigest({worldName:"Work", config:baseConfig, snapshot:safe, now:new Date("2026-10-01T08:00:00Z")});
    assert.match(digest.text, /Added report\.pdf/);
    assert.doesNotMatch(digest.text, /private document body|private note|secret/);
});

test("world digest scheduling respects timezone, cadence, prior delivery and enabled state", () => {
    const beforeTime = new Date("2026-10-01T07:55:00Z");
    assert.equal(dueDigestKey(baseConfig, {}, beforeTime), "");
    assert.equal(nextDigestAt(baseConfig, {}, beforeTime), "2026-10-01T08:00:00.000Z");
    assert.equal(dueDigestKey(baseConfig, {}, new Date("2026-10-01T08:00:00Z")), "2026-10-01");
    assert.equal(dueDigestKey(baseConfig, {lastSentKey:"2026-10-01"}, new Date("2026-10-01T08:01:00Z")), "");
    assert.equal(nextDigestAt(baseConfig, {lastSentKey:"2026-10-01"}, new Date("2026-10-01T08:01:00Z")), "2026-10-02T08:00:00.000Z");
    assert.equal(dueDigestKey({...baseConfig, enabled:false}, {}, new Date("2026-10-01T09:00:00Z")), "");
    assert.equal(nextDigestAt({...baseConfig, everyDays:2}, {}, new Date("2026-10-02T07:00:00Z")), "2026-10-03T08:00:00.000Z");
    assert.equal(nextDigestAt(baseConfig, {attemptKey:"2026-10-01",attempts:1,nextAttemptAt:"2026-10-01T08:10:00.000Z"}, new Date("2026-10-01T08:05:00Z")), "2026-10-01T08:10:00.000Z");
    assert.equal(normalizeWorldActivityNotifications({...baseConfig, timeZone:"not/a-zone"}).timeZone, "UTC");
});

test("digest enablement requires a sender, valid recipient and selected source", () => {
    assert.throws(() => validForEnable({...baseConfig, senderBlockId:""}), /Choose a connected sender/);
    assert.throws(() => validForEnable({...baseConfig, recipient:"invalid"}), /valid digest recipient/);
    assert.throws(() => validForEnable({...baseConfig, sources:[]}), /at least one digest source/);
    assert.throws(() => validForEnable({...baseConfig, senderProvider:"outlook"}, false), /Mail.Send consent/);
    assert.equal(validForEnable({...baseConfig, senderProvider:"outlook"}, true).enabled, true);
});

test("digest history is bounded and redacts secrets from provider errors", () => {
    const runtime = appendDigestHistory({}, {at:"2026-10-01T08:00:00Z",kind:"scheduled",status:"failed",error:"Authorization: Bearer abc token=xyz"});
    assert.equal(runtime.history.length, 1);
    assert.doesNotMatch(runtime.history[0].error, /abc|xyz/);
    const bounded = Array.from({length:30}, (_,index) => ({at:`2026-10-${String(index + 1).padStart(2,"0")}T08:00:00Z`,kind:"test",status:"sent"})).reduce((value,entry) => appendDigestHistory(value,entry), {});
    assert.equal(bounded.history.length, 25);
});

test("snapshot persistence retains only categories explicitly selected for this planet", () => {
    const input = {activities:[{at:"2026-10-01T07:30:00Z",kind:"recent",summary:"File activity"},{at:"2026-10-01T07:31:00Z",kind:"teams",summary:"Teams count"}],calendarEvents:[{start:"2026-10-01T10:00:00Z",title:"Meeting"}],reminders:[{at:"2026-10-01T11:00:00Z",title:"Due"}]};
    const selected = selectActivitySnapshotSources(input,["teams","calendar"]);
    assert.deepEqual(selected.activities.map(item => item.kind),["teams"]);
    assert.equal(selected.calendarEvents.length,1);
    assert.deepEqual(selected.reminders,[]);
    const empty = selectActivitySnapshotSources(input,[]);
    assert.deepEqual(empty.activities,[]);
    assert.deepEqual(empty.calendarEvents,[]);
    assert.deepEqual(empty.reminders,[]);
});

async function runWithFakeSender(error) {
    const now = new Date("2026-10-01T08:05:00Z");
    const world = {activityNotifications:{...baseConfig, runtime:{}}};
    const writes = [];
    let sends = 0;
    await runWorldActivityDigest("user", "work", "Work", world, async value => writes.push(value), {
        now:() => now,
        gmail:{sendEmail:async () => {sends += 1; if (error) throw error;}}
    });
    return {writes, sends};
}

test("scheduled digest sends once and persists a deduplication key before and after delivery", async () => {
    const {writes, sends} = await runWithFakeSender(null);
    assert.equal(sends, 1);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].activityNotifications.runtime.pendingKey, "2026-10-01");
    assert.equal(writes[1].activityNotifications.runtime.lastSentKey, "2026-10-01");
    assert.equal(writes[1].activityNotifications.runtime.lastStatus, "sent");
});

test("digest retries only a definitive 429 throttle and holds uncertain outcomes to prevent duplicates", async () => {
    const throttled = new Error("Provider throttled"); throttled.status = 429;
    const retryResult = await runWithFakeSender(throttled);
    assert.equal(retryResult.writes.at(-1).activityNotifications.runtime.lastStatus, "retrying");
    assert.equal(retryResult.writes.at(-1).activityNotifications.runtime.pendingKey, "");
    assert.ok(retryResult.writes.at(-1).activityNotifications.runtime.nextAttemptAt);

    const ambiguous = new Error("Provider unavailable"); ambiguous.status = 503;
    const uncertainResult = await runWithFakeSender(ambiguous);
    const runtime = uncertainResult.writes.at(-1).activityNotifications.runtime;
    assert.equal(runtime.lastStatus, "delivery-uncertain");
    assert.equal(runtime.pendingKey, "2026-10-01");
    assert.equal(dueDigestKey(baseConfig, runtime, new Date("2026-10-01T09:00:00Z")), "");

    const rejected = new Error("Invalid recipient"); rejected.status = 400;
    const failedResult = await runWithFakeSender(rejected);
    assert.equal(failedResult.writes.at(-1).activityNotifications.runtime.lastStatus, "failed");
    assert.equal(failedResult.writes.at(-1).activityNotifications.runtime.attempts, 3);
});
