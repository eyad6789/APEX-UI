import type { Engine, Speech } from "./types";
import { piper } from "./piper";
import { kokoro } from "./kokoro";
import { elevenlabs } from "./elevenlabs";
import { say } from "./say";

export type { Engine, Speech } from "./types";

/** Every voice Apex knows how to use, in the order we fall back through them. */
export const ENGINES: Engine[] = [piper, kokoro, elevenlabs, say];

// ElevenLabs first when a key is present - it is still the best-sounding voice.
// Everything after it is local and free, so Apex keeps talking if the key is
// missing, the plan runs out, or the network is down.
const DEFAULT_ORDER = ["elevenlabs", "piper", "kokoro", "say"];

/**
 * Speak, falling down the list until something works.
 *
 * ElevenLabs is tried first because it still sounds best, but a dead key, an
 * exhausted quota or a plane with no wifi should not make Apex mute - so a
 * failure here is not fatal, it just moves to the next voice. APEX_TTS pins one
 * engine and disables the cascade, which is what you want when testing.
 */
export async function speak(text: string): Promise<{ speech: Speech; engine: Engine } | { error: string }> {
  const pinned = process.env.APEX_TTS?.trim().toLowerCase();

  if (pinned && pinned !== "auto") {
    const engine = ENGINES.find((e) => e.id === pinned);
    if (!engine) return { error: `Unknown APEX_TTS="${pinned}". Try: ${DEFAULT_ORDER.join(", ")}, auto.` };
    if (!engine.isConfigured()) return { error: engine.setupHint() };
    try {
      return { speech: await engine.speak(text), engine };
    } catch (e) {
      return { error: `${engine.label}: ${(e as Error).message}` };
    }
  }

  const failures: string[] = [];
  for (const id of DEFAULT_ORDER) {
    const engine = ENGINES.find((e) => e.id === id);
    if (!engine?.isConfigured()) continue;
    try {
      return { speech: await engine.speak(text), engine };
    } catch (e) {
      // Note it and keep going - the next voice down is still better than silence.
      const why = (e as Error).message;
      console.warn(`[tts] ${engine.id} failed, trying the next voice: ${why}`);
      failures.push(`${engine.id}: ${why}`);
    }
  }
  return { error: failures.length ? `every voice failed - ${failures.join(" | ")}` : piper.setupHint() };
}
