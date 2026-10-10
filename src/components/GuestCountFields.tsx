import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface GuestCountFieldsProps {
  adults: number;
  kids: number;
  onAdultsChange: (count: number) => void;
  onKidsChange: (count: number) => void;
}

const MAX_GUESTS = 50;

const clampCount = (value: number, minimum: number) =>
  Math.min(MAX_GUESTS, Math.max(minimum, value));

interface GuestCounterProps {
  id: string;
  label: string;
  singular: string;
  value: number;
  minimum: number;
  onChange: (count: number) => void;
}

const GuestCounter = ({ id, label, singular, value, minimum, onChange }: GuestCounterProps) => {
  const [draft, setDraft] = useState<string | null>(null);

  const step = (direction: number) => {
    setDraft(null);
    onChange(clampCount(value + direction, minimum));
  };

  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] rounded-md border border-input bg-card transition-shadow focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/20">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-r-none"
          aria-label={`Remove one ${singular}`}
          disabled={value <= minimum}
          onClick={() => step(-1)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          role="spinbutton"
          aria-valuemin={minimum}
          aria-valuemax={MAX_GUESTS}
          aria-valuenow={value}
          autoComplete="off"
          value={draft ?? String(value)}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            const next = event.target.value;
            if (!/^\d*$/.test(next)) return;
            setDraft(next);
            // Keep the RSVP valid while allowing an empty field during editing.
            onChange(clampCount(Number(next), minimum));
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              step(event.key === "ArrowUp" ? 1 : -1);
            }
          }}
          className="h-11 min-w-0 w-full rounded-sm bg-transparent text-center text-base font-medium tabular-nums focus-visible:outline-none"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-l-none"
          aria-label={`Add one ${singular}`}
          disabled={value >= MAX_GUESTS}
          onClick={() => step(1)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};

const GuestCountFields = ({ adults, kids, onAdultsChange, onKidsChange }: GuestCountFieldsProps) => (
  <div className="grid grid-cols-2 gap-3 sm:gap-4">
    <GuestCounter id="adult-count" label="Adults" singular="adult" value={adults} minimum={1} onChange={onAdultsChange} />
    <GuestCounter id="child-count" label="Children" singular="child" value={kids} minimum={0} onChange={onKidsChange} />
  </div>
);

export default GuestCountFields;
