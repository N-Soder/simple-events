import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import GuestCountFields from "./GuestCountFields";

const TestHarness = ({ initialAdults = 1, initialKids = 0 }) => {
  const [adults, setAdults] = useState(initialAdults);
  const [kids, setKids] = useState(initialKids);

  return (
    <GuestCountFields
      adults={adults}
      kids={kids}
      onAdultsChange={setAdults}
      onKidsChange={setKids}
    />
  );
};

describe("GuestCountFields", () => {
  it("keeps the child count hidden until the guest opts in", () => {
    render(<TestHarness />);

    expect(screen.queryByLabelText("Number of children")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Bringing children?" }));

    expect(screen.getByLabelText("Number of children")).toHaveValue(1);
  });

  it("accepts typed party sizes and resets children when opted out", () => {
    render(<TestHarness initialKids={2} />);

    fireEvent.change(screen.getByLabelText("Adults"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Number of children"), { target: { value: "3" } });

    expect(screen.getByLabelText("Adults")).toHaveValue(4);
    expect(screen.getByLabelText("Number of children")).toHaveValue(3);

    fireEvent.click(screen.getByRole("checkbox", { name: "Bringing children?" }));

    expect(screen.queryByLabelText("Number of children")).not.toBeInTheDocument();
  });
});
