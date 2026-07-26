/**
 * Whether this browser's locale writes times as AM/PM rather than 24-hour.
 * Used to display times the way the reader already expects to see them.
 */
export function prefers12Hour(): boolean {
  try {
    return Intl.DateTimeFormat(navigator.language, { hour: "numeric" }).resolvedOptions().hour12 ?? true;
  } catch {
    return true;
  }
}

/**
 * Format an "HH:MM" (24-hour) time string for display.
 *
 * Returns the original string unchanged if it isn't a well-formed "HH:MM"
 * value, so malformed data degrades gracefully instead of rendering "NaN:NaN".
 */
export function formatEventTime(time: string, use12Hour: boolean): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time;

  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return time;

  if (use12Hour) {
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
