import * as gemini from "./gemini";
import * as local from "./local";
import type { Msg } from "./persona";

export type { Msg } from "./persona";

/**
 * Think, with a net underneath.
 *
 * Gemini answers by default - it is fast, good, and already paid for. If every
 * Gemini model fails, the local open model takes the question instead, so losing
 * the network downgrades Apex rather than silencing him.
 *
 * APEX_BRAIN=local pins the offline model; APEX_BRAIN=gemini disables the fallback.
 */
export async function think(messages: Msg[]): Promise<{ reply: string; model: string }> {
  const pinned = process.env.APEX_BRAIN?.trim().toLowerCase();

  if (pinned === "local") return local.think(messages);
  if (pinned === "gemini") return gemini.think(messages);

  if (!gemini.isConfigured()) {
    if (await local.isReachable()) return local.think(messages);
    throw new Error("No brain available: GEMINI_API_KEY is not set and Ollama is not running.");
  }

  try {
    return await gemini.think(messages);
  } catch (e) {
    const why = (e as Error).message;
    if (!(await local.isReachable())) throw new Error(`${why} (the local model is not running either - start it with \`ollama serve\`)`);
    console.warn(`[chat] Gemini unavailable, falling back to the local model: ${why}`);
    return local.think(messages);
  }
}
