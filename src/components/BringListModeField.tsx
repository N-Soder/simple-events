import { ListOrdered, ListPlus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { BringListMode } from "@/lib/bringList";

const MODES = [
  {
    value: "open" as const,
    icon: ListPlus,
    label: "Open list",
    description: "Guests can choose a suggestion or add their own item.",
  },
  {
    value: "signup" as const,
    icon: ListOrdered,
    label: "Fixed slots",
    description: "You set the categories and how many of each are needed.",
  },
];

interface BringListModeFieldProps {
  value: BringListMode;
  onChange: (mode: BringListMode) => void;
}

/**
 * How a bring list behaves. Shown identically when creating an event and when
 * editing one, so switching between the two never means relearning the choice.
 */
const BringListModeField = ({ value, onChange }: BringListModeFieldProps) => (
  <div>
    <Label className="mb-2 block">List type</Label>
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as BringListMode)}
      className="grid gap-2 sm:grid-cols-2"
    >
      {MODES.map((mode) => {
        const Icon = mode.icon;
        return (
          <label
            key={mode.value}
            className={`cursor-pointer rounded-md border p-3 transition-colors ${value === mode.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/35"}`}
          >
            <span className="flex items-center gap-2">
              <RadioGroupItem value={mode.value} />
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm font-medium">{mode.label}</span>
            </span>
            <span className="mt-1.5 block pl-6 text-xs leading-5 text-muted-foreground">{mode.description}</span>
          </label>
        );
      })}
    </RadioGroup>
  </div>
);

export default BringListModeField;
