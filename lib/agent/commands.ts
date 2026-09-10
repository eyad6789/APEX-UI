/**
 * How Mey acts on anything.
 *
 * The model emits tagged JSON blocks and the server executes them, so what Mey
 * says is the real outcome - he can never claim to have done something that failed.
 * This generalises the original calendar-only version: any namespace, several blocks
 * per reply, run in the order they were written.
 *
 *   <apex:schedule>{"action":"add","title":"Meeting with Ammar","start":"2026-09-07T15:33"}</apex:schedule>
 *   <apex:terminal>{"action":"open","count":4,"project":"MARSAD"}</apex:terminal>
 *
 * Provider-native function calling was deliberately not used: Gemini and Ollama
 * disagree on the shape and the local 7B is unreliable at it. One contract for every
 * brain, and greppable in a log.
 */

/** Matches one block and captures its namespace and body. The backreference keeps
 *  <apex:terminal>…</apex:schedule> from parsing as anything. */
const BLOCK = /<apex:([a-z]+)>\s*([\s\S]*?)\s*<\/apex:\1>/gi;

export type Block = { ns: string; payload: Record<string, unknown> };

export type HandlerResult = {
  /**
   * What Mey should say. Replaces his own words when present, so an action reports
   * its real outcome rather than what he predicted.
   */
  spoken: string;
  /**
   * Facts he asked for rather than an action he took. These go BACK to the model to
   * be phrased, because raw material - a readme, a file tree - must never be read
   * aloud verbatim.
   */
  context?: string;
  /** Did this change persistent state? */
  changed?: boolean;
  /** Anything the UI needs, merged into the response under the namespace. */
  data?: Record<string, unknown>;
};

export type Handler = (payload: Record<string, unknown>) => HandlerResult | Promise<HandlerResult>;

const handlers = new Map<string, Handler>();

export function registerHandler(ns: string, handler: Handler): void {
  handlers.set(ns.toLowerCase(), handler);
}

/** Exposed for tests; the chat route uses runBlocks. */
export function knownNamespaces(): string[] {
  return [...handlers.keys()].sort();
}

/** Every well-formed block in a reply, in order. Malformed JSON is logged and skipped. */
export function parseBlocks(reply: string): Block[] {
  const found: Block[] = [];
  for (const match of reply.matchAll(BLOCK)) {
    const [, ns, body] = match;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        found.push({ ns: ns.toLowerCase(), payload: parsed as Record<string, unknown> });
      }
    } catch {
      console.warn(`[agent] malformed <apex:${ns}> block:`, body.slice(0, 200));
    }
  }
  return found;
}

/** The reply with every block removed - what is left is what gets spoken. */
export function stripBlocks(reply: string): string {
  return reply.replace(BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
}

export type RunOutcome = {
  /** Sentences from the handlers, in order. Empty when nothing ran. */
  spoken: string[];
  /** Namespace-keyed payloads for the UI, e.g. { schedule: { meetings: [...] } }. */
  data: Record<string, Record<string, unknown>>;
  /** Namespaces that changed persistent state. */
  changed: string[];
  /** Raw facts for the model to phrase, if any handler returned some. */
  context: string[];
};

/**
 * Run every block. A handler that throws costs its own sentence, never the reply -
 * a failed terminal launch should not silence Mey.
 */
export async function runBlocks(blocks: Block[]): Promise<RunOutcome> {
  const outcome: RunOutcome = { spoken: [], data: {}, changed: [], context: [] };

  for (const { ns, payload } of blocks) {
    const handler = handlers.get(ns);
    if (!handler) {
      console.warn(`[agent] no handler for <apex:${ns}>`);
      continue;
    }
    try {
      const result = await handler(payload);
      if (result.spoken) outcome.spoken.push(result.spoken);
      if (result.context) outcome.context.push(result.context);
      if (result.data) outcome.data[ns] = { ...(outcome.data[ns] ?? {}), ...result.data };
      if (result.changed && !outcome.changed.includes(ns)) outcome.changed.push(ns);
    } catch (e) {
      console.error(`[agent] <apex:${ns}> failed:`, e);
      outcome.spoken.push(`I could not do that, sir. ${(e as Error).message}`);
    }
  }
  return outcome;
}
