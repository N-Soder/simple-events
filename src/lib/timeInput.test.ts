import { describe, it, expect } from "vitest";
import {
  buildTimeOptions,
  filterTimeOptions,
  formatDuration,
  minutesBetween,
  parseTimeInput,
  toHHMM,
} from "./timeInput";

describe("parseTimeInput", () => {
  it("reads a bare hour literally", () => {
    expect(parseTimeInput("6")).toBe("06:00");
    expect(parseTimeInput("18")).toBe("18:00");
    expect(parseTimeInput("0")).toBe("00:00");
  });

  it("reads compact digits as a 24-hour time", () => {
    expect(parseTimeInput("630")).toBe("06:30");
    expect(parseTimeInput("1830")).toBe("18:30");
    expect(parseTimeInput("0005")).toBe("00:05");
  });

  it("accepts common separators", () => {
    expect(parseTimeInput("6:30")).toBe("06:30");
    expect(parseTimeInput("6.30")).toBe("06:30");
    expect(parseTimeInput("18h30")).toBe("18:30");
  });

  it("accepts am/pm in several shapes", () => {
    expect(parseTimeInput("6pm")).toBe("18:00");
    expect(parseTimeInput("6 PM")).toBe("18:00");
    expect(parseTimeInput("6p")).toBe("18:00");
    expect(parseTimeInput("6:30pm")).toBe("18:30");
    expect(parseTimeInput("6am")).toBe("06:00");
  });

  it("handles the 12 o'clock edge cases", () => {
    expect(parseTimeInput("12am")).toBe("00:00");
    expect(parseTimeInput("12pm")).toBe("12:00");
    expect(parseTimeInput("12:30am")).toBe("00:30");
  });

  it("understands noon and midnight", () => {
    expect(parseTimeInput("noon")).toBe("12:00");
    expect(parseTimeInput("midnight")).toBe("00:00");
  });

  it("rejects impossible and unreadable input", () => {
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("10:99")).toBeNull();
    expect(parseTimeInput("13pm")).toBeNull();
    expect(parseTimeInput("abc")).toBeNull();
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("  ")).toBeNull();
  });

  describe("with an `after` hint", () => {
    it("picks the reading that comes soonest after the start", () => {
      // 6pm start, type "7" → 7pm, not 7am.
      expect(parseTimeInput("7", "18:00")).toBe("19:00");
      // 9am start, type "5" → 5pm.
      expect(parseTimeInput("5", "09:00")).toBe("17:00");
      // 3am start, type "6" → 6am.
      expect(parseTimeInput("6", "03:00")).toBe("06:00");
    });

    it("still wraps past midnight when that is the nearer reading", () => {
      // 11pm start, type "1" → 1am the next day.
      expect(parseTimeInput("1", "23:00")).toBe("01:00");
    });

    it("does not override an explicit am/pm", () => {
      expect(parseTimeInput("7am", "18:00")).toBe("07:00");
    });

    it("leaves unambiguous 24-hour input alone", () => {
      expect(parseTimeInput("19", "09:00")).toBe("19:00");
      expect(parseTimeInput("0", "18:00")).toBe("00:00");
    });
  });
});

describe("buildTimeOptions", () => {
  it("covers the day at 30-minute steps", () => {
    const options = buildTimeOptions(30);
    expect(options).toHaveLength(48);
    expect(options[0]).toBe("00:00");
    expect(options.at(-1)).toBe("23:30");
  });

  it("supports other steps", () => {
    expect(buildTimeOptions(15)).toHaveLength(96);
    expect(buildTimeOptions(60)).toHaveLength(24);
  });
});

describe("filterTimeOptions", () => {
  const options = buildTimeOptions(30);

  it("returns everything for an empty query", () => {
    expect(filterTimeOptions(options, "")).toHaveLength(48);
    expect(filterTimeOptions(options, "   ")).toHaveLength(48);
  });

  it("matches an hour in both halves of the day", () => {
    expect(filterTimeOptions(options, "6")).toEqual(["06:00", "06:30", "18:00", "18:30"]);
  });

  it("narrows by meridiem", () => {
    expect(filterTimeOptions(options, "6p")).toEqual(["18:00", "18:30"]);
    expect(filterTimeOptions(options, "6am")).toEqual(["06:00", "06:30"]);
  });

  it("narrows by minutes", () => {
    expect(filterTimeOptions(options, "6:3")).toEqual(["06:30", "18:30"]);
  });

  it("matches 24-hour input", () => {
    expect(filterTimeOptions(options, "18")).toEqual(["18:00", "18:30"]);
  });

  it("returns nothing for input that cannot be a time", () => {
    expect(filterTimeOptions(options, "wat")).toEqual([]);
  });
});

describe("minutesBetween", () => {
  it("measures a same-day gap", () => {
    expect(minutesBetween("18:00", "21:00")).toBe(180);
  });

  it("wraps past midnight", () => {
    expect(minutesBetween("20:00", "01:00")).toBe(300);
  });

  it("treats an equal time as a full day", () => {
    expect(minutesBetween("20:00", "20:00")).toBe(1440);
  });
});

describe("formatDuration", () => {
  it("formats hours, minutes and both", () => {
    expect(formatDuration(180)).toBe("3 hr");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });
});

describe("toHHMM", () => {
  it("pads and wraps", () => {
    expect(toHHMM(0)).toBe("00:00");
    expect(toHHMM(65)).toBe("01:05");
    expect(toHHMM(1440)).toBe("00:00");
    expect(toHHMM(-60)).toBe("23:00");
  });
});
