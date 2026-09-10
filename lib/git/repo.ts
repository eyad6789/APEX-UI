import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { safeResolve } from "@/lib/paths";

const run = promisify(execFile);

/**
 * Git, as far as Mey is allowed to drive it.
 *
 * Every call is execFile with an argv array and an explicit cwd - no shell, so a
 * branch name or a commit message cannot become a command. The repository itself
 * is proved to be inside the workspace before any of it runs.
 */

export type RepoStatus = {
  branch: string;
  /** Paths git reports as changed, from `status --porcelain`. */
  dirty: string[];
  /** Commits on this branch that the remote does not have. */
  ahead: number;
  hasUpstream: boolean;
};

async function git(path: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: path, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

export async function repoStatus(path: string): Promise<RepoStatus> {
  const cwd = safeResolve(path);

  const branch = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const porcelain = await git(cwd, ["status", "--porcelain"]);
  const dirty = porcelain ? porcelain.split("\n").map((l) => l.slice(3).trim()).filter(Boolean) : [];

  let hasUpstream = true;
  let ahead = 0;
  try {
    const counts = await git(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
    ahead = Number(counts.split(/\s+/)[0]) || 0;
  } catch {
    hasUpstream = false;                       // no upstream set yet
    ahead = Number(await git(cwd, ["rev-list", "--count", "HEAD"]).catch(() => "0")) || 0;
  }

  return { branch, dirty, ahead, hasUpstream };
}

/** File names that should never be committed, whatever is in them. */
const SECRET_FILES = [
  /(^|\/)\.env($|\.)/i,
  /\.(pem|p12|pfx|key|keystore|jks)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|\/)credentials\.json$/i,
  /(^|\/)\.netrc$/i,
];

/** Key shapes, matched only on lines the commit would ADD. */
const SECRET_VALUES: Array<[RegExp, string]> = [
  [/AIza[0-9A-Za-z_\-]{30,}/, "a Google API key"],
  [/sk-[A-Za-z0-9]{20,}/, "an OpenAI-style key"],
  [/sk_(live|test)_[A-Za-z0-9]{20,}/, "a Stripe key"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/xox[baprs]-[A-Za-z0-9-]{20,}/, "a Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];

/**
 * Reasons this commit should not happen. Empty means it is clean.
 *
 * Only added lines are read: a diff that removes a key, or a README that mentions
 * one, is not a leak, and crying wolf about those would train Mey to be ignored.
 */
export function secretsIn(diff: string, files: string[]): string[] {
  const reasons: string[] = [];

  for (const file of files) {
    if (SECRET_FILES.some((p) => p.test(file))) reasons.push(`${file} looks like a secret file`);
  }
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  for (const [pattern, what] of SECRET_VALUES) {
    if (added.some((l) => pattern.test(l))) reasons.push(`the changes contain ${what}`);
  }
  return [...new Set(reasons)];
}

export const stageAll = (path: string) => git(safeResolve(path), ["add", "-A"]);
export const unstageAll = (path: string) => git(safeResolve(path), ["reset"]);
export const stagedDiff = (path: string) => git(safeResolve(path), ["diff", "--cached"]);
export const stagedFiles = async (path: string): Promise<string[]> =>
  (await git(safeResolve(path), ["diff", "--cached", "--name-only"])).split("\n").filter(Boolean);

export const commit = (path: string, message: string) =>
  git(safeResolve(path), ["commit", "-m", message]);

/**
 * Push. Never --force, and an unset upstream is set to origin/<branch> rather than
 * being an error - that is the ordinary case for a branch made locally.
 */
export const push = (path: string, branch: string, hasUpstream: boolean) =>
  git(safeResolve(path), hasUpstream ? ["push"] : ["push", "-u", "origin", branch]);
