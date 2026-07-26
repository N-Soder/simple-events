/**
 * iCalendar (RFC 5545) generation for event pages.
 *
 * Events are stored as a local wall-clock date/time plus an optional IANA time
 * zone. Three cases fall out of that:
 *
 *   - No start time      → an all-day VEVENT (DTSTART;VALUE=DATE).
 *   - Time + time zone   → converted to a UTC instant, emitted with a "Z"
 *                          suffix. Fully unambiguous, and needs no VTIMEZONE
 *                          component (which not every client parses well).
 *   - Time, no time zone → a "floating" local time, which calendars interpret
 *                          in the viewer's own zone. This is the fallback for
 *                          events created before time zones were captured.
 */

import { isSafeHttpUrl } from "./url";

export interface CalendarEvent {
  id: string;
  name: string;
  description?: string | null;
  event_date: string;                 // YYYY-MM-DD
  event_time?: string | null;         // HH:MM
  event_end_time?: string | null;     // HH:MM
  timezone?: string | null;           // IANA zone, e.g. "Europe/London"
  location?: string | null;
  location_url?: string | null;       // map pin / venue page, http(s) only
  url?: string;
}

/** Fallback length for events with a start time but no end time. */
export const DEFAULT_DURATION_HOURS = 3;

/**
 * Offset, in milliseconds, of `timeZone` from UTC at the given instant.
 *
 * Formats the instant as wall-clock time in the target zone, reads the parts
 * back as if they were UTC, and takes the difference.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const at: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") at[p.type] = Number(p.value);
  }
  // Some engines render midnight as hour 24 when hour12 is false.
  const asIfUtc = Date.UTC(at.year, at.month - 1, at.day, at.hour % 24, at.minute, at.second);
  return asIfUtc - utcMs;
}

/**
 * Resolve a wall-clock date/time in `timeZone` to the UTC instant it refers to.
 *
 * The offset is looked up twice because the first lookup uses a provisional
 * instant that can sit on the wrong side of a DST transition.
 */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);

  const firstGuess = naive - zoneOffsetMs(naive, timeZone);
  const corrected = naive - zoneOffsetMs(firstGuess, timeZone);
  return new Date(corrected);
}

/** "20260801T170000Z" */
function formatUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** "20260801T170000": a floating local time, deliberately without a zone. */
function formatFloatingStamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

/** "20260801" */
function formatDateStamp(date: string): string {
  return date.replace(/-/g, "");
}

/** Add `days` to a YYYY-MM-DD string, returning the same format. */
function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, mo - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

function addMinutes(time: string, minutes: number): { time: string; dayOffset: number } {
  const [h, mi] = time.split(":").map(Number);
  const total = h * 60 + mi + minutes;
  const dayOffset = Math.floor(total / (24 * 60));
  const within = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(within / 60)).padStart(2, "0");
  const mm = String(within % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayOffset };
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Work out the event's end as a date + time pair.
 *
 * An end time at or before the start time is read as crossing midnight (a
 * 20:00–01:00 party ends the next morning) rather than as invalid input.
 */
export function resolveEnd(event: CalendarEvent): { date: string; time: string } {
  const start = event.event_time as string;

  if (event.event_end_time) {
    const crossesMidnight = minutesOfDay(event.event_end_time) <= minutesOfDay(start);
    return {
      date: crossesMidnight ? addDays(event.event_date, 1) : event.event_date,
      time: event.event_end_time,
    };
  }

  const { time, dayOffset } = addMinutes(start, DEFAULT_DURATION_HOURS * 60);
  return { date: addDays(event.event_date, dayOffset), time };
}

/** Escape a value for an iCalendar TEXT field (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a content line to 75 octets (RFC 5545 §3.1), continuing with a leading
 * space. Folding counts bytes, not characters, so multi-byte characters are
 * measured by their UTF-8 length and never split across a fold.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // The first octet of a continuation line is the leading space.
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/**
 * Strip Markdown to readable plain text for the calendar DESCRIPTION field,
 * which is not a rich-text field in any mainstream client.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")      // images → alt text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // links → "text (url)"
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")             // headings
    .replace(/^\s{0,3}>\s?/gm, "")                  // blockquotes
    .replace(/(\*\*|__)(.*?)\1/g, "$2")             // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")                // italic
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")          // code
    .replace(/^\s{0,3}[-*+]\s+/gm, "• ")            // bullets
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Build the full .ics document for an event. */
export function buildIcs(event: CalendarEvent, now = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Simple Events//Event Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@simple-events`,
    `DTSTAMP:${formatUtcStamp(now)}`,
  ];

  if (!event.event_time) {
    // All-day. DTEND is exclusive, so it lands on the following day.
    lines.push(`DTSTART;VALUE=DATE:${formatDateStamp(event.event_date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateStamp(addDays(event.event_date, 1))}`);
  } else {
    const end = resolveEnd(event);
    if (event.timezone) {
      lines.push(`DTSTART:${formatUtcStamp(zonedWallTimeToUtc(event.event_date, event.event_time, event.timezone))}`);
      lines.push(`DTEND:${formatUtcStamp(zonedWallTimeToUtc(end.date, end.time, event.timezone))}`);
    } else {
      lines.push(`DTSTART:${formatFloatingStamp(event.event_date, event.event_time)}`);
      lines.push(`DTEND:${formatFloatingStamp(end.date, end.time)}`);
    }
  }

  lines.push(`SUMMARY:${escapeText(event.name)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);

  const descriptionParts: string[] = [];
  if (event.description) descriptionParts.push(markdownToPlainText(event.description));
  // Calendar clients do not linkify LOCATION, so the map link goes in the body
  // where it is actually tappable.
  if (isSafeHttpUrl(event.location_url)) descriptionParts.push(`Location: ${event.location_url}`);
  if (event.url) descriptionParts.push(event.url);
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeText(descriptionParts.join("\n\n"))}`);
  }
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A Google Calendar "add event" URL, as an alternative to downloading a file. */
export function googleCalendarUrl(event: CalendarEvent): string {
  let dates: string;
  if (!event.event_time) {
    dates = `${formatDateStamp(event.event_date)}/${formatDateStamp(addDays(event.event_date, 1))}`;
  } else {
    const end = resolveEnd(event);
    if (event.timezone) {
      dates =
        `${formatUtcStamp(zonedWallTimeToUtc(event.event_date, event.event_time, event.timezone))}` +
        `/${formatUtcStamp(zonedWallTimeToUtc(end.date, end.time, event.timezone))}`;
    } else {
      dates = `${formatFloatingStamp(event.event_date, event.event_time)}/${formatFloatingStamp(end.date, end.time)}`;
    }
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates,
  });
  if (event.location) params.set("location", event.location);

  const details: string[] = [];
  if (event.description) details.push(markdownToPlainText(event.description));
  if (isSafeHttpUrl(event.location_url)) details.push(`Location: ${event.location_url}`);
  if (event.url) details.push(event.url);
  if (details.length > 0) params.set("details", details.join("\n\n"));
  // Without a zone the dates are floating; tell Google to read them as the
  // event's own zone when we have one.
  if (event.timezone) params.set("ctz", event.timezone);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Filesystem-safe .ics filename derived from the event name. */
export function icsFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "event"}.ics`;
}

/** Trigger a browser download of the event's .ics file. */
export function downloadIcs(event: CalendarEvent): void {
  const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFilename(event.name);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
