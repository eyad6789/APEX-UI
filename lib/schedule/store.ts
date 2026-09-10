import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Mey's calendar. One JSON file on disk - no account, no network, no sync.
 * Small enough to read whole on every request, which keeps the code honest.
 */

/**
 * A start is one of three things, and the shape says which:
 *   "2026-09-10T15:33"  a time on a day
 *   "2026-09-10"        a day, no clock
 *   null                neither - something to do, eventually
 * Local wall-clock throughout. Zones cause more bugs than they solve here.
 */
export type Start = string | null;

export type Meeting = {
  id: string;
  title: string;
  start: Start;
  /** Null unless a length was actually asked for. We do not invent one. */
  durationMinutes: number | null;
  with: string[];
  note?: string;
  createdAt: string;
};

const TIMED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isTimed = (start: Start): boolean => typeof start === "string" && TIMED.test(start);
export const isAllDay = (start: Start): boolean => typeof start === "string" && DAY.test(start);

/**
 * The start as we will store it, or undefined when it is not a date at all.
 * Undefined rather than null, because "he gave me nonsense" and "he gave me
 * nothing" deserve different answers.
 */
export function normalizeStart(value: unknown): Start | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isTimed(trimmed) || isAllDay(trimmed) ? trimmed : undefined;
}

/** Undated items live at the end of the list; everything else sorts by its own text. */
const sortKey = (m: Meeting) => m.start ?? "￿";

const FILE = () => process.env.APEX_SCHEDULE_FILE || path.join(process.cwd(), "data/schedule.json");

/** The day part of a start, or "" when there is none. */
export const dayOf = (start: Start): string => (start ? start.slice(0, 10) : "");

function load(): Meeting[] {
  const file = FILE();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) return [];
    // Older files were written before a start could be absent.
    return parsed.map((m) => ({ ...m, start: m.start ?? null, durationMinutes: m.durationMinutes ?? null }));
  } catch {
    console.warn("[schedule] file is not valid JSON - starting from an empty calendar");
    return [];
  }
}

function save(meetings: Meeting[]): void {
  const file = FILE();
  mkdirSync(path.dirname(file), { recursive: true });
  // Sorted on disk so the file stays readable by a human, not just by us. A bare
  // day sorts before that day's timed items because it is their prefix.
  const sorted = [...meetings].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

export function listMeetings(): Meeting[] {
  return load();
}

/** Meetings on a given local day, "2026-09-06". All-day items included. */
export function meetingsOn(day: string): Meeting[] {
  return load().filter((m) => dayOf(m.start) === day);
}

/** Everything with no date yet. Never appears in `upcoming` - it has no when. */
export function undated(): Meeting[] {
  return load().filter((m) => m.start === null);
}

/**
 * The next `count` dated items from now onwards. An all-day item is compared by
 * its day, so "the tenth" is still ahead of you at four in the afternoon on the
 * tenth - comparing it against the clock would drop it at midnight.
 */
export function upcoming(count = 5, from = new Date()): Meeting[] {
  const nowIso = localIso(from);
  const today = nowIso.slice(0, 10);
  return load()
    .filter((m) => {
      if (m.start === null) return false;               // no when, so never "next"
      return isAllDay(m.start) ? m.start >= today : m.start >= nowIso;
    })
    .slice(0, count);
}

export function addMeeting(input: {
  title: string; start?: unknown; durationMinutes?: number | null; with?: string[]; note?: string;
}): Meeting {
  const start = normalizeStart(input.start);
  if (start === undefined) throw new Error(`Not a date: ${String(input.start)}`);

  const meetings = load();
  const duration = Number(input.durationMinutes);
  const meeting: Meeting = {
    id: `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    start,
    durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : null,
    with: (input.with ?? []).map((w) => w.trim()).filter(Boolean),
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  meetings.push(meeting);
  save(meetings);
  return meeting;
}

/** Remove by id, or by a loose title/attendee match when Mey only has words to go on. */
export function removeMeeting(query: string): Meeting | null {
  const meetings = load();
  const needle = query.trim().toLowerCase();
  const index = meetings.findIndex((m) =>
    m.id === query ||
    m.title.toLowerCase().includes(needle) ||
    m.with.some((w) => w.toLowerCase().includes(needle)));
  if (index === -1) return null;
  const [removed] = meetings.splice(index, 1);
  save(meetings);
  return removed;
}

/** "2026-09-06T15:33" for a Date, in local time - the format the whole module speaks. */
export function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "3:33 pm" - how a meeting time should be read aloud. Timed starts only. */
export function spokenTime(start: Start): string {
  if (!start || !TIMED.test(start)) return "";
  const [h, m] = start.split("T")[1].split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Friday the 6th of September" - for reading a date aloud, timed or not. */
export function spokenDate(start: Start): string {
  const day = dayOf(start);
  if (!day) return "";
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
