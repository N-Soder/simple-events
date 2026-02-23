import { User, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RsvpSummaryCardProps {
  guestName: string;
  adults: number;
  kids: number;
  claimedItems: Array<{ id: string; item_name: string }>;
  onEdit: () => void;
}

const RsvpSummaryCard = ({
  guestName,
  adults,
  kids,
  claimedItems,
  onEdit,
}: RsvpSummaryCardProps) => {
  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <User className="h-5 w-5" />
          Your RSVP
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
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
