import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Laptop, PartyPopper, Shield, Trash2, Users } from "lucide-react";
import { format } from "date-fns";
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
import { CopyableLink } from "@/components/CopyButton";
import { adminLinkFor, getMyEvents, removeMyEvent, StoredEvent } from "@/lib/myEvents";

function formatEventDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : format(parsed, "EEEE, MMMM d, yyyy");
}

function isPast(date: string, now = new Date()): boolean {
  const parsed = new Date(`${date}T23:59:59`);
  return !Number.isNaN(parsed.getTime()) && parsed < now;
}

const MyEventsPage = () => {
  const [events, setEvents] = useState<StoredEvent[]>(() => getMyEvents());

  const handleForget = (id: string) => {
    removeMyEvent(id);
    setEvents(getMyEvents());
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <div className="mb-8">
          <h1 className="text-3xl font-bold sm:text-4xl">Your events</h1>
          <p className="mt-2 text-muted-foreground">
            Events you created in this browser, with the links you'll need to manage them.
          </p>
        </div>

        {events.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <PartyPopper className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">No events saved on this device</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Events you create are listed here. If you created one in a different browser
                  or cleared your browsing data, you'll need the admin link you saved at the time.
                </p>
              </div>
              <Button asChild>
                <Link to="/create">Create an Event</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <Card key={event.id} className={isPast(event.event_date) ? "opacity-75" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-start justify-between gap-3 text-lg">
                    <span className="min-w-0">
                      <span className="block truncate">{event.name}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        {formatEventDate(event.event_date)}
                        {isPast(event.event_date) && " · past"}
                      </span>
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          title="Remove from this list"
                          aria-label={`Remove ${event.name} from this list`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove "{event.name}" from this list?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This only forgets the event on this device. The event itself, its RSVPs
                            and its links all keep working. If you haven't saved the admin link
                            elsewhere, you won't be able to get back to it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleForget(event.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove from list
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <Users className="h-4 w-4" />
                      Guest link
                    </p>
                    <CopyableLink
                      value={event.guest_link}
                      successMessage="Guest link copied"
                      label={`Copy guest link for ${event.name}`}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <Shield className="h-4 w-4" />
                      Admin link
                    </p>
                    <CopyableLink
                      value={adminLinkFor(event)}
                      successMessage="Admin link copied"
                      label={`Copy admin link for ${event.name}`}
                    />
                  </div>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/admin/${event.id}?token=${event.admin_token}`}>Open admin dashboard</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          <Laptop className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This list is stored in this browser only. It isn't an account, and it doesn't sync.
            Clearing your browsing data removes it, and some browsers drop stored data after a
            few weeks of not visiting. Keep a copy of any admin link you care about.
          </p>
        </div>
      </div>
    </main>
  );
};

export default MyEventsPage;
