import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type GuestVisibility = "full" | "count_only" | "hidden";

const OPTIONS = [
  { value: "full" as const, label: "Names and totals", description: "Guests see who is coming" },
  { value: "count_only" as const, label: "Totals only", description: "No guest names" },
  { value: "hidden" as const, label: "Hidden", description: "No attendance details" },
];

interface GuestVisibilityFieldProps {
  value: GuestVisibility;
  onChange: (value: GuestVisibility) => void;
}

/** What guests are allowed to see about everyone else's replies. */
const GuestVisibilityField = ({ value, onChange }: GuestVisibilityFieldProps) => (
  <RadioGroup
    value={value}
    onValueChange={(next) => onChange(next as GuestVisibility)}
    className="grid gap-2 sm:grid-cols-3"
  >
    {OPTIONS.map((option) => (
      <label
        key={option.value}
        className={`cursor-pointer rounded-md border p-3 transition-colors ${value === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/35"}`}
      >
        <span className="flex items-center gap-2">
          <RadioGroupItem value={option.value} />
          <span className="text-sm font-medium">{option.label}</span>
        </span>
        <span className="mt-1.5 block pl-6 text-xs leading-5 text-muted-foreground">{option.description}</span>
      </label>
    ))}
  </RadioGroup>
);

export default GuestVisibilityField;
