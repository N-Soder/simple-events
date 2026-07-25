import { describe, it, expect } from "vitest";
import {
  buildIcs,
  googleCalendarUrl,
  icsFilename,
  markdownToPlainText,
  resolveEnd,
  zonedWallTimeToUtc,
} from "./ics";

const NOW = new Date("2026-07-25T12:00:00Z");

function lineOf(ics: string, prefix: string): string | undefined {
  return ics.split("\r\n").find((l) => l.startsWith(prefix));
}

describe("zonedWallTimeToUtc", () => {
  it("converts a summer wall time in a DST zone", () => {
    // Europe/London is UTC+1 on 1 August.
    expect(zonedWallTimeToUtc("2026-08-01", "18:00", "Europe/London").toISOString())
      .toBe("2026-08-01T17:00:00.000Z");
  });

  it("converts a winter wall time in the same zone", () => {
    // Europe/London is UTC+0 in January.
    expect(zonedWallTimeToUtc("2026-01-15", "18:00", "Europe/London").toISOString())
      .toBe("2026-01-15T18:00:00.000Z");
  });

  it("handles zones behind UTC", () => {
    // New York is UTC-4 in August.
    expect(zonedWallTimeToUtc("2026-08-01", "18:00", "America/New_York").toISOString())
      .toBe("2026-08-01T22:00:00.000Z");
  });

  it("handles a wall time on the evening of a spring-forward day", () => {
    // London springs forward on 2026-03-29; 20:00 that evening is BST (UTC+1).
    expect(zonedWallTimeToUtc("2026-03-29", "20:00", "Europe/London").toISOString())
      .toBe("2026-03-29T19:00:00.000Z");
  });

  it("handles a wall time on the morning of an autumn fall-back day", () => {
    // London falls back on 2026-10-25; 09:00 that morning is GMT (UTC+0).
    expect(zonedWallTimeToUtc("2026-10-25", "09:00", "Europe/London").toISOString())
      .toBe("2026-10-25T09:00:00.000Z");
  });

  it("handles a half-hour offset zone", () => {
    expect(zonedWallTimeToUtc("2026-08-01", "18:00", "Asia/Kolkata").toISOString())
      .toBe("2026-08-01T12:30:00.000Z");
  });
});

describe("resolveEnd", () => {
  const base = { id: "e1", name: "Party", event_date: "2026-08-01" };

  it("defaults to three hours after the start", () => {
    expect(resolveEnd({ ...base, event_time: "18:00" }))
      .toEqual({ date: "2026-08-01", time: "21:00" });
  });

  it("rolls the default duration over midnight", () => {
    expect(resolveEnd({ ...base, event_time: "23:00" }))
      .toEqual({ date: "2026-08-02", time: "02:00" });
  });

  it("uses an explicit end time on the same day", () => {
    expect(resolveEnd({ ...base, event_time: "18:00", event_end_time: "22:30" }))
      .toEqual({ date: "2026-08-01", time: "22:30" });
  });

  it("reads an earlier end time as crossing midnight", () => {
    expect(resolveEnd({ ...base, event_time: "20:00", event_end_time: "01:00" }))
      .toEqual({ date: "2026-08-02", time: "01:00" });
  });

  it("reads an equal end time as a full day later", () => {
    expect(resolveEnd({ ...base, event_time: "20:00", event_end_time: "20:00" }))
      .toEqual({ date: "2026-08-02", time: "20:00" });
  });
});

describe("buildIcs", () => {
  it("emits an all-day event when there is no start time", () => {
    const ics = buildIcs({ id: "e1", name: "Picnic", event_date: "2026-08-01" }, NOW);
    expect(lineOf(ics, "DTSTART")).toBe("DTSTART;VALUE=DATE:20260801");
    // DTEND is exclusive.
    expect(lineOf(ics, "DTEND")).toBe("DTEND;VALUE=DATE:20260802");
  });

  it("emits UTC instants when a time zone is known", () => {
    const ics = buildIcs(
      { id: "e1", name: "BBQ", event_date: "2026-08-01", event_time: "18:00", timezone: "Europe/London" },
      NOW,
    );
    expect(lineOf(ics, "DTSTART")).toBe("DTSTART:20260801T170000Z");
    expect(lineOf(ics, "DTEND")).toBe("DTEND:20260801T200000Z");
  });

  it("emits floating times when no time zone is stored", () => {
    const ics = buildIcs(
      { id: "e1", name: "BBQ", event_date: "2026-08-01", event_time: "18:00" },
      NOW,
    );
    expect(lineOf(ics, "DTSTART")).toBe("DTSTART:20260801T180000");
    expect(lineOf(ics, "DTEND")).toBe("DTEND:20260801T210000");
  });

  it("escapes commas, semicolons and backslashes in text fields", () => {
    const ics = buildIcs(
      { id: "e1", name: "Food, drink; fun\\times", event_date: "2026-08-01" },
      NOW,
    );
    expect(lineOf(ics, "SUMMARY")).toBe("SUMMARY:Food\\, drink\\; fun\\\\times");
  });

  it("escapes newlines in the description", () => {
    const ics = buildIcs(
      { id: "e1", name: "BBQ", event_date: "2026-08-01", description: "Line one\nLine two" },
      NOW,
    );
    expect(lineOf(ics, "DESCRIPTION")).toBe("DESCRIPTION:Line one\\nLine two");
  });

  it("folds long lines at 75 octets with a leading space", () => {
    const ics = buildIcs({ id: "e1", name: "x".repeat(200), event_date: "2026-08-01" }, NOW);
    const lines = ics.split("\r\n");
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Continuation lines are marked by a single leading space.
    expect(lines.filter((l) => l.startsWith(" ")).length).toBeGreaterThan(0);
  });

  it("never splits a multi-byte character across a fold", () => {
    const ics = buildIcs({ id: "e1", name: "🎉".repeat(40), event_date: "2026-08-01" }, NOW);
    // A split surrogate pair would surface as a replacement character.
    expect(ics).not.toContain("�");
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("uses CRLF line endings and closes the calendar", () => {
    const ics = buildIcs({ id: "e1", name: "BBQ", event_date: "2026-08-01" }, NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("includes the event URL in both URL and DESCRIPTION", () => {
    const ics = buildIcs(
      { id: "e1", name: "BBQ", event_date: "2026-08-01", url: "https://example.com/event/e1" },
      NOW,
    );
    expect(lineOf(ics, "URL:")).toBe("URL:https://example.com/event/e1");
    expect(lineOf(ics, "DESCRIPTION")).toContain("https://example.com/event/e1");
  });
});

describe("googleCalendarUrl", () => {
  it("uses UTC stamps and a ctz hint when a zone is known", () => {
    const url = new URL(googleCalendarUrl({
      id: "e1", name: "BBQ", event_date: "2026-08-01", event_time: "18:00", timezone: "Europe/London",
    }));
    expect(url.searchParams.get("dates")).toBe("20260801T170000Z/20260801T200000Z");
    expect(url.searchParams.get("ctz")).toBe("Europe/London");
    expect(url.searchParams.get("text")).toBe("BBQ");
  });

  it("uses bare dates for an all-day event", () => {
    const url = new URL(googleCalendarUrl({ id: "e1", name: "Picnic", event_date: "2026-08-01" }));
    expect(url.searchParams.get("dates")).toBe("20260801/20260802");
    expect(url.searchParams.get("ctz")).toBeNull();
  });
});

describe("markdownToPlainText", () => {
  it("unwraps emphasis, links and bullets", () => {
    expect(markdownToPlainText("**Bring** a [dish](https://x.com)\n- salad\n- bread"))
      .toBe("Bring a dish (https://x.com)\n• salad\n• bread");
  });

  it("strips headings and blockquotes", () => {
    expect(markdownToPlainText("## Plans\n> be there")).toBe("Plans\nbe there");
  });
});

describe("icsFilename", () => {
  it("slugifies the event name", () => {
    expect(icsFilename("Summer BBQ 2026!")).toBe("summer-bbq-2026.ics");
  });

  it("falls back when the name has no usable characters", () => {
    expect(icsFilename("!!!")).toBe("event.ics");
  });
});
