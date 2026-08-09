import { useSearchParams, Link as RouterLink } from "react-router-dom";
import { ArrowRight, Check, ExternalLink, Laptop, LockKeyhole, Send, ShieldCheck } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { CopyableLink } from "@/components/CopyButton";

const EventCreated = () => {
  const [params] = useSearchParams();
  const eventId = params.get("id");
  const adminToken = params.get("token");
  const password = params.get("password");
  const embed = params.get("embed") === "1";

  if (!eventId || !adminToken) {
    return (
      <main id="main-content" className="page-texture flex min-h-[100dvh] items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-3xl">This link is incomplete</h1>
          <p className="mt-3 text-muted-foreground">Return home to create a new event.</p>
          <Button asChild className="mt-6"><RouterLink to="/">Return home</RouterLink></Button>
        </div>
      </main>
    );
  }

  const baseGuestLink = `${window.location.origin}/event/${eventId}`;
  const guestLink = password && embed ? `${baseGuestLink}#${password}` : baseGuestLink;
  const adminLink = `${window.location.origin}/admin/${eventId}?token=${adminToken}`;

  const guestDescription = !password
    ? "Anyone you send this link to can open the event."
    : embed
      ? "The password is already in this link, so guests can open it directly."
      : `Guests will enter “${password}” after opening the link.`;

  return (
    <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
      <AppHeader />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-2xl animate-rise">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="eyebrow mt-6">Event created</p>
          <h1 className="mt-3 text-4xl leading-tight tracking-[-0.025em] sm:text-5xl">Your event is ready to share.</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">
            Send the guest link now. Save the private admin link somewhere you trust before leaving this page.
          </p>
        </header>

        <div className="mt-10 space-y-5">
          <section className="surface-panel overflow-hidden" aria-labelledby="guest-link-heading">
            <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:p-7">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <Send className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 id="guest-link-heading" className="font-sans text-lg font-semibold">Guest link</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{guestDescription}</p>
                <CopyableLink value={guestLink} successMessage="Guest link copied" label="Copy guest link" className="mt-4" />
              </div>
              <Button asChild variant="outline" className="sm:mt-9">
                <RouterLink to={`/event/${eventId}`} target="_blank" rel="noopener noreferrer">Preview <ExternalLink aria-hidden="true" /></RouterLink>
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-primary/35 bg-primary/[0.055]" aria-labelledby="admin-link-heading">
            <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/12 text-primary">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="eyebrow">Keep this private</p>
                <h2 id="admin-link-heading" className="mt-1 font-sans text-lg font-semibold">Your admin link</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Anyone with this link can edit the event and see every RSVP. There is no account recovery if you lose it.
                </p>
                <CopyableLink value={adminLink} successMessage="Admin link copied" label="Copy admin link" className="mt-4" />
                <Button asChild className="mt-4 w-full sm:w-auto">
                  <RouterLink to={`/admin/${eventId}?token=${adminToken}`}>Open event dashboard <ArrowRight aria-hidden="true" /></RouterLink>
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="flex gap-3 border-t border-border pt-4">
            <Laptop className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Both links are saved under <RouterLink to="/my-events" className="font-medium text-foreground underline underline-offset-2">Your events</RouterLink> on this device only.</p>
          </div>
          <div className="flex gap-3 border-t border-border pt-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Events and guest data are automatically deleted 90 days after the event date.</p>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <Button variant="ghost" asChild className="-ml-4 text-muted-foreground hover:text-foreground">
            <RouterLink to="/create">Create another event <ArrowRight aria-hidden="true" /></RouterLink>
          </Button>
        </div>
      </div>
    </main>
  );
};

export default EventCreated;
