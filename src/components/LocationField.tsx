import { useEffect, useRef, useState } from "react";
import { Link2, MapPin, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { displayHost, looksLikeUrl, normalizeUrl } from "@/lib/url";

interface LocationFieldProps {
  location: string;
  onLocationChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  idPrefix?: string;
}

/**
 * Address field with an optional link tucked behind it.
 *
 * Most events are "John's backyard" and need no link at all, so the second
 * field stays out of the way until it is asked for. Two things reveal it: a
 * quiet "Add a link" once an address exists, and a prompt when the address
 * itself looks like a pasted URL, which is how people actually try to attach a
 * map pin.
 */
const LocationField = ({
  location,
  onLocationChange,
  url,
  onUrlChange,
  idPrefix = "",
}: LocationFieldProps) => {
  const [showUrl, setShowUrl] = useState(!!url);
  const urlRef = useRef<HTMLInputElement>(null);
  const shouldFocusUrl = useRef(false);

  const locationId = `${idPrefix}location`;
  const urlId = `${idPrefix}location_url`;

  // Keep the field open when an existing link loads in from the server.
  useEffect(() => {
    if (url) setShowUrl(true);
  }, [url]);

  useEffect(() => {
    if (shouldFocusUrl.current && showUrl) {
      shouldFocusUrl.current = false;
      urlRef.current?.focus();
    }
  }, [showUrl]);

  const reveal = () => {
    shouldFocusUrl.current = true;
    setShowUrl(true);
  };

  /** Move a URL that was typed into the address box into the link field. */
  const promoteToLink = () => {
    onUrlChange(normalizeUrl(location));
    onLocationChange("");
    setShowUrl(true);
  };

  const pastedUrlInAddress = looksLikeUrl(location);

  return (
    <div>
      <Label htmlFor={locationId}>
        <MapPin className="mr-1.5 inline h-4 w-4" />
        Location
      </Label>
      <Input
        id={locationId}
        placeholder="123 Main St or 'John's backyard'"
        value={location}
        onChange={(e) => onLocationChange(e.target.value)}
        className="mt-1.5"
      />

      {pastedUrlInAddress && !url && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          That looks like a link.{" "}
          <button
            type="button"
            onClick={promoteToLink}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Use it as the location link instead?
          </button>
        </p>
      )}

      {!showUrl && !!location && !pastedUrlInAddress && (
        <button
          type="button"
          onClick={reveal}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
        >
          <Link2 className="h-3 w-3" />
          Add a link
        </button>
      )}

      {showUrl && (
        <div className="mt-2">
          <Label htmlFor={urlId} className="text-xs text-muted-foreground">
            Link (optional)
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id={urlId}
              ref={urlRef}
              type="url"
              inputMode="url"
              placeholder="https://maps.app.goo.gl/..."
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onBlur={(e) => {
                const normalized = normalizeUrl(e.target.value);
                if (normalized !== e.target.value) onUrlChange(normalized);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              title="Remove link"
              aria-label="Remove location link"
              onClick={() => {
                onUrlChange("");
                setShowUrl(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            A map pin, venue page, or meeting link. Guests see{" "}
            {url ? <span className="font-medium">{displayHost(url)}</span> : "the address"} as a link.
          </p>
        </div>
      )}
    </div>
  );
};

export default LocationField;
