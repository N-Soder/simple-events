import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import EventPage from "./EventPage";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => ({
  getEvent: vi.fn(),
  verifyPassword: vi.fn(),
  getRsvpByManageCode: vi.fn(),
  submitRsvp: vi.fn(),
  updateRsvp: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")),
  ...api,
}));

const turnstile = vi.hoisted(() => ({ loadTurnstile: vi.fn() }));
vi.mock("@/lib/turnstile", () => turnstile);

const eventData = {
  event: {
    id: "picnic",
    name: "Park picnic",
    description: null,
    event_date: "2030-06-01",
    event_time: null,
    event_end_time: null,
    timezone: null,
    location: null,
    location_url: null,
    banner_url: null,
    guest_visibility: "full" as const,
    bring_list_enabled: true,
    bring_list_mode: "signup" as const,
    bring_list_message: null,
  },
  rsvps: [],
  rsvp_counts: { count: 1, adults: 1, kids: 0 },
  bring_items: [
    {
      id: "chairs",
      item_name: "Chairs",
      target_quantity: 2,
      committed_quantity: 2,
      commitments: [{ guest_name: "Ada", quantity: 2, note: null }],
    },
  ],
};

const renderEvent = () =>
  render(
    <MemoryRouter initialEntries={["/event/picnic"]}>
      <Routes>
        <Route path="/event/:id" element={<EventPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("EventPage", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    localStorage.clear();
    window.location.hash = "";
    api.getConfig.mockResolvedValue({ emailEnabled: false, turnstileSiteKey: null });
    // Like Turnstile, a reset issues a fresh token through the same callback.
    let issued = 0;
    let callback: (token: string) => void = () => {};
    turnstile.loadTurnstile.mockReset().mockResolvedValue({
      render: (_el: HTMLElement, options: { callback(token: string): void }) => {
        callback = options.callback;
        callback(`tok-${++issued}`);
        return "widget-1";
      },
      reset: vi.fn(() => callback(`tok-${++issued}`)),
      remove: vi.fn(),
    });
  });

  it("asks for the password, then opens the event with the access token it gets back", async () => {
    api.getEvent.mockImplementation(async (_id: string, token?: string) => {
      if (token !== "tok") throw new ApiError("Invalid password", 403);
      return eventData;
    });
    api.verifyPassword.mockImplementation(async (_id: string, pw: string) =>
      pw === "hunter2" ? { valid: true, access_token: "tok" } : { valid: false },
    );
    renderEvent();

    const input = await screen.findByLabelText("Password");
    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Open event" }));
    expect(await screen.findByText(/That password didn't work/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Open event" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Park picnic" })).toBeInTheDocument();
    expect(localStorage.getItem("event_access_picnic")).toBe("tok");
  });

  it("shows a retry when the event can't be loaded, and recovers", async () => {
    api.getEvent.mockRejectedValueOnce(new ApiError("Internal error", 500)).mockResolvedValue(eventData);
    renderEvent();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Park picnic" })).toBeInTheDocument();
  });

  it("lets a guest editing their RSVP keep the slots they already hold", async () => {
    api.getEvent.mockResolvedValue(eventData);
    localStorage.setItem("rsvp_manage_picnic", JSON.stringify({ rsvp_id: "r1", manage_code: "c1" }));
    api.getRsvpByManageCode.mockResolvedValue({
      rsvp: { id: "r1", manage_code: "c1", guest_name: "Ada", adults: 1, kids: 0, cancelled: false },
      claimed_items: [{ id: "k1", item_id: "chairs", item_name: "Chairs", quantity: 2 }],
    });
    renderEvent();

    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    // Ada holds both slots, so the item must read as hers, not as full.
    expect(screen.queryByText("Full")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bring one more Chairs" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bring one fewer Chairs" }));
    expect(screen.getByRole("button", { name: "Bring one more Chairs" })).toBeEnabled();
  });

  it("shows that an item is taken without a name when the host hides the guest list", async () => {
    api.getEvent.mockResolvedValue({
      ...eventData,
      event: { ...eventData.event, guest_visibility: "hidden" },
      rsvps: undefined,
      rsvp_counts: undefined,
      bring_items: [{ ...eventData.bring_items[0], commitments: [
        { guest_name: null, quantity: 1, note: null },
        { guest_name: null, quantity: 1, note: "folding ones" },
      ] }],
    });
    renderEvent();

    expect(await screen.findByText("Someone")).toBeInTheDocument();
    expect(screen.getByText(/Someone: “folding ones”/)).toBeInTheDocument();
  });

  it("has no email field when the deployment can't send email", async () => {
    api.getEvent.mockResolvedValue(eventData);
    renderEvent();
    await screen.findByLabelText(/Your name/);
    expect(screen.queryByLabelText(/Email me a confirmation/)).not.toBeInTheDocument();
  });

  it("sends the guest's address with a bot-check token and confirms where it went", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.getEvent.mockResolvedValue(eventData);
    api.submitRsvp.mockResolvedValue({ id: "r1", manage_code: "c1", reserved: [], email: "sent" });
    renderEvent();

    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: "Ada" } });
    fireEvent.change(await screen.findByLabelText(/Email me a confirmation/), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    expect(await screen.findByRole("status")).toHaveTextContent("We’ve emailed your confirmation to ada@example.com.");
    expect(api.submitRsvp.mock.calls[0][0]).toMatchObject({
      guest_name: "Ada", email: "ada@example.com", turnstile_token: "tok-1", hour12: expect.any(Boolean),
    });
  });

  it("tells the guest when the confirmation could not be sent", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.getEvent.mockResolvedValue(eventData);
    api.submitRsvp.mockResolvedValue({ id: "r1", manage_code: "c1", reserved: [], email: "limited" });
    renderEvent();

    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: "Ada" } });
    fireEvent.change(await screen.findByLabelText(/Email me a confirmation/), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));

    expect(await screen.findByRole("status")).toHaveTextContent("We couldn’t send the email. Save the link below instead.");
  });

  it("stops a malformed address, and lets the guest retry after a failed request", async () => {
    api.getConfig.mockResolvedValue({ emailEnabled: true, turnstileSiteKey: "site-key" });
    api.getEvent.mockResolvedValue(eventData);
    api.submitRsvp
      .mockRejectedValueOnce(new ApiError("Verification failed. Please try again.", 403))
      .mockResolvedValue({ id: "r1", manage_code: "c1", reserved: [], email: "sent" });
    renderEvent();

    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: "Ada" } });
    const email = await screen.findByLabelText(/Email me a confirmation/);
    fireEvent.change(email, { target: { value: "not-an-address" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(api.submitRsvp).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));
    await waitFor(() => expect(api.submitRsvp).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send RSVP" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Send RSVP" }));
    expect(await screen.findByText(/We’ve emailed your confirmation to/)).toBeInTheDocument();
    expect(api.submitRsvp).toHaveBeenCalledTimes(2);
  });
});
