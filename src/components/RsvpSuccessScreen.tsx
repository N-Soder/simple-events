import { Check, Copy, ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import { CalendarEvent } from "@/lib/ics";

interface RsvpSuccessScreenProps {
  guestName: string;
  adults: number;
  kids: number;
  claimedItems: string[];
  manageUrl: string;
  calendarEvent: CalendarEvent;
  onViewEvent: () => void;
}

const RsvpSuccessScreen = ({
  guestName,
  adults,
  kids,
  claimedItems,
  manageUrl,
  calendarEvent,
  onViewEvent,
}: RsvpSuccessScreenProps) => {
  const { toast } = useToast();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(manageUrl);
      toast({ title: "Manage link copied" });
    } catch {
      toast({ title: "Couldn't copy", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  return (
    <div className="page-texture mx-auto min-h-[100dvh] max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-xl">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-5 w-5" /></span>
        <p className="eyebrow mt-6">Reply saved</p>
        <h1 className="mt-3 text-4xl tracking-[-0.025em] sm:text-5xl">You’re on the guest list.</h1>
        <p className="mt-3 text-lg text-muted-foreground">Thanks, {guestName}. Your host has your reply.</p>
      </div>

      <Card className="surface-panel mt-9 border-0 shadow-none">
        <CardHeader className="border-b border-border pb-5">
          <h2 className="font-serif text-2xl">Your RSVP</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between gap-4 border-b border-border pb-3">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{guestName}</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-border pb-3">
            <span className="text-muted-foreground">Guests</span>
            <span className="font-medium">
              {adults} adult{adults !== 1 ? "s" : ""}
              {kids > 0 ? `, ${kids} kid${kids !== 1 ? "s" : ""}` : ""}
            </span>
          </div>
          {claimedItems.length > 0 && (
            <div className="flex justify-between gap-4 border-b border-border pb-3">
              <span className="text-muted-foreground">Bringing</span>
              <span className="font-medium text-right">{claimedItems.join(", ")}</span>
            </div>
          )}
          <div className="border-t pt-3">
            <AddToCalendarButton event={calendarEvent} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-dashed bg-background/50 shadow-none">
        <CardContent className="space-y-3 pt-6">
          <p className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4 text-primary" />Your private edit link</p>
          <p className="text-xs leading-5 text-muted-foreground">
            You can edit your RSVP from this device at any time. To edit from another device, save the link below, or contact the host.
          </p>
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-md bg-muted px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-muted/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Copy link"
            onClick={copyLink}
            aria-label="Copy private RSVP edit link"
          >
            <span className="flex-1 truncate text-muted-foreground">
              {(() => {
                try {
                  const url = new URL(manageUrl);
                  const hash = url.hash; // e.g. #manage=abc.def
                  const token = hash.slice(1, 13) + "…"; // first 12 chars of hash content
                  return `${url.hostname}${url.pathname.slice(0, 18)}…#${token}`;
                } catch {
                  return manageUrl.slice(0, 30) + "…";
                }
              })()}
            </span>
            <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

      <Button className="mt-6 w-full sm:w-auto" size="lg" onClick={onViewEvent}>
        View event details
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
};

export default RsvpSuccessScreen;
