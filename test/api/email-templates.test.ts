import { describe, expect, it } from "vitest";
import { renderHostLinksEmail, renderRsvpEmail, rsvpCalendarAttachment, type EmailEvent } from "../../server/email/templates";

const origin = "https://events.test";
const event: EmailEvent = {
  id: "ev1", name: "Park picnic", event_date: "2030-06-01", event_time: "18:30", event_end_time: "22:00",
  timezone: "Australia/Perth", location: "Kings Park", location_url: "https://maps.example/kings-park",
};
const rsvp = { id: "r1", manage_code: "c1", guest_name: "Ada", adults: 2, kids: 1 };

describe("renderHostLinksEmail", () => {
  it("contains both links in the HTML and the text", () => {
    const email = renderHostLinksEmail({ origin, event, adminToken: "tok123", hasPassword: false });
    expect(email.subject).toBe("Your links for Park picnic");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("https://events.test/admin/ev1?token=tok123");
      expect(part).toContain("https://events.test/event/ev1");
      expect(part).toContain("Saturday 1 June 2030");
      expect(part).toContain("https://events.test/privacy");
      expect(part).toContain("entered on events.test");
      expect(part).not.toContain("password");
    }
  });

  it("mentions the password without including it when the event has one", () => {
    const email = renderHostLinksEmail({ origin, event, adminToken: "tok123", hasPassword: true });
    expect(email.html).toContain("Guests will need the password you set");
    expect(email.text).toContain("Guests will need the password you set");
  });

  it("escapes hostile text and keeps the subject on one line", () => {
    const hostile = { ...event, name: `<script>alert(1)</script> "x" & y\r\nBcc: evil@example.com` };
    const email = renderHostLinksEmail({ origin, event: hostile, adminToken: "tok123", hasPassword: false });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot; &amp; y");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toBe(`Your links for <script>alert(1)</script> "x" & y Bcc: evil@example.com`);
  });
});

describe("renderRsvpEmail", () => {
  it("contains the event, the reply and the private edit link", () => {
    const email = renderRsvpEmail({ origin, event, rsvp, bringing: ["Chairs ×2", "Salad"], hour12: true });
    expect(email.subject).toBe("You’re going to Park picnic");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("https://events.test/event/ev1#manage=r1.c1");
      expect(part).toContain("Saturday 1 June 2030, 6:30 pm to 10:00 pm (Australia/Perth)");
      expect(part).toContain("Kings Park");
      expect(part).toContain("2 adults, 1 kid");
      expect(part).toContain("Chairs ×2, Salad");
      expect(part).toContain("https://events.test/privacy");
    }
    expect(email.text).toContain("https://calendar.google.com/calendar/render?");
    expect(email.html).toContain('href="https://maps.example/kings-park"');
  });

  it("uses the 24-hour clock when asked, and handles all-day events", () => {
    expect(renderRsvpEmail({ origin, event, rsvp, bringing: [], hour12: false }).text)
      .toContain("Saturday 1 June 2030, 18:30 to 22:00 (Australia/Perth)");

    const allDay = { ...event, event_time: null, event_end_time: null, timezone: null, location: null, location_url: null };
    const email = renderRsvpEmail({ origin, event: allDay, rsvp: { ...rsvp, adults: 1, kids: 0 }, bringing: [], hour12: true });
    expect(email.text).toContain("When: Saturday 1 June 2030\n");
    expect(email.text).toContain("1 adult");
    expect(email.text).not.toContain("Where:");
    expect(email.text).not.toContain("Bringing:");
  });

  it("escapes hostile guest, location and item text", () => {
    const hostile = { ...event, location: "<img src=x onerror=alert(1)>", location_url: "javascript:alert(1)" };
    const email = renderRsvpEmail({
      origin, event: hostile, rsvp: { ...rsvp, guest_name: "<b>Ada</b>" }, bringing: ["<i>Chips</i>"], hour12: true,
    });
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<b>Ada</b>");
    expect(email.html).not.toContain("<i>Chips</i>");
    expect(email.html).not.toContain("javascript:");
  });
});

describe("rsvpCalendarAttachment", () => {
  it("is a base64 .ics for the event, without a description", () => {
    const attachment = rsvpCalendarAttachment(origin, event);
    expect(attachment.filename).toBe("park-picnic.ics");
    expect(attachment.content_type).toBe("text/calendar");
    const ics = atob(attachment.content);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("SUMMARY:Park picnic");
    expect(ics).toContain("https://events.test/event/ev1");
  });
});
