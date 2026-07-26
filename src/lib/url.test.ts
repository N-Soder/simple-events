import { describe, it, expect } from "vitest";
import { displayHost, isSafeHttpUrl, looksLikeUrl, normalizeUrl } from "./url";

describe("isSafeHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeHttpUrl("https://maps.google.com/?q=x")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects script-bearing and non-web schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("JavaScript:alert(1)")).toBe(false);
  });

  it("rejects empty, missing and unparseable values", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });

  it("rejects absurdly long values", () => {
    expect(isSafeHttpUrl(`https://example.com/${"a".repeat(2100)}`)).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("adds https to a bare host", () => {
    expect(normalizeUrl("maps.app.goo.gl/xyz")).toBe("https://maps.app.goo.gl/xyz");
  });

  it("leaves an existing scheme alone", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("trims and passes through empty input", () => {
    expect(normalizeUrl("  https://example.com  ")).toBe("https://example.com");
    expect(normalizeUrl("   ")).toBe("");
  });
});

describe("looksLikeUrl", () => {
  it("spots pasted links", () => {
    expect(looksLikeUrl("https://maps.google.com/?q=x")).toBe(true);
    expect(looksLikeUrl("maps.app.goo.gl/AbCd")).toBe(true);
  });

  it("does not mistake an address for a link", () => {
    expect(looksLikeUrl("123 Main St")).toBe(false);
    expect(looksLikeUrl("John's backyard")).toBe(false);
    expect(looksLikeUrl("example.com")).toBe(false); // no path, likely a venue name
    expect(looksLikeUrl("")).toBe(false);
  });
});

describe("displayHost", () => {
  it("shows a bare hostname", () => {
    expect(displayHost("https://www.google.com/maps/place/x")).toBe("google.com");
    expect(displayHost("https://maps.app.goo.gl/xyz")).toBe("maps.app.goo.gl");
  });

  it("falls back to the raw value when unparseable", () => {
    expect(displayHost("nonsense")).toBe("nonsense");
  });
});
