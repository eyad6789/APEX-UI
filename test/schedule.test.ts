import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The calendar's own tests. store.ts reads APEX_SCHEDULE_FILE lazily, on every
 * call, so pointing it at a temp file here is enough to keep Mey's real calendar
 * out of the way.
 */
const FILE = path.join(mkdtempSync(path.join(tmpdir(), "apex-schedule-")), "schedule.json");
process.env.APEX_SCHEDULE_FILE = FILE;

import {
  addMeeting, listMeetings, meetingsOn, spokenDate, undated, upcoming,
} from "../lib/schedule/store.ts";
import { scheduleHandler } from "../lib/schedule/commands.ts";

const reset = () => rmSync(FILE, { force: true });

test("a date with no time is kept as an all-day item", () => {
  reset();
  const m = addMeeting({ title: "Design review", start: "2026-09-10" });
  assert.equal(m.start, "2026-09-10");
});

test("an item with no date at all is kept with no start", () => {
  reset();
  const m = addMeeting({ title: "Call the bank" });
  assert.equal(m.start, null);
});

test("a meeting no longer gets an invented thirty minute duration", () => {
  reset();
  assert.equal(addMeeting({ title: "Ammar", start: "2026-09-10T15:33" }).durationMinutes, null);
});

test("a duration that was actually asked for is kept", () => {
  reset();
  assert.equal(addMeeting({ title: "Ammar", start: "2026-09-10T15:33", durationMinutes: 45 }).durationMinutes, 45);
});

test("items survive the write and come back from disk", () => {
  reset();
  addMeeting({ title: "Call the bank" });
  addMeeting({ title: "Design review", start: "2026-09-10" });
  assert.ok(existsSync(FILE), "the calendar should be on disk");
  assert.deepEqual(listMeetings().map((m) => m.title).sort(), ["Call the bank", "Design review"]);
});

test("an all-day item sorts before that day's timed ones, and undated items sort last", () => {
  reset();
  addMeeting({ title: "Timed", start: "2026-09-10T09:00" });
  addMeeting({ title: "Someday" });
  addMeeting({ title: "All day", start: "2026-09-10" });
  assert.deepEqual(listMeetings().map((m) => m.title), ["All day", "Timed", "Someday"]);
});

test("an all-day item is still upcoming late in its own day", () => {
  reset();
  addMeeting({ title: "All day", start: "2026-09-10" });
  assert.deepEqual(upcoming(5, new Date(2026, 8, 10, 16, 0)).map((m) => m.title), ["All day"]);
});

test("yesterday's all-day item is not upcoming", () => {
  reset();
  addMeeting({ title: "All day", start: "2026-09-09" });
  assert.deepEqual(upcoming(5, new Date(2026, 8, 10, 16, 0)), []);
});

test("undated items are not upcoming - they have their own list", () => {
  reset();
  addMeeting({ title: "Someday" });
  assert.deepEqual(upcoming(5, new Date(2026, 8, 10, 9, 0)), []);
  assert.deepEqual(undated().map((m) => m.title), ["Someday"]);
});

test("an all-day item is found on its day", () => {
  reset();
  addMeeting({ title: "All day", start: "2026-09-10" });
  assert.equal(meetingsOn("2026-09-10").length, 1);
});

test("a date-only start reads aloud the same as a timed one", () => {
  assert.equal(spokenDate("2026-09-10"), spokenDate("2026-09-10T09:00"));
});

test("Mey can book something with no time, and does not say a time back", async () => {
  reset();
  const result = await scheduleHandler({ action: "add", title: "Design review", start: "2026-09-10" });
  assert.equal(result.changed, true);
  assert.match(result.spoken, /September/);
  assert.doesNotMatch(result.spoken, /\b(am|pm)\b/);
});

test("Mey can book something with no date, and says so", async () => {
  reset();
  const result = await scheduleHandler({ action: "add", title: "Call the bank" });
  assert.equal(result.changed, true);
  assert.match(result.spoken, /no date/i);
});

test("a start that is not a date is still refused", async () => {
  reset();
  const result = await scheduleHandler({ action: "add", title: "X", start: "sometime next week" });
  assert.equal(result.changed, false);
  assert.equal(listMeetings().length, 0);
});

test("undated items are read out after the upcoming ones", async () => {
  reset();
  addMeeting({ title: "Call the bank" });
  const result = await scheduleHandler({ action: "list" });
  assert.match(result.spoken, /Call the bank/);
});
