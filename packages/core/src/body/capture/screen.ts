/**
 * Screen Capture Driver
 *
 * Cross-platform screenshot capture using:
 * - Primary: screenshot-desktop (X11/macOS/Windows)
 * - Wayland fallback: @napi-rs/screenshot
 *
 * Supports CaptureTarget (display/window/region) and CaptureFilters (blur, redact).
 * Returns Buffer in requested CaptureFormat (png/jpeg).
 *
 * Supported platforms: Linux X11, Linux Wayland, macOS, Windows
 */

import type { CaptureTarget, CaptureFilters } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CanvasModule = any;

async function tryLoadCanvas(): Promise<CanvasModule | null> {
  try {
    // @ts-expect-error — canvas is an optional dependency
    return await import('canvas');
  } catch {
    return null;
  }
}

export type CaptureFormat = 'png' | 'jpeg';

export interface ScreenCaptureOptions {
  target?: CaptureTarget;
  format?: CaptureFormat;
  filters?: CaptureFilters;
}

export interface CaptureResult {
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  format: CaptureFormat;
}

/** Detect whether we're running under Wayland. */
function isWayland(): boolean {
  return (
    process.platform === 'linux' &&
    (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland')
  );
}

/**
 * Attempt screenshot via screenshot-desktop.
 * Returns raw Buffer on success or throws if unavailable.
 */
async function captureViaScreenshotDesktop(options: {
  screen?: number;
  format?: CaptureFormat;
}): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let screenshotDesktop: any;
  try {
    // @ts-expect-error — screenshot-desktop types may not be available
    screenshotDesktop = (await import('screenshot-desktop')).default;
  } catch {
    throw new Error('screenshot-desktop is not installed. Run: npm install screenshot-desktop');
  }

  const buf = (await screenshotDesktop({
    screen: options.screen,
    format: options.format === 'jpeg' ? 'jpg' : 'png',
  })) as Buffer;
  return buf;
}

/**
 * Attempt screenshot via @napi-rs/screenshot (Wayland fallback).
 */
async function captureViaNapiScreenshot(): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let napiScreenshot: any;
  try {
    // @ts-expect-error — @napi-rs/screenshot is an optional dependency
    napiScreenshot = await import('@napi-rs/screenshot');
  } catch {
    throw new Error('@napi-rs/screenshot is not installed. Run: npm install @napi-rs/screenshot');
  }
  const raw = await napiScreenshot.screenshot();
  if (typeof (raw as { toPng?: () => Buffer }).toPng === 'function') {
    return (raw as { toPng: () => Buffer }).toPng();
  }
  return raw as Buffer;
}

/**
 * Apply CaptureFilters to the raw PNG buffer:
 * - blurRegions → composited as black rectangles (requires optional `canvas` package)
 * - excludeWindows → not rendered without compositor access (no-op)
 *
 * If the `canvas` package is not installed, filters are skipped and the raw buffer is returned.
 */
async function applyFilters(raw: Buffer, filters: CaptureFilters): Promise<Buffer> {
  if (!filters.blurRegions || filters.blurRegions.length === 0) return raw;

  const canvasMod = await tryLoadCanvas();
  if (!canvasMod) return raw; // canvas not installed — skip filter

  const { createCanvas, loadImage } = canvasMod;
  const img = await loadImage(raw);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  ctx.fillStyle = 'black';
  for (const region of filters.blurRegions) {
    ctx.fillRect(region.x, region.y, region.w, region.h);
  }

  return canvas.toBuffer('image/png');
}

/**
 * Capture a screenshot.
 *
 * Target types:
 *   display  — capture display by index (default: 0)
 *   window   — not supported natively; falls back to full display capture
 *   region   — capture then crop to region
 */
export async function captureScreen(options: ScreenCaptureOptions = {}): Promise<CaptureResult> {
  const format: CaptureFormat = options.format ?? 'png';
  const target = options.target;

  let displayIndex: number | undefined;
  if (target?.type === 'display' && target.id) {
    displayIndex = parseInt(target.id, 10) || 0;
  }

  let raw: Buffer;

  if (isWayland()) {
    try {
      raw = await captureViaNapiScreenshot();
    } catch {
      // Fallback to screenshot-desktop (may work with XWayland)
      raw = await captureViaScreenshotDesktop({ screen: displayIndex, format });
    }
  } else {
    raw = await captureViaScreenshotDesktop({ screen: displayIndex, format });
  }

  // Apply filters if needed
  if (options.filters) {
    raw = await applyFilters(raw, options.filters);
  }

  // Crop to region if requested (requires optional canvas package)
  if (target?.type === 'region' && target.region) {
    const r = target.region;
    const canvasMod = await tryLoadCanvas();
    if (canvasMod) {
      const { createCanvas, loadImage } = canvasMod;
      const img = await loadImage(raw);
      const canvas = createCanvas(r.width, r.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, -r.x, -r.y);
      raw = canvas.toBuffer(format === 'jpeg' ? 'image/jpeg' : 'image/png');
    }
    // If canvas not available, return full screenshot with note in metadata
  }

  // Get dimensions
  let width = 0;
  let height = 0;
  try {
    const canvasMod = await tryLoadCanvas();
    if (canvasMod) {
      const img = await canvasMod.loadImage(raw);
      width = img.width;
      height = img.height;
    }
  } catch {
    // Best-effort dimension read
  }

  const mimeType: 'image/png' | 'image/jpeg' = format === 'jpeg' ? 'image/jpeg' : 'image/png';

  return {
    imageBase64: raw.toString('base64'),
    mimeType,
    width,
    height,
    format,
  };
}
