import type { Handler, HandlerResult } from "@/lib/agent/commands";
import { findProjects } from "@/lib/workspace/index";
import { APPS, installedApp, matchApps, openApp } from "./open";

/**
 * <apex:app>{"action":"open","app":"VS Code","project":"MARSAD"}</apex:app>
 * <apex:app>{"action":"open","app":"Blender","confirm":true}</apex:app>
 *
 * Two ways in. An app on the approved list opens straight away; anything else is
 * named back and waits for a yes, so a misheard word cannot start something on its
 * own. Either way the name is a real installed application and the path is inside
 * the workspace before `open` ever sees them.
 */
export const appHandler: Handler = async (payload): Promise<HandlerResult> => {
  if (String(payload.action ?? "").toLowerCase() !== "open") return { spoken: "" };

  const said = String(payload.app ?? "").trim();
  if (!said) return { spoken: "Which application, sir?" };

  const matches = matchApps(said);
  if (matches.length > 1) {
    // Guessing here opens the wrong window, so ask instead.
    return { spoken: `Several match "${said}", sir: ${matches.map((a) => a.name).join(", ")}. Which one?` };
  }

  if (matches.length === 1) {
    const app = matches[0];
    const wanted = String(payload.project ?? "").trim();
    let path: string | undefined;
    let where = "";

    if (wanted && app.opensPath) {
      const found = findProjects(wanted);
      if (!found.length) return { spoken: `I could not find a project called "${wanted}", sir.` };
      if (found.length > 1) {
        return { spoken: `Several match "${wanted}", sir: ${found.map((m) => m.name).join(", ")}. Which one?` };
      }
      path = found[0].path;
      where = found[0].name;
    }

    await openApp({ appName: app.name, path });
    return {
      spoken: `${app.name}${where ? ` on ${where}` : ""}, sir.`,
      data: { opened: app.name, ...(where ? { project: where } : {}) },
    };
  }

  // Off the list. It must at least be a real application before we offer to open it.
  const real = installedApp(said);
  if (!real) return { spoken: `I could not find an application called "${said}", sir.` };
  if (payload.confirm !== true) {
    return { spoken: `${real} is not on your approved list, sir. Shall I open it?` };
  }

  await openApp({ appName: real });
  return { spoken: `${real}, sir.`, data: { opened: real } };
};

export function appBriefing(): string {
  return [
    `You can open applications on the user's Mac:`,
    `<apex:app>{"action":"open","app":"VS Code","project":"MARSAD"}</apex:app>`,
    `These open on request: ${APPS.map((a) => a.name).join(", ")}.`,
    `"project" is a name from the workspace list, and only means anything for the editor,`,
    `Finder and iTerm - leave it out otherwise. If what they said matches more than one`,
    `project, do NOT choose for them: ask which, and emit no block until they answer.`,
    `For any other application, send it by name and say nothing about having opened it.`,
    `You will be told it is not on the approved list, and you should pass that question on.`,
    `Only when the user then says yes, send the same block again with "confirm": true.`,
    `Never set "confirm" yourself, and never open anything they did not ask for.`,
  ].join("\n");
}
