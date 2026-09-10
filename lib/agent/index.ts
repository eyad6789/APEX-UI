import { registerHandler } from "./commands";
import { scheduleHandler } from "@/lib/schedule/commands";
import { workspaceHandler } from "@/lib/workspace/commands";
import { terminalHandler } from "@/lib/terminal/commands";
import { webHandler } from "@/lib/web/commands";

/**
 * Wiring. Importing this module registers every namespace Mey can act in;
 * the handlers themselves stay unaware of each other.
 */
let wired = false;

export function wireHandlers(): void {
  if (wired) return;
  registerHandler("schedule", scheduleHandler);
  registerHandler("workspace", workspaceHandler);
  registerHandler("terminal", terminalHandler);
  registerHandler("web", webHandler);
  wired = true;
}

export * from "./commands";
