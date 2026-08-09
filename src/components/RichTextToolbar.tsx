import { type ReactNode } from "react";
import { useEditor, useEditorState } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered, Redo2, Undo2 } from "lucide-react";

import RichTextLinkControl from "@/components/RichTextLinkControl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RichTextToolbarProps {
  editor: ReturnType<typeof useEditor>;
  editorId: string;
  ariaLabel: string;
}

interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

const ToolbarButton = ({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: ToolbarButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={cn(
      "h-8 w-8 text-muted-foreground hover:text-foreground",
      active && "bg-accent text-accent-foreground",
    )}
    aria-label={label}
    aria-pressed={active}
    title={shortcut ? `${label} (${shortcut})` : label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </Button>
);

const RichTextToolbar = ({ editor, editorId, ariaLabel }: RichTextToolbarProps) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isBold: currentEditor?.isActive("bold") ?? false,
      isItalic: currentEditor?.isActive("italic") ?? false,
      isLink: currentEditor?.isActive("link") ?? false,
      isBulletList: currentEditor?.isActive("bulletList") ?? false,
      isOrderedList: currentEditor?.isActive("orderedList") ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
    }),
  }) ?? {
    isBold: false,
    isItalic: false,
    isLink: false,
    isBulletList: false,
    isOrderedList: false,
    canUndo: false,
    canRedo: false,
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1"
      role="toolbar"
      aria-label={`${ariaLabel} formatting`}
    >
      <ToolbarButton
        label="Bold"
        shortcut="⌘B"
        active={state.isBold}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        shortcut="⌘I"
        active={state.isItalic}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <RichTextLinkControl editor={editor} editorId={editorId} active={state.isLink} />

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <ToolbarButton
        label="Bulleted list"
        active={state.isBulletList}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.isOrderedList}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <ToolbarButton
        label="Undo"
        shortcut="⌘Z"
        disabled={!state.canUndo}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        shortcut="⇧⌘Z"
        disabled={!state.canRedo}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
};

export default RichTextToolbar;
