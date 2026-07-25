/**
 * IANA time zone helpers, kept out of the component file so they can be shared
 * without tripping fast refresh.
 */

/**
 * Used when Intl.supportedValuesOf is unavailable. Not a complete list — the
 * detected zone is always merged in, so the host's own zone is never missing.
 */
const FALLBACK_ZONES = [
  "UTC",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Madrid",
  "Europe/Berlin", "Europe/Amsterdam", "Europe/Brussels", "Europe/Zurich", "Europe/Rome",
  "Europe/Stockholm", "Europe/Oslo", "Europe/Copenhagen", "Europe/Helsinki", "Europe/Warsaw",
  "Europe/Prague", "Europe/Vienna", "Europe/Athens", "Europe/Istanbul", "Europe/Moscow",
  "America/New_York", "America/Toronto", "America/Chicago", "America/Denver",
  "America/Phoenix", "America/Los_Angeles", "America/Vancouver", "America/Mexico_City",
  "America/Bogota", "America/Sao_Paulo", "America/Buenos_Aires",
  "Africa/Casablanca", "Africa/Lagos", "Africa/Cairo", "Africa/Johannesburg", "Africa/Nairobi",
  "Asia/Jerusalem", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka",
  "Asia/Bangkok", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Perth", "Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne",
  "Pacific/Auckland",
];

/** The host's own zone, or UTC if the browser won't say. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Every zone the runtime knows, always including UTC and `current`. */
export function allZones(current: string): string[] {
  let zones: string[];
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    zones = supported ? supported("timeZone") : FALLBACK_ZONES;
  } catch {
    zones = FALLBACK_ZONES;
  }
  const set = new Set(zones);
  set.add("UTC");
  if (current) set.add(current);
  return [...set].sort();
}

/** "GMT+1" style label for the zone's offset right now. */
export function offsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "Europe/London" → "Europe / London" */
export function prettyZone(zone: string): string {
  return zone.replace(/_/g, " ").replace(/\//g, " / ");
}
