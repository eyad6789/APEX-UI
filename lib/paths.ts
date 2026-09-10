import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";

/**
 * The one gate between Mey and the filesystem.
 *
 * Everything he can name resolves through here, and anything that lands outside
 * the workspace is refused. Symlinks are followed BEFORE the check - a link inside
 * the workspace pointing at /etc is still outside it.
 */

export const WORKSPACE_ROOT = process.env.APEX_WORKSPACE
  ? resolve(process.env.APEX_WORKSPACE)
  : resolve(homedir(), "Desktop", "WorkSpace");

export class OutsideWorkspaceError extends Error {
  constructor(candidate: string) {
    super(`Refused: ${candidate} is outside ${WORKSPACE_ROOT}.`);
    this.name = "OutsideWorkspaceError";
  }
}

/** True when `real` is the root itself or genuinely beneath it. */
function contains(root: string, real: string): boolean {
  return real === root || real.startsWith(root + sep);
}

/**
 * Resolve a path (absolute, or relative to the workspace) and prove it is inside.
 * Throws rather than returning a sentinel, so a caller cannot forget to check.
 */
export function safeResolve(candidate: string): string {
  if (!candidate || typeof candidate !== "string") throw new OutsideWorkspaceError(String(candidate));
  const abs = resolve(WORKSPACE_ROOT, candidate);

  let real: string, root: string;
  try {
    root = realpathSync(WORKSPACE_ROOT);
  } catch {
    throw new Error(`The workspace ${WORKSPACE_ROOT} does not exist.`);
  }
  try {
    real = realpathSync(abs);
  } catch {
    throw new OutsideWorkspaceError(candidate);   // missing counts as refused
  }

  if (!contains(root, real)) throw new OutsideWorkspaceError(candidate);
  return real;
}

/** Non-throwing form, for tests and for "is this safe?" checks. */
export function isInsideWorkspace(candidate: string): boolean {
  try {
    safeResolve(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escape a path for embedding in a single-quoted shell word inside AppleScript.
 * Validated paths should never need it; belt and braces, because the cost of being
 * wrong here is arbitrary command execution.
 */
export function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
