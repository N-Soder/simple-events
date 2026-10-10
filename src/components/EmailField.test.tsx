import { createRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import EmailField, { type EmailFieldHandle } from "./EmailField";

const turnstile = vi.hoisted(() => ({ loadTurnstile: vi.fn() }));
vi.mock("@/lib/turnstile", () => turnstile);

/** A stand-in Turnstile that hands out tok-1, tok-2, ... on render and on reset. */
function fakeTurnstile() {
  let issued = 0;
  let callback: (token: string) => void = () => {};
  const api = {
    render: vi.fn((_el: HTMLElement, options: { callback(token: string): void }) => {
      callback = options.callback;
      callback(`tok-${++issued}`);
      return "widget-1";
    }),
    reset: vi.fn(() => callback(`tok-${++issued}`)),
    remove: vi.fn(),
  };
  return api;
}

function Harness({ handle }: { handle: React.RefObject<EmailFieldHandle> }) {
  const [value, setValue] = useState("");
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <EmailField ref={handle} id="email" label="Email me the links" hint="Used once. Not stored." value={value} onChange={setValue} siteKey="site-key" />
    </MemoryRouter>
  );
}

const type = (value: string) => fireEvent.change(screen.getByLabelText(/Email me the links/), { target: { value } });

describe("EmailField", () => {
  beforeEach(() => {
    turnstile.loadTurnstile.mockReset();
  });

  it("explains itself, links to the privacy notice, and loads nothing while empty", () => {
    render(<Harness handle={createRef()} />);
    expect(screen.getByText(/Used once\. Not stored\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(turnstile.loadTurnstile).not.toHaveBeenCalled();
  });

  it("starts the bot check once an address is typed and hands out its token", async () => {
    const api = fakeTurnstile();
    turnstile.loadTurnstile.mockResolvedValue(api);
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.render.mock.calls[0][1]).toMatchObject({ sitekey: "site-key", appearance: "interaction-only" });
    await expect(handle.current!.getToken()).resolves.toBe("tok-1");
  });

  it("gives a fresh token after reset, because tokens are single use", async () => {
    const api = fakeTurnstile();
    turnstile.loadTurnstile.mockResolvedValue(api);
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    await handle.current!.getToken();
    act(() => handle.current!.reset());
    expect(api.reset).toHaveBeenCalledWith("widget-1");
    await expect(handle.current!.getToken()).resolves.toBe("tok-2");
  });

  it("waits for a token that has not arrived yet", async () => {
    let deliver: (token: string) => void = () => {};
    turnstile.loadTurnstile.mockResolvedValue({
      render: vi.fn((_el: HTMLElement, options: { callback(token: string): void }) => {
        deliver = options.callback;
        return "widget-1";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    });
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    const waiting = handle.current!.getToken();
    act(() => deliver("late-token"));
    await expect(waiting).resolves.toBe("late-token");
  });

  it("says email isn't available when the bot check can't load, and removes the widget when cleared", async () => {
    turnstile.loadTurnstile.mockRejectedValue(new Error("blocked"));
    const handle = createRef<EmailFieldHandle>();
    render(<Harness handle={handle} />);

    await act(async () => type("ada@example.com"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/can’t send email right now/);
    await expect(handle.current!.getToken()).rejects.toThrow(/can’t send email right now/);

    await act(async () => type(""));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
