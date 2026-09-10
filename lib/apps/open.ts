import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { safeResolve } from "@/lib/paths";

const run = promisify(execFile);

/**
 * Opening applications.
 *
 * `open -a Name path` through execFile, not AppleScript: every piece is one
 * element of argv, so no shell ever parses it and the quoting question does not
 * arise. The app name is taken from the list below rather than from the model,
 * and a path is proved to be inside the workspace before it is passed.
 */

export type App = {
  /** Exactly as macOS knows it. */
  name: string;
  /** What a person might call it out loud. */
  says: string[];
  /** Whether handing it a project folder means anything. */
  opensPath: boolean;
};

/**
 * The approved list. Adding one is a line here.
 *
 * Chrome is deliberately absent: the browser on this machine is Safari. Anything
 * off this list still has to be confirmed out loud before it opens.
 */
export const APPS: App[] = [
  { name: "Visual Studio Code", says: ["vs code", "vscode", "code", "visual studio code", "editor"], opensPath: true },
  { name: "Finder", says: ["finder", "files"], opensPath: true },
  { name: "iTerm", says: ["iterm", "terminal"], opensPath: true },
  { name: "Safari", says: ["safari", "browser"], opensPath: false },
  { name: "Wispr Flow", says: ["wispr", "wispr flow", "flow"], opensPath: false },
  { name: "Figma", says: ["figma"], opensPath: false },
];

const APP_DIRS = ["/Applications", join(homedir(), "Applications")];

/** Lowercase, punctuation flattened: "VS Code" and "vs-code" are the same words. */
const norm = (s: string): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Every approved app the words could mean. An exact match wins outright, so
 * "code" is the editor rather than every app with "code" somewhere in its name.
 */
export function matchApps(query: string): App[] {
  const said = norm(query);
  if (said.length < 2) return [];

  const exact = APPS.filter((a) => norm(a.name) === said || a.says.some((s) => norm(s) === said));
  if (exact.length) return exact;

  if (said.length < 3) return [];                  // too little to guess from
  return APPS.filter((a) => [norm(a.name), ...a.says.map(norm)].some((s) => s.includes(said)));
}

/** argv for `open`. A folder is passed only to an app that does something with one. */
export function buildArgs(app: App, path?: string): string[] {
  return ["-a", app.name, ...(path && app.opensPath ? [path] : [])];
}

/**
 * The real name of an installed app, or null. Case-insensitive, because the model
 * will say "figma" and the bundle is "Figma.app".
 *
 * A name containing a path separator is refused outright rather than joined - the
 * point of this function is that it can only ever name something in /Applications.
 */
export function installedApp(name: string): string | null {
  const wanted = String(name ?? "").trim();
  if (!wanted || wanted.includes("/") || wanted.includes("..")) return null;

  // Always answer from the directory listing rather than from existsSync: this
  // filesystem is case-insensitive, so "figma.app" exists, and handing `open -a`
  // a name in the wrong case is how you get the wrong app or none at all.
  const bundle = `${wanted.toLowerCase()}.app`;
  for (const dir of APP_DIRS) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    const hit = entries.find((e) => e.toLowerCase() === bundle);
    if (hit) return hit.slice(0, -4);
  }
  return null;
}

export type OpenAppRequest = {
  /** A real macOS application name - from APPS, or proved installed by installedApp. */
  appName: string;
  /** Optional, and validated against the workspace before it is used. */
  path?: string;
  /** Return the argv instead of running it. Used by the tests. */
  dryRun?: boolean;
};

export async function openApp({ appName, path, dryRun = false }: OpenAppRequest): Promise<{ opened: string; args: string[] }> {
  const realPath = path ? safeResolve(path) : undefined;   // throws if outside the workspace
  const args = ["-a", appName, ...(realPath ? [realPath] : [])];

  if (dryRun) return { opened: appName, args };

  await run("open", args, { timeout: 20_000 });
  return { opened: appName, args };
}
