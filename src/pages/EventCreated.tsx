import { useSearchParams } from "react-router-dom";
import { Check, Copy, Link, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

const EventCreated = () => {
  const [params] = useSearchParams();
  const eventId = params.get("id");
  const adminToken = params.get("token");

  const guestLink = `${window.location.origin}/event/${eventId}`;
  const adminLink = `${window.location.origin}/admin/${eventId}?token=${adminToken}`;

  const [copiedGuest, setCopiedGuest] = useState(false);
  const [copiedAdmin, setCopiedAdmin] = useState(false);

  const copyToClipboard = async (text: string, type: "guest" | "admin") => {
    await navigator.clipboard.writeText(text);
    if (type === "guest") { setCopiedGuest(true); setTimeout(() => setCopiedGuest(false), 2000); }
    else { setCopiedAdmin(true); setTimeout(() => setCopiedAdmin(false), 2000); }
  };

  if (!eventId || !adminToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Invalid link.</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-4 py-12 sm:py-20">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">Event Created!</h1>
          <p className="mt-3 text-muted-foreground">Save these links — you won't be able to see them again.</p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link className="h-5 w-5 text-primary" />
                Guest Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">Share this with your guests. They'll need the password you set to access the event.</p>
              <div className="flex gap-2">
                <code className="flex-1 overflow-hidden truncate rounded-md bg-muted px-3 py-2 text-sm">{guestLink}</code>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(guestLink, "guest")}>
                  {copiedGuest ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-accent">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-accent-foreground" />
                Admin Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">Keep this private! Use it to edit your event, manage RSVPs, and update the bring list.</p>
              <div className="flex gap-2">
                <code className="flex-1 overflow-hidden truncate rounded-md bg-muted px-3 py-2 text-sm">{adminLink}</code>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(adminLink, "admin")}>
                  {copiedAdmin ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <Button variant="outline" onClick={() => window.location.href = "/"}>Create Another Event</Button>
        </div>
      </div>
    </main>
  );
};

export default EventCreated;
