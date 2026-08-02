import { useState } from "react";
import { Link } from "react-router-dom";
import { PartyPopper, Users, ListChecks, ShieldCheck, Github, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyEvents } from "@/lib/myEvents";

const features = [
  {
    icon: Users,
    title: "No Accounts Needed",
    description: "Guests RSVP with just their name — no signups or logins required.",
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
    <main className="relative min-h-[100dvh] overflow-hidden bg-background">
      {/* Warm wash behind the hero, built from brand tokens rather than a stock gradient. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(60rem_28rem_at_15%_-10%,hsl(var(--accent))_0%,transparent_70%)] opacity-70"
      />

      <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-20 sm:pb-28 sm:pt-24">
        {/* Hero — left-aligned at desktop so the page doesn't read as a centered template. */}
        <section>
          <div className="mb-7 flex h-14 w-14 animate-rise items-center justify-center rounded-2xl bg-primary/10">
            <PartyPopper className="h-7 w-7 text-primary" />
          </div>
          <h1 className="animate-rise text-5xl leading-[1.05] tracking-tight [animation-delay:60ms] sm:text-7xl">
            Simple Events
          </h1>
          <p className="mt-5 max-w-xl animate-rise text-lg leading-relaxed text-muted-foreground [animation-delay:120ms] sm:text-xl">
            Create a private event page, share a link, collect RSVPs, and coordinate who's bringing what — all without
            accounts.
          </p>
          <div className="mt-9 flex animate-rise flex-wrap items-center gap-x-7 gap-y-4 [animation-delay:180ms]">
            <Button asChild size="lg" className="px-8 text-base">
              <Link to="/create">Create an Event</Link>
            </Button>
            {savedCount > 0 && (
              <Link
                to="/my-events"
                className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Your {savedCount} saved event{savedCount !== 1 ? "s" : ""} on this device
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </section>

        {/* Features — an editorial row stack instead of three identical centered cards. */}
        <section className="mt-20 animate-rise border-t [animation-delay:260ms] sm:mt-24">
          {features.map((f) => (
            <div
              key={f.title}
              className="group flex gap-5 border-b py-7 transition-colors duration-300 hover:bg-secondary/40 sm:gap-8 sm:py-8"
            >
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary transition-colors duration-300 group-hover:bg-primary/10">
                <f.icon className="h-5 w-5 text-secondary-foreground transition-colors duration-300 group-hover:text-primary" />
              </div>
              <div className="sm:flex sm:flex-1 sm:items-baseline sm:gap-8">
                <h2 className="text-xl sm:w-52 sm:shrink-0">{f.title}</h2>
                <p className="mt-1.5 text-muted-foreground sm:mt-0 sm:flex-1">{f.description}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Footer */}
        <footer className="mt-16 flex flex-col gap-3 text-sm text-muted-foreground sm:mt-20 sm:flex-row sm:items-center sm:justify-between">
          <p>Open source under the AGPL-3.0 license.</p>
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
        </footer>
      </div>
    </main>
  );
};

export default LandingPage;
