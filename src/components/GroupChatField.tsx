import { useEffect, useRef } from "react";
import { MessagesSquare, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { normalizeUrl } from "@/lib/url";
import { detectGroupChatPlatform, groupChatAction } from "@/lib/groupChat";

export type ContactVisibility = "always" | "after_rsvp";

interface GroupChatFieldProps {
  url: string;
  onUrlChange: (value: string) => void;
  visibility: ContactVisibility;
  onVisibilityChange: (value: ContactVisibility) => void;
  idPrefix?: string;
  /** Focus the input as soon as the field appears, when it was just revealed. */
  autoFocus?: boolean;
}

/**
 * The optional group chat link, plus the choice of when guests see it.
 *
 * The host pastes an invite and nothing else: the button wording underneath is
 * derived from the address (`src/lib/groupChat.ts`), so there is no label field
 * to keep in step with the link.
 *
 * The visibility choice is two radio-style buttons rather than a switch,
 * because neither option is the "off" state and a switch would imply one was.
 * Wording avoids promising privacy the code cannot deliver: with no accounts,
 * anyone willing to reply can see a gated link, and the helper text says so.
 */
const GroupChatField = ({
  url,
  onUrlChange,
  visibility,
  onVisibilityChange,
  idPrefix = "",
  autoFocus = false,
}: GroupChatFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlId = `${idPrefix}contact_url`;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const platform = detectGroupChatPlatform(url);

  return (
    <div>
      <Label htmlFor={urlId}>
        <MessagesSquare className="mr-1.5 inline h-4 w-4" />
        Group chat link
      </Label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id={urlId}
          ref={inputRef}
          type="url"
          inputMode="url"
          placeholder="https://chat.whatsapp.com/..."
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onBlur={(e) => {
            const normalized = normalizeUrl(e.target.value);
            if (normalized !== e.target.value) onUrlChange(normalized);
          }}
        />
        {!!url && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            title="Remove link"
            aria-label="Remove group chat link"
            onClick={() => onUrlChange("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        A WhatsApp, Signal or Telegram invite, or any other link where guests can talk.
        {url && (
          <>
            {" "}
            Guests see a <span className="font-medium">{groupChatAction(url)}</span> button
            {!platform && " for it"}.
          </>
        )}
      </p>

      {!!url && (
        <fieldset className="mt-3">
          <legend className="text-xs font-sans text-muted-foreground">Who can see it</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {(
              [
                { value: "after_rsvp" as const, label: "After they reply", hint: "Shown once a guest RSVPs" },
                { value: "always" as const, label: "Anyone with the link", hint: "Shown on the event page" },
              ]
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={visibility === option.value}
                onClick={() => onVisibilityChange(option.value)}
                className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                  visibility === option.value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <span className="block font-sans text-sm">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
          {visibility === "after_rsvp" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Replying is all it takes, and nobody has to prove who they are, so treat this as a
              speed bump rather than a lock.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
};

export default GroupChatField;
