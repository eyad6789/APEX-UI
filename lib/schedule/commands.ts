import type { Handler, HandlerResult } from "@/lib/agent/commands";
import {
  addMeeting, listMeetings, localIso, meetingsOn, normalizeStart, removeMeeting,
  spokenDate, spokenTime, undated, upcoming, type Meeting,
} from "./store";

/**
 * What Mey does to the calendar. Parsing of the <apex:schedule> block itself lives
 * in lib/agent/commands.ts, which owns every namespace; this file is only the
 * calendar behaviour behind it.
 */

type Command =
  | { action: "add"; title: string; start?: unknown; durationMinutes?: number; with?: string[]; note?: string }
  | { action: "remove"; query: string }
  | { action: "list"; day?: string };

export type CommandResult = { spoken: string; changed: boolean; meetings: Meeting[] };

/** The "when" half of a read-back. Says only as much as the item actually knows. */
function whenOf(m: Meeting): string {
  if (m.start === null) return "no date yet";
  const time = spokenTime(m.start);
  return time ? `${spokenDate(m.start)} at ${time}` : spokenDate(m.start);
}

function readBack(m: Meeting): string {
  // The title usually already names the person ("Meeting with Ammar"), so only add
  // the attendees when they are not in there - otherwise Mey says "with Ammar" twice.
  const title = m.title.toLowerCase();
  const unnamed = m.with.filter((w) => !title.includes(w.toLowerCase()));
  const people = unnamed.length ? ` with ${unnamed.join(" and ")}` : "";
  return `${m.title}${people}, ${whenOf(m)}`;
}

/** Read a list out the way a person would say it. */
function readList(meetings: Meeting[], emptyLine: string): string {
  if (!meetings.length) return emptyLine;
  if (meetings.length === 1) return `One thing: ${readBack(meetings[0])}.`;
  return `${meetings.length} things. ` + meetings.map((m) => readBack(m)).join(". ") + ".";
}

function runCommand(command: Command): CommandResult {
  switch (command.action) {
    case "add": {
      const start = normalizeStart(command.start);
      if (!command.title?.trim() || start === undefined) {
        return { spoken: "I could not work out when that is, sir. Could you say it again?", changed: false, meetings: listMeetings() };
      }
      const meeting = addMeeting({ ...command, start });
      return { spoken: `Noted, sir. ${readBack(meeting)}.`, changed: true, meetings: listMeetings() };
    }
    case "remove": {
      const removed = removeMeeting(command.query ?? "");
      return removed
        ? { spoken: `Cleared, sir. ${readBack(removed)} is off the calendar.`, changed: true, meetings: listMeetings() }
        : { spoken: `I could not find that one on the calendar, sir.`, changed: false, meetings: listMeetings() };
    }
    case "list": {
      const meetings = command.day ? meetingsOn(command.day) : upcoming(5);
      const empty = command.day ? "Nothing scheduled that day, sir." : "Your calendar is clear, sir.";
      let spoken = readList(meetings, empty);
      // Undated items have no place in a run of times, so they get their own tail.
      if (!command.day) {
        const loose = undated();
        if (loose.length) spoken += ` And with no date yet: ${loose.map((m) => m.title).join(", ")}.`;
      }
      return { spoken, changed: false, meetings: listMeetings() };
    }
    default:
      return { spoken: "", changed: false, meetings: listMeetings() };
  }
}

/**
 * What the model needs to know to schedule anything: the current moment (so
 * "tomorrow at 3" resolves), and what is already booked (so it can answer
 * "what's on today?" without a round trip).
 */
export function scheduleBriefing(now = new Date()): string {
  const next = upcoming(8, now);
  const loose = undated();
  const lines = next.length
    ? next.map((m) => `- ${m.start} ${m.title}${m.with.length ? ` (with ${m.with.join(", ")})` : ""}`).join("\n")
    : "- nothing scheduled";
  const looseLines = loose.length
    ? `\nWith no date yet:\n` + loose.map((m) => `- ${m.title}`).join("\n")
    : "";
  return [
    `Current date and time: ${localIso(now)} (${now.toLocaleDateString("en-GB", { weekday: "long" })}).`,
    `The user's upcoming schedule:`,
    lines + looseLines,
    ``,
    `You manage this calendar. When the user asks to add, cancel or hear their schedule,`,
    `append EXACTLY ONE command block to your reply, on its own line:`,
    `<apex:schedule>{"action":"add","title":"Meeting with Ammar","start":"2026-09-06T15:33","with":["Ammar"]}</apex:schedule>`,
    `<apex:schedule>{"action":"remove","query":"Ammar"}</apex:schedule>`,
    `<apex:schedule>{"action":"list"}</apex:schedule>`,
    `"start" is local wall-clock, and says only as much as the user said:`,
    `- they gave a time: "YYYY-MM-DDTHH:MM" ("3:33 pm" means today if it is still ahead, otherwise tomorrow)`,
    `- they gave a day but no time: "YYYY-MM-DD", an all-day item`,
    `- they gave neither ("remind me to call the bank"): leave "start" out entirely`,
    `Never invent a time, a day or a length the user did not say. Add "durationMinutes"`,
    `only when they told you how long it runs; an item with no length is simply open-ended.`,
    `Say a short natural sentence as well - the block is stripped before you are heard.`,
    `Never invent a command block when the user is not talking about their schedule.`,
  ].join("\n");
}

/**
 * The calendar as the agent sees it. Anything the model sends that is not a valid
 * command comes back as silence rather than an error, so a stray block cannot
 * derail a reply.
 */
export const scheduleHandler: Handler = (payload): HandlerResult => {
  const action = String(payload.action ?? "").toLowerCase();
  if (!["add", "remove", "list"].includes(action)) return { spoken: "" };

  const result = runCommand(payload as unknown as Command);
  return { spoken: result.spoken, changed: result.changed, data: { meetings: result.meetings } };
};
