import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import PrivacyPage from "./PrivacyPage";
import { RETENTION_DAYS } from "@/lib/myEvents";

describe("PrivacyPage", () => {
  beforeEach(() => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PrivacyPage />
      </MemoryRouter>,
    );
  });

  it("covers each topic a visitor would look for", () => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("How your details are handled");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "What we store",
      "Email addresses",
      "On your device",
      "Who can see what",
      "Services we use",
      "Never sold or used for marketing",
      "When it’s deleted",
      "Removal requests and questions",
    ]);
  });

  it("states the email promise, the retention period and the contact address", () => {
    expect(screen.getByText(/used once to send that email and is not saved/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${RETENTION_DAYS} days after the event date`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy@soderholm.app" })).toHaveAttribute("href", "mailto:privacy@soderholm.app");
  });
});
