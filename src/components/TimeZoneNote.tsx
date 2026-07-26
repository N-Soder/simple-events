import { useState } from "react";
import TimezoneSelect from "@/components/TimezoneSelect";
import { offsetLabel, prettyZone } from "@/lib/timezone";
import { DEFAULT_DURATION_HOURS } from "@/lib/ics";

interface TimeZoneNoteProps {
  value: string;
  onChange: (zone: string) => void;
  /** Mention the fallback event length, shown only when no end time is set. */
  showDurationHint?: boolean;
}

/**
 * A quiet one-line statement of the event's time zone that opens into a picker
 * when clicked.
 *
 * The zone is almost always already correct, so it does not deserve a labelled
 * field and two lines of explanation competing with the date and time. It
 * behaves like the 12/24-hour toggle on the event page: dotted underline,
 * clickable, explains itself only once someone asks.
 */
const TimeZoneNote = ({ value, onChange, showDurationHint }: TimeZoneNoteProps) => {
  const [open, setOpen] = useState(false);
  const offset = offsetLabel(value);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
      >
        Times in {prettyZone(value)}
        {offset ? ` (${offset})` : ""}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Calendar exports use this zone, so guests elsewhere in the world see the
            right local time. It defaults to yours. Change it if the event is
            somewhere else.
          </p>
          <TimezoneSelect value={value} onChange={onChange} />
          {showDurationHint && (
            <p className="mt-2 text-xs text-muted-foreground">
              With no end time, calendar entries are {DEFAULT_DURATION_HOURS} hours long.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeZoneNote;
