import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  BANNER_ASPECT,
  cropRectAt,
  maxCropSize,
  viewFromCropRect,
  type CropRect,
  type Point,
  type Size,
} from "@/lib/bannerImage";

const MAX_ZOOM = 4;
/** Arrow-key nudge, as a share of the visible crop. Keyboard panning needs to
 *  be usable without being so coarse that it overshoots the subject. */
const NUDGE_FRACTION = 0.04;

interface BannerCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Object URL for the *original* file, so repeated crops don't compound loss. */
  imageUrl: string;
  /** Dimensions of the original file. All crop maths is in these pixels. */
  source: Size;
  /** Existing crop, when reopening to adjust one. */
  crop: CropRect | null;
  onApply: (crop: CropRect | null) => void;
}

/**
 * Pan-and-zoom crop for the banner.
 *
 * The event page renders a banner into a fixed-height band with `object-cover`,
 * and that band's shape swings from about 1.7:1 on a phone to 5:1 on a wide
 * desktop, so no single crop can be pixel-faithful everywhere. What the host
 * needs is control over *what the banner is about* — their faces, not the empty
 * sky above them — so the frame is fixed at `BANNER_ASPECT` and the copy is
 * honest that the very edges may be trimmed.
 *
 * Zoom 1 always fills the frame, and panning is clamped, so it is impossible to
 * produce a crop with a blank strip down one side.
 */
const BannerCropDialog = ({
  open,
  onOpenChange,
  imageUrl,
  source,
  crop,
  onApply,
}: BannerCropDialogProps) => {
  const [frameWidth, setFrameWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState<Point>({ x: source.width / 2, y: source.height / 2 });

  // Live pointers, keyed by pointerId: one is a drag, two are a pinch.
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setCentre({ x: source.width / 2, y: source.height / 2 });
  }, [source.height, source.width]);

  // Adopt the existing crop each time the dialog opens, so "Cancel" followed by
  // a second visit doesn't quietly start from a different place than it showed.
  useEffect(() => {
    if (!open) return;
    if (crop) {
      const view = viewFromCropRect(source, BANNER_ASPECT, crop);
      setZoom(Math.min(view.zoom, MAX_ZOOM));
      setCentre(view.centre);
    } else {
      reset();
    }
  }, [open, crop, source, reset]);

  /**
   * The image is positioned in frame pixels, so the frame's width has to be
   * measured rather than assumed: the dialog is narrower on a phone than on a
   * laptop, and it can be resized while open.
   *
   * Measuring happens in a ref callback rather than an effect keyed on `open`,
   * because the dialog's content is mounted by Radix in a later commit than the
   * one that flips `open` — an effect here would run while the frame is still
   * unmounted and measure nothing.
   */
  const observer = useRef<ResizeObserver | null>(null);
  const attachFrame = useCallback((frame: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!frame) {
      setFrameWidth(0);
      return;
    }
    setFrameWidth(frame.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.current.observe(frame);
  }, []);

  const rect = cropRectAt(source, BANNER_ASPECT, zoom, centre);
  // One frame pixel is this many source pixels, which converts a drag in screen
  // space into a move in image space.
  const scale = frameWidth > 0 ? frameWidth / rect.width : 0;

  const panBy = (dxSource: number, dySource: number) => {
    setCentre((current) => ({ x: current.x + dxSource, y: current.y + dySource }));
  };

  const distanceBetweenPointers = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinchStart.current = { distance: distanceBetweenPointers(), zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous || scale === 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const ratio = distanceBetweenPointers() / pinchStart.current.distance;
      setZoom(Math.min(Math.max(pinchStart.current.zoom * ratio, 1), MAX_ZOOM));
      return;
    }

    // Dragging moves the picture with the finger, so the crop window travels
    // the other way.
    panBy(-(e.clientX - previous.x) / scale, -(e.clientY - previous.y) / scale);
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const stepX = rect.width * NUDGE_FRACTION;
    const stepY = rect.height * NUDGE_FRACTION;
    switch (e.key) {
      case "ArrowLeft": panBy(-stepX, 0); break;
      case "ArrowRight": panBy(stepX, 0); break;
      case "ArrowUp": panBy(0, -stepY); break;
      case "ArrowDown": panBy(0, stepY); break;
      case "+": case "=": setZoom((z) => Math.min(z + 0.25, MAX_ZOOM)); break;
      case "-": case "_": setZoom((z) => Math.max(z - 0.25, 1)); break;
      default: return;
    }
    e.preventDefault();
  };

  const apply = () => {
    const full = maxCropSize(source, BANNER_ASPECT);
    // At zoom 1 on an already-2:1 photo there is nothing to crop, so keep the
    // banner marked as uncropped and let the whole picture through.
    const unchanged = zoom === 1 && full.width === source.width && full.height === source.height;
    onApply(unchanged ? null : cropRectAt(source, BANNER_ASPECT, zoom, centre));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Crop banner</DialogTitle>
          <DialogDescription>
            Drag to reposition, zoom to fill. Guests always see the middle of the frame; the
            very edges can be trimmed on narrow or very wide screens.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={attachFrame}
          role="group"
          aria-label="Banner crop area. Drag to reposition, or use the arrow keys."
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onKeyDown={onKeyDown}
          className="relative aspect-[2/1] w-full cursor-grab touch-none select-none overflow-hidden rounded-lg bg-muted active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {scale > 0 && (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="absolute left-0 top-0 max-w-none origin-top-left"
              style={{
                width: source.width * scale,
                height: source.height * scale,
                transform: `translate(${-rect.x * scale}px, ${-rect.y * scale}px)`,
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <Minus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Slider
            value={[zoom]}
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            onValueChange={([value]) => setZoom(value)}
            aria-label="Zoom"
          />
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={reset} className="sm:mr-auto">
            Reset
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Save crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BannerCropDialog;
