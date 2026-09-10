import { strict as assert } from "node:assert";
import { test } from "node:test";
import { repoStatus, secretsIn } from "../lib/git/repo.ts";
import { affirms, gitHandler } from "../lib/git/commands.ts";
import { WORKSPACE_ROOT } from "../lib/paths.ts";

test("a person saying yes is recognised, in either language", () => {
  for (const yes of ["yes", "Yes please", "yeah do it", "go ahead", "push it", "confirm", "ok", "نعم", "ايوه", "تمام"]) {
    assert.ok(affirms(yes), `"${yes}" should count as yes`);
  }
});

test("anything that is not a yes is not a yes", () => {
  for (const no of ["", "no", "not yet", "wait", "cancel", "stop", "what is on my calendar", "open vs code", "لا"]) {
    assert.equal(affirms(no), false, `"${no}" should not count as yes`);
  }
});

test("a yes buried in a longer sentence still counts", () => {
  assert.ok(affirms("yes, push it please"));
});

test("an api key about to be committed is caught", () => {
  const diff = `+++ b/lib/x.ts\n+const key = "AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY";\n`;
  assert.ok(secretsIn(diff, ["lib/x.ts"]).length, "a Google key should be caught");
});

test("a secret-shaped file is caught by its name alone", () => {
  assert.ok(secretsIn("", [".env.production"]).length);
  assert.ok(secretsIn("", ["certs/server.pem"]).length);
  assert.ok(secretsIn("", ["deploy/id_rsa"]).length);
});

test("ordinary code is not mistaken for a secret", () => {
  const diff = `+++ b/lib/x.ts\n+const greeting = "hello";\n+// the api key lives in .env.local\n`;
  assert.deepEqual(secretsIn(diff, ["lib/x.ts", "README.md"]), []);
});

test("this repository reports its own branch", async () => {
  const status = await repoStatus(WORKSPACE_ROOT + "/Projects/APEX-UI");
  assert.equal(typeof status.branch, "string");
  assert.ok(status.branch.length, "a branch name should come back");
  assert.equal(typeof status.ahead, "number");
});

test("an unknown project is refused, not guessed at", async () => {
  const result = await gitHandler({ action: "push", project: "zebra-not-real" }, { lastUserMessage: "yes" });
  assert.match(result.spoken, /could not find/i);
  assert.equal(result.changed, undefined);
});

test("a confirmation with nothing staged does nothing", async () => {
  const result = await gitHandler({ action: "confirm", project: "APEX-UI" }, { lastUserMessage: "yes" });
  assert.equal(result.changed, undefined);
});

test("a push is never the first thing that happens", async () => {
  const result = await gitHandler({ action: "push", project: "APEX-UI", message: "test" }, { lastUserMessage: "push it now" });
  // Even with the user plainly saying yes, the first block only ever stages.
  assert.equal(result.changed, undefined, "nothing should have been pushed");
  assert.match(result.spoken, /shall i|nothing to push/i);
});

test("an unknown action is silence", async () => {
  assert.equal((await gitHandler({ action: "rebase" }, { lastUserMessage: "" })).spoken, "");
});
