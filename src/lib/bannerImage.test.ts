import { describe, it, expect } from "vitest";
import {
  BANNER_ASPECT,
  clampCropOrigin,
  cropRectAt,
  fitWithin,
  formatFileSize,
  isFullFrame,
  maxCropSize,
  viewFromCropRect,
} from "./bannerImage";

const PHONE_PHOTO = { width: 4032, height: 3024 };

describe("fitWithin", () => {
  it("scales a large photo down to the box", () => {
    expect(fitWithin(PHONE_PHOTO, { width: 1600, height: 1000 })).toEqual({ width: 1333, height: 1000 });
  });

  it("respects the width cap on a wide crop", () => {
    expect(fitWithin({ width: 4032, height: 2016 }, { width: 1600, height: 1000 })).toEqual({
      width: 1600,
      height: 800,
    });
  });

  it("never upscales a small image", () => {
    expect(fitWithin({ width: 800, height: 400 }, { width: 1600, height: 1000 })).toEqual({
      width: 800,
      height: 400,
    });
  });

  it("keeps at least one pixel in each direction", () => {
    expect(fitWithin({ width: 1, height: 1 }, { width: 1600, height: 1000 })).toEqual({ width: 1, height: 1 });
  });
});

describe("maxCropSize", () => {
  it("is limited by height on a landscape photo", () => {
    expect(maxCropSize(PHONE_PHOTO, BANNER_ASPECT)).toEqual({ width: 4032, height: 2016 });
  });

  it("is limited by width on a portrait photo", () => {
    expect(maxCropSize({ width: 3024, height: 4032 }, BANNER_ASPECT)).toEqual({ width: 3024, height: 1512 });
  });

  it("is the whole image when the shape already matches", () => {
    expect(maxCropSize({ width: 1600, height: 800 }, BANNER_ASPECT)).toEqual({ width: 1600, height: 800 });
  });
});

describe("clampCropOrigin", () => {
  const size = { width: 1000, height: 500 };

  it("centres the crop when there is room", () => {
    expect(clampCropOrigin({ x: 2000, y: 1500 }, size, PHONE_PHOTO)).toEqual({ x: 1500, y: 1250 });
  });

  it("stops at the left and top edges", () => {
    expect(clampCropOrigin({ x: 0, y: 0 }, size, PHONE_PHOTO)).toEqual({ x: 0, y: 0 });
  });

  it("stops at the right and bottom edges", () => {
    expect(clampCropOrigin({ x: 99999, y: 99999 }, size, PHONE_PHOTO)).toEqual({ x: 3032, y: 2524 });
  });

  it("pins a crop that is larger than the source to the origin", () => {
    expect(clampCropOrigin({ x: 50, y: 50 }, { width: 5000, height: 5000 }, PHONE_PHOTO)).toEqual({ x: 0, y: 0 });
  });
});

describe("cropRectAt", () => {
  const centre = { x: PHONE_PHOTO.width / 2, y: PHONE_PHOTO.height / 2 };

  it("fills the frame at zoom 1", () => {
    const rect = cropRectAt(PHONE_PHOTO, BANNER_ASPECT, 1, centre);
    expect(rect).toEqual({ x: 0, y: 504, width: 4032, height: 2016 });
    expect(rect.width / rect.height).toBeCloseTo(BANNER_ASPECT, 5);
  });

  it("halves the visible area at zoom 2", () => {
    const rect = cropRectAt(PHONE_PHOTO, BANNER_ASPECT, 2, centre);
    expect(rect).toEqual({ x: 1008, y: 1008, width: 2016, height: 1008 });
  });

  it("keeps the rect inside the image when panned past an edge", () => {
    const rect = cropRectAt(PHONE_PHOTO, BANNER_ASPECT, 2, { x: -5000, y: -5000 });
    expect(rect).toEqual({ x: 0, y: 0, width: 2016, height: 1008 });
  });

  it("treats a zoom below 1 as 1, so the frame is never underfilled", () => {
    expect(cropRectAt(PHONE_PHOTO, BANNER_ASPECT, 0.2, centre)).toEqual(
      cropRectAt(PHONE_PHOTO, BANNER_ASPECT, 1, centre),
    );
  });
});

describe("viewFromCropRect", () => {
  it("round-trips a crop back into the zoom and centre that made it", () => {
    const centre = { x: 1500, y: 1200 };
    const rect = cropRectAt(PHONE_PHOTO, BANNER_ASPECT, 2.5, centre);
    const view = viewFromCropRect(PHONE_PHOTO, BANNER_ASPECT, rect);
    expect(view.zoom).toBeCloseTo(2.5, 2);
    expect(cropRectAt(PHONE_PHOTO, BANNER_ASPECT, view.zoom, view.centre)).toEqual(rect);
  });
});

describe("isFullFrame", () => {
  it("spots a crop that trims nothing", () => {
    expect(isFullFrame({ x: 0, y: 0, ...PHONE_PHOTO }, PHONE_PHOTO)).toBe(true);
  });

  it("spots a crop that trims something", () => {
    expect(isFullFrame({ x: 0, y: 504, width: 4032, height: 2016 }, PHONE_PHOTO)).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("uses bytes, kilobytes and megabytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(188_416)).toBe("184 KB");
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
    expect(formatFileSize(26_214_400)).toBe("25 MB");
  });
});
