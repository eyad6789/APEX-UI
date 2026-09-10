import { walk } from "@/lib/brain/gemini-call";

/**
 * The rest of the internet, through Gemini's own Google Search grounding.
 *
 * No second API key and no scraping: the model already has search, we just have to
 * ask for it. What comes back is an answer plus the pages it leaned on, and both
 * are treated as untrusted material by the caller.
 */

export type Source = { title: string; url: string };
export type Grounded = { answer: string; sources: Source[] };

type GroundedResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
};

/** The answer and its citations, out of Gemini's grounding metadata. */
export function parseGrounded(data: unknown): Grounded {
  const candidate = (data as GroundedResponse)?.candidates?.[0];
  const answer = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join(" ").trim();
  const sources: Source[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.web?.uri) sources.push({ title: chunk.web.title ?? chunk.web.uri, url: chunk.web.uri });
  }
  return { answer, sources };
}

/** Ask the web a question. Throws when no model could answer it. */
export async function search(query: string): Promise<Grounded> {
  const { value } = await walk(
    {
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.2 },
    },
    (data) => {
      const grounded = parseGrounded(data);
      return grounded.answer ? grounded : null;
    },
  );
  return value;
}
