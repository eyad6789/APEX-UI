import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildScript, clampCount, openTerminals, MAX_WINDOWS } from "../lib/terminal/open.ts";
import { WORKSPACE_ROOT } from "../lib/paths.ts";

test("count is clamped to a sane range", () => {
  assert.equal(clampCount(0), 1);
  assert.equal(clampCount(-5), 1);
  assert.equal(clampCount(4), 4);
  assert.equal(clampCount(40), MAX_WINDOWS);      // a misheard "forty"
  assert.equal(clampCount("banana"), 1);
  assert.equal(clampCount(undefined), 1);
});

test("one window is scripted per requested session", () => {
  const script = buildScript("/tmp/x", 4);
  assert.equal(script.split("create window").length - 1, 4);
});

test("the script only ever cds and runs claude", () => {
  const script = buildScript("/tmp/x", 1);
  assert.match(script, /write text "cd " & quoted form of "\/tmp\/x" & " && claude"/);
});

test("a path with shell metacharacters cannot break out", () => {
  // The path is an AppleScript literal, quoted for the shell by AppleScript itself.
  const script = buildScript(`/tmp/a"; rm -rf ~; echo "`, 1);
  assert.ok(!script.includes(`"; rm -rf ~; echo "`), "raw quotes must not survive");
  assert.match(script, /\\"/);
});

test("dryRun builds without opening anything", async () => {
  const result = await openTerminals({ path: WORKSPACE_ROOT, count: 2, dryRun: true });
  assert.equal(result.opened, 2);
  assert.match(result.script, /tell application "iTerm"/);
});

test("openTerminals refuses a path outside the workspace", async () => {
  await assert.rejects(() => openTerminals({ path: "/etc", count: 1, dryRun: true }));
});

test("the timeout scales with the number of windows", async () => {
  const { timeoutFor } = await import("../lib/terminal/open.ts");
  assert.ok(timeoutFor(1) >= 20_000, "one window needs room for a cold start");
  assert.ok(timeoutFor(8) > timeoutFor(4), "more windows, more time");
});

// These exercise the handler's own guards. They return before anything is opened,
// so no windows appear.
test("an ambiguous project name asks instead of guessing", async () => {
  const { terminalHandler } = await import("../lib/terminal/commands.ts");
  const result = await terminalHandler({ action: "open", count: 1, project: "geo" });
  assert.match(result.spoken, /Which one|which one/);
  assert.match(result.spoken, /Geo_Erp/);
  assert.equal(result.data, undefined, "nothing should have been opened");
});

test("an unknown project is refused, not guessed at", async () => {
  const { terminalHandler } = await import("../lib/terminal/commands.ts");
  const result = await terminalHandler({ action: "open", count: 1, project: "zebra-not-real" });
  assert.match(result.spoken, /could not find/);
  assert.equal(result.data, undefined);
});

test("a non-open action does nothing", async () => {
  const { terminalHandler } = await import("../lib/terminal/commands.ts");
  assert.equal((await terminalHandler({ action: "close" })).spoken, "");
});
