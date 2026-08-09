import { fireEvent, render, screen } from "@testing-library/react";

import MarkdownEditor from "./MarkdownEditor";

describe("MarkdownEditor", () => {
  it("offers direct rich-text editing without Markdown or preview controls", () => {
    render(
      <MarkdownEditor
        value="Bring **snacks** and *good vibes*."
        onChange={() => {}}
        placeholder="Tell your guests what to expect..."
      />,
    );

    const editor = screen.getByRole("textbox", { name: "Description" });

    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor.querySelector("strong")).toHaveTextContent("snacks");
    expect(editor.querySelector("em")).toHaveTextContent("good vibes");
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Italic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulleted list" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Numbered list" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/supports.*markdown/i)).not.toBeInTheDocument();
  });

  it("visually updates when saved content arrives after mount", () => {
    const { rerender } = render(
      <MarkdownEditor value="" onChange={() => {}} ariaLabel="Event details" />,
    );

    rerender(
      <MarkdownEditor value="Updated with **important details**." onChange={() => {}} ariaLabel="Event details" />,
    );

    const editor = screen.getByRole("textbox", { name: "Event details" });
    expect(editor.querySelector("strong")).toHaveTextContent("important details");
  });

  it("does not submit the parent event form when applying a link", () => {
    const parentSubmit = vi.fn();

    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          parentSubmit();
        }}
      >
        <MarkdownEditor value="Event details" onChange={() => {}} />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Link address" }), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(parentSubmit).not.toHaveBeenCalled();
  });
});
