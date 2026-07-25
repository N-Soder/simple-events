import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Used when Intl.supportedValuesOf is unavailable. Not a complete list — the
 * detected zone is always merged in, so the host's own zone is never missing.
 */
const FALLBACK_ZONES = [
  "UTC",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Madrid",
  "Europe/Berlin", "Europe/Amsterdam", "Europe/Brussels", "Europe/Zurich", "Europe/Rome",
  "Europe/Stockholm", "Europe/Oslo", "Europe/Copenhagen", "Europe/Helsinki", "Europe/Warsaw",
  "Europe/Prague", "Europe/Vienna", "Europe/Athens", "Europe/Istanbul", "Europe/Moscow",
  "America/New_York", "America/Toronto", "America/Chicago", "America/Denver",
  "America/Phoenix", "America/Los_Angeles", "America/Vancouver", "America/Mexico_City",
  "America/Bogota", "America/Sao_Paulo", "America/Buenos_Aires",
  "Africa/Casablanca", "Africa/Lagos", "Africa/Cairo", "Africa/Johannesburg", "Africa/Nairobi",
  "Asia/Jerusalem", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka",
  "Asia/Bangkok", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Perth", "Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne",
  "Pacific/Auckland",
];

/** The host's own zone, or UTC if the browser won't say. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function allZones(current: string): string[] {
  let zones: string[];
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    zones = supported ? supported("timeZone") : FALLBACK_ZONES;
  } catch {
    zones = FALLBACK_ZONES;
  }
  const set = new Set(zones);
  set.add("UTC");
  if (current) set.add(current);
  return [...set].sort();
}

/** "GMT+1" style label for the zone's offset right now. */
function offsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "Europe/London" → "Europe / London" */
function prettyZone(zone: string): string {
  return zone.replace(/_/g, " ").replace(/\//g, " / ");
}

interface TimezoneSelectProps {
  value: string;
  onChange: (zone: string) => void;
  id?: string;
}

const TimezoneSelect = ({ value, onChange, id }: TimezoneSelectProps) => {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => allZones(value), [value]);
  const offset = offsetLabel(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="mt-1.5 w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{prettyZone(value)}</span>
            {offset && <span className="shrink-0 text-muted-foreground">({offset})</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time zones..." />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={prettyZone(zone)}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", zone === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{prettyZone(zone)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default TimezoneSelect;
