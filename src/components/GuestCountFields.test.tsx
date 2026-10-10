import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import GuestCountFields from "./GuestCountFields";

const TestHarness = ({ initialAdults = 1, initialKids = 0 }) => {
  const [adults, setAdults] = useState(initialAdults);
  const [kids, setKids] = useState(initialKids);

  return (
    <>
      <GuestCountFields
        adults={adults}
        kids={kids}
        onAdultsChange={setAdults}
        onKidsChange={setKids}
      />
      <output aria-label="Party size">{adults} adults, {kids} children</output>
    </>
  );
};

describe("GuestCountFields", () => {
  it("starts with one adult and no children, with both counters visible", () => {
    render(<TestHarness />);

    expect(screen.getByRole("spinbutton", { name: "Adults" })).toHaveValue("1");
    expect(screen.getByRole("spinbutton", { name: "Children" })).toHaveValue("0");
    expect(screen.getByRole("button", { name: "Remove one adult" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove one child" })).toBeDisabled();
  });

  it("lets guests add children and reduce the count back to zero", () => {
    render(<TestHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Add one child" }));
    expect(screen.getByLabelText("Party size")).toHaveTextContent("1 adults, 1 children");

    fireEvent.click(screen.getByRole("button", { name: "Remove one child" }));
    expect(screen.getByRole("spinbutton", { name: "Children" })).toHaveValue("0");
    expect(screen.getByLabelText("Party size")).toHaveTextContent("1 adults, 0 children");
  });

  it("allows clearing and replacing a count without snapping back while typing", () => {
    render(<TestHarness initialAdults={4} initialKids={2} />);
    const children = screen.getByRole("spinbutton", { name: /children/i });

    fireEvent.change(children, { target: { value: "" } });
    expect(children).toHaveValue("");
    expect(screen.getByLabelText("Party size")).toHaveTextContent("4 adults, 0 children");

    fireEvent.change(children, { target: { value: "3" } });
    fireEvent.blur(children);
    expect(children).toHaveValue("3");
    expect(screen.getByLabelText("Party size")).toHaveTextContent("4 adults, 3 children");
  });

  it("normalizes empty fields on blur and keeps party sizes valid", () => {
    render(<TestHarness initialAdults={4} initialKids={2} />);
    const adults = screen.getByRole("spinbutton", { name: "Adults" });
    const children = screen.getByRole("spinbutton", { name: /children/i });

    fireEvent.change(adults, { target: { value: "" } });
    fireEvent.blur(adults);
    fireEvent.change(children, { target: { value: "" } });
    fireEvent.blur(children);

    expect(adults).toHaveValue("1");
    expect(children).toHaveValue("0");
    expect(screen.getByLabelText("Party size")).toHaveTextContent("1 adults, 0 children");
  });

  it("supports keyboard steps and caps typed and stepped counts at 50", () => {
    render(<TestHarness initialAdults={49} />);
    const adults = screen.getByRole("spinbutton", { name: "Adults" });
    const children = screen.getByRole("spinbutton", { name: /children/i });

    fireEvent.keyDown(adults, { key: "ArrowUp" });
    expect(adults).toHaveValue("50");
    expect(screen.getByRole("button", { name: "Add one adult" })).toBeDisabled();
    fireEvent.keyDown(adults, { key: "ArrowUp" });
    expect(adults).toHaveValue("50");
    fireEvent.keyDown(children, { key: "ArrowDown" });
    expect(children).toHaveValue("0");

    fireEvent.change(children, { target: { value: "99" } });
    fireEvent.blur(children);
    expect(children).toHaveValue("50");
    fireEvent.change(children, { target: { value: "-2" } });
    expect(children).toHaveValue("50");
  });
});
