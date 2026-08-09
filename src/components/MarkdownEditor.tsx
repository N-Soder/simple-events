import { useEffect, useId, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";

import RichTextToolbar from "@/components/RichTextToolbar";
import { normalizeRichTextLink } from "@/lib/richText";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Height, in rows, before the field starts scrolling. */
  rows?: number;
  id?: string;
  ariaLabel?: string;
}

const MarkdownEditor = ({
  value,
  onChange,
  placeholder = "Start writing…",
  rows = 6,
  id,
  ariaLabel = "Description",
}: MarkdownEditorProps) => {
  const generatedId = useId();
  const editorId = id ?? `rich-text-${generatedId.replace(/:/g, "")}`;
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        strike: false,
        trailingNode: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            target: "_blank",
            rel: "noopener noreferrer",
          },
          isAllowedUri: (url, context) => (
            context.defaultValidate(url)
            && /^(https?:\/\/|mailto:|tel:)/i.test(normalizeRichTextLink(url))
          ),
        },
      }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        id: editorId,
        role: "textbox",
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        class: "rich-text-editor__content",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChangeRef.current(updatedEditor.getMarkdown());
    },
  });

  useEffect(() => {
    if (!editor || editor.getMarkdown() === value) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="rich-text-editor mt-1.5 overflow-hidden rounded-md border border-input bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <RichTextToolbar editor={editor} editorId={editorId} ariaLabel={ariaLabel} />
      <EditorContent
        editor={editor}
        style={{ minHeight: `${Math.max(rows, 2) * 1.5 + 1}rem` }}
      />
    </div>
  );
};

export default MarkdownEditor;
