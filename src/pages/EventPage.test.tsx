import { fireEvent, render, screen } from "@testing-library/react";
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
}));

vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api")>("@/lib/api")),
  ...api,
}));

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
});
