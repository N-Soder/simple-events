import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

import CreateEvent from "./CreateEvent";
import { emailNoticeFor } from "@/lib/email";

const api = vi.hoisted(() => ({ getConfig: vi.fn(), createEvent: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")),
  ...api,
}));

const turnstile = vi.hoisted(() => ({ loadTurnstile: vi.fn() }));
vi.mock("@/lib/turnstile", () => turnstile);

const Created = () => <pre data-testid="created-state">{JSON.stringify(useLocation().state)}</pre>;

const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={["/create"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/create" element={<CreateEvent />} />
        <Route path="/created" element={<Created />} />
      </Routes>
    </MemoryRouter>,
  );

const fillRequired = () => {
  fireEvent.change(screen.getByLabelText(/Event name/), { target: { value: "Park picnic" } });
  fireEvent.change(screen.getByLabelText(/Date/), { target: { value: "2030-06-01" } });
};

describe("CreateEvent email", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    localStorage.clear();
    let issued = 0;
    turnstile.loadTurnstile.mockReset().mockResolvedValue({
      render: (_el: HTMLElement, options: { callback(token: string): void }) => {
        options.callback(`tok-${++issued}`);
        return "widget-1";
      },
      reset: vi.fn(),
      remove: vi.fn(),
    });
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.createEvent.mockResolvedValue({ id: "e1", admin_token: "t1", email: "sent" });
  });

  it("has no email field when the deployment can't send email", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: false, turnstileSiteKey: null });
    renderCreate();
    await waitFor(() => expect(api.getConfig).toHaveBeenCalled());
    expect(screen.queryByLabelText(/Email me the links/)).not.toBeInTheDocument();

    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await screen.findByTestId("created-state");
    expect(api.createEvent.mock.calls[0][0]).toMatchObject({ email: undefined, turnstile_token: undefined });
  });

  it("sends the address with a bot-check token and passes the outcome on", async () => {
    renderCreate();
    fireEvent.change(await screen.findByLabelText(/Email me the links/), { target: { value: " ada@example.com " } });
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    const state = await screen.findByTestId("created-state");
    expect(api.createEvent.mock.calls[0][0]).toMatchObject({ email: "ada@example.com", turnstile_token: "tok-1" });
    // The address must not go into router state: that is written to the
    // browser's history entry and outlives the page.
    expect(state.textContent).not.toContain("ada@example.com");
    expect(emailNoticeFor("e1")).toEqual({ address: "ada@example.com", status: "sent" });
  });

  it("stops a malformed address before anything is sent", async () => {
    renderCreate();
    fireEvent.change(await screen.findByLabelText(/Email me the links/), { target: { value: "not-an-address" } });
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  it("lets the host try again after a failed request", async () => {
    api.createEvent.mockRejectedValueOnce(new Error("Verification failed. Please try again."));
    renderCreate();
    fireEvent.change(await screen.findByLabelText(/Email me the links/), { target: { value: "ada@example.com" } });
    fillRequired();

    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(api.createEvent).toHaveBeenCalledTimes(1));
    const retry = await screen.findByRole("button", { name: "Create event" });
    await waitFor(() => expect(retry).toBeEnabled());
  });
});
