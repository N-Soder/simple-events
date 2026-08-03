import { useSearchParams, Link as RouterLink } from "react-router-dom";
import { Check, Link, Shield, Globe, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableLink } from "@/components/CopyButton";

const EventCreated = () => {
  const [params] = useSearchParams();
  const eventId = params.get("id");
  const adminToken = params.get("token");
  const password = params.get("password"); // null if no password
  const embed = params.get("embed") === "1";

  // Build guest link
  const baseGuestLink = `${window.location.origin}/event/${eventId}`;
  const guestLink = password && embed ? `${baseGuestLink}#${password}` : baseGuestLink;
  const adminLink = `${window.location.origin}/admin/${eventId}?token=${adminToken}`;

  if (!eventId || !adminToken) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Invalid link.</p>
      </div>
    );
  }

  // Determine guest link description
  let guestDescription: string;
  if (!password) {
    guestDescription = "Anyone with this link can view your event. No password required.";
  } else if (embed) {
    guestDescription = "The password is embedded in this link. Guests can open it directly without typing anything.";
  } else {
    guestDescription = `Guests will need to enter the password "${password}" to view your event.`;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-4 py-12 sm:py-20">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">Event created!</h1>
          <p className="mt-3 text-muted-foreground">Save these links somewhere safe.</p>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                {password ? <Link className="h-5 w-5 text-primary" /> : <Globe className="h-5 w-5 text-primary" />}
                Guest link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">{guestDescription}</p>
              <CopyableLink value={guestLink} successMessage="Guest link copied" label="Copy guest link" />
            </CardContent>
          </Card>

          <Card className="border-accent">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-accent-foreground" />
                Admin link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">Keep this private! Use it to edit your event, manage RSVPs, and update the bring list.</p>
              <CopyableLink value={adminLink} successMessage="Admin link copied" label="Copy admin link" />
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          <Laptop className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Both links are also saved in this browser, so you can find them again under{" "}
            <RouterLink to="/my-events" className="font-medium text-foreground underline underline-offset-2">
              Your events
            </RouterLink>
            . That copy only lives on this device, so if you clear your browser data or switch devices, it's gone.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <RouterLink to="/create">Create another event</RouterLink>
          </Button>
        </div>
      </div>
    </main>
  );
};

export default EventCreated;
