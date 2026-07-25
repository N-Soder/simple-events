import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarEvent, downloadIcs, googleCalendarUrl } from "@/lib/ics";

interface AddToCalendarButtonProps {
  event: CalendarEvent;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}

/**
 * "Add to calendar" with two routes: an .ics download (Apple Calendar, Outlook,
 * anything else) and a Google Calendar link, whose web flow is far smoother
 * than downloading a file — especially on Android.
 */
const AddToCalendarButton = ({
  event,
  variant = "outline",
  size = "sm",
  className,
}: AddToCalendarButtonProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant={variant} size={size} className={className}>
        <CalendarPlus className="mr-2 h-4 w-4" />
        Add to calendar
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem onSelect={() => downloadIcs(event)}>
        <Download className="mr-2 h-4 w-4" />
        Apple, Outlook, other (.ics)
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-2 h-4 w-4" />
          Google Calendar
        </a>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default AddToCalendarButton;
