import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { CalendarX } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const isEventNotFound = (location.state as { type?: string } | null)?.type === "event";

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  if (isEventNotFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="text-center max-w-md">
          <CalendarX className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="mb-2 text-4xl font-bold">Event Not Found</h1>
          <p className="mb-6 text-muted-foreground">
            This event no longer exists. Events are automatically deleted 90 days after they occur.
          </p>
          <Link to="/" className="text-primary underline hover:text-primary/90">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
