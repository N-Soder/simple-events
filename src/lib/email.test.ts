import { emailNoticeFor, isValidEmail, rememberEmailNotice } from "./email";

describe("isValidEmail", () => {
  it("accepts what the server accepts", () => {
    for (const ok of [" Ada@Example.COM ", "first.last+tag@sub.example.co.uk"]) {
      expect(isValidEmail(ok), ok).toBe(true);
    }
  });

  it("rejects what the server would reject, so the error shows on the field", () => {
    for (const bad of ["", "ada", "ada@example", "user@müller.de", "a@b_c.com", "a,b@example.com", "Ada <ada@example.com>", `${"x".repeat(250)}@example.com`]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});

describe("email notice handoff", () => {
  it("returns the notice only for the event it was remembered for", () => {
    rememberEmailNotice("e1", { address: "ada@example.com", status: "sent" });
    expect(emailNoticeFor("e1")).toEqual({ address: "ada@example.com", status: "sent" });
    expect(emailNoticeFor("e2")).toBeNull();
    rememberEmailNotice("e1", null);
    expect(emailNoticeFor("e1")).toBeNull();
  });
});
