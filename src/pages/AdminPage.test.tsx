import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import AdminPage from "./AdminPage";

const { getAdminEvent } = vi.hoisted(() => ({ getAdminEvent: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    getAdminEvent,
    updateEvent: vi.fn(),
    adminAddBringItem: vi.fn(),
    adminDeleteBringItem: vi.fn(),
    adminDeleteRsvp: vi.fn(),
    adminDeleteEvent: vi.fn(),
  };
});

vi.mock("@/lib/myEvents", () => ({
  getMyEvent: vi.fn(() => null),
  saveMyEvent: vi.fn(),
}));

const eventData = {
  event: {
    id: "garden-dinner",
    name: "Midsummer garden dinner",
    description: "An evening outside with good food and old friends.",
    event_date: "2026-08-22",
    event_time: "18:30",
    event_end_time: "23:00",
    timezone: "Europe/Helsinki",
    location: "Kivinokka summer house",
    location_url: "https://example.com/map",
    banner_url: null,
    guest_visibility: "full" as const,
    bring_list_enabled: true,
    bring_list_mode: "open" as const,
    bring_list_message: "Bring something you love to share.",
    admin_token: "host-token",
  },
  rsvps: [
    { id: "r1", guest_name: "Aino Korhonen", adults: 1, kids: 1, manage_code: "a1" },
    { id: "r2", guest_name: "Marcus Lind", adults: 1, kids: 0, manage_code: "b2" },
    { id: "r3", guest_name: "Oliver Chen", adults: 1, kids: 2, manage_code: "c3", cancelled: true },
  ],
  bring_items: [
    {
      id: "i1",
      item_name: "Summer salad",
      target_quantity: 2,
      committed_quantity: 1,
      commitments: [{ guest_name: "Aino Korhonen", quantity: 1, note: "With strawberries" }],
    },
  ],
};

const renderAdmin = () =>
  render(
    <MemoryRouter initialEntries={["/admin/garden-dinner?token=host-token"]}>
      <Routes>
        <Route path="/admin/:id" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("AdminPage", () => {
  beforeEach(() => {
    getAdminEvent.mockResolvedValue(eventData);
  });

  it("leads with the event and gives hosts a clear dashboard overview", async () => {
    renderAdmin();

    expect(await screen.findByRole("heading", { level: 1, name: "Midsummer garden dinner" })).toBeInTheDocument();
    expect(screen.getByText("Host dashboard")).toBeInTheDocument();
    expect(screen.getByText("3 people coming")).toBeInTheDocument();
    expect(screen.getAllByText(/1 child/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "View guest page" })[0]).toHaveAttribute(
      "href",
      "/event/garden-dinner",
    );
    expect(screen.getByRole("navigation", { name: "Dashboard sections" })).toBeInTheDocument();
  });

  it("edits the event through the same sections, in the same order, as the create page", async () => {
    renderAdmin();

    await screen.findByRole("heading", { level: 1, name: "Midsummer garden dinner" });

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Share your event",
      "Guest responses",
      "Event details",
      "Event banner",
      "Bring list",
      "Access & privacy",
      "Delete event",
    ]);
  });

  it("keeps the bring list collapsed while it is switched off", async () => {
    renderAdmin();

    const bringListSwitch = await screen.findByRole("switch", { name: "Enable bring list" });
    expect(screen.getByText("List type")).toBeInTheDocument();

    fireEvent.click(bringListSwitch);
    expect(screen.queryByText("List type")).not.toBeInTheDocument();
  });

  it("opens the banner section only for an event that has one", async () => {
    renderAdmin();

    const bannerSwitch = await screen.findByRole("switch", { name: "Add an event banner" });
    expect(bannerSwitch).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("Banner photo")).not.toBeInTheDocument();

    fireEvent.click(bannerSwitch);
    expect(screen.getByLabelText("Banner photo")).toBeInTheDocument();
  });
});
