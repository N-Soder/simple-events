import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Github, Mail } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEmailConfig } from "@/hooks/use-email-config";
import { REPO_URL } from "@/lib/links";
import { getMyEvents } from "@/lib/myEvents";

const REASSURANCES = ["Guests only need the link", "Nothing to install", "Deleted 90 days after the event"];

const STEPS = [
  ["01", "Add the details", "A date is enough to begin. Add a place, photo, password or bring list only if you need them."],
  ["02", "Send one link", "The page carries the plan. No app to download and no account to explain."],
  ["03", "Get clear replies", "Guests RSVP by name and can change their answer later from their own link."],
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [savedCount] = useState(() => getMyEvents().length);
  const { emailEnabled } = useEmailConfig();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    navigate(trimmed ? `/create?name=${encodeURIComponent(trimmed)}` : "/create");
  };

  return (
    <main id="main-content" className="page-texture flex min-h-[100dvh] flex-col bg-background">
      <AppHeader showMyEvents={savedCount > 0} showGitHub />

      <section className="mx-auto w-full max-w-6xl flex-1 animate-rise px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-24">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2.5 pr-3.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Github className="h-4 w-4 text-foreground" aria-hidden="true" />
          <span>
            <span className="font-medium text-foreground">Open source</span> · free · no accounts
          </span>
        </a>

        <h1 id="landing-question" className="mx-auto mt-6 max-w-[13ch] text-5xl leading-none tracking-[-0.03em] sm:text-6xl lg:text-7xl">
          What are you planning?
        </h1>
        <p className="mx-auto mt-6 max-w-[34ch] text-lg leading-8 text-muted-foreground sm:text-xl">
          One private page for the details, the RSVPs and who’s bringing what.
        </p>

        <form onSubmit={handleSubmit} className="mx-auto mt-9 max-w-xl" aria-labelledby="landing-question">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Midsommar Party"
              aria-label="Event name"
              maxLength={200}
              className="h-14 flex-1 border-foreground/15 bg-card px-4 text-base shadow-sm sm:text-base"
            />
            <Button type="submit" size="lg" className="group h-14 px-6 text-base">
              Start your event
              <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Button>
          </div>
        </form>

        <ul className="mt-6 flex flex-col items-center gap-x-7 gap-y-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:justify-center sm:text-base">
          {REASSURANCES.map((text) => (
            <li key={text} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>

        {savedCount > 0 && (
          <Link
            to="/my-events"
            className="mt-8 inline-flex items-center gap-2 rounded-sm text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Continue with your {savedCount} saved event{savedCount === 1 ? "" : "s"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="border-t border-border/80 py-12 sm:py-16">
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
            {STEPS.map(([number, title, copy]) => (
              <div key={number}>
                <span className="font-serif text-2xl text-primary/70">{number}</span>
                <h2 className="mt-2 font-sans text-base font-semibold">{title}</h2>
                <p className="mt-1.5 leading-7 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>

          {/* Only promised where this deployment can actually send email. */}
          {emailEnabled && (
            <p className="mt-10 flex items-start gap-3.5 rounded-lg bg-secondary px-5 py-4 leading-7 text-muted-foreground sm:mt-12 sm:items-center">
              <Mail className="mt-1 h-5 w-5 shrink-0 text-primary sm:mt-0" aria-hidden="true" />
              <span>
                <span className="font-semibold text-foreground">Want a copy of your links?</span> Hosts and guests can
                have them emailed. The address is used once and never stored.
              </span>
            </p>
          )}
        </div>

        <div className="border-t border-border/80 py-14 text-center sm:py-16">
          <h2 className="text-3xl sm:text-4xl">Open source, and yours to run.</h2>
          <p className="mx-auto mt-3 max-w-[46ch] leading-7 text-muted-foreground">
            Simple Events is free software under the AGPL-3.0 licence. Read the code, or deploy it yourself.
          </p>
          <Button asChild variant="outline" className="mt-6 bg-card">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <Github aria-hidden="true" />
              View the source
            </a>
          </Button>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <div className="flex gap-5">
          <Link className="hover:text-foreground" to="/privacy">Privacy</Link>
          <a className="hover:text-foreground" href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a className="hover:text-foreground" href="https://soderholm.app/" target="_blank" rel="noopener noreferrer">More projects</a>
        </div>
      </footer>
    </main>
  );
};

export default LandingPage;
