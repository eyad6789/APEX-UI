import type { Handler, HandlerResult } from "@/lib/agent/commands";
import { findProjects } from "@/lib/workspace/index";
import { WORKSPACE_ROOT } from "@/lib/paths";
import { clampCount, oneLine, openTerminals, MAX_WINDOWS } from "./open";

/** Spoken, not printed - "four sessions" reads better aloud than "4 sessions". */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const spell = (n: number) => WORDS[n] ?? String(n);

/**
 * <apex:terminal>{"action":"open","count":4,"project":"MARSAD"}</apex:terminal>
 * <apex:terminal>{"action":"send","project":"MARSAD","prompt":"add a dark mode toggle"}</apex:terminal>
 *
 * "send" is one window with the prompt already asked. It goes in as claude's own
 * argument, so nothing is typed at a keyboard and nothing is interpolated into a
 * command - the prompt is one shell word however it is written.
 */
export const terminalHandler: Handler = async (payload): Promise<HandlerResult> => {
  const action = String(payload.action ?? "").toLowerCase();
  if (action !== "open" && action !== "send") return { spoken: "" };

  const prompt = oneLine(String(payload.prompt ?? ""));
  if (action === "send" && !prompt) return { spoken: "What should I ask it, sir?" };

  const requested = action === "send" ? 1 : payload.count ?? 1;
  const count = clampCount(requested);
  const name = String(payload.project ?? "").trim();

  // No project named: the workspace root is a reasonable place to think from.
  let path = WORKSPACE_ROOT;
  let where = "the workspace";

  if (name) {
    const matches = findProjects(name);
    if (!matches.length) {
      return { spoken: `I could not find a project called "${name}", sir.` };
    }
    if (matches.length > 1) {
      // Guessing here opens windows in the wrong repo, so ask instead.
      return { spoken: `Several match "${name}", sir: ${matches.map((m) => m.name).join(", ")}. Which one?` };
    }
    path = matches[0].path;
    where = matches[0].name;
  }

  const result = await openTerminals({ path, count, prompt: prompt || undefined });

  if (action === "send") {
    return {
      spoken: `Asked Claude Code on ${where}, sir.`,
      data: { opened: result.opened, project: where, sent: true },
    };
  }

  const capped = Number(requested) > MAX_WINDOWS
    ? ` I capped it at ${spell(MAX_WINDOWS)}.`
    : "";
  const plural = result.opened === 1 ? "session" : "sessions";
  const opened = spell(result.opened);
  return {
    spoken: `${opened.charAt(0).toUpperCase()}${opened.slice(1)} Claude Code ${plural} on ${where}, sir.${capped}`,
    data: { opened: result.opened, project: where },
  };
};

export function terminalBriefing(): string {
  return [
    `You can open Claude Code sessions on the user's Mac. Each one is an iTerm window,`,
    `already in the project folder with claude running:`,
    `<apex:terminal>{"action":"open","count":4,"project":"MARSAD"}</apex:terminal>`,
    `You can also hand a Claude Code session a job to start on:`,
    `<apex:terminal>{"action":"send","project":"MARSAD","prompt":"add a dark mode toggle to settings"}</apex:terminal>`,
    `Use "send" whenever the user asks you to tell Claude, ask Claude, or get something`,
    `built or fixed in a project. Put their instruction in "prompt" in their own words -`,
    `do not summarise it, do not answer it yourself, and do not add anything they did not`,
    `say. One window per send.`,
    `Rules: "count" is how many they asked for (1 to ${MAX_WINDOWS}; anything higher is capped).`,
    `"project" is a name from the workspace list - omit it only when they named no project`,
    `and none is under discussion. Do not open anything unless they actually asked you to.`,
    `If what they said matches more than one project in that list - "geo" when both Geo_Erp`,
    `and Geo_Landing exist - do NOT choose for them. Ask which one, and emit no block until`,
    `they answer. Opening windows in the wrong repository is worse than one more question.`,
  ].join("\n");
}
