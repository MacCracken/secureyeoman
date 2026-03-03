import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerDesktopRoutes } from './desktop-routes.js';

// All dynamic imports are mocked at the module level so tests run without
// native dependencies (screen capture, input drivers, etc.)

vi.mock('./capture/screen.js', () => ({
  captureScreen: vi.fn().mockResolvedValue({
    imageBase64: 'abc123',
    mimeType: 'image/png',
    width: 1920,
    height: 1080,
  }),
}));

vi.mock('./capture/windows.js', () => ({
  listWindows: vi.fn().mockResolvedValue([{ id: 'w-1', title: 'Terminal', pid: 1234 }]),
  listDisplays: vi.fn().mockResolvedValue([{ id: 'd-1', name: 'Built-in Display' }]),
}));

vi.mock('./capture/camera.js', () => ({
  captureCamera: vi.fn().mockResolvedValue({
    imageBase64: 'camera123',
    mimeType: 'image/jpeg',
  }),
}));

vi.mock('./actuator/input.js', () => ({
  moveMouse: vi.fn().mockResolvedValue(undefined),
  clickMouse: vi.fn().mockResolvedValue(undefined),
  scrollMouse: vi.fn().mockResolvedValue(undefined),
  typeText: vi.fn().mockResolvedValue(undefined),
  pressKey: vi.fn().mockResolvedValue(undefined),
  releaseKey: vi.fn().mockResolvedValue(undefined),
  focusWindow: vi.fn().mockResolvedValue(undefined),
  resizeWindow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./actuator/clipboard.js', () => ({
  readClipboard: vi.fn().mockResolvedValue('clipboard text'),
  writeClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./actuator/sequence.js', () => ({
  executeSequence: vi.fn().mockResolvedValue({ ok: true, stepsExecuted: 1 }),
}));

// Mock capture-permissions — always grant by default (Phase 108-A)
vi.mock('./capture-permissions.js', () => ({
  checkCapturePermission: vi.fn().mockResolvedValue({ granted: true }),
}));

// Mock capture/recording — for recording endpoints (Phase 108-E)
vi.mock('./capture/recording.js', () => {
  const sessions = new Map<string, Record<string, unknown>>();
  class MockScreenRecordingManager {
    async startRecording(userId: string, config: Record<string, unknown>) {
      const session = {
        id: 'rec-1',
        userId,
        status: 'active',
        config,
        filePath: '/tmp/rec.bin',
        fileSize: 0,
        startedAt: Date.now(),
      };
      sessions.set('rec-1', session);
      return session;
    }
    async stopRecording(id: string) {
      const session = sessions.get(id);
      if (!session) return null;
      sessions.delete(id);
      return { ...session, status: 'completed', stoppedAt: Date.now() };
    }
    getActiveRecordings() {
      return [];
    }
  }
  return { ScreenRecordingManager: MockScreenRecordingManager };
});

function buildApp(
  opts: {
    allowDesktop?: boolean;
    allowCamera?: boolean;
    allowMultimodal?: boolean;
    analyzeImage?: (req: {
      imageBase64: string;
      mimeType: string;
      prompt?: string;
    }) => Promise<{ description: string }>;
    captureAuditLogger?: Record<string, unknown> | null;
    trainingBridge?: Record<string, unknown> | null;
  } = {}
) {
  const app = Fastify({ logger: false });
  registerDesktopRoutes(app, {
    getAllowDesktopControl: vi.fn().mockReturnValue(opts.allowDesktop ?? false),
    getAllowCamera: vi.fn().mockReturnValue(opts.allowCamera ?? false),
    getAllowMultimodal: vi.fn().mockReturnValue(opts.allowMultimodal ?? false),
    analyzeImage: opts.analyzeImage,
    getCaptureAuditLogger: vi.fn().mockReturnValue(opts.captureAuditLogger ?? null),
    getTrainingBridge: vi.fn().mockReturnValue(opts.trainingBridge ?? null),
  });
  return app;
}

// ── Disabled guard tests (403) ─────────────────────────────────────────────────

describe('desktop-routes — disabled guard (403)', () => {
  it('POST /screenshot returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/screenshot',
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /windows returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({ method: 'GET', url: '/api/v1/desktop/windows' });
    expect(res.statusCode).toBe(403);
  });

  it('GET /displays returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({ method: 'GET', url: '/api/v1/desktop/displays' });
    expect(res.statusCode).toBe(403);
  });

  it('POST /camera returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({ method: 'POST', url: '/api/v1/desktop/camera', payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('POST /camera returns 403 when camera disabled (desktop enabled)', async () => {
    const app = buildApp({ allowDesktop: true, allowCamera: false });
    const res = await app.inject({ method: 'POST', url: '/api/v1/desktop/camera', payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('POST /mouse/move returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/mouse/move',
      payload: { x: 0, y: 0 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /mouse/click returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/mouse/click',
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /mouse/scroll returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/mouse/scroll',
      payload: { dx: 0, dy: 10 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /keyboard/type returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/keyboard/type',
      payload: { text: 'hello' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /keyboard/key returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/keyboard/key',
      payload: { combo: 'ctrl+c' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /window/focus returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/window/focus',
      payload: { windowId: 'w-1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /window/resize returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/window/resize',
      payload: { windowId: 'w-1', x: 0, y: 0, width: 800, height: 600 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /clipboard returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({ method: 'GET', url: '/api/v1/desktop/clipboard' });
    expect(res.statusCode).toBe(403);
  });

  it('POST /clipboard returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/clipboard',
      payload: { text: 'hi' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /input/sequence returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/input/sequence',
      payload: { steps: [] },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── Enabled paths ──────────────────────────────────────────────────────────────

describe('desktop-routes — enabled paths', () => {
  it('GET /windows returns window list', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/desktop/windows' });
    expect(res.statusCode).toBe(200);
    expect(res.json().windows).toHaveLength(1);
    expect(res.json().windows[0].title).toBe('Terminal');
  });

  it('GET /displays returns display list', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/desktop/displays' });
    expect(res.statusCode).toBe(200);
    expect(res.json().displays).toHaveLength(1);
  });

  it('POST /screenshot returns image data', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/screenshot',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().imageBase64).toBe('abc123');
    expect(res.json().description).toBeNull();
  });

  it('POST /screenshot includes vision description when multimodal enabled', async () => {
    const analyzeImage = vi.fn().mockResolvedValue({ description: 'A terminal window' });
    const app = buildApp({ allowDesktop: true, allowMultimodal: true, analyzeImage });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/screenshot',
      payload: { prompt: 'What do you see?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe('A terminal window');
  });

  it('POST /screenshot ignores vision failure gracefully', async () => {
    const analyzeImage = vi.fn().mockRejectedValue(new Error('Vision unavailable'));
    const app = buildApp({ allowDesktop: true, allowMultimodal: true, analyzeImage });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/screenshot',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBeNull();
  });

  it('POST /camera returns frame with description', async () => {
    const analyzeImage = vi.fn().mockResolvedValue({ description: 'A person' });
    const app = buildApp({
      allowDesktop: true,
      allowCamera: true,
      allowMultimodal: true,
      analyzeImage,
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/desktop/camera', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().imageBase64).toBe('camera123');
    expect(res.json().description).toBe('A person');
  });

  it('POST /mouse/move succeeds', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/mouse/move',
      payload: { x: 100, y: 200 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('POST /mouse/click succeeds with defaults', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/mouse/click',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('POST /mouse/scroll succeeds', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/mouse/scroll',
      payload: { dx: 0, dy: 100 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('POST /keyboard/type succeeds and returns char count', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/keyboard/type',
      payload: { text: 'hello' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().charactersTyped).toBe(5);
  });

  it('POST /keyboard/key presses key', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/keyboard/key',
      payload: { combo: 'Enter' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().combo).toBe('Enter');
  });

  it('POST /keyboard/key releases key when release=true', async () => {
    const { releaseKey } = await import('./actuator/input.js');
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/keyboard/key',
      payload: { combo: 'Shift', release: true },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(releaseKey)).toHaveBeenCalledWith('Shift');
  });

  it('POST /window/focus succeeds', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/window/focus',
      payload: { windowId: 'w-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('POST /window/resize succeeds', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/window/resize',
      payload: { windowId: 'w-1', x: 0, y: 0, width: 800, height: 600 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('GET /clipboard returns text', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/desktop/clipboard' });
    expect(res.statusCode).toBe(200);
    expect(res.json().text).toBe('clipboard text');
  });

  it('POST /clipboard writes text', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/clipboard',
      payload: { text: 'hello world' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('POST /input/sequence returns 400 when steps empty', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/input/sequence',
      payload: { steps: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /input/sequence executes steps', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/input/sequence',
      payload: { steps: [{ type: 'key', combo: 'ctrl+c' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

// ── RBAC enforcement (Phase 108-A) ────────────────────────────────────────────

describe('desktop-routes — RBAC enforcement (108-A)', () => {
  it('POST /screenshot calls checkCapturePermission', async () => {
    const { checkCapturePermission } = await import('./capture-permissions.js');
    const app = buildApp({ allowDesktop: true });
    await app.inject({ method: 'POST', url: '/api/v1/desktop/screenshot', payload: {} });
    expect(vi.mocked(checkCapturePermission)).toHaveBeenCalledWith(
      'capture.screen',
      'capture',
      {},
      expect.objectContaining({ userId: 'anonymous', roleId: 'default' })
    );
  });

  it('POST /camera calls checkCapturePermission with capture.camera', async () => {
    const { checkCapturePermission } = await import('./capture-permissions.js');
    vi.mocked(checkCapturePermission).mockClear();
    const app = buildApp({ allowDesktop: true, allowCamera: true });
    await app.inject({ method: 'POST', url: '/api/v1/desktop/camera', payload: {} });
    expect(vi.mocked(checkCapturePermission)).toHaveBeenCalledWith(
      'capture.camera',
      'capture',
      {},
      expect.objectContaining({ userId: 'anonymous' })
    );
  });

  it('GET /clipboard calls checkCapturePermission with capture.clipboard', async () => {
    const { checkCapturePermission } = await import('./capture-permissions.js');
    vi.mocked(checkCapturePermission).mockClear();
    const app = buildApp({ allowDesktop: true });
    await app.inject({ method: 'GET', url: '/api/v1/desktop/clipboard' });
    expect(vi.mocked(checkCapturePermission)).toHaveBeenCalledWith(
      'capture.clipboard',
      'capture',
      {},
      expect.objectContaining({ userId: 'anonymous' })
    );
  });

  it('POST /mouse/move calls checkCapturePermission with configure action', async () => {
    const { checkCapturePermission } = await import('./capture-permissions.js');
    vi.mocked(checkCapturePermission).mockClear();
    const app = buildApp({ allowDesktop: true });
    await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/mouse/move',
      payload: { x: 0, y: 0 },
    });
    expect(vi.mocked(checkCapturePermission)).toHaveBeenCalledWith(
      'capture.screen',
      'configure',
      {},
      expect.objectContaining({ userId: 'anonymous' })
    );
  });
});

// ── Audit logging (Phase 108-B) ──────────────────────────────────────────────

describe('desktop-routes — audit logging (108-B)', () => {
  it('POST /screenshot calls audit logger on success', async () => {
    const mockLogger = { logCaptureEvent: vi.fn().mockResolvedValue({}) };
    const app = buildApp({ allowDesktop: true, captureAuditLogger: mockLogger });
    await app.inject({ method: 'POST', url: '/api/v1/desktop/screenshot', payload: {} });
    expect(mockLogger.logCaptureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'capture.completed',
        result: expect.objectContaining({ success: true, action: 'screenshot' }),
      })
    );
  });

  it('POST /clipboard calls audit logger for clipboard access', async () => {
    const mockLogger = { logCaptureEvent: vi.fn().mockResolvedValue({}) };
    const app = buildApp({ allowDesktop: true, captureAuditLogger: mockLogger });
    await app.inject({ method: 'POST', url: '/api/v1/desktop/clipboard', payload: { text: 'x' } });
    expect(mockLogger.logCaptureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'capture.completed',
        result: expect.objectContaining({ action: 'clipboard_write' }),
      })
    );
  });
});

// ── Training bridge (Phase 108-C) ──────────────────────────────────────────────

describe('desktop-routes — training bridge (108-C)', () => {
  it('POST /screenshot records action via bridge', async () => {
    const mockBridge = { recordAction: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp({ allowDesktop: true, trainingBridge: mockBridge });
    await app.inject({ method: 'POST', url: '/api/v1/desktop/screenshot', payload: {} });
    expect(mockBridge.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'screenshot' })
    );
  });

  it('POST /keyboard/type records action via bridge', async () => {
    const mockBridge = { recordAction: vi.fn().mockResolvedValue(undefined) };
    const app = buildApp({ allowDesktop: true, trainingBridge: mockBridge });
    await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/keyboard/type',
      payload: { text: 'hi' },
    });
    expect(mockBridge.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'keyboard_type' })
    );
  });
});

// ── Recording endpoints (Phase 108-E) ────────────────────────────────────────

describe('desktop-routes — recording endpoints (108-E)', () => {
  it('POST /recording/start returns 403 when desktop disabled', async () => {
    const app = buildApp({ allowDesktop: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/recording/start',
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /recording/start creates recording session', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/recording/start',
      payload: { duration: 60 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe('rec-1');
    expect(res.json().status).toBe('active');
  });

  it('POST /recording/stop returns completed session', async () => {
    const app = buildApp({ allowDesktop: true });
    // Start then stop
    await app.inject({ method: 'POST', url: '/api/v1/desktop/recording/start', payload: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/desktop/recording/stop',
      payload: { sessionId: 'rec-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });

  it('GET /recording/active returns list', async () => {
    const app = buildApp({ allowDesktop: true });
    const res = await app.inject({ method: 'GET', url: '/api/v1/desktop/recording/active' });
    expect(res.statusCode).toBe(200);
    expect(res.json().recordings).toBeDefined();
  });
});
