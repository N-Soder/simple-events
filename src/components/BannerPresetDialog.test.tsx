import { render, screen } from "@testing-library/react";

import BannerPresetDialog from "./BannerPresetDialog";
import { BANNER_PRESETS } from "@/lib/bannerPresets";

describe("BannerPresetDialog", () => {
  it("uses banner names for accessible tile labels without rendering captions", () => {
    render(
      <BannerPresetDialog
        open
        onOpenChange={() => {}}
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    for (const preset of BANNER_PRESETS) {
      expect(screen.getByRole("button", { name: preset.label })).toBeInTheDocument();
      expect(screen.queryByText(preset.label)).not.toBeInTheDocument();
    }
  });
});
