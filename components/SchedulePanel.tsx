"use client";

/**
 * The calendar, on screen. Reads /api/schedule once and then trusts whatever the
 * agent hands back after a reply, so adding a meeting by voice updates it at once.
 */

import { useEffect, useState } from "react";
import type { Meeting } from "@/lib/schedule/store";

/** A start says how much it knows by its shape: 10 characters is a bare day. */
const isAllDay = (start: string): boolean => start.length === 10;

function dayLabel(start: string, today: string, tomorrow: string): string {
  const day = start.slice(0, 10);
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function clockLabel(start: string): string {
  const [h, m] = start.split("T")[1].split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function SchedulePanel({ meetings, onChange }: {
  meetings: Meeting[] | null;
  onChange: (m: Meeting[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (meetings !== null) return;         // already supplied by the agent
    fetch("/api/schedule")
      .then((r) => r.json())
      .then((d) => onChange(d.meetings ?? []))
      .catch(() => onChange([]));
  }, [meetings, onChange]);

  const now = new Date();
  const today = iso(now);
  const tomorrow = iso(new Date(now.getTime() + 86_400_000));
  const cutoff = `${today}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const all = meetings ?? [];
  // An all-day item is compared by its day, so it stays on the list all day rather
  // than disappearing at one minute past midnight.
  const upcoming = all
    .filter((m): m is Meeting & { start: string } => {
      if (m.start === null) return false;               // no when, so never "next"
      return isAllDay(m.start) ? m.start >= today : m.start >= cutoff;
    })
    .slice(0, 6);
  const someday = all.filter((m) => m.start === null);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/schedule?q=${encodeURIComponent(id)}`, { method: "DELETE" });
      const d = await fetch("/api/schedule").then((r) => r.json());
      onChange(d.meetings ?? []);
    } finally {
      setBusy(null);
    }
  };

  const row = (m: Meeting, when: string, time: string) => (
    <li key={m.id} className="apex-schedule__item">
      <div className="apex-schedule__when">
        <span className="apex-schedule__day">{when}</span>
        <span className="apex-schedule__time">{time}</span>
      </div>
      <div className="apex-schedule__what">
        <span className="apex-schedule__name">{m.title}</span>
        {m.with.length > 0 && <span className="apex-schedule__with">{m.with.join(", ")}</span>}
      </div>
      <button type="button" className="apex-schedule__remove" onClick={() => remove(m.id)}
              disabled={busy === m.id} aria-label={`Remove ${m.title}`}>
        {busy === m.id ? "…" : "×"}
      </button>
    </li>
  );

  return (
    <aside className="apex-schedule" aria-label="Upcoming schedule">
      <h2 className="apex-schedule__title">Schedule</h2>

      {meetings === null ? (
        <p className="apex-schedule__empty">Loading…</p>
      ) : upcoming.length === 0 && someday.length === 0 ? (
        <p className="apex-schedule__empty">
          Nothing ahead. Try saying <em>&ldquo;Mey, add a meeting at 3:33 pm with Ammar&rdquo;</em> — or just
          <em> &ldquo;remind me to call the bank&rdquo;</em> when you have no time in mind.
        </p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <ul className="apex-schedule__list">
              {upcoming.map((m) =>
                row(m, dayLabel(m.start, today, tomorrow),
                    isAllDay(m.start) ? "All day" : clockLabel(m.start)))}
            </ul>
          )}

          {someday.length > 0 && (
            <>
              <h3 className="apex-schedule__group">No date yet</h3>
              <ul className="apex-schedule__list">
                {someday.map((m) => row(m, "Someday", "—"))}
              </ul>
            </>
          )}
        </>
      )}
    </aside>
  );
}
