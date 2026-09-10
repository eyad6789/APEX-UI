import { NextResponse } from "next/server";
import { think, type Msg } from "@/lib/brain";
import { parseBlocks, runBlocks, stripBlocks, wireHandlers } from "@/lib/agent";

/**
 * The agent's brain. POST { messages: [{ role, content }] } → { reply }.
 *
 * Gemini answers, the local open model catches it if Gemini is down (see lib/brain),
 * and any command the model emitted - calendar, workspace, terminal - is executed
 * here before replying. What Mey says about an action is the action's real outcome.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

wireHandlers();

/** A browser page can now spawn processes, so only this machine may ask. */
function isLocal(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;                      // same-origin fetches send none
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isLocal(request)) {
    return NextResponse.json({ error: "Only this machine may talk to Mey." }, { status: 403 });
  }

  let body: { messages?: Msg[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20); // the last ten exchanges
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send at least one user message." }, { status: 400 });
  }

  let reply: string, model: string;
  try {
    ({ reply, model } = await think(messages));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const blocks = parseBlocks(reply);
  const spoken = stripBlocks(reply);
  if (blocks.length === 0) {
    return NextResponse.json({ reply: spoken || "…", model });
  }

  // Ran something: the outcome is what he says, so he cannot claim a booking that
  // did not save or a window that did not open.
  const outcome = await runBlocks(blocks, { lastUserMessage: messages[messages.length - 1].content });

  // A handler that returned facts rather than an outcome gets one more pass through
  // the model, so a readme comes back as a sentence instead of being read aloud.
  let said = outcome.spoken.join(" ") || spoken || "Done, sir.";
  if (outcome.context.length) {
    try {
      const phrased = await think([
        ...messages,
        { role: "assistant", content: spoken || "Let me look." },
        {
          role: "user",
          content: `${outcome.context.join("\n\n")}\n\nAnswer my question from those facts, in one or two spoken sentences. Do not emit a command block.`,
        },
      ]);
      said = stripBlocks(phrased.reply) || said;
    } catch (e) {
      console.warn("[chat] could not phrase the lookup:", (e as Error).message);
      said = outcome.spoken.join(" ") || "I found it, sir, but could not put it into words.";
    }
  }
  const meetings = outcome.data.schedule?.meetings;

  return NextResponse.json({
    reply: said,
    model,
    effects: outcome.data,
    changed: outcome.changed,
    // The console still reads these two directly.
    scheduleChanged: outcome.changed.includes("schedule"),
    ...(meetings ? { meetings } : {}),
  });
}
