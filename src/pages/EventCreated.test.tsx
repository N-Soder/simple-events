import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import EventCreated from "./EventCreated";
import { rememberEmailNotice, type EmailNotice } from "@/lib/email";

const renderCreated = (notice: EmailNotice | null, state: unknown = null) => {
  rememberEmailNotice("e1", notice);
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/created", search: "?id=e1&token=t1", state }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <EventCreated />
    </MemoryRouter>,
  );
};

describe("EventCreated email notice", () => {
  it("confirms where the links were emailed", () => {
    renderCreated({ address: "ada@example.com", status: "sent" });
    expect(screen.getByRole("status")).toHaveTextContent("We’ve emailed these links to ada@example.com.");
  });

  it("says so plainly when the email could not be sent", () => {
    for (const status of ["failed", "limited"] as const) {
      const { unmount } = renderCreated({ address: "ada@example.com", status });
      expect(screen.getByRole("status")).toHaveTextContent("We couldn’t send the email. Copy the links below instead.");
      unmount();
    }
  });

  it("shows nothing about email when none was requested", () => {
    renderCreated(null);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a notice left over from a different event, and one in history state", () => {
    rememberEmailNotice("another-event", { address: "ada@example.com", status: "sent" });
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/created", search: "?id=e1&token=t1", state: { email: { address: "ada@example.com", status: "sent" } } }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <EventCreated />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
