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

    expect(screen.queryByText("Banner photo (optional)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Event banner/i }));
    expect(screen.getByText("Banner photo (optional)")).toBeInTheDocument();

    expect(screen.queryByText("Message for guests")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Enable bring list" }));
    expect(screen.getByText("Message for guests")).toBeInTheDocument();

    expect(screen.queryByText("Guest list privacy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Access & privacy/i }));
    expect(screen.getByText("Guest list privacy")).toBeInTheDocument();
  });
});
