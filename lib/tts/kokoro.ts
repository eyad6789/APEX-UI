import { existsSync } from "node:fs";
import path from "node:path";
import type { Engine } from "./types";
import { runCapturingStdout } from "./run";
import { wavFromPcm } from "./wav";

/**
 * Kokoro-82M - the richer, heavier open voice (Apache-2.0). Noticeably more
 * natural than Piper, at the cost of a PyTorch install (~2GB) and a slower start.
 *
 * Opt in with APEX_TTS=kokoro once you have run:  npm run tts:setup:kokoro
 * Env: KOKORO_PYTHON, KOKORO_VOICE (bm_george, bm_lewis, bm_daniel, …)
 */

const root = process.cwd();
const python = () => process.env.KOKORO_PYTHON || path.join(root, ".venv-tts/bin/python");
const SAMPLE_RATE = 24000;

// Reads text on stdin, writes raw 16-bit PCM on stdout - the same contract as Piper.
const SCRIPT = `
import sys, numpy as np
from kokoro import KPipeline

text = sys.stdin.read().strip()
voice = sys.argv[1]
pipeline = KPipeline(lang_code=voice[0])          # 'b' = British English
chunks = [audio for _, _, audio in pipeline(text, voice=voice)]
audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
pcm = np.clip(audio, -1.0, 1.0)
sys.stdout.buffer.write((pcm * 32767).astype("<i2").tobytes())
`.trim();

export const kokoro: Engine = {
  id: "kokoro",
  label: "Kokoro-82M (local, open source)",

  isConfigured: () => existsSync(python()),

  setupHint: () =>
    `Kokoro is not installed. Run \`npm run tts:setup:kokoro\` (pulls PyTorch, ~2GB), ` +
    `or set KOKORO_PYTHON to a Python that has the \`kokoro\` package.`,

  async speak(text) {
    const voice = process.env.KOKORO_VOICE || "bm_george";
    const pcm = await runCapturingStdout(python(), ["-c", SCRIPT, voice], text);
    if (pcm.length === 0) throw new Error("Kokoro produced no audio.");
    return { audio: wavFromPcm(pcm, SAMPLE_RATE), contentType: "audio/wav" };
  },
};
