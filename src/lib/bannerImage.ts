/**
 * Banner images: crop geometry and client-side downscaling.
 *
 * A photo straight off a phone is 3–12 MB and around 4000 px wide. The banner
 * is only ever rendered into a 224–288 px tall band (`EventPage`) and reused as
 * the link-preview image, so storing the original means paying R2 for pixels
 * nobody will ever see, and making every guest download them on a phone.
 *
 * So the resize happens here, in the browser, before the upload: the host picks
 * a full-size photo and the server receives a WebP no wider than
 * `BANNER_MAX_WIDTH`. That is why the upload limit in `functions/api` can stay
 * small while hosts still pick whatever their camera produced.
 *
 * The geometry half of this module is pure and unit-tested. The canvas half
 * cannot be, since jsdom has no 2D context.
 */

/** Banner shape the crop frame targets, width ÷ height. */
export const BANNER_ASPECT = 2;

/**
 * Box the stored image is scaled to fit inside.
 *
 * 1600 px covers a full-width banner on a 2× laptop display and comfortably
 * exceeds the 1200 px that link-preview cards ask for. The height cap only
 * bites on portrait sources, which the banner band crops away anyway.
 */
export const BANNER_MAX_WIDTH = 1600;
export const BANNER_MAX_HEIGHT = 1000;

const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;
/** Second pass quality, used only if the first encode somehow lands over the cap. */
const FALLBACK_QUALITY = 0.6;

/**
 * Largest file we will decode. Not a product limit — the resize means any
 * reasonable photo is fine — just a guard so a 200 MB TIFF can't be pulled into
 * a phone browser's memory.
 */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** Mirrors `MAX_BANNER_BYTES` in `functions/api`. Keep the two in step. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Mirrors `ALLOWED_IMAGE_TYPES` in `functions/api`, for the pass-through path. */
const UPLOADABLE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A region of the source image, in source pixels. */
export interface CropRect extends Point, Size {}

export interface PreparedBanner {
  /** What gets uploaded. */
  file: File;
  /** Dimensions of `file`. */
  width: number;
  height: number;
  /** Dimensions of the picked file, which the crop UI works in. */
  source: Size;
  /** False when the picked file is being uploaded untouched. */
  processed: boolean;
}

/** An error with a message that is safe to show a host verbatim. */
export class BannerImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BannerImageError";
  }
}

/** The message for a failure, falling back to something plain for a surprise. */
export function bannerErrorMessage(error: unknown): string {
  if (error instanceof BannerImageError) return error.message;
  return "We couldn't read that image. Try a JPEG, PNG or WebP.";
}

// --- Geometry -------------------------------------------------------------

/** Scale a size down to fit inside `box`, never up, in whole pixels. */
export function fitWithin(source: Size, box: Size): Size {
  const scale = Math.min(box.width / source.width, box.height / source.height, 1);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/** The largest rect of `aspect` that fits inside `source`, i.e. zoom 1. */
export function maxCropSize(source: Size, aspect: number): Size {
  if (source.width / source.height > aspect) {
    return { width: Math.round(source.height * aspect), height: source.height };
  }
  return { width: source.width, height: Math.round(source.width / aspect) };
}

/**
 * Top-left corner for a crop of `size` centred on `centre`, pushed back inside
 * `source` if the centre would hang the rect over an edge. Panning is clamped
 * rather than rejected so a drag slides to the edge and stops there.
 */
export function clampCropOrigin(centre: Point, size: Size, source: Size): Point {
  const maxX = Math.max(0, source.width - size.width);
  const maxY = Math.max(0, source.height - size.height);
  return {
    x: Math.round(Math.min(Math.max(centre.x - size.width / 2, 0), maxX)),
    y: Math.round(Math.min(Math.max(centre.y - size.height / 2, 0), maxY)),
  };
}

/**
 * The crop rect for a pan/zoom view. Zoom 1 is the largest rect of `aspect`
 * that fits the source; 2 shows half of it, and so on.
 */
export function cropRectAt(source: Size, aspect: number, zoom: number, centre: Point): CropRect {
  const base = maxCropSize(source, aspect);
  const safeZoom = Math.max(1, zoom);
  // Height follows from the rounded width rather than being rounded separately,
  // so reopening the crop dialog reproduces the same rect instead of drifting a
  // pixel each time (see `viewFromCropRect`).
  const width = Math.max(1, Math.round(base.width / safeZoom));
  const size = { width, height: Math.max(1, Math.round(width / aspect)) };
  return { ...clampCropOrigin(centre, size, source), ...size };
}

/**
 * The crop frame's width as a share of the stage it sits in. The remainder is
 * the gutter down each side, where a photo wider than the frame shows what is
 * being cut off.
 */
export const CROP_FRAME_WIDTH_SHARE = 0.9;

/**
 * Bounds on the gutter above and below the crop frame, as a share of the frame's
 * own height. The floor keeps the frame's edge off the edge of the stage; the
 * ceiling stops a portrait photo, which overhangs by more than the frame's whole
 * height, from making the dialog taller than a phone screen.
 */
const MIN_GUTTER_SHARE = 0.04;
const MAX_GUTTER_SHARE = 0.3;

/**
 * Gutter above and below the crop frame, as a share of the frame's height.
 *
 * Sized to the photo: exactly enough to show the part that the frame will cut
 * off, so a 16:9 source gets a thin gutter and a 4:3 source a deep one, and
 * neither is surrounded by dead space. A photo already wider than the frame
 * overhangs sideways rather than vertically and gets the floor.
 *
 * `aspect / sourceAspect` is how many times taller than the frame the photo is
 * drawn at minimum zoom, which is where the halved overhang comes from.
 */
export function cropGutterShare(source: Size, aspect: number): number {
  const overhang = (Math.max(1, aspect / (source.width / source.height)) - 1) / 2;
  return Math.min(Math.max(overhang, MIN_GUTTER_SHARE), MAX_GUTTER_SHARE);
}

/**
 * Width ÷ height of the whole crop stage for a given photo.
 *
 * Derived from the source's shape alone, so the stage can be sized in CSS before
 * anything is measured, and does not change as the host zooms.
 */
export function cropStageAspect(source: Size, aspect: number): number {
  const frameHeightShare = CROP_FRAME_WIDTH_SHARE / aspect;
  return 1 / (frameHeightShare * (1 + 2 * cropGutterShare(source, aspect)));
}

/** Zoom and centre that reproduce an existing crop rect, for reopening the dialog. */
export function viewFromCropRect(
  source: Size,
  aspect: number,
  crop: CropRect,
): { zoom: number; centre: Point } {
  const base = maxCropSize(source, aspect);
  return {
    zoom: Math.max(1, base.width / crop.width),
    centre: { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 },
  };
}

/** Whether a crop rect actually trims anything worth re-encoding for. */
export function isFullFrame(crop: CropRect, source: Size): boolean {
  return (
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width === source.width &&
    crop.height === source.height
  );
}

/** Byte count in the shortest honest form: "184 KB", "1.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1000) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

// --- Encoding -------------------------------------------------------------

let webpSupport: boolean | null = null;

/**
 * Whether this browser can *encode* WebP from a canvas. Every current engine
 * can (Safari since 14), but an old one silently hands back a PNG, which would
 * be larger than the JPEG we could have written instead.
 */
function supportsWebpEncoding(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    webpSupport = probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

type DecodedImage = ImageBitmap | HTMLImageElement;

function imageSize(image: DecodedImage): Size {
  return image instanceof HTMLImageElement
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height };
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some engines refuse certain blobs here but will still render them in an
      // <img>, so fall through rather than giving up on the file.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new BannerImageError("We couldn't read that image. Try a JPEG, PNG or WebP."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function newCanvas(size: Size): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new BannerImageError("This browser can't resize images. Try a different one.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/**
 * Draw `region` of `image` into a `target`-sized canvas.
 *
 * Halving in steps first: a single drawImage() from 4000 px to 1600 px samples
 * only a few source pixels per output pixel, which aliases fine detail into
 * shimmer. Repeated halving averages the pixels it discards, so text and
 * foliage survive the trip.
 */
function drawResized(image: DecodedImage, region: CropRect, target: Size): HTMLCanvasElement {
  let source: CanvasImageSource = image;
  let { x, y, width, height } = region;

  while (width >= target.width * 2 && height >= target.height * 2) {
    const step = {
      width: Math.max(target.width, Math.round(width / 2)),
      height: Math.max(target.height, Math.round(height / 2)),
    };
    const stepCanvas = newCanvas(step);
    context2d(stepCanvas).drawImage(source, x, y, width, height, 0, 0, step.width, step.height);
    source = stepCanvas;
    x = 0;
    y = 0;
    width = step.width;
    height = step.height;
  }

  const canvas = newCanvas(target);
  context2d(canvas).drawImage(source, x, y, width, height, 0, 0, target.width, target.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === type) resolve(blob);
        else reject(new BannerImageError("We couldn't process that image. Try a JPEG or PNG."));
      },
      type,
      quality,
    );
  });
}

/** Flatten transparency onto white, since JPEG has no alpha channel. */
function flattenOntoWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flattened = newCanvas({ width: canvas.width, height: canvas.height });
  const ctx = context2d(flattened);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flattened.width, flattened.height);
  ctx.drawImage(canvas, 0, 0);
  return flattened;
}

// --- Entry point ----------------------------------------------------------

/**
 * Turn a picked file into the image to upload, optionally cropped.
 *
 * `crop` is in source pixels and comes from `cropRectAt`. Always work from the
 * original file rather than a previous result, so re-cropping doesn't stack
 * generations of lossy encoding on top of each other.
 */
export async function prepareBanner(file: File, crop?: CropRect): Promise<PreparedBanner> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new BannerImageError(`Images must be ${formatFileSize(MAX_SOURCE_BYTES)} or smaller`);
  }

  const image = await decodeImage(file);
  try {
    const source = imageSize(image);
    if (!source.width || !source.height) {
      throw new BannerImageError("We couldn't read that image. Try a JPEG, PNG or WebP.");
    }

    const region = crop && !isFullFrame(crop, source) ? crop : { x: 0, y: 0, ...source };
    const untouched = { file, ...source, source, processed: false };

    // A canvas only ever sees a GIF's first frame, so re-encoding one would
    // quietly drop the animation that was the point of choosing it. Uncropped
    // GIFs go up as they are and answer to the server's limit instead.
    if (file.type === "image/gif" && region.width === source.width && region.height === source.height) {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new BannerImageError(
          `An animated GIF has to be ${formatFileSize(MAX_UPLOAD_BYTES)} or smaller, because resizing it would drop the animation`,
        );
      }
      return untouched;
    }

    const target = fitWithin(region, { width: BANNER_MAX_WIDTH, height: BANNER_MAX_HEIGHT });
    const canvas = drawResized(image, region, target);

    const type = supportsWebpEncoding() ? "image/webp" : "image/jpeg";
    const drawn = type === "image/jpeg" ? flattenOntoWhite(canvas) : canvas;
    let blob = await toBlob(drawn, type, type === "image/webp" ? WEBP_QUALITY : JPEG_QUALITY);
    if (blob.size > MAX_UPLOAD_BYTES) {
      blob = await toBlob(drawn, type, FALLBACK_QUALITY);
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new BannerImageError("We couldn't get that image small enough. Try a different photo.");
    }

    // Re-encoding an image that is already small and well compressed can make
    // it bigger. Nothing was cropped or scaled in that case, so keep the file
    // the host actually picked.
    const scaled = target.width !== region.width || target.height !== region.height;
    const cropped = region.width !== source.width || region.height !== source.height;
    if (
      !cropped &&
      !scaled &&
      blob.size >= file.size &&
      file.size <= MAX_UPLOAD_BYTES &&
      UPLOADABLE_TYPES.includes(file.type)
    ) {
      return untouched;
    }

    const extension = type === "image/webp" ? "webp" : "jpg";
    return {
      file: new File([blob], `banner.${extension}`, { type }),
      width: target.width,
      height: target.height,
      source,
      processed: true,
    };
  } finally {
    if (!(image instanceof HTMLImageElement)) image.close();
  }
}
