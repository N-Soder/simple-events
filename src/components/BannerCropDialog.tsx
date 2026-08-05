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
  CROP_FRAME_WIDTH_SHARE,
  cropGutterShare,
  cropRectAt,
  cropStageAspect,
  maxCropSize,
  viewFromCropRect,
  type CropRect,
  type Point,
  type Size,
} from "@/lib/bannerImage";

const MAX_ZOOM = 4;

/** Arrow-key nudge, as a share of the visible crop. */
const NUDGE_FRACTION = 0.04;
/** Wheel delta to zoom factor. One notch of a mouse wheel is about 14%. */
const WHEEL_SENSITIVITY = 0.0015;

const clampZoom = (zoom: number) => Math.min(Math.max(zoom, 1), MAX_ZOOM);

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
 * The photo is drawn whole and the part that will be discarded is dimmed rather
 * than hidden, so a host can see what they are giving up instead of choosing a
 * crop blind. Both the stage and the frame inside it are a fixed size at every
 * zoom level: nothing in the layout moves, only what sits in the gutters.
 *
 * The frame is fixed at `BANNER_ASPECT` rather than resizable, because the ratio
 * is not the host's to choose and a locked-ratio marquee is a zoom control with
 * worse ergonomics — corner handles are a poor target for a thumb. Dragging the
 * picture is the gesture people already have from their phone's photo editor.
 *
 * It is deliberately not WYSIWYG: the event page renders a banner into a band
 * whose shape runs from about 1.7:1 on a phone to over 5:1 on a wide desktop, so
 * no crop is faithful everywhere. Zoom 1 always covers the frame and panning is
 * clamped, so it is impossible to produce a banner with a blank strip down one
 * side.
 */
const BannerCropDialog = ({
  open,
  onOpenChange,
  imageUrl,
  source,
  crop,
  onApply,
}: BannerCropDialogProps) => {
  const [stageWidth, setStageWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState<Point>({ x: source.width / 2, y: source.height / 2 });
  const [dragging, setDragging] = useState(false);

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
      setZoom(clampZoom(view.zoom));
      setCentre(view.centre);
    } else {
      reset();
    }
  }, [open, crop, source, reset]);

  /**
   * Zooming with the wheel needs a non-passive listener, which the `onWheel`
   * prop cannot give us: React registers wheel passively at the root, so
   * `preventDefault()` there is ignored and the page scrolls instead.
   */
  const onWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    setZoom((current) => clampZoom(current * Math.exp(-event.deltaY * WHEEL_SENSITIVITY)));
  }, []);

  /**
   * The image is positioned in stage pixels, so the stage has to be measured
   * rather than assumed: the dialog is narrower on a phone than on a laptop, and
   * it can be resized while open.
   *
   * Measuring happens in a ref callback rather than an effect keyed on `open`,
   * because the dialog's content is mounted by Radix in a later commit than the
   * one that flips `open` — an effect here would run while the stage is still
   * unmounted and measure nothing.
   */
  const stage = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const attachStage = useCallback(
    (node: HTMLDivElement | null) => {
      stage.current?.removeEventListener("wheel", onWheel);
      observer.current?.disconnect();
      observer.current = null;
      stage.current = node;
      if (!node) {
        setStageWidth(0);
        return;
      }
      setStageWidth(node.clientWidth);
      node.addEventListener("wheel", onWheel, { passive: false });
      if (typeof ResizeObserver === "undefined") return;
      observer.current = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
      observer.current.observe(node);
    },
    [onWheel],
  );

  // The stage is shaped to the photo (see `cropStageAspect`), so the gutters hold
  // the part being cut off rather than empty space. Both are fixed for as long as
  // the dialog is open: zooming changes what sits in the gutters, never the size
  // of anything.
  const frameWidth = stageWidth * CROP_FRAME_WIDTH_SHARE;
  const frameHeight = frameWidth / BANNER_ASPECT;
  const gutterX = (stageWidth - frameWidth) / 2;
  const gutterY = frameHeight * cropGutterShare(source, BANNER_ASPECT);

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
    setDragging(true);
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
      setZoom(clampZoom(pinchStart.current.zoom * ratio));
      return;
    }

    // Dragging moves the picture with the finger, so the crop window travels
    // the other way.
    panBy(-(e.clientX - previous.x) / scale, -(e.clientY - previous.y) / scale);
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const stepX = rect.width * NUDGE_FRACTION;
    const stepY = rect.height * NUDGE_FRACTION;
    switch (e.key) {
      case "ArrowLeft": panBy(-stepX, 0); break;
      case "ArrowRight": panBy(stepX, 0); break;
      case "ArrowUp": panBy(0, -stepY); break;
      case "ArrowDown": panBy(0, stepY); break;
      case "+": case "=": setZoom((z) => clampZoom(z + 0.25)); break;
      case "-": case "_": setZoom((z) => clampZoom(z - 0.25)); break;
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
            Drag to reposition the image. Areas near the edge may not be visible on all devices.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={attachStage}
          role="group"
          aria-label="Banner crop area. Drag to reposition, arrow keys to nudge, plus and minus to zoom."
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onKeyDown={onKeyDown}
          style={{ aspectRatio: cropStageAspect(source, BANNER_ASPECT) }}
          className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-lg bg-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {scale > 0 && (
            <>
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                className="absolute left-0 top-0 max-w-none origin-top-left"
                style={{
                  width: source.width * scale,
                  height: source.height * scale,
                  transform: `translate(${gutterX - rect.x * scale}px, ${gutterY - rect.y * scale}px)`,
                }}
              />
              {/*
                One element does the dimming: an outsized spread shadow paints
                everything around the frame, and the stage clips it. A hole in a
                scrim reads faster than four rectangles and can never misalign.
              */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/70"
                style={{
                  left: gutterX,
                  top: gutterY,
                  width: frameWidth,
                  height: frameHeight,
                }}
              >
                {/* Thirds guide, while the photo is actually being moved. */}
                <div
                  className={`absolute inset-0 transition-opacity duration-150 ${
                    dragging ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
                </div>
              </div>
            </>
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
