import type { Handler, HandlerResult } from "@/lib/agent/commands";
import { findProjects } from "@/lib/workspace/index";
import { WORKSPACE_ROOT } from "@/lib/paths";
import { clampCount, openTerminals, MAX_WINDOWS } from "./open";

/** Spoken, not printed - "four sessions" reads better aloud than "4 sessions". */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const spell = (n: number) => WORDS[n] ?? String(n);

/** <apex:terminal>{"action":"open","count":4,"project":"MARSAD"}</apex:terminal> */
export const terminalHandler: Handler = async (payload): Promise<HandlerResult> => {
  if (String(payload.action ?? "").toLowerCase() !== "open") return { spoken: "" };

  const requested = payload.count ?? 1;
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

  const result = await openTerminals({ path, count });

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
    `Rules: "count" is how many they asked for (1 to ${MAX_WINDOWS}; anything higher is capped).`,
    `"project" is a name from the workspace list - omit it only when they named no project`,
    `and none is under discussion. Do not open anything unless they actually asked you to.`,
    `If what they said matches more than one project in that list - "geo" when both Geo_Erp`,
    `and Geo_Landing exist - do NOT choose for them. Ask which one, and emit no block until`,
    `they answer. Opening windows in the wrong repository is worse than one more question.`,
  ].join("\n");
}
