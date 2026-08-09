import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Laptop, Shield, Trash2, Users } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
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
    <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
      <AppHeader showCreate />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-9 max-w-2xl">
          <p className="eyebrow">Saved on this device</p>
          <h1 className="mt-3 text-4xl tracking-[-0.025em] sm:text-5xl">Your events</h1>
          <p className="mt-3 text-lg leading-8 text-muted-foreground">
            The guest and admin links for events you created in this browser.
          </p>
        </header>

        {events.length === 0 ? (
          <div className="surface-panel px-5 py-12 text-center sm:px-10">
              <p className="font-serif text-3xl">Nothing saved here yet.</p>
              <div className="mx-auto mt-3 max-w-lg">
                <p className="text-sm leading-6 text-muted-foreground">
                  Events you create are listed here. If you created one in a different browser
                  or cleared your browsing data, you'll need the admin link you saved at the time.
                </p>
              </div>
              <Button asChild className="mt-6">
                <Link to="/create">Create an event <ArrowRight /></Link>
              </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {events.map((event) => (
              <article key={event.id} className={`surface-panel overflow-hidden ${isPast(event.event_date) ? "opacity-75" : ""}`}>
                <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl">{event.name}</h2>
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        {formatEventDate(event.event_date)}
                        {isPast(event.event_date) && " · past"}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground"
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
                </div>
                <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
                  <div className="min-w-0">
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
                  <div className="min-w-0">
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
                  <Button variant="secondary" asChild className="sm:col-span-2 sm:justify-self-start">
                    <Link to={`/admin/${event.id}?token=${event.admin_token}`}>Open dashboard <ArrowRight /></Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-start gap-3 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
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
