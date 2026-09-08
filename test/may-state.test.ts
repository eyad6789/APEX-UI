import assert from "node:assert/strict";
import test from "node:test";
import { mapConsoleState, STATE_VISUALS } from "../lib/may/stateMachine.ts";

test("maps existing console states to May states", () => {
  assert.equal(mapConsoleState("idle"), "idle");
  assert.equal(mapConsoleState("listening"), "listening");
  assert.equal(mapConsoleState("thinking"), "thinking");
  assert.equal(mapConsoleState("speaking"), "speaking");
});

test("defines distinct visual targets for every May state", () => {
  assert.deepEqual(Object.keys(STATE_VISUALS).sort(), ["idle", "listening", "sleep", "speaking", "thinking", "wake"]);
  assert.ok(STATE_VISUALS.listening.formation > STATE_VISUALS.idle.formation);
  assert.ok(STATE_VISUALS.speaking.mouth > STATE_VISUALS.idle.mouth);
  assert.ok(STATE_VISUALS.thinking.temple > STATE_VISUALS.idle.temple);
});
