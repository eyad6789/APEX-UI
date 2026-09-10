import type { Handler, HandlerResult } from "@/lib/agent/commands";
import { compactList, findProjects, loadIndex, projectDetail } from "./index";

/** <apex:workspace>{"action":"detail","project":"MARSAD"}</apex:workspace> */
export const workspaceHandler: Handler = (payload): HandlerResult => {
  const action = String(payload.action ?? "").toLowerCase();

  switch (action) {
    case "detail": {
      const name = String(payload.project ?? "").trim();
      if (!name) return { spoken: "Which project, sir?" };
      // Facts, not speech: a readme and a file tree must be phrased before they are heard.
      return { spoken: "", context: projectDetail(name), data: { detail: name } };
    }
    case "list": {
      const projects = loadIndex();
      const recent = projects.slice(0, 5).map((p) => p.name);
      return {
        spoken: `${projects.length} projects, sir. Most recently touched: ${recent.join(", ")}.`,
        data: { count: projects.length },
      };
    }
    case "find": {
      const query = String(payload.query ?? "").trim();
      const matches = findProjects(query);
      if (!matches.length) return { spoken: `Nothing in the workspace matches "${query}", sir.` };
      return {
        spoken: "",
        context: matches.length === 1
          ? `${matches[0].name} is a ${matches[0].kind} project at ${matches[0].rel}.`
          : `${matches.length} projects match "${query}": ${matches.map((m) => `${m.name} (${m.kind})`).join(", ")}.`,
        data: { matches: matches.map((m) => m.name) },
      };
    }
    default:
      return { spoken: "" };
  }
};

/** What the model needs to know about the workspace to talk about it. */
export function workspaceBriefing(): string {
  let list: string;
  try {
    list = compactList();
  } catch (e) {
    console.warn("[workspace] could not build the index:", (e as Error).message);
    return "";
  }

  return [
    `The user's workspace, most recently touched first:`,
    list,
    ``,
    `You know this workspace. Answer from the list above without a command block.`,
    `For depth on one project - its readme, recent commits, what is inside - ask for it:`,
    `<apex:workspace>{"action":"detail","project":"MARSAD"}</apex:workspace>`,
    `You cannot create or delete projects yet. If asked, say so plainly.`,
  ].join("\n");
}
