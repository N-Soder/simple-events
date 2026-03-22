import { User, Pencil, XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RsvpSummaryCardProps {
  guestName: string;
  adults: number;
  kids: number;
  claimedItems: Array<{ id: string; item_name: string }>;
  cancelled?: boolean;
  onEdit: () => void;
  onCancel?: () => void;
  onReRsvp?: () => void;
}

const RsvpSummaryCard = ({
  guestName,
  adults,
  kids,
  claimedItems,
  cancelled,
  onEdit,
  onCancel,
  onReRsvp,
}: RsvpSummaryCardProps) => {
  if (cancelled) {
    return (
      <Card className="mt-6 opacity-70">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg text-muted-foreground">
            <User className="h-5 w-5" />
            Your RSVP (Cancelled)
          </CardTitle>
          {onReRsvp && (
            <Button variant="outline" size="sm" onClick={onReRsvp}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Re-RSVP
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">You cancelled your RSVP for this event.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <User className="h-5 w-5" />
          Your RSVP
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          {onCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Cancel RSVP
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel your RSVP?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will cancel your RSVP and release any items you claimed. You can always re-RSVP later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep RSVP</AlertDialogCancel>
                  <AlertDialogAction onClick={onCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, cancel
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
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
            <span className="font-medium text-right">
              {claimedItems.map((i) => i.item_name).join(", ")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RsvpSummaryCard;
