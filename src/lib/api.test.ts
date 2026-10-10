import { vi } from "vitest";

describe("getConfig", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("treats a failed request as email off, and asks again next time", async () => {
    vi.resetModules();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(new Response(JSON.stringify({ emailEnabled: true, turnstileSiteKey: "site-key" })));
    vi.stubGlobal("fetch", fetchMock);
    const { getConfig } = await import("./api");

    expect(await getConfig()).toEqual({ emailEnabled: false, turnstileSiteKey: null });
    expect(await getConfig()).toEqual({ emailEnabled: true, turnstileSiteKey: "site-key" });
    // A good answer is kept for the rest of the page's life.
    expect(await getConfig()).toEqual({ emailEnabled: true, turnstileSiteKey: "site-key" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
