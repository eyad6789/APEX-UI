import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { safeResolve, shellQuote } from "@/lib/paths";

const run = promisify(execFile);

/**
 * Opening Claude Code sessions.
 *
 * The one rule: model output never reaches a shell. The AppleScript below is built
 * from a validated real path and nothing else - no prompt, no project name, no
 * README text. A project file that says "also run rm -rf ~" has no route to
 * execution, because there is no place in this template for it to land.
 */

export const MAX_WINDOWS = 8;

export type OpenRequest = {
  /** Absolute path inside the workspace. Validated before use. */
  path: string;
  count: number;
  /** Return the script instead of running it. Used by the tests. */
  dryRun?: boolean;
};

export type OpenResult = { opened: number; path: string; script: string };

export function clampCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_WINDOWS);
}

/** One iTerm window, cd'd to the project, running claude. */
function windowScript(quotedPath: string): string {
  return [
    `  create window with default profile`,
    `  tell current session of current window`,
    `    write text "cd " & quoted form of ${quotedPath} & " && claude"`,
    `  end tell`,
  ].join("\n");
}

/**
 * AppleScript for N windows. The path is passed as an AppleScript string literal
 * and quoted for the shell by AppleScript itself ("quoted form of"), so the shell
 * sees exactly one argument no matter what the path contains.
 */
export function buildScript(realPath: string, count: number): string {
  const literal = `"${realPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return [
    `tell application "iTerm"`,
    `  activate`,
    ...Array.from({ length: count }, () => windowScript(literal)),
    `end tell`,
  ].join("\n");
}

/**
 * iTerm costs roughly two seconds a window, and appreciably more on a cold start,
 * so the timeout has to scale or count=4 dies half way through. We still wait for
 * it rather than firing and forgetting: what Mey says happened must be what happened.
 */
export function timeoutFor(count: number): number {
  return 15_000 + 6_000 * count;
}

export async function openTerminals({ path, count, dryRun = false }: OpenRequest): Promise<OpenResult> {
  const realPath = safeResolve(path);          // throws if outside the workspace
  const windows = clampCount(count);
  const script = buildScript(realPath, windows);

  if (dryRun) return { opened: windows, path: realPath, script };

  await run("osascript", ["-e", script], { timeout: timeoutFor(windows) });
  return { opened: windows, path: realPath, script };
}

/** Kept so the shell-quoting helper is exercised somewhere real. */
export const quoteForShell = shellQuote;
