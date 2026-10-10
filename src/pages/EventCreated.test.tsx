import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import EventCreated from "./EventCreated";

const renderCreated = (state: unknown) =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/created", search: "?id=e1&token=t1", state }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <EventCreated />
    </MemoryRouter>,
  );

describe("EventCreated email notice", () => {
  it("confirms where the links were emailed", () => {
    renderCreated({ email: { address: "ada@example.com", status: "sent" } });
    expect(screen.getByRole("status")).toHaveTextContent("We’ve emailed these links to ada@example.com.");
  });

  it("says so plainly when the email could not be sent", () => {
    for (const status of ["failed", "limited"]) {
      const { unmount } = renderCreated({ email: { address: "ada@example.com", status } });
      expect(screen.getByRole("status")).toHaveTextContent("We couldn’t send the email. Copy the links below instead.");
      unmount();
    }
  });

  it("shows nothing about email when none was requested", () => {
    renderCreated(null);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
