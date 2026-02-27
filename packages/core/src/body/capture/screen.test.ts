/**
 * Screen Capture Driver Tests
 *
 * Tests captureScreen() by mocking the optional dynamic imports
 * (screenshot-desktop, @napi-rs/screenshot, canvas).
 * No screenshot libraries required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// We mock the dynamic imports used by screen.ts
// screenshot-desktop: primary capture
const screenshotDesktopFn = vi.fn();

vi.mock('screenshot-desktop', () => ({
  default: screenshotDesktopFn,
}));

// canvas: optional for filters/crop/dimensions
const mockLoadImage = vi.fn();
const mockCreateCanvas = vi.fn();
const mockGetContext = vi.fn();
const mockDrawImage = vi.fn();
const mockFillRect = vi.fn();
const mockToBuffer = vi.fn();

vi.mock('canvas', () => ({
  loadImage: mockLoadImage,
  createCanvas: mockCreateCanvas,
}));

// @napi-rs/screenshot: Wayland fallback
const napiScreenshotFn = vi.fn();
vi.mock('@napi-rs/screenshot', () => ({
  screenshot: napiScreenshotFn,
}));

// Import after mocks
const { captureScreen } = await import('./screen.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_BUF = Buffer.from('fake-screenshot-data');
const FAKE_B64 = FAKE_BUF.toString('base64');

function setupCanvasMock(width = 1920, height = 1080) {
  const ctx = {
    drawImage: mockDrawImage,
    fillRect: mockFillRect,
    fillStyle: '',
  };
  mockGetContext.mockReturnValue(ctx);
  const canvas = {
    getContext: mockGetContext,
    toBuffer: mockToBuffer,
  };
  mockCreateCanvas.mockReturnValue(canvas);
  mockLoadImage.mockResolvedValue({ width, height });
  mockToBuffer.mockReturnValue(FAKE_BUF);
}

beforeEach(() => {
  vi.clearAllMocks();
  screenshotDesktopFn.mockResolvedValue(FAKE_BUF);
  napiScreenshotFn.mockResolvedValue(FAKE_BUF);
  setupCanvasMock();

  // Ensure non-Wayland environment
  delete process.env.WAYLAND_DISPLAY;
  delete process.env.XDG_SESSION_TYPE;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('captureScreen() — basic capture', () => {
  it('returns base64-encoded PNG by default', async () => {
    const result = await captureScreen();
    expect(result.imageBase64).toBe(FAKE_B64);
    expect(result.mimeType).toBe('image/png');
    expect(result.format).toBe('png');
  });

  it('returns JPEG when format=jpeg', async () => {
    const result = await captureScreen({ format: 'jpeg' });
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.format).toBe('jpeg');
  });

  it('returns width and height from canvas.loadImage', async () => {
    setupCanvasMock(2560, 1440);
    const result = await captureScreen();
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1440);
  });

  it('returns 0x0 dimensions when canvas is unavailable', async () => {
    vi.mocked(mockLoadImage).mockRejectedValueOnce(new Error('no canvas'));
    const result = await captureScreen();
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe('captureScreen() — display target', () => {
  it('passes display index to screenshotDesktop when target.type=display', async () => {
    await captureScreen({ target: { type: 'display', id: '2' } });
    expect(screenshotDesktopFn).toHaveBeenCalledWith(expect.objectContaining({ screen: 2 }));
  });

  it('defaults to display 0 when target.id is not a valid number', async () => {
    await captureScreen({ target: { type: 'display', id: 'nan' } });
    expect(screenshotDesktopFn).toHaveBeenCalledWith(expect.objectContaining({ screen: 0 }));
  });
});

describe('captureScreen() — Wayland', () => {
  beforeEach(() => {
    process.env.WAYLAND_DISPLAY = ':1';
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  afterEach(() => {
    delete process.env.WAYLAND_DISPLAY;
  });

  it('uses napi-rs screenshot on Wayland', async () => {
    const result = await captureScreen();
    expect(napiScreenshotFn).toHaveBeenCalledOnce();
    expect(result.imageBase64).toBe(FAKE_B64);
  });

  it('falls back to screenshot-desktop when napi-rs fails', async () => {
    napiScreenshotFn.mockRejectedValueOnce(new Error('napi unavailable'));
    const result = await captureScreen();
    expect(screenshotDesktopFn).toHaveBeenCalledOnce();
    expect(result.imageBase64).toBe(FAKE_B64);
  });

  it('calls toPng when raw has toPng method', async () => {
    const pngBuf = Buffer.from('png-data');
    napiScreenshotFn.mockResolvedValueOnce({
      toPng: vi.fn().mockReturnValue(pngBuf),
    });
    const result = await captureScreen();
    expect(result.imageBase64).toBe(pngBuf.toString('base64'));
  });
});

describe('captureScreen() — filters', () => {
  it('applies blur regions using canvas', async () => {
    await captureScreen({
      filters: { blurRegions: [{ x: 0, y: 0, w: 100, h: 50 }] },
    });
    expect(mockFillRect).toHaveBeenCalledWith(0, 0, 100, 50);
  });

  it('skips blur when blurRegions is empty', async () => {
    const result = await captureScreen({ filters: { blurRegions: [] } });
    expect(mockFillRect).not.toHaveBeenCalled();
    expect(result.imageBase64).toBe(FAKE_B64);
  });
});

describe('captureScreen() — region crop', () => {
  it('crops to region when target.type=region and canvas is available', async () => {
    const croppedBuf = Buffer.from('cropped-data');
    mockToBuffer.mockReturnValue(croppedBuf);

    const result = await captureScreen({
      target: { type: 'region', region: { x: 10, y: 20, width: 300, height: 200 } },
    });

    expect(mockCreateCanvas).toHaveBeenCalledWith(300, 200);
    expect(mockDrawImage).toHaveBeenCalledWith(expect.anything(), -10, -20);
    expect(result.imageBase64).toBe(croppedBuf.toString('base64'));
  });
});
