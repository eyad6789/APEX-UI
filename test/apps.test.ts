import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readdirSync } from "node:fs";
import { APPS, buildArgs, installedApp, matchApps, openApp } from "../lib/apps/open.ts";
import { appHandler } from "../lib/apps/commands.ts";
import { WORKSPACE_ROOT } from "../lib/paths.ts";

const app = (name: string) => APPS.find((a) => a.name === name)!;

/** A real app on this Mac that is deliberately NOT on the approved list. */
const offList = readdirSync("/Applications")
  .filter((f) => f.endsWith(".app"))
  .map((f) => f.slice(0, -4))
  .find((n) => /^[A-Za-z][A-Za-z ]+$/.test(n) && !APPS.some((a) => a.name === n))!;

test("the words a person would use all find the editor", () => {
  for (const said of ["vs code", "VS Code", "vscode", "code", "editor", "Visual Studio Code"]) {
    assert.deepEqual(matchApps(said).map((a) => a.name), ["Visual Studio Code"], `"${said}"`);
  }
});

test("the browser is Safari, and Chrome is not on the list", () => {
  assert.deepEqual(matchApps("browser").map((a) => a.name), ["Safari"]);
  assert.deepEqual(matchApps("chrome"), []);
});

test("an app nobody has heard of matches nothing", () => {
  assert.deepEqual(matchApps("zebraphone"), []);
  assert.deepEqual(matchApps(""), []);
  assert.deepEqual(matchApps("a"), []);            // too short to guess from
});

test("only the apps that take a folder are given one", () => {
  assert.deepEqual(buildArgs(app("Visual Studio Code"), "/tmp/x"), ["-a", "Visual Studio Code", "/tmp/x"]);
  assert.deepEqual(buildArgs(app("Safari"), "/tmp/x"), ["-a", "Safari"]);
  assert.deepEqual(buildArgs(app("Safari")), ["-a", "Safari"]);
});

test("the path is one argument, so metacharacters cannot break out", async () => {
  const { args } = await openApp({ appName: "Visual Studio Code", path: WORKSPACE_ROOT, dryRun: true });
  assert.deepEqual(args, ["-a", "Visual Studio Code", WORKSPACE_ROOT]);
  assert.ok(!args.some((a) => a.includes("&&") || a.includes(";")), "no argument should carry a shell operator");
});

test("openApp refuses a path outside the workspace", async () => {
  await assert.rejects(() => openApp({ appName: "Finder", path: "/etc", dryRun: true }), /Refused/);
});

test("an installed app is found whatever the case", () => {
  assert.equal(installedApp("Figma"), "Figma");
  assert.equal(installedApp("figma"), "Figma");
});

test("an app that is not installed is not invented", () => {
  assert.equal(installedApp("Zebraphone 9000"), null);
});

test("a name that tries to escape /Applications finds nothing", () => {
  for (const bad of ["../../etc/passwd", "/System/Applications/Mail", "..", "Figma/../Safari"]) {
    assert.equal(installedApp(bad), null, bad);
  }
});

test("an app off the approved list is named back and not opened", async () => {
  const result = await appHandler({ action: "open", app: offList });
  assert.match(result.spoken, new RegExp(offList));
  assert.match(result.spoken, /not on your approved list/i);
  assert.equal(result.data, undefined, "nothing should have been opened");
});

test("an app that is neither approved nor installed is refused", async () => {
  const result = await appHandler({ action: "open", app: "Zebraphone 9000" });
  assert.match(result.spoken, /could not find/i);
  assert.equal(result.data, undefined);
});

test("an unknown project is refused rather than guessed at", async () => {
  const result = await appHandler({ action: "open", app: "vs code", project: "zebra-not-real" });
  assert.match(result.spoken, /could not find/i);
  assert.equal(result.data, undefined);
});

test("no app named is a question, not a guess", async () => {
  const result = await appHandler({ action: "open", project: "APEX-UI" });
  assert.match(result.spoken, /which|what/i);
  assert.equal(result.data, undefined);
});

test("a non-open action does nothing", async () => {
  assert.equal((await appHandler({ action: "quit", app: "Safari" })).spoken, "");
});
