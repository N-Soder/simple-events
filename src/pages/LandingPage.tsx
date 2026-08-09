import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, Link2, MessageCircle, Users } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyEvents } from "@/lib/myEvents";

const LandingPage = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [savedCount] = useState(() => getMyEvents().length);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    navigate(trimmed ? `/create?name=${encodeURIComponent(trimmed)}` : "/create");
  };

  return (
    <main id="main-content" className="page-texture flex min-h-[100dvh] flex-col overflow-x-clip bg-background">
      <AppHeader showMyEvents={savedCount > 0} />

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:gap-20 lg:py-24">
        <div className="min-w-0 animate-rise">
          <p className="eyebrow">One link. Everyone invited.</p>
          <h1 className="mt-5 max-w-3xl text-5xl leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
            Make plans without making everyone sign up.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Create a private page for the details, RSVPs, and who’s bringing what. Guests only need the link and their name.
          </p>

          <form onSubmit={handleSubmit} className="mt-9 max-w-2xl" aria-label="Start creating an event">
            <LabelText />
            <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
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
            <p className="mt-3 text-sm text-muted-foreground">Free, open source, and no account required.</p>
          </form>

          {savedCount > 0 && (
            <Link
              to="/my-events"
              className="mt-8 inline-flex items-center gap-2 rounded-sm text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Continue with your {savedCount} saved event{savedCount === 1 ? "" : "s"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>

        <aside className="relative mx-auto min-w-0 w-full max-w-md animate-rise [animation-delay:120ms]" aria-label="Example event page">
          <div className="absolute -inset-2 -rotate-2 rounded-lg border border-border/70 bg-accent/60 sm:-inset-5" aria-hidden="true" />
          <div className="surface-panel relative overflow-hidden">
            <div className="h-2 bg-primary" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between border-b border-border pb-5">
                <p className="text-sm font-medium text-muted-foreground">You’re invited</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <h2 className="mt-7 text-4xl leading-tight tracking-[-0.02em]">Midsommar Party</h2>
              <p className="mt-3 leading-7 text-muted-foreground">Friday, 19 June · 6:30 pm<br />The garden, rain or shine</p>

              <div className="mt-8 space-y-3 border-y border-border py-5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" />Coming</span>
                  <span className="font-medium tabular-nums">14 adults · 3 kids</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-muted-foreground"><MessageCircle className="h-4 w-4" />Bring list</span>
                  <span className="flex items-center gap-1.5 font-medium text-primary"><Check className="h-4 w-4" />Dessert covered</span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 rounded-md bg-secondary px-4 py-3 text-sm">
                <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 truncate text-muted-foreground">events.soderholm.app/event/midsommar</span>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="border-y border-border/80 bg-card/55">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          {[
            ["01", "Add the details", "A date is enough to begin. Add a place, photo, password, or bring list only if you need them."],
            ["02", "Send one link", "The page carries the plan. No app download, account, or invitation system to explain."],
            ["03", "Get clear replies", "Guests RSVP by name and can update their response later from their private link."],
          ].map(([number, title, copy]) => (
            <div key={number} className="grid grid-cols-[2.5rem_1fr] gap-3">
              <span className="font-serif text-2xl text-primary/70">{number}</span>
              <div>
                <h2 className="font-sans text-sm font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <div className="flex gap-5">
          <a className="hover:text-foreground" href="https://github.com/N-Soder/simple-events" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a className="hover:text-foreground" href="https://soderholm.app/" target="_blank" rel="noopener noreferrer">More projects</a>
        </div>
      </footer>
    </main>
  );
};

const LabelText = () => (
  <span className="font-sans text-sm font-semibold text-foreground">What are you planning?</span>
);

export default LandingPage;
