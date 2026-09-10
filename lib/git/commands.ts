import type { Handler, HandlerResult } from "@/lib/agent/commands";
import { findProjects } from "@/lib/workspace/index";
import { commit, push, repoStatus, secretsIn, stageAll, stagedDiff, stagedFiles, unstageAll } from "./repo";

/**
 * Committing and pushing.
 *
 * This is the one thing Mey does that cannot be undone by closing a window, so the
 * gate is harder than anywhere else. A push never happens on the first block: it is
 * staged, described out loud, and only goes ahead when the NEXT message from the
 * user says yes. That check reads what the user actually said, not what the model
 * wrote, which is the difference that matters - the model can put "confirm": true
 * in a block, but it cannot put the word "yes" in the user's mouth.
 */

const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|go on|push it|push|confirm|please do|affirmative)\b/i;
const NO = /\b(no|nope|not yet|wait|stop|cancel|don'?t|do not)\b/i;
const YES_AR = /(نعم|ايوه|أيوه|تمام|اوكي|أوكي|موافق|كمل|اكمل)/;

/** Did a person just say yes? A refusal wins, so "no, don't push it" is not a yes. */
export function affirms(text: string): boolean {
  const said = String(text ?? "").trim();
  if (!said) return false;
  if (NO.test(said)) return false;
  return YES.test(said) || YES_AR.test(said);
}

type Pending = {
  path: string; project: string; message: string;
  branch: string; hasUpstream: boolean; at: number;
};

const pending = new Map<string, Pending>();
const PENDING_TTL_MS = 10 * 60 * 1000;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * <apex:git>{"action":"status","project":"MARSAD"}</apex:git>
 * <apex:git>{"action":"push","project":"MARSAD","message":"fix the login redirect"}</apex:git>
 * <apex:git>{"action":"confirm","project":"MARSAD"}</apex:git>
 */
export const gitHandler: Handler = async (payload, ctx): Promise<HandlerResult> => {
  const action = String(payload.action ?? "").toLowerCase();
  if (!["status", "push", "confirm"].includes(action)) return { spoken: "" };

  const wanted = String(payload.project ?? "").trim();
  if (!wanted) return { spoken: "Which project, sir?" };

  const found = findProjects(wanted);
  if (!found.length) return { spoken: `I could not find a project called "${wanted}", sir.` };
  if (found.length > 1) {
    return { spoken: `Several match "${wanted}", sir: ${found.map((m) => m.name).join(", ")}. Which one?` };
  }
  const project = found[0];

  let status: Awaited<ReturnType<typeof repoStatus>>;
  try {
    status = await repoStatus(project.path);
  } catch {
    return { spoken: `${project.name} is not a git repository, sir.` };
  }

  if (action === "status") {
    const parts = [
      `on ${status.branch}`,
      status.dirty.length ? count(status.dirty.length, "change", "changes") : "nothing uncommitted",
      status.ahead ? `${count(status.ahead, "commit", "commits")} ahead` : "",
    ].filter(Boolean);
    return { spoken: `${project.name} is ${parts.join(", ")}, sir.` };
  }

  if (action === "push") {
    if (!status.dirty.length && status.ahead === 0) {
      return { spoken: `Nothing to push, sir. ${project.name} is clean and up to date.` };
    }
    const message = String(payload.message ?? "").trim().slice(0, 200) || `update ${project.name}`;
    pending.set(project.path, {
      path: project.path, project: project.name, message,
      branch: status.branch, hasUpstream: status.hasUpstream, at: Date.now(),
    });

    const what = [
      status.dirty.length ? count(status.dirty.length, "changed file", "changed files") : "",
      status.ahead ? `${count(status.ahead, "commit", "commits")} already ahead` : "",
    ].filter(Boolean).join(" and ");
    return { spoken: `${what} on ${status.branch}, sir. Shall I push?` };
  }

  // action === "confirm"
  const staged = pending.get(project.path);
  if (!staged || Date.now() - staged.at > PENDING_TTL_MS) {
    pending.delete(project.path);
    return { spoken: "There is nothing waiting to be pushed, sir." };
  }
  // The gate. What the user said, not what the model wrote.
  if (!affirms(ctx?.lastUserMessage ?? "")) {
    return { spoken: "I will hold off until you say so, sir." };
  }

  await stageAll(staged.path);
  const files = await stagedFiles(staged.path);
  const reasons = secretsIn(await stagedDiff(staged.path), files);
  if (reasons.length) {
    await unstageAll(staged.path);
    pending.delete(staged.path);
    return { spoken: `I stopped, sir. ${reasons[0]}, so I have not committed anything.` };
  }

  if (files.length) await commit(staged.path, staged.message);
  await push(staged.path, staged.branch, staged.hasUpstream);
  pending.delete(staged.path);

  const committed = files.length ? `Committed ${count(files.length, "file", "files")} and pushed` : "Pushed";
  return {
    spoken: `${committed} ${staged.branch} to the remote, sir.`,
    changed: true,
    data: { project: staged.project, branch: staged.branch, files: files.length },
  };
};

export function gitBriefing(): string {
  return [
    `You can commit and push a project for the user:`,
    `<apex:git>{"action":"status","project":"MARSAD"}</apex:git>`,
    `<apex:git>{"action":"push","project":"MARSAD","message":"fix the login redirect"}</apex:git>`,
    `<apex:git>{"action":"confirm","project":"MARSAD"}</apex:git>`,
    `"push" NEVER pushes. It works out what would happen and asks. You then repeat what`,
    `you were told and wait. Only if the user answers yes do you send "confirm" on the`,
    `next turn - and if they say anything else, send nothing at all.`,
    `Write "message" yourself from what they have been doing: a short imperative line,`,
    `no quotes, no trailing full stop. Never sign it, and never add a co-author.`,
    `NEVER ask the user what the commit message should be - that is your job, and asking`,
    `wastes a turn. If there is nothing uncommitted, the message is not used anyway.`,
    `Do not say you are "preparing to" push or about to push. Emit the block and let what`,
    `comes back be your answer; you will be given the real state to read out.`,
    `Use "status" freely - it only looks.`,
  ].join("\n");
}
