import { useLocation, Link } from "react-router-dom";
import { ArrowLeft, CalendarX } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const isEventNotFound = (location.state as { type?: string } | null)?.type === "event";

  return (
    <main id="main-content" className="page-texture min-h-[100dvh] bg-background">
      <AppHeader />
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl items-center px-4 py-16 sm:px-6">
        <div>
          <CalendarX className="h-9 w-9 text-primary" aria-hidden="true" />
          <p className="eyebrow mt-6">{isEventNotFound ? "Event unavailable" : "Page not found"}</p>
          <h1 className="mt-3 text-4xl tracking-[-0.025em] sm:text-5xl">
            {isEventNotFound ? "This event is no longer here." : "There’s nothing at this address."}
          </h1>
          <p className="mt-4 max-w-md text-lg leading-8 text-muted-foreground">
            {isEventNotFound
              ? "The link may be incomplete, or the event was deleted. Events are automatically removed 90 days after they happen."
              : "Check the address, or return home to start a new event."}
          </p>
          <Button asChild className="mt-7">
            <Link to="/"><ArrowLeft aria-hidden="true" />Return home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
