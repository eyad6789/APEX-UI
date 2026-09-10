import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseBlocks, stripBlocks, registerHandler, runBlocks } from "../lib/agent/commands.ts";

test("parses a single block", () => {
  const blocks = parseBlocks(`Noted, sir. <apex:schedule>{"action":"add","title":"X"}</apex:schedule>`);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].ns, "schedule");
  assert.equal(blocks[0].payload.title, "X");
});

test("parses several blocks in order", () => {
  const blocks = parseBlocks(
    `<apex:schedule>{"action":"list"}</apex:schedule>\n<apex:terminal>{"action":"open","count":4}</apex:terminal>`,
  );
  assert.deepEqual(blocks.map((b) => b.ns), ["schedule", "terminal"]);
  assert.equal(blocks[1].payload.count, 4);
});

test("mismatched tags do not parse", () => {
  assert.equal(parseBlocks(`<apex:terminal>{"action":"open"}</apex:schedule>`).length, 0);
});

test("malformed json is skipped, not thrown", () => {
  assert.equal(parseBlocks(`<apex:schedule>{nope}</apex:schedule>`).length, 0);
});

test("stripBlocks leaves only what is spoken", () => {
  const said = stripBlocks(`Opening them now.\n<apex:terminal>{"action":"open","count":2}</apex:terminal>`);
  assert.equal(said, "Opening them now.");
});

test("a handler that throws costs its sentence, not the reply", async () => {
  registerHandler("boom", () => { throw new Error("no"); });
  registerHandler("fine", () => ({ spoken: "second one worked" }));
  const outcome = await runBlocks(parseBlocks(
    `<apex:boom>{"a":1}</apex:boom><apex:fine>{"a":1}</apex:fine>`,
  ));
  assert.equal(outcome.spoken.length, 2);
  assert.match(outcome.spoken[0], /could not/);
  assert.equal(outcome.spoken[1], "second one worked");
});

test("an unknown namespace is ignored", async () => {
  const outcome = await runBlocks(parseBlocks(`<apex:nothing>{"a":1}</apex:nothing>`));
  assert.deepEqual(outcome.spoken, []);
});

test("context is collected separately from speech", async () => {
  registerHandler("facts", () => ({ spoken: "", context: "the readme says hello" }));
  const outcome = await runBlocks(parseBlocks(`<apex:facts>{"a":1}</apex:facts>`));
  assert.deepEqual(outcome.spoken, []);
  assert.deepEqual(outcome.context, ["the readme says hello"]);
});
