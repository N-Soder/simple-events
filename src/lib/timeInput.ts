/**
 * Parsing and option helpers for the time picker.
 *
 * The canonical form everywhere — state, API, database — is 24-hour "HH:MM".
 * These helpers only exist to let people type times the way they say them.
 */

const MINUTES_IN_DAY = 24 * 60;

export function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(totalMinutes: number): string {
  const within = ((totalMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${String(Math.floor(within / 60)).padStart(2, "0")}:${String(within % 60).padStart(2, "0")}`;
}

/**
 * Read a loosely typed time and return canonical "HH:MM", or null if it can't
 * be understood. Accepts "6", "630", "6:30", "6.30", "6pm", "6:30 PM", "18:30",
 * "noon" and "midnight".
 *
 * `after` disambiguates a bare 1–12 hour with no am/pm: the reading that lands
 * soonest after that time wins, so typing "7" in an end field with a 6pm start
 * means 7pm, not 7am. Without it, a bare hour is taken literally.
 */
export function parseTimeInput(raw: string, after?: string): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  if (text === "noon" || text === "midday") return "12:00";
  if (text === "midnight") return "00:00";

  const match = /^(\d{1,2})(?::|\.|h)?(\d{2})?\s*(am|pm|a|p)?$/.exec(text);
  if (!match) return null;

  const [, hourRaw, minuteRaw, meridiemRaw] = match;
  let hour = Number(hourRaw);
  const minute = minuteRaw === undefined ? 0 : Number(minuteRaw);
  const meridiem = meridiemRaw?.[0]; // "a" | "p" | undefined

  if (minute > 59) return null;

  // "1830" and "930" are compact 24-hour times, not hour-plus-minutes.
  if (minuteRaw === undefined && hourRaw.length > 2) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "p") hour = hour === 12 ? 12 : hour + 12;
    else hour = hour === 12 ? 0 : hour;
    return toHHMM(hour * 60 + minute);
  }

  if (hour > 23) return null;

  // Ambiguous bare hour: pick whichever reading comes soonest after `after`.
  if (after && hour >= 1 && hour <= 12) {
    const start = minutesOfDay(after);
    const morning = hour * 60 + minute;
    const evening = ((hour % 12) + 12) * 60 + minute;
    const gap = (candidate: number) => ((candidate - start) % MINUTES_IN_DAY + MINUTES_IN_DAY) % MINUTES_IN_DAY;
    return toHHMM(gap(morning) <= gap(evening) ? morning : evening);
  }

  return toHHMM(hour * 60 + minute);
}

/** Every time of day at the given step, as canonical "HH:MM". */
export function buildTimeOptions(stepMinutes = 30): string[] {
  const options: string[] = [];
  for (let m = 0; m < MINUTES_IN_DAY; m += stepMinutes) options.push(toHHMM(m));
  return options;
}

/**
 * Gap from `start` to `end` in whole minutes, wrapping past midnight so a
 * 20:00–01:00 event reads as five hours rather than minus nineteen.
 */
export function minutesBetween(start: string, end: string): number {
  const diff = minutesOfDay(end) - minutesOfDay(start);
  return diff > 0 ? diff : diff + MINUTES_IN_DAY;
}

/**
 * Narrow a list of times to those matching a partly typed query.
 *
 * Matches on what the reader sees, so "6" finds 6am, 6:30am, 6pm and 6:30pm,
 * while "6p" narrows to the afternoon ones. Anything unrecognisable returns the
 * full list rather than an empty one — a stuck dropdown is worse than a noisy
 * one, and free typing still works.
 */
export function filterTimeOptions(options: string[], query: string): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return options;

  const match = /^(\d{1,2})?(?:[:.](\d{1,2}))?(am|pm|a|p)?$/.exec(q);
  if (!match) return [];

  const [, hourDigits, minuteDigits, meridiemRaw] = match;
  const meridiem = meridiemRaw?.[0];
  if (!hourDigits && !minuteDigits && !meridiem) return options;

  return options.filter((time) => {
    const hour24 = Number(time.slice(0, 2));
    const minutes = time.slice(3, 5);

    if (meridiem && (meridiem === "p") !== hour24 >= 12) return false;
    if (minuteDigits && !minutes.startsWith(minuteDigits)) return false;
    if (hourDigits) {
      const forms = [String(hour24 % 12 || 12), String(hour24), time.slice(0, 2)];
      if (!forms.some((form) => form.startsWith(hourDigits))) return false;
    }
    return true;
  });
}

/** "3 hr", "45 min", "1 hr 30 min" */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}
