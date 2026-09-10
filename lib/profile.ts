import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Who the user is. Distilled from his CV into data/profile.md, hand-editable, and
 * kept out of git because it is personal. Missing file → Mey is simply generic again.
 */
const PROFILE = resolve(process.cwd(), "data", "profile.md");

export function profileBriefing(): string {
  if (!existsSync(PROFILE)) return "";
  try {
    const text = readFileSync(PROFILE, "utf8").trim();
    return text ? `What you know about the person you are speaking to:\n\n${text}` : "";
  } catch (e) {
    console.warn("[profile] could not be read:", (e as Error).message);
    return "";
  }
}
