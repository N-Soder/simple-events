import { normalizeRichTextLink } from "./richText";

describe("normalizeRichTextLink", () => {
  it("adds HTTPS to a plain domain", () => {
    expect(normalizeRichTextLink(" example.com/event ")).toBe("https://example.com/event");
  });

  it("preserves supported link schemes", () => {
    expect(normalizeRichTextLink("mailto:host@example.com")).toBe("mailto:host@example.com");
    expect(normalizeRichTextLink("tel:+3581234567")).toBe("tel:+3581234567");
  });

  it("rejects unsupported schemes", () => {
    expect(normalizeRichTextLink("javascript:alert(1)")).toBe("");
    expect(normalizeRichTextLink("data:text/html,<script>alert(1)</script>")).toBe("");
  });
});
