import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import BannerField from "./BannerField";

describe("BannerField", () => {
  it("shows and can remove an existing banner", () => {
    const onChange = vi.fn();

    render(
      <BannerField
        initialUrl="/banner-presets/string-lights.webp"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("img", { name: "Current banner" })).toHaveAttribute(
      "src",
      "/banner-presets/string-lights.webp",
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove banner photo" }));

    expect(screen.queryByRole("img", { name: "Current banner" })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
