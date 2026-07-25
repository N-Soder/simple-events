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
import { allZones, offsetLabel, prettyZone } from "@/lib/timezone";

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
