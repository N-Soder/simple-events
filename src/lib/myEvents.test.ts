import { describe, it, expect, beforeEach } from "vitest";
import { getMyEvents, getMyEvent, saveMyEvent, removeMyEvent, adminLinkFor } from "./myEvents";

const NOW = new Date("2026-07-25T12:00:00Z");

const base = {
  id: "e1",
  name: "Summer BBQ",
  event_date: "2026-08-01",
  admin_token: "tok-1",
  guest_link: "https://example.com/event/e1",
};

describe("myEvents", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty list when nothing is stored", () => {
    expect(getMyEvents(NOW)).toEqual([]);
  });

  it("saves and reads back an event", () => {
    saveMyEvent(base, NOW);
    expect(getMyEvents(NOW)).toHaveLength(1);
    expect(getMyEvent("e1", NOW)?.name).toBe("Summer BBQ");
  });

  it("updates an existing event in place rather than duplicating it", () => {
    saveMyEvent(base, NOW);
    saveMyEvent({ ...base, name: "Renamed BBQ" }, NOW);
    const events = getMyEvents(NOW);
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("Renamed BBQ");
  });

  it("keeps the original saved_at across updates", () => {
    saveMyEvent(base, NOW);
    const later = new Date("2026-07-26T12:00:00Z");
    saveMyEvent({ ...base, name: "Renamed" }, later);
    expect(getMyEvent("e1", later)?.saved_at).toBe(NOW.toISOString());
  });

  it("preserves an embedded password link when a bare link is saved over it", () => {
    saveMyEvent({ ...base, guest_link: "https://example.com/event/e1#hunter2" }, NOW);
    saveMyEvent(base, NOW);
    expect(getMyEvent("e1", NOW)?.guest_link).toBe("https://example.com/event/e1#hunter2");
  });

  it("does let a new embedded password link replace an older one", () => {
    saveMyEvent({ ...base, guest_link: "https://example.com/event/e1#old" }, NOW);
    saveMyEvent({ ...base, guest_link: "https://example.com/event/e1#new" }, NOW);
    expect(getMyEvent("e1", NOW)?.guest_link).toBe("https://example.com/event/e1#new");
  });

  it("sorts by event date, soonest first", () => {
    saveMyEvent({ ...base, id: "later", event_date: "2026-09-01" }, NOW);
    saveMyEvent({ ...base, id: "sooner", event_date: "2026-08-01" }, NOW);
    expect(getMyEvents(NOW).map((e) => e.id)).toEqual(["sooner", "later"]);
  });

  it("drops events more than 90 days past their date", () => {
    saveMyEvent({ ...base, event_date: "2026-01-01" }, NOW);
    expect(getMyEvents(NOW)).toEqual([]);
  });

  it("keeps an event that is past but still inside the retention window", () => {
    saveMyEvent({ ...base, event_date: "2026-07-01" }, NOW);
    expect(getMyEvents(NOW)).toHaveLength(1);
  });

  it("removes an event", () => {
    saveMyEvent(base, NOW);
    removeMyEvent("e1", NOW);
    expect(getMyEvents(NOW)).toEqual([]);
  });

  it("ignores corrupt stored JSON", () => {
    localStorage.setItem("simple_events_created", "{not json");
    expect(getMyEvents(NOW)).toEqual([]);
  });

  it("ignores entries that are missing required fields", () => {
    localStorage.setItem("simple_events_created", JSON.stringify([{ id: "x" }, base]));
    // `base` has no saved_at, so both entries are rejected as malformed.
    expect(getMyEvents(NOW)).toEqual([]);
  });

  it("builds an admin link", () => {
    saveMyEvent(base, NOW);
    expect(adminLinkFor(getMyEvent("e1", NOW)!, "https://example.com"))
      .toBe("https://example.com/admin/e1?token=tok-1");
  });
});
