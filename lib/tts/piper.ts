import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Engine } from "./types";
import { runCapturingStdout } from "./run";
import { wavFromPcm } from "./wav";

/**
 * Piper - the default voice. A small MIT-licensed ONNX model that runs entirely
 * on this machine: no account, no API key, no per-word cost, works offline.
 *
 * The stock voice is "Alan" (en_GB): an unhurried, low British male read, which
 * is about as close to Jarvis as the open voices get.
 *
 * Setup:  npm run tts:setup
 * Env:    PIPER_BIN, PIPER_MODEL, PIPER_LENGTH_SCALE (higher = slower)
 */

const root = process.cwd();
const binary = () => process.env.PIPER_BIN || path.join(root, ".venv-tts/bin/piper");
const model = () => process.env.PIPER_MODEL || path.join(root, "voices/en_GB-alan-medium.onnx");

/** Piper writes bare PCM; the sample rate lives in the model's sidecar JSON. */
function sampleRateOf(modelPath: string): number {
  try {
    const config = JSON.parse(readFileSync(`${modelPath}.json`, "utf8"));
    return config?.audio?.sample_rate ?? 22050;
  } catch {
    return 22050;
  }
}

export const piper: Engine = {
  id: "piper",
  label: "Piper (local, open source)",

  isConfigured: () => existsSync(binary()) && existsSync(model()),

  setupHint: () =>
    `Piper is not installed yet. Run \`npm run tts:setup\` (downloads a ~60MB voice), ` +
    `or point PIPER_BIN and PIPER_MODEL at an existing install.`,

  async speak(text) {
    const modelPath = model();
    // --output-raw streams samples straight out of the model, so nothing touches disk.
    const pcm = await runCapturingStdout(binary(), [
      "--model", modelPath,
      "--output-raw",
      "--length-scale", process.env.PIPER_LENGTH_SCALE || "1.05",   // a touch slower: measured, not rushed
      "--sentence-silence", "0.28",                                  // room to breathe between sentences
    ], text);

    if (pcm.length === 0) throw new Error("Piper produced no audio.");
    return { audio: wavFromPcm(pcm, sampleRateOf(modelPath)), contentType: "audio/wav" };
  },
};
