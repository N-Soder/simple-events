import { useRef } from "react";
import { Bold, Italic, Link, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

const MarkdownEditor = ({ value, onChange, placeholder, rows = 3 }: MarkdownEditorProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);

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
      <div className="flex gap-1 mb-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrap("**", "**")} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrap("*", "*")} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrap("[", "](url)")} title="Link">
          <Link className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertList} title="List">
          <List className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Supports <strong>**bold**</strong>, <em>*italic*</em>, [links](url), and - lists
      </p>
    </div>
  );
};

export default MarkdownEditor;
