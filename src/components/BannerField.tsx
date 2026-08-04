import { useEffect, useRef, useState } from "react";
import { Crop, Info, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import BannerCropDialog from "@/components/BannerCropDialog";
import {
  bannerErrorMessage,
  formatFileSize,
  prepareBanner,
  type CropRect,
  type PreparedBanner,
} from "@/lib/bannerImage";

interface BannerFieldProps {
  /** The file to upload, or null once the host clears it. */
  onChange: (file: File | null) => void;
}

interface Picked {
  /** Kept so every crop re-encodes from the original, not from a previous crop. */
  original: File;
  crop: CropRect | null;
  prepared: PreparedBanner;
}

/** "image/webp" as a reader would write it. */
function formatLabel(type: string): string {
  const names: Record<string, string> = {
    "image/webp": "WebP",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/gif": "GIF",
    "image/avif": "AVIF",
  };
  return names[type] ?? type.replace("image/", "").toUpperCase();
}

/**
 * Banner picker: choose a photo, see what will be stored, optionally crop it.
 *
 * The resize happens the moment a file is picked rather than at submit, so the
 * host sees the real result while they can still change their mind, and so the
 * slowest part of creating an event isn't hidden behind the Create button. See
 * `src/lib/bannerImage.ts` for why the browser does this work at all.
 */
const BannerField = ({ onChange }: BannerFieldProps) => {
  const { toast } = useToast();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Two object URLs with separate lifetimes: the preview shows the processed
  // image, while the crop dialog works from the original.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  // Each cleanup revokes the URL the render before it created, which covers
  // both replacing a photo and leaving the page mid-edit.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
  }, [originalUrl]);

  // Which file `originalUrl` points at, so re-cropping reuses it instead of
  // minting an equivalent URL each time.
  const urlSource = useRef<File | null>(null);

  const clear = () => {
    setPicked(null);
    setPreviewUrl(null);
    setOriginalUrl(null);
    urlSource.current = null;
    onChange(null);
    // Let the same file be picked again after removing it.
    if (inputRef.current) inputRef.current.value = "";
  };

  const process = async (original: File, crop: CropRect | null) => {
    setBusy(true);
    try {
      const prepared = await prepareBanner(original, crop ?? undefined);
      setPicked({ original, crop, prepared });
      setPreviewUrl(URL.createObjectURL(prepared.file));
      // Only once the file is known to be usable, so a photo this browser can't
      // decode doesn't leave the crop dialog pointing at it.
      if (urlSource.current !== original) {
        urlSource.current = original;
        setOriginalUrl(URL.createObjectURL(original));
      }
      onChange(prepared.file);
    } catch (error) {
      toast({
        title: "Couldn't use that image",
        description: bannerErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Couldn't use that file",
        description: "A banner has to be an image. Try a JPEG, PNG or WebP.",
        variant: "destructive",
      });
      return;
    }
    void process(file, null);
  };

  /**
   * What was actually stored, for the details popover.
   *
   * Measurements are behind a button rather than under the photo because a host
   * setting up a barbecue does not need a file size in their eyeline. It is kept
   * available, though: it is the only place the resize is visible, and someone
   * wondering why their photo looks softer than the original deserves an answer.
   */
  const details = ({ prepared, crop }: Picked): { measurements: string; note: string } => {
    const measurements = `${prepared.width} × ${prepared.height} · ${formatLabel(
      prepared.file.type,
    )} · ${formatFileSize(prepared.file.size)}`;
    const from = `${prepared.source.width} × ${prepared.source.height}`;
    if (prepared.file.type === "image/gif") {
      return { measurements, note: "A GIF is uploaded as it is, so any animation survives." };
    }
    if (!prepared.processed) {
      return { measurements, note: "Already small enough to upload as it is." };
    }
    if (crop) {
      return { measurements, note: `Cropped from ${from} in your browser, so guests download less.` };
    }
    const shrank =
      prepared.width !== prepared.source.width || prepared.height !== prepared.source.height;
    return {
      measurements,
      note: shrank
        ? `Resized from ${from} in your browser, so guests download less.`
        : "Kept at its original size.",
    };
  };

  const canCrop = !!picked && !!originalUrl && picked.original.type !== "image/gif";
  const info = picked && details(picked);

  return (
    <div>
      <div className="flex items-center gap-1">
        <Label>Banner photo (optional)</Label>
        {info && (
          <Popover>
            <PopoverTrigger
              className="-my-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="About this image"
            >
              <Info className="h-3.5 w-3.5" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto max-w-xs p-3">
              <p className="text-xs font-medium">{info.measurements}</p>
              <p className="mt-1 text-xs text-muted-foreground">{info.note}</p>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="mt-2">
        {picked && previewUrl ? (
          <div>
            <div className="relative">
              <img
                src={previewUrl}
                alt="Banner preview"
                className="aspect-[2/1] w-full rounded-lg object-cover"
              />
              <div className="absolute right-2 top-2 flex gap-2">
                {canCrop && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => setCropOpen(true)}
                  >
                    <Crop className="h-4 w-4" />
                    Crop
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label="Remove banner photo"
                  disabled={busy}
                  onClick={clear}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">Preparing image</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/50 px-4 text-center transition-colors hover:bg-muted ${
              dragging ? "border-primary bg-muted" : "border-border"
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="mb-2 h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">Preparing image...</span>
              </>
            ) : (
              <>
                <Upload className="mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">Click to upload, or drop a photo here</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  Any size. It's resized in your browser before it's uploaded
                </span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              aria-label="Banner photo"
              className="hidden"
              disabled={busy}
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {picked && originalUrl && (
        <BannerCropDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          imageUrl={originalUrl}
          source={picked.prepared.source}
          crop={picked.crop}
          onApply={(crop) => void process(picked.original, crop)}
        />
      )}
    </div>
  );
};

export default BannerField;
