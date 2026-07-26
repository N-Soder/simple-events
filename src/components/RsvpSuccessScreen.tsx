import { CheckCircle, Copy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Couldn't copy", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <div className="flex flex-col items-center text-center">
        <CheckCircle className="h-16 w-16 text-primary" />
        <h1 className="mt-4 text-3xl font-bold">RSVP Submitted!</h1>
        <p className="mt-2 text-muted-foreground">Thanks, {guestName}. You're all set.</p>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Your RSVP Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{guestName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Guests</span>
            <span className="font-medium">
              {adults} adult{adults !== 1 ? "s" : ""}
              {kids > 0 ? `, ${kids} kid${kids !== 1 ? "s" : ""}` : ""}
            </span>
          </div>
          {claimedItems.length > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bringing</span>
              <span className="font-medium text-right">{claimedItems.join(", ")}</span>
            </div>
          )}
          <div className="border-t pt-3">
            <AddToCalendarButton event={calendarEvent} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-dashed">
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm font-medium">Edit your RSVP</p>
          <p className="text-xs text-muted-foreground">
            You can edit your RSVP from this device at any time. To edit from another device, save the link below, or contact the host.
          </p>
          <div
            className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs font-mono cursor-pointer"
            title="Copy link"
            onClick={copyLink}
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
          </div>
        </CardContent>
      </Card>

      <Button className="mt-6 w-full" onClick={onViewEvent}>
        View Event Details
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
};

export default RsvpSuccessScreen;
