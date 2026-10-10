// The two emails Simple Events sends. Pure functions: everything they need is
// passed in, and every piece of user-supplied text is escaped on the way out.

import { buildIcs, googleCalendarUrl, icsFilename, type CalendarEvent } from "../../src/lib/ics";
import { isSafeHttpUrl } from "../../src/lib/url";
import type { EmailAttachment } from "./resend";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailEvent {
  id: string;
  name: string;
  event_date: string;
  event_time: string | null;
  event_end_time: string | null;
  timezone: string | null;
  location: string | null;
  location_url: string | null;
}

// The light theme tokens from src/index.css as hex, since email clients need
// inline colours. Fonts fall back to Georgia and Helvetica where DM is absent.
const C = { bg: "#FCFAF8", card: "#FFFFFF", ink: "#1D212B", muted: "#6A7181", line: "#E7E4DF", panel: "#F5F3F0", primary: "#358C61" };
const SANS = "'DM Sans',Helvetica,Arial,sans-serif";
const SERIF = "'DM Serif Display',Georgia,'Times New Roman',serif";

// The wordmark from src/components/Logo.tsx, rebuilt from text so the email
// carries no image: nothing to block, and nothing fetched when it is opened.
// A dotless i sits under a green dot; the short line-height pulls the two
// together without the negative margins Gmail strips. Outlook's Word engine
// can't stack them, so it gets the plain name.
const WORDMARK_STYLE = `font-family:${SERIF};font-size:24px;line-height:1;color:${C.ink};white-space:nowrap;`;
const WORDMARK = `<!--[if mso]><span style="${WORDMARK_STYLE}">Simple Events</span><![endif]--><!--[if !mso]><!--><span role="img" aria-label="Simple Events" style="${WORDMARK_STYLE}">S<span style="display:inline-block;text-align:center;"><span style="display:block;width:5px;height:5px;margin:0 auto;border-radius:50%;background:${C.primary};line-height:0;font-size:0;"></span><span style="display:block;line-height:.38em;">&#305;</span></span>mple Events</span><!--<![endif]-->`;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse line breaks and control characters, so a name is safe as a subject. */
const oneLine = (value: string) => value.replace(/[\p{Cc}\s]+/gu, " ").trim();

// Names are spelled out by hand rather than through Intl, because the Workers
// runtime does not carry locale data for anything but en-US.
function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(utc.getTime())) return date;
  return `${WEEKDAYS[utc.getUTCDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
}

function formatTime(time: string, hour12: boolean): string {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return time;
  const mm = String(minute).padStart(2, "0");
  return hour12 ? `${hour % 12 || 12}:${mm} ${hour >= 12 ? "pm" : "am"}` : `${String(hour).padStart(2, "0")}:${mm}`;
}

function formatWhen(event: EmailEvent, hour12: boolean): string {
  const date = formatDate(event.event_date);
  if (!event.event_time) return date;
  const start = formatTime(event.event_time, hour12);
  const range = event.event_end_time ? `${start} to ${formatTime(event.event_end_time, hour12)}` : start;
  return `${date}, ${range}${event.timezone ? ` (${event.timezone.replace(/_/g, " ")})` : ""}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Row { label: string; value: string; href?: string }
interface Layout {
  origin: string;
  subject: string;
  eyebrow: string;
  heading: string;
  intro: string;
  rows: Row[];
  button: { label: string; href: string };
  /** A second link, shown in full under the button. */
  secondary: { label: string; href: string };
  notes: string[];
}

function render(layout: Layout): RenderedEmail {
  const host = new URL(layout.origin).host;
  const privacy = `${layout.origin}/privacy`;
  const why = `You’re getting this because this address was entered on ${host}. It was used once and isn’t stored, so you won’t hear from us again.`;
  const e = escapeHtml;

  const rows = layout.rows.map((row) => {
    const value = row.href
      ? `<a href="${e(row.href)}" style="color:${C.primary};">${e(row.value)}</a>`
      : e(row.value);
    return `<tr><td style="padding:3px 16px 3px 0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.muted};white-space:nowrap;vertical-align:top;">${e(row.label)}</td><td style="padding:3px 0;font-size:15px;line-height:1.5;color:${C.ink};">${value}</td></tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${e(layout.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;">${e(layout.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:12px;">
<tr><td style="padding:28px 28px 0;">${WORDMARK}</td></tr>
<tr><td style="padding:24px 28px 0;font-family:${SANS};">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.primary};">${e(layout.eyebrow)}</p>
<h1 style="margin:0 0 14px;font-family:${SERIF};font-weight:400;font-size:28px;line-height:1.2;color:${C.ink};">${e(layout.heading)}</h1>
<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:${C.ink};">${e(layout.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border-radius:8px;"><tr><td style="padding:14px 18px;"><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;"><tr><td style="border-radius:8px;background:${C.primary};"><a href="${e(layout.button.href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${e(layout.button.label)}</a></td></tr></table>
<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${C.muted};">Or paste this into your browser:<br><a href="${e(layout.button.href)}" style="color:${C.primary};word-break:break-all;">${e(layout.button.href)}</a></p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:${C.ink};"><strong>${e(layout.secondary.label)}</strong><br><a href="${e(layout.secondary.href)}" style="color:${C.primary};word-break:break-all;">${e(layout.secondary.href)}</a></p>
${layout.notes.map((note) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:${C.muted};">${e(note)}</p>`).join("\n")}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid ${C.line};font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">
<p style="margin:0 0 8px;">${e(why)}</p>
<p style="margin:0;"><a href="${e(privacy)}" style="color:${C.muted};">Privacy</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    layout.heading, "", layout.intro, "",
    ...layout.rows.map((row) => `${row.label}: ${row.value}${row.href ? ` (${row.href})` : ""}`),
    "", `${layout.button.label}:`, layout.button.href,
    "", `${layout.secondary.label}:`, layout.secondary.href,
    "", ...layout.notes,
    "", why, `Privacy: ${privacy}`, "",
  ].join("\n");

  return { subject: layout.subject, html, text };
}

/** Sent to a host who asked for their links when creating an event. */
export function renderHostLinksEmail(input: {
  origin: string;
  event: Pick<EmailEvent, "id" | "name" | "event_date">;
  adminToken: string;
  hasPassword: boolean;
}): RenderedEmail {
  const { origin, event } = input;
  const name = oneLine(event.name);
  return render({
    origin,
    subject: `Your links for ${name}`,
    eyebrow: "Event created",
    heading: `${name} is ready to share`,
    intro: "Here are the two links for your event. Send the guest link to the people you’re inviting, and keep the admin link to yourself.",
    rows: [
      { label: "Event", value: name },
      { label: "Date", value: formatDate(event.event_date) },
    ],
    button: { label: "Open event dashboard", href: `${origin}/admin/${event.id}?token=${encodeURIComponent(input.adminToken)}` },
    secondary: { label: "Guest link to share", href: `${origin}/event/${event.id}` },
    notes: [
      // The password is deliberately not in this email.
      ...(input.hasPassword ? ["Guests will need the password you set. It isn’t included in this email."] : []),
      "Anyone with the dashboard link can edit the event and see every reply, so don’t forward this email.",
    ],
  });
}

function calendarEvent(origin: string, event: EmailEvent): CalendarEvent {
  // No description: it can be long, and a host may not want it travelling by
  // email. The link back to the event page carries the detail.
  return { ...event, url: `${origin}/event/${event.id}` };
}

/** Sent to a guest who asked for a confirmation when they replied. */
export function renderRsvpEmail(input: {
  origin: string;
  event: EmailEvent;
  rsvp: { id: string; manage_code: string; guest_name: string; adults: number; kids: number };
  bringing: string[];
  hour12: boolean;
}): RenderedEmail {
  const { origin, event, rsvp } = input;
  const name = oneLine(event.name);
  const link = isSafeHttpUrl(event.location_url) ? event.location_url : undefined;

  const rows: Row[] = [{ label: "When", value: formatWhen(event, input.hour12) }];
  if (event.location) rows.push({ label: "Where", value: oneLine(event.location), href: link });
  else if (link) rows.push({ label: "Where", value: new URL(link).host, href: link });
  rows.push({ label: "Guests", value: `${plural(rsvp.adults, "adult")}${rsvp.kids > 0 ? `, ${plural(rsvp.kids, "kid")}` : ""}` });
  if (input.bringing.length > 0) rows.push({ label: "Bringing", value: input.bringing.map(oneLine).join(", ") });

  return render({
    origin,
    subject: `You’re going to ${name}`,
    eyebrow: "Reply saved",
    heading: `You’re going to ${name}`,
    intro: `Thanks, ${oneLine(rsvp.guest_name)}. Your host has your reply.`,
    rows,
    button: { label: "View or change my RSVP", href: `${origin}/event/${event.id}#manage=${rsvp.id}.${rsvp.manage_code}` },
    secondary: { label: "Add to Google Calendar", href: googleCalendarUrl(calendarEvent(origin, event)) },
    notes: [
      "A calendar file is attached for Apple Calendar, Outlook and other apps.",
      "The RSVP link lets anyone change your reply, so keep this email to yourself.",
    ],
  });
}

/** The event as a base64 .ics file, for the RSVP confirmation. */
export function rsvpCalendarAttachment(origin: string, event: EmailEvent): EmailAttachment {
  let binary = "";
  for (const byte of new TextEncoder().encode(buildIcs(calendarEvent(origin, event)))) binary += String.fromCharCode(byte);
  return { filename: icsFilename(event.name), content: btoa(binary), content_type: "text/calendar" };
}
