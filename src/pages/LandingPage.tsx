import { useState } from "react";
import { Link } from "react-router-dom";
import { PartyPopper, Users, ListChecks, ShieldCheck, Github, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyEvents } from "@/lib/myEvents";

const features = [
  {
    icon: Users,
    title: "No Accounts Needed",
    description: "Guests RSVP with just their name. No signups or logins required.",
  },
  {
    icon: ListChecks,
    title: "Bring List Coordination",
    description: "Let guests volunteer to bring items so nothing gets doubled up.",
  },
  {
    icon: ShieldCheck,
    title: "Guest Privacy Controls",
    description: "Choose whether guests see the full list, just a count, or nothing at all.",
  },
];

const LandingPage = () => {
  // Only returning hosts see the "your events" entry point; first-time
  // visitors get the hero on its own.
  const [savedCount] = useState(() => getMyEvents().length);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:py-32">
        {/* Hero */}
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <PartyPopper className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Simple Events</h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
            Create a private event page, share a link, collect RSVPs, and coordinate who's bringing what. All without accounts.
          </p>
          <Button asChild size="lg" className="mt-8 text-base px-8">
            <Link to="/create">Create an Event</Link>
          </Button>
          {savedCount > 0 && (
            <p className="mt-4">
              <Link
                to="/my-events"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Your {savedCount} saved event{savedCount !== 1 ? "s" : ""} on this device
                <ArrowRight className="h-4 w-4" />
              </Link>
            </p>
          )}
        </div>

        {/* Features */}
        <div className="mt-24 grid gap-8 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
                <f.icon className="h-5 w-5 text-secondary-foreground" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-24 flex flex-col items-center gap-3 border-t pt-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/N-Soder/simple-events"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <a
              href="https://soderholm.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              More projects
            </a>
          </div>
          <p>Open source under the AGPL-3.0 license.</p>
        </footer>
      </div>
    </main>
  );
};

export default LandingPage;
