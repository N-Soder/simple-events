import { describe, it, expect } from "vitest";
import { formatEventTime } from "./time";

describe("formatEventTime", () => {
  it("formats 24-hour output", () => {
    expect(formatEventTime("09:05", false)).toBe("09:05");
    expect(formatEventTime("18:30", false)).toBe("18:30");
    expect(formatEventTime("00:00", false)).toBe("00:00");
  });

  it("formats 12-hour output with AM/PM", () => {
    expect(formatEventTime("09:05", true)).toBe("9:05 AM");
    expect(formatEventTime("18:30", true)).toBe("6:30 PM");
    expect(formatEventTime("00:00", true)).toBe("12:00 AM");
    expect(formatEventTime("12:00", true)).toBe("12:00 PM");
    expect(formatEventTime("23:59", true)).toBe("11:59 PM");
  });

  it("tolerates seconds in the input", () => {
    expect(formatEventTime("14:15:00", false)).toBe("14:15");
    expect(formatEventTime("14:15:00", true)).toBe("2:15 PM");
  });

  it("returns the original string for malformed input instead of NaN", () => {
    expect(formatEventTime("", true)).toBe("");
    expect(formatEventTime("not-a-time", true)).toBe("not-a-time");
    expect(formatEventTime("25:00", true)).toBe("25:00");
    expect(formatEventTime("10:99", false)).toBe("10:99");
  });
});
