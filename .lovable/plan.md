

# Markdown Description Editor

Add markdown editing and rendering for event descriptions across all three pages.

## New Dependency
- `react-markdown` -- lightweight markdown renderer

## New Files

### `src/components/MarkdownEditor.tsx`
A textarea with a simple toolbar above it. Four buttons:
- **B** (Bold) -- wraps selected text in `**...**`
- **I** (Italic) -- wraps selected text in `*...*`
- **Link** -- wraps selected text in `[text](url)`
- **List** -- prepends `- ` to current line

Uses standard textarea `selectionStart`/`selectionEnd` APIs to insert syntax around the cursor or selection. Props: `value`, `onChange`, `placeholder`, `rows`.

### `src/components/MarkdownContent.tsx`
Wraps `react-markdown` with Tailwind prose-like styles:
- Bold/italic rendered naturally
- Links styled with `text-primary underline`, open in new tab (`target="_blank"`, `rel="noopener noreferrer"`)
- Lists get standard bullet styling
- Paragraphs get proper spacing

Props: `content: string | null`.

## Changed Files

### `src/pages/Index.tsx` (Create Event)
- Replace the `<Textarea>` for description (line 145) with `<MarkdownEditor>`
- Since `react-hook-form` uses `register("description")`, switch to using `watch("description")` + `setValue("description", ...)` to control the value manually
- Add helper text below: "Supports **bold**, *italic*, [links], and lists"

### `src/pages/EventPage.tsx` (Guest View)
- Replace `<p className="whitespace-pre-wrap">{event.description}</p>` with `<MarkdownContent content={event.description} />`

### `src/pages/AdminPage.tsx` (Admin Edit)
- Replace the description `<Textarea>` with `<MarkdownEditor>` (value/onChange already use state, so straightforward swap)

## Technical Details

### MarkdownEditor toolbar implementation
- The toolbar is a row of small icon buttons above the textarea
- Each button calls a helper function that reads `textareaRef.current.selectionStart/End`, constructs the new string with markdown syntax inserted, calls `onChange` with the new value, and restores cursor position via `setTimeout` + `setSelectionRange`
- The textarea ref is obtained via `useRef<HTMLTextAreaElement>`

### MarkdownContent rendering
- Uses `react-markdown` with custom component overrides:
  - `a` renders with `className="text-primary underline"` and `target="_blank"`
  - `ul` renders with `className="list-disc pl-6"`
  - `p` renders with `className="mb-2 last:mb-0"`
- Wrapped in a div with `className="text-foreground/80 whitespace-pre-wrap"`
