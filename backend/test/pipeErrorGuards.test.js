const assert = require("node:assert/strict");
const {EventEmitter} = require("node:events");
const test = require("node:test");

const {attachLogPipeErrorGuards} = require("../services/pipeErrorGuards");

test("log pipe guard consumes only EPIPE errors", () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    attachLogPipeErrorGuards([stdout, stderr]);

    assert.doesNotThrow(() => stdout.emit("error", Object.assign(new Error("pipe closed"), {code:"EPIPE"})));
    const failure = Object.assign(new Error("stream failure"), {code:"EIO"});
    assert.throws(() => stderr.emit("error", failure), error => error === failure);
});
