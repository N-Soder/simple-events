import { useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import { Link as LinkIcon, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeRichTextLink } from "@/lib/richText";
import { cn } from "@/lib/utils";

interface RichTextLinkControlProps {
  editor: ReturnType<typeof useEditor>;
  editorId: string;
  active: boolean;
}

const RichTextLinkControl = ({ editor, editorId, active }: RichTextLinkControlProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && editor) setUrl(editor.getAttributes("link").href ?? "");
    setOpen(nextOpen);
  };

  const applyLink = () => {
    if (!editor) return;
    const href = normalizeRichTextLink(url);

    if (href) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }

    setOpen(false);
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 text-muted-foreground hover:text-foreground",
            active && "bg-accent text-accent-foreground",
          )}
          aria-label="Add link"
          aria-pressed={active}
          title="Add link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            applyLink();
          }}
        >
          <Label htmlFor={`${editorId}-link`} className="text-xs font-medium">
            Link address
          </Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              ref={inputRef}
              id={`${editorId}-link`}
              type="text"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="example.com"
              className="h-9"
            />
            <Button type="submit" size="sm" className="h-9">
              Apply
            </Button>
          </div>
          {active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-8 px-2 text-muted-foreground"
              onClick={removeLink}
            >
              <Unlink className="h-3.5 w-3.5" />
              Remove link
            </Button>
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
};

export default RichTextLinkControl;
