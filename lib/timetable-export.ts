import type { TimetableSlot } from "./types";

const TZ = "Asia/Kolkata";
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

function localStamp(d: Date, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
}

function utcStamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Next Monday at 00:00 local — the anchor for the weekly recurrence. */
export function nextMonday(from = new Date()): Date {
  const d = new Date(from);
  const day = d.getDay();
  const delta = ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + delta);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface IcsOptions {
  section: string;
  room?: string | null;
  building?: string | null;
  weeks?: number;
}

/** A weekly recurring calendar for one section. */
export function buildIcs(slots: TimetableSlot[], opts: IcsOptions): string {
  const start = nextMonday();
  const weeks = opts.weeks ?? 16;
  const stamp = utcStamp();
  const loc = [opts.room ? `Room ${opts.room}` : null, opts.building].filter(Boolean).join(", ");

  const lines: Array<string | null> = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CLASSFIND//Timetable//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:CLASSFIND ${opts.section}`,
    `X-WR-TIMEZONE:${TZ}`,
  ];

  slots.forEach((s, i) => {
    if (s.kind === "break" || s.kind === "lunch") return;
    if (!s.startTime || !s.endTime) return;
    const dayDate = new Date(start.getTime() + s.day * DAY_MS);
    lines.push(
      "BEGIN:VEVENT",
      `UID:classfind-${opts.section}-${s.day}-${s.period}-${i}@classfind.site`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${localStamp(dayDate, s.startTime)}`,
      `DTEND;TZID=${TZ}:${localStamp(dayDate, s.endTime)}`,
      `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
      `SUMMARY:${s.subject ?? s.subjectCode ?? "Class"}${s.group ? ` (${s.group})` : ""}`,
      loc ? `LOCATION:${loc}` : null,
      `DESCRIPTION:${opts.section} · Period ${s.period} · CLASSFIND`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/calendar") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
