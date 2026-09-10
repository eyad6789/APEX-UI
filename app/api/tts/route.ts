/**
 * The agent's voice. POST { text } → audio bytes.
 *
 * The voice itself is open source and local by default (Piper). Which engine
 * speaks is chosen by APEX_TTS; see lib/tts/index.ts for the list and the
 * fallback order. When no engine is installed this returns 204 and the browser
 * reads the reply in its own voice, so Mey is never silent.
 */

import { speak } from "@/lib/tts";

export const runtime = "nodejs";       // the local engines are child processes
export const dynamic = "force-dynamic";

const MAX_CHARS = 2500;

export async function POST(request: Request) {
  let text: string;
  try {
    text = String((await request.json()).text ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });

  const result = await speak(text.slice(0, MAX_CHARS));

  if ("error" in result) {
    // 204 is the agreed "no server voice - use your own": not an error, just quiet.
    console.warn(`[tts] ${result.error}`);
    return new Response(null, { status: 204, headers: { "x-apex-voice": "none", "x-apex-tts-note": result.error.slice(0, 200) } });
  }

  const { speech, engine } = result;
  // Blob keeps TypeScript happy about BodyInit and sets the length for us.
  return new Response(new Blob([speech.audio], { type: speech.contentType }), {
    headers: {
      "content-type": speech.contentType,
      "cache-control": "no-store",
      "x-apex-voice": engine.id,     // handy when you are checking which voice you just heard
    },
  });
}
