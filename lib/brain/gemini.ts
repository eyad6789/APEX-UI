import { systemPrompt, type Msg } from "./persona";
import { isConfigured, textOf, walk } from "./gemini-call";

/** The main brain. The transport and the model-walk live in ./gemini-call. */

export { isConfigured };

/** Resolves with the reply, or throws with the reason every model failed. */
export async function think(messages: Msg[]): Promise<{ reply: string; model: string }> {
  const { value, model } = await walk(
    {
      system_instruction: { parts: [{ text: systemPrompt() }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
    },
    (data) => textOf(data) || null,
  );
  return { reply: value, model };
}
