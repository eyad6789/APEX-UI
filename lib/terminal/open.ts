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

/** Longer than this and it is not a prompt, it is a paste. */
export const MAX_PROMPT = 2000;

/**
 * A prompt as a single AppleScript-safe line.
 *
 * Newlines matter more than they look: an AppleScript string literal cannot contain
 * one, so a raw newline would end the literal and let the rest of the text become a
 * statement. Collapsing whitespace closes that off before the escaping even starts.
 */
export function oneLine(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT);
}

/** A JavaScript string as an AppleScript string literal. */
function literal(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type OpenRequest = {
  /** Absolute path inside the workspace. Validated before use. */
  path: string;
  count: number;
  /** Handed to `claude` as its opening prompt. Quoted, never interpolated. */
  prompt?: string;
  /** Return the script instead of running it. Used by the tests. */
  dryRun?: boolean;
};

export type OpenResult = { opened: number; path: string; script: string };

export function clampCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_WINDOWS);
}

/**
 * One iTerm window, cd'd to the project, running claude - with an opening prompt
 * when there is one. The prompt is passed as claude's positional argument rather
 * than typed in afterwards: no synthetic keystrokes, and AppleScript's own
 * `quoted form of` makes it exactly one shell word whatever it contains.
 */
function windowScript(quotedPath: string, quotedPrompt: string | null): string {
  const command = quotedPrompt
    ? `"cd " & quoted form of ${quotedPath} & " && claude " & quoted form of ${quotedPrompt}`
    : `"cd " & quoted form of ${quotedPath} & " && claude"`;
  return [
    `  create window with default profile`,
    `  tell current session of current window`,
    `    write text ${command}`,
    `  end tell`,
  ].join("\n");
}

/**
 * AppleScript for N windows. The path is passed as an AppleScript string literal
 * and quoted for the shell by AppleScript itself ("quoted form of"), so the shell
 * sees exactly one argument no matter what the path contains.
 */
export function buildScript(realPath: string, count: number, prompt?: string): string {
  const path = literal(realPath);
  const said = oneLine(prompt ?? "");
  const asked = said ? literal(said) : null;
  return [
    `tell application "iTerm"`,
    `  activate`,
    ...Array.from({ length: count }, () => windowScript(path, asked)),
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

export async function openTerminals({ path, count, prompt, dryRun = false }: OpenRequest): Promise<OpenResult> {
  const realPath = safeResolve(path);          // throws if outside the workspace
  const windows = clampCount(count);
  const script = buildScript(realPath, windows, prompt);

  if (dryRun) return { opened: windows, path: realPath, script };

  try {
    await run("osascript", ["-e", script], { timeout: timeoutFor(windows) });
  } catch (e) {
    // iTerm puts a modal in front of a new window for things like a missing UNIX
    // locale, and AppleScript then waits on it forever. Reporting the whole script
    // helps nobody; saying where to look does.
    if ((e as { killed?: boolean }).killed) {
      throw new Error("iTerm did not answer in time, sir. It may be waiting on a dialog - there is likely an iTerm window asking you something.");
    }
    throw e;
  }
  return { opened: windows, path: realPath, script };
}

/** Kept so the shell-quoting helper is exercised somewhere real. */
export const quoteForShell = shellQuote;
