import { NextResponse } from "next/server";
import { addMeeting, listMeetings, removeMeeting, undated, upcoming } from "@/lib/schedule/store";

/**
 * The calendar, for the UI (and for anything else that wants it).
 * GET → every meeting. POST → add one. DELETE ?q= → remove by id, title or person.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // `meetings` is everything, which is what the panel renders from; the other two
  // are the same items pre-split, for anything that would rather not do it itself.
  return NextResponse.json({ meetings: listMeetings(), upcoming: upcoming(6), undated: undated() });
}

export async function POST(request: Request) {
  let body: { title?: unknown; start?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // A title is the only thing a schedule item genuinely cannot do without. No
  // start at all is a thing to do eventually, and that is allowed on purpose.
  if (typeof body?.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "A schedule item needs a title." }, { status: 400 });
  }
  try {
    return NextResponse.json({ meeting: addMeeting(body as { title: string }) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (!query) return NextResponse.json({ error: "Pass ?q= an id, title or person." }, { status: 400 });
  const removed = removeMeeting(query);
  return removed
    ? NextResponse.json({ removed })
    : NextResponse.json({ error: "No meeting matched." }, { status: 404 });
}
