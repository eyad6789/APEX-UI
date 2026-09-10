import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Engine } from "./types";
import { runCapturingStdout } from "./run";

/**
 * macOS `say` - always present, nothing to install, but it is the flat system
 * voice. Kept as the last resort so Mey is never mute on a Mac.
 *
 * Env: SAY_VOICE (default "Daniel", the en_GB male system voice)
 */

export const say: Engine = {
  id: "say",
  label: "macOS say",

  isConfigured: () => process.platform === "darwin",

  setupHint: () => "The `say` engine only exists on macOS.",

  async speak(text) {
    // `say` insists on writing to a file, so give it a private one and read it back.
    const dir = mkdtempSync(path.join(tmpdir(), "apex-say-"));
    const file = path.join(dir, "speech.wav");
    try {
      await runCapturingStdout("say", [
        "-v", process.env.SAY_VOICE || "Daniel",
        "--data-format=LEI16@22050",
        "-o", file,
        text,
      ]);
      return { audio: new Uint8Array(readFileSync(file)), contentType: "audio/wav" };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
