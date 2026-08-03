import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, ListChecks, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/Logo";
import { getMyEvents } from "@/lib/myEvents";

const features = [
  {
    icon: Users,
    title: "No accounts needed",
    description: "Guests RSVP with just their name.",
  },
  {
    icon: ListChecks,
    title: "Bring list",
    description: "Guests claim what they'll bring, nothing doubled up.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy controls",
    description: "Decide what guests can see about each other.",
  },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  // Only returning hosts see the "your events" entry point; first-time
  // visitors get the page on its own.
  const [savedCount] = useState(() => getMyEvents().length);

  // The name is a head start, not a commitment. An empty box still opens the
  // full form rather than blocking on validation the host hasn't seen yet.
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    navigate(trimmed ? `/create?name=${encodeURIComponent(trimmed)}` : "/create");
  };

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-6 w-6" />
          <span className="font-medium text-foreground">Simple Events</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          {savedCount > 0 && (
            <Link to="/my-events" className="transition-colors hover:text-foreground">
              Your {savedCount} saved event{savedCount !== 1 ? "s" : ""}
            </Link>
          )}
          <a
            href="https://github.com/N-Soder/simple-events"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:py-14">
        <h1 className="animate-rise text-center text-[2rem] leading-[1.15] sm:text-5xl sm:leading-tight">
          What are you planning?
        </h1>
        <p className="mt-3.5 max-w-lg animate-rise text-center leading-relaxed text-muted-foreground [animation-delay:60ms] sm:mt-4 sm:text-lg">
          Name it and you'll have a shareable event page in about ten seconds. No account, yours or theirs.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-7 flex w-full max-w-xl animate-rise flex-col gap-2.5 [animation-delay:120ms] sm:mt-9 sm:flex-row sm:gap-3"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anna's birthday dinner…"
            aria-label="Event name"
            maxLength={200}
            className="h-14 flex-1 bg-card px-5 text-base shadow-sm"
          />
          <Button type="submit" size="lg" className="group h-14 px-7 text-base">
            Create event
            <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Button>
        </form>

        {/* Claims here have to be ones the code actually backs. "Nothing tracked"
            did not: event names, guest names and bring list items are stored in
            plain text in D1. The retention window is verifiable, so say that. */}
        <ul className="mt-5 flex animate-rise flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-muted-foreground [animation-delay:180ms]">
          <li>Free and open source</li>
          <li className="text-primary">No sign-up required</li>
          <li>Auto-deleted 90 days after the event</li>
        </ul>

        <div className="mt-11 grid w-full max-w-3xl animate-rise gap-5 border-t pt-7 [animation-delay:260ms] sm:mt-16 sm:gap-10 sm:pt-9 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="flex gap-3">
              <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <div>
                <h2 className="font-sans text-sm font-medium text-foreground">{f.title}</h2>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground sm:mt-1">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="flex flex-col gap-2 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <p>Open source under the AGPL-3.0 license.</p>
        <a
          href="https://soderholm.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-foreground"
        >
          More projects
        </a>
      </footer>
    </main>
  );
};

export default LandingPage;
