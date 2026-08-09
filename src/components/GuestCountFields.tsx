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
  <div className="grid gap-4 sm:grid-cols-2">
    <div>
      <Label htmlFor="adult-count">Adults</Label>
      <Input
        id="adult-count"
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        value={adults}
        onChange={(event) => onAdultsChange(clampCount(event.target.value, 1))}
        className="mt-1.5"
      />
    </div>

    <div className="rounded-md border border-border bg-muted/25 px-4 py-3">
      <div className="flex min-h-6 items-center gap-3">
        <Checkbox
          id="bringing-children"
          checked={kids > 0}
          onCheckedChange={(checked) => onKidsChange(checked === true ? Math.max(kids, 1) : 0)}
        />
        <Label htmlFor="bringing-children" className="cursor-pointer">
          Bringing children?
        </Label>
      </div>

      {kids > 0 && (
        <div className="mt-3 border-t border-border pt-3">
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
