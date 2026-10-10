import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GuestCountFieldsProps {
  adults: number;
  kids: number;
  onAdultsChange: (count: number) => void;
  onKidsChange: (count: number) => void;
}

const clampCount = (value: string, minimum: number) => {
  const count = Number.parseInt(value, 10);
  if (Number.isNaN(count)) return minimum;
  return Math.min(50, Math.max(minimum, count));
};

const GuestCountFields = ({
  adults,
  kids,
  onAdultsChange,
  onKidsChange,
}: GuestCountFieldsProps) => (
  <div className="grid items-start gap-x-4 gap-y-1.5 sm:grid-cols-2">
    <Label htmlFor="adult-count" className="sm:col-span-2">Adults</Label>
    <Input
      id="adult-count"
      type="number"
      inputMode="numeric"
      min={1}
      max={50}
      value={adults}
      onChange={(event) => onAdultsChange(clampCount(event.target.value, 1))}
    />

    <div className="mt-2.5 min-w-0 sm:mt-0">
      <Label htmlFor="bringing-children" className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-muted/25 px-3.5 py-2 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5">
        <Checkbox
          id="bringing-children"
          checked={kids > 0}
          onCheckedChange={(checked) => onKidsChange(checked === true ? Math.max(kids, 1) : 0)}
        />
        Bringing children?
      </Label>

      {kids > 0 && (
        <div className="mt-3">
          <Label htmlFor="child-count">Number of children</Label>
          <Input
            id="child-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={kids}
            onChange={(event) => onKidsChange(clampCount(event.target.value, 1))}
            className="mt-1.5"
          />
        </div>
      )}
    </div>
  </div>
);

export default GuestCountFields;
