import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { getMyEvents } from "@/lib/myEvents";

interface AppHeaderProps {
  backTo?: string;
  backLabel?: string;
  showCreate?: boolean;
  showMyEvents?: boolean;
}

const AppHeader = ({
  backTo,
  backLabel = "Back",
  showCreate = false,
  showMyEvents = false,
}: AppHeaderProps) => {
  const [hasMyEvents] = useState(() => showMyEvents && getMyEvents().length > 0);

  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {backTo ? (
          <Button asChild variant="ghost" className="-ml-3 text-muted-foreground hover:text-foreground">
            <Link to={backTo}>
              <ArrowLeft aria-hidden="true" />
              {backLabel}
            </Link>
          </Button>
        ) : (
          <Link to="/" className="flex items-center gap-2.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
            <Logo className="h-7 w-7" />
            <span>Simple Events</span>
          </Link>
        )}

        {(showCreate || hasMyEvents) && (
          <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
            {hasMyEvents && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/my-events">Your events</Link>
              </Button>
            )}
            {showCreate && (
              <Button asChild size="sm">
                <Link to="/create">Create event</Link>
              </Button>
            )}
          </nav>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
