import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Github } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { REPO_URL } from "@/lib/links";
import { getMyEvents } from "@/lib/myEvents";

interface AppHeaderProps {
  backTo?: string;
  backLabel?: string;
  showCreate?: boolean;
  showMyEvents?: boolean;
  showGitHub?: boolean;
}

const AppHeader = ({
  backTo,
  backLabel = "Back",
  showCreate = false,
  showMyEvents = false,
  showGitHub = false,
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
          <Link to="/" className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
            <Logo className="h-7 w-auto" />
          </Link>
        )}

        {(showCreate || hasMyEvents || showGitHub) && (
          <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
            {hasMyEvents && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/my-events">Your events</Link>
              </Button>
            )}
            {showGitHub && (
              <Button asChild variant="outline" size="sm" className="bg-card">
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  <Github aria-hidden="true" />
                  GitHub
                </a>
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
