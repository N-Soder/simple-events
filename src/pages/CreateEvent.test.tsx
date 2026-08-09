import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CreateEvent from "./CreateEvent";

describe("CreateEvent sections", () => {
  it("presents the creation flow as four named sections in order", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CreateEvent />
      </MemoryRouter>,
    );

    const sectionHeadings = screen.getAllByRole("heading", { level: 2 });
    expect(sectionHeadings.map((heading) => heading.textContent)).toEqual([
      "Event details",
      "Event banner",
      "Bring list",
      "Access & privacy",
    ]);
    expect(screen.queryByText("More options")).not.toBeInTheDocument();
  });

  it("keeps each optional section independently discoverable", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CreateEvent />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText("Banner photo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Add an event banner" }));
    expect(screen.getByLabelText("Banner photo")).toBeInTheDocument();

    expect(screen.queryByText("Message for guests")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Enable bring list" }));
    expect(screen.getByText("Message for guests")).toBeInTheDocument();

    expect(screen.queryByText("Guest list privacy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Access & privacy/i }));
    expect(screen.getByText("Guest list privacy")).toBeInTheDocument();
  });

  it("keeps the create action in normal flow on desktop without losing its mobile sticky treatment", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CreateEvent />
      </MemoryRouter>,
    );

    const createButton = screen.getByRole("button", { name: "Create event" });
    const actionBar = createButton.parentElement;
    const form = createButton.closest("form");

    expect(actionBar).toHaveClass("sticky", "sm:static");
    expect(actionBar).toHaveClass("bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]");
    expect(form).toHaveClass("pb-24", "sm:pb-0");
  });
});
