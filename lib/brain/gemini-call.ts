/**
 * The transport to Gemini, and nothing else.
 *
 * Deliberately free of the persona: the grounded web search imports this too, and
 * routing it through the module that builds the system prompt would make a cycle
 * (persona → web → search → gemini). Everything that knows what to *say* lives a
 * layer up; this file only knows how to get a body to Google and back.
 *
 * Google renames models often and the newest one is regularly saturated (503), so
 * we walk a list and remember whichever answered last.
 */

const MODELS = ["gemini-3.7-flash", "gemini-3-flash", "gemini-2.5-flash"];
export const TIMEOUT_MS = 15_000;

let workingModel: string | null = null;

export const isConfigured = () => !!process.env.GEMINI_API_KEY;

function candidates(): string[] {
  return [...new Set([process.env.APEX_MODEL, workingModel, ...MODELS].filter((m): m is string => !!m))];
}

/**
 * Send `body` to each model in turn until `extract` gets something usable out of
 * the response. Returning null from `extract` means "this model answered, but with
 * nothing" - worth trying the next one, which is how an empty completion is handled.
 */
export async function walk<T>(
  body: Record<string, unknown>,
  extract: (data: Record<string, never>) => T | null,
  timeoutMs = TIMEOUT_MS,
): Promise<{ value: T; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  let lastError = "";
  for (const model of candidates()) {
    let ok: boolean, status: number, data: Record<string, never>;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
      ({ ok, status } = r);
      data = await r.json().catch(() => ({}));
    } catch (e) {
      lastError = `${model} did not answer: ${(e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message}`;
      console.warn(`[gemini] ${lastError}`);
      continue;
    }

    if (ok) {
      const value = extract(data);
      if (value !== null) {
        if (workingModel !== model) console.log(`[gemini] using ${model}`);
        workingModel = model;
        return { value, model };
      }
      const why = (data as Record<string, never> & { candidates?: [{ finishReason?: string }]; promptFeedback?: { blockReason?: string } });
      lastError = `${model} returned nothing (${why.candidates?.[0]?.finishReason ?? why.promptFeedback?.blockReason ?? "empty"}).`;
      continue;
    }

    lastError = `${model} error ${status}: ${(data as { error?: { message?: string } })?.error?.message ?? "unknown"}`;
    console.warn(`[gemini] ${lastError}`);
    if (workingModel === model) workingModel = null;
    // 404 unknown model, 429/503 saturated → worth trying the next one.
    // Anything else (bad key, blocked prompt) will fail identically on every model.
    if (![404, 429, 503].includes(status)) break;
  }
  throw new Error(lastError || "No Gemini model answered.");
}

/** The text of a completion, joined across parts. "" when there is none. */
export function textOf(data: unknown): string {
  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    ?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join(" ").trim();
}
