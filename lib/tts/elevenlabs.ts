import type { Engine } from "./types";

/**
 * ElevenLabs - the paid option, kept as an opt-in. Set APEX_TTS=elevenlabs and a
 * key to use it; otherwise nothing here runs and no request leaves the machine.
 *
 * Note: library voices (a "Jarvis" you added from the Voice Library) are refused
 * with HTTP 402 on the free plan, so we fall back to a stock voice rather than
 * failing - the configured voice starts working by itself once the plan allows it.
 */

const STOCK_VOICE = "onwK4e9ZLuTAKqWW03F9";   // "Daniel", the deep British stock voice

export const elevenlabs: Engine = {
  id: "elevenlabs",
  label: "ElevenLabs (hosted, paid)",

  isConfigured: () => !!process.env.ELEVENLABS_API_KEY,

  setupHint: () => "Set ELEVENLABS_API_KEY in .env.local to use the hosted voice.",

  async speak(text) {
    const apiKey = process.env.ELEVENLABS_API_KEY!;
    const configured = process.env.ELEVENLABS_VOICE_ID || STOCK_VOICE;
    const modelId = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

    const request = (voice: string) =>
      fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
        }),
      });

    let response = await request(configured);
    if (response.status === 402 && configured !== STOCK_VOICE) {
      console.warn(`[tts] voice ${configured} needs a paid ElevenLabs plan - using the stock voice`);
      response = await request(STOCK_VOICE);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`ElevenLabs error ${response.status}: ${detail.slice(0, 200)}`);
    }
    return { audio: new Uint8Array(await response.arrayBuffer()), contentType: "audio/mpeg" };
  },
};
