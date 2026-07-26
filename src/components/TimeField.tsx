import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatEventTime, prefers12Hour } from "@/lib/time";
import {
  buildTimeOptions,
  filterTimeOptions,
  formatDuration,
  minutesBetween,
  minutesOfDay,
  parseTimeInput,
  toHHMM,
} from "@/lib/timeInput";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";

const STEP_MINUTES = 30;

interface TimeFieldProps {
  id?: string;
  /** Canonical "HH:MM", or "" for unset. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Start time for an end-time field. Options gain a duration label, an
   * ambiguous bare hour resolves forwards from here, and the list opens near
   * the default event length.
   */
  relativeTo?: string;
  /** Offset from `relativeTo` the list scrolls to when no value is set yet. */
  defaultOffsetMinutes?: number;
  /** Canonical "HH:MM" shown as the worked example in the placeholder. */
  placeholderExample?: string;
  "aria-label"?: string;
}

/**
 * Time picker that defers to the platform on touch devices and offers a
 * typeahead combobox everywhere else.
 *
 * Native <input type="time"> is the best control on phones: it opens the OS
 * wheel or clock dial, is fully accessible, and already honours the reader's
 * own 12/24-hour setting. On desktop it is the weakest part of the form.
 * Firefox offers no picker at all, and no browser lets you simply type "6pm".
 * So desktop gets a text field with forgiving parsing plus a list of half-hour
 * options, and touch devices keep the native control.
 *
 * The split is on pointer type, not viewport width: a narrow desktop window is
 * still driven by a mouse and keyboard and should keep the combobox.
 */
const TimeField = ({
  id,
  value,
  onChange,
  disabled,
  relativeTo,
  defaultOffsetMinutes = 180,
  placeholderExample = "18:30",
  "aria-label": ariaLabel,
}: TimeFieldProps) => {
  const isTouch = useCoarsePointer();

  if (isTouch) {
    return (
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="mt-1.5"
      />
    );
  }

  return (
    <TimeCombobox
      id={id}
      value={value}
      onChange={onChange}
      disabled={disabled}
      relativeTo={relativeTo}
      defaultOffsetMinutes={defaultOffsetMinutes}
      placeholderExample={placeholderExample}
      aria-label={ariaLabel}
    />
  );
};

const TimeCombobox = ({
  id,
  value,
  onChange,
  disabled,
  relativeTo,
  defaultOffsetMinutes = 180,
  placeholderExample = "18:30",
  "aria-label": ariaLabel,
}: TimeFieldProps) => {
  const use12Hour = useMemo(prefers12Hour, []);
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  /** Raw text while typing; null means "show the formatted value". */
  const [draft, setDraft] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  /**
   * Whether the highlight was moved with the arrow keys. Enter commits what was
   * typed unless the reader deliberately walked the list, so typing "6pm" and
   * pressing Enter gives 6pm rather than whichever row happens to be first.
   */
  const [navigated, setNavigated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** Value when editing began, so Escape can still undo an edit in progress. */
  const valueOnOpen = useRef(value);

  const allOptions = useMemo(() => buildTimeOptions(STEP_MINUTES), []);

  const label = (time: string) => formatEventTime(time, use12Hour);

  const options = useMemo(() => {
    const query = (draft ?? "").trim();
    if (!query) return allOptions;

    const matches = filterTimeOptions(allOptions, query);
    // A time typed off the half-hour grid ("6:15 PM") is offered as its own row.
    const exact = parseTimeInput(query, relativeTo || undefined);
    if (exact && !matches.includes(exact)) return [exact, ...matches];
    // Never strand the reader with an empty list — free typing still works.
    return matches.length > 0 ? matches : allOptions;
  }, [draft, allOptions, relativeTo]);

  /** Where the list should sit when it opens. */
  const anchorTime = useMemo(() => {
    if (value) return value;
    if (relativeTo) return toHHMM(minutesOfDay(relativeTo) + defaultOffsetMinutes);
    // Most events here are evening gatherings, so start the scroll near then.
    return "18:00";
  }, [value, relativeTo, defaultOffsetMinutes]);

  const commit = (text: string | null) => {
    if (text === null) return;
    if (!text.trim()) {
      onChange("");
      return;
    }
    const parsed = parseTimeInput(text, relativeTo || undefined);
    if (parsed) onChange(parsed);
    // Unparseable text simply reverts to the previous value on blur.
  };

  const choose = (time: string) => {
    onChange(time);
    setDraft(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const openList = () => {
    if (disabled) return;
    const target = options.findIndex((t) => t >= anchorTime);
    setHighlighted(target === -1 ? 0 : target);
    setNavigated(false);
    valueOnOpen.current = value;
    setOpen(true);
  };

  // Close when focus or a click leaves the field.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        commit(draft);
        setDraft(null);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  // Keep the highlighted option in view.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setNavigated(true);
      setHighlighted((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(options.length - 1, next));
      });
      return;
    }
    if (e.key === "Enter") {
      const typed = draft?.trim();

      // Walking the list with the arrows wins: that is a deliberate choice.
      if (navigated && open && options[highlighted]) {
        e.preventDefault();
        choose(options[highlighted]);
        return;
      }
      if (typed) {
        e.preventDefault();
        const parsed = parseTimeInput(typed, relativeTo || undefined);
        // Unreadable text stays put so it can be corrected, rather than
        // silently becoming some unrelated time.
        if (parsed) choose(parsed);
        return;
      }
      if (typed === "") {
        e.preventDefault();
        onChange("");
        setDraft(null);
        setOpen(false);
        return;
      }
      if (open && options[highlighted]) {
        e.preventDefault();
        choose(options[highlighted]);
      }
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      // Undo the whole edit, including anything committed while typing.
      if (value !== valueOnOpen.current) onChange(valueOnOpen.current);
      setDraft(null);
      setOpen(false);
      return;
    }
    if (e.key === "Tab" && open) {
      commit(draft);
      setDraft(null);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative mt-1.5">
      <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && options[highlighted] ? `${listboxId}-${options[highlighted]}` : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={`e.g. ${label(placeholderExample)}`}
        className="pl-9"
        value={draft ?? (value ? label(value) : "")}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          setHighlighted(0);
          setNavigated(false);
          if (!open) setOpen(true);
          // Publish a readable time as soon as one is typed, so dependent parts
          // of the form (the end field, the time zone picker) come alive
          // without waiting for a blur. Empty and unreadable drafts are left
          // for the blur handler: clearing the box mid-retype should not wipe
          // the value, which would take the end time with it.
          const parsed = parseTimeInput(text, relativeTo || undefined);
          if (parsed) onChange(parsed);
        }}
        onFocus={(e) => {
          e.target.select();
          openList();
        }}
        // Clicking an already-focused field fires no focus event, so without
        // this the list would not reopen after a selection.
        onClick={() => { if (!open) openList(); }}
        onBlur={() => {
          // Pointer selections are handled by the outside-click listener, which
          // fires before blur; this covers keyboard focus leaving the field.
          commit(draft);
          setDraft(null);
        }}
        onKeyDown={handleKeyDown}
      />

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {options.map((time, index) => {
            const selected = time === value;
            return (
              <li
                key={time}
                id={`${listboxId}-${time}`}
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm",
                  index === highlighted && "bg-accent text-accent-foreground",
                  selected && "font-medium",
                )}
                onPointerDown={(e) => {
                  // Beat the input's blur so the click always registers.
                  e.preventDefault();
                  choose(time);
                }}
                onMouseEnter={() => setHighlighted(index)}
              >
                <span>{label(time)}</span>
                {relativeTo && (
                  <span className="ml-3 text-xs text-muted-foreground">
                    {formatDuration(minutesBetween(relativeTo, time))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default TimeField;
