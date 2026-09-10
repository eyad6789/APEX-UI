import { systemPrompt, type Msg } from "./persona";

/**
 * The offline brain: a small open model served by Ollama on this machine.
 *
 * This is the safety net, not the main act - it takes over when Gemini is
 * unreachable, out of quota, or the wifi is gone, so Apex still answers.
 *
 * Setup:  ollama pull qwen2.5:7b-instruct
 * Env:    OLLAMA_HOST (default http://127.0.0.1:11434), APEX_LOCAL_MODEL
 */

const host = () => process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const model = () => process.env.APEX_LOCAL_MODEL || "qwen2.5:7b-instruct";
const TIMEOUT_MS = 45_000;   // a cold local model has to load from disk first

/** Cheap liveness check - false when Ollama is not running, so we do not stall on it. */
export async function isReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${host()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function think(messages: Msg[]): Promise<{ reply: string; model: string }> {
  const name = model();
  const r = await fetch(`${host()}/api/chat`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: name,
      stream: false,
      messages: [{ role: "system", content: systemPrompt() }, ...messages],
      options: { temperature: 0.7, num_predict: 400 },
    }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => r.statusText);
    throw new Error(`Ollama error ${r.status}: ${detail.slice(0, 200)}`);
  }
  const data = await r.json();
  const reply = String(data?.message?.content ?? "").trim();
  if (!reply) throw new Error(`${name} returned nothing.`);
  return { reply, model: `${name} (local)` };
}
