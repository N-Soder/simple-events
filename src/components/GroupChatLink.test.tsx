import { render, screen } from "@testing-library/react";

import GroupChatLink from "./GroupChatLink";

describe("GroupChatLink", () => {
  it("labels the link with the platform it points at", () => {
    render(<GroupChatLink url="https://chat.whatsapp.com/Fx9abcDEF" />);

    const link = screen.getByRole("link", { name: /Join the WhatsApp group/ });
    expect(link).toHaveAttribute("href", "https://chat.whatsapp.com/Fx9abcDEF");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("falls back to neutral wording for an unrecognised host", () => {
    render(<GroupChatLink url="https://chat.example.com/room" />);

    expect(screen.getByRole("link", { name: /Open the group chat/ })).toBeInTheDocument();
  });

  it("renders nothing when there is no link", () => {
    const { container } = render(<GroupChatLink url={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("refuses to render a stored value that is not a plain web address", () => {
    // The server validates on write; this is the second gate, so a row that
    // predates that check or was written some other way cannot become a
    // scripted anchor on a page other people open.
    const { container } = render(<GroupChatLink url="javascript:alert(1)" />);

    expect(container).toBeEmptyDOMElement();
  });
});
