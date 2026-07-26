import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bold, Eye, Italic, Link, List, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MarkdownContent from "@/components/MarkdownContent";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Height, in rows, before the field starts growing to fit its content. */
  rows?: number;
}

/** Ceiling for auto-growth; past this the textarea scrolls (and can be dragged). */
const MAX_AUTO_HEIGHT_PX = 520;

const MarkdownEditor = ({ value, onChange, placeholder, rows = 6 }: MarkdownEditorProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  // Once the field has been dragged to a size, auto-growth stops fighting it.
  const manuallyResized = useRef(false);
  const autoHeight = useRef<number | null>(null);

  const grow = useCallback(() => {
    const ta = ref.current;
    if (!ta || manuallyResized.current) return;
    const style = window.getComputedStyle(ta);
    // scrollHeight excludes borders, but border-box sizing includes them.
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    // Never shrink below the requested number of rows.
    const floor = lineHeight * rows + padding + borders;

    ta.style.height = "auto";
    const next = Math.min(Math.max(ta.scrollHeight + borders, floor), MAX_AUTO_HEIGHT_PX);
    ta.style.height = `${next}px`;
    autoHeight.current = next;
  }, [rows]);

  useLayoutEffect(() => {
    if (!preview) grow();
  }, [value, preview, grow]);

  // A height change we did not cause is the user dragging the resize handle.
  useEffect(() => {
    const ta = ref.current;
    if (!ta || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (autoHeight.current === null) return;
      if (Math.abs(ta.offsetHeight - autoHeight.current) > 2) manuallyResized.current = true;
    });
    observer.observe(ta);
    return () => observer.disconnect();
  }, [preview]);

  const wrap = (before: string, after: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newValue);
    const cursor = start + before.length + selected.length + after.length;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
  };

  const insertList = () => {
    const ta = ref.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    const newValue = value.slice(0, lineStart) + "- " + value.slice(lineStart);
    onChange(newValue);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(pos + 2, pos + 2); }, 0);
  };

  return (
    <div className="mt-1.5">
      <div className="mb-1 flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={preview} onClick={() => wrap("**", "**")} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={preview} onClick={() => wrap("*", "*")} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={preview} onClick={() => wrap("[", "](url)")} title="Link">
          <Link className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={preview} onClick={insertList} title="List">
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
        >
          {preview ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
          {preview ? "Write" : "Preview"}
        </Button>
      </div>

      {preview ? (
        <div
          className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm"
          style={{ minHeight: `${rows * 1.5 + 1}rem` }}
        >
          {value.trim()
            ? <MarkdownContent content={value} />
            : <p className="text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      ) : (
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="resize-y"
        />
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        Supports <strong>**bold**</strong>, <em>*italic*</em>, [links](url), and - lists
      </p>
    </div>
  );
};

export default MarkdownEditor;
