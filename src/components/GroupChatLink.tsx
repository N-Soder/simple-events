import { ExternalLink, MessagesSquare } from "lucide-react";
import { isSafeHttpUrl } from "@/lib/url";
import { groupChatAction } from "@/lib/groupChat";

interface GroupChatLinkProps {
  url: string | null | undefined;
  /** "button" for the RSVP success moment, "inline" inside an existing card. */
  variant?: "button" | "inline";
  className?: string;
}

/**
 * The guest-facing group chat link.
 *
 * Only ever rendered when the stored value is a plain http(s) address, the same
 * rule the location link follows: the server validates on write, and this
 * checks again on read rather than trusting stored data.
 */
const GroupChatLink = ({ url, variant = "button", className = "" }: GroupChatLinkProps) => {
  if (!isSafeHttpUrl(url)) return null;

  const label = groupChatAction(url);
  const base =
    variant === "button"
      ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-sans transition-colors hover:bg-muted"
      : "inline-flex min-h-11 items-center gap-2.5 rounded-md bg-muted/55 px-3.5 text-sm underline decoration-dotted underline-offset-2 transition-colors hover:bg-muted hover:text-foreground";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${className}`.trim()}
    >
      <MessagesSquare className="h-4 w-4 shrink-0" />
      {label}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
};

export default GroupChatLink;
