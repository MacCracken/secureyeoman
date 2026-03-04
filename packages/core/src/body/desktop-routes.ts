/**
 * Desktop Control Routes — REST API for body/capture and body/actuator drivers.
 *
 * All endpoints gate on:
 *   1. SecurityConfig.allowDesktopControl (or allowCamera for camera endpoint)
 *   2. JWT auth (via standard auth middleware applied globally)
 *   3. Granular RBAC capture permissions (Phase 108-A)
 *
 * Phase 108:
 *   - 108-A: RBAC enforcement per endpoint via capture-permissions
 *   - 108-B: Capture audit logging via CaptureAuditLogger
 *   - 108-C: Desktop-to-training bridge via DesktopTrainingBridge
 */

import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { checkCapturePermission } from './capture-permissions.js';
import type { CaptureAuditLogger } from './capture-audit-logger.js';
import type { DesktopTrainingBridge } from './desktop-training-bridge.js';
import type { CaptureResource, CaptureAction, CaptureScope } from './types.js';

export interface DesktopRoutesOpts {
  getAllowDesktopControl: () => boolean;
  getAllowCamera: () => boolean;
  getAllowMultimodal: () => boolean;
  analyzeImage?: (req: {
    imageBase64: string;
    mimeType: string;
    prompt?: string;
  }) => Promise<{ description: string }>;
  // Phase 108 additions
  getCaptureAuditLogger?: () => CaptureAuditLogger | null;
  getTrainingBridge?: () => DesktopTrainingBridge | null;
}

function sanitizeError(error: unknown): string {
  return toErrorMessage(error);
}

/**
 * Extract auth context from Fastify request.
 * Returns userId and roleId (defaults if auth middleware not applied, e.g. in tests).
 */
function getAuthContext(request: FastifyRequest): { userId: string; roleId: string } {
  const authUser = (request as unknown as Record<string, unknown>).authUser as
    | { id?: string; userId?: string; role?: string; roleId?: string }
    | undefined;
  return {
    userId: authUser?.id ?? authUser?.userId ?? 'anonymous',
    roleId: authUser?.role ?? authUser?.roleId ?? 'default',
  };
}

/**
 * Enforce granular RBAC capture permission.
 * Returns null if granted, or a 403 reply if denied.
 */
async function enforceCapturePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  resource: CaptureResource,
  action: CaptureAction
): Promise<FastifyReply | null> {
  const { userId, roleId } = getAuthContext(request);
  try {
    const result = await checkCapturePermission(resource, action, {}, { userId, roleId });
    if (!result.granted) {
      return sendError(reply, 403, result.reason ?? 'Capture permission denied');
    }
  } catch {
    // RBAC system unavailable — fall through (feature toggle already passed)
  }
  return null;
}

/** Build a minimal CaptureScope for audit events */
function buildScope(resource: CaptureResource): CaptureScope {
  return {
    resource,
    duration: { maxSeconds: 0 },
    quality: { resolution: 'native', frameRate: 30, compression: 'medium', format: 'png' },
    purpose: 'desktop_control',
  };
}

/** Fire-and-forget audit log */
function auditLog(
  logger: CaptureAuditLogger | null | undefined,
  eventType: string,
  resource: CaptureResource,
  action: string,
  userId: string,
  roleId: string,
  success: boolean,
  sessionId: string,
  error?: string
): void {
  if (!logger) return;
  logger
    .logCaptureEvent({
      eventType: eventType as Parameters<CaptureAuditLogger['logCaptureEvent']>[0]['eventType'],
      sessionId,
      userId,
      roleId,
      consentId: 'implicit',
      scope: buildScope(resource),
      result: { success, action, error },
    })
    .catch(() => {});
}

/** Fire-and-forget training bridge record */
function bridgeRecord(
  bridge: DesktopTrainingBridge | null | undefined,
  sessionId: string,
  actionType: string,
  actionTarget: string,
  actionValue: string
): void {
  if (!bridge) return;
  bridge.recordAction({ sessionId, actionType, actionTarget, actionValue }).catch(() => {});
}

export function registerDesktopRoutes(app: FastifyInstance, opts: DesktopRoutesOpts): void {
  const {
    getAllowDesktopControl,
    getAllowCamera,
    getAllowMultimodal,
    analyzeImage,
    getCaptureAuditLogger,
    getTrainingBridge,
  } = opts;

  // ── Screenshot ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/screenshot',
    async (
      request: FastifyRequest<{
        Body: {
          target?: 'display' | 'window' | 'region';
          targetId?: string;
          region?: { x: number; y: number; width: number; height: number };
          format?: 'png' | 'jpeg';
          prompt?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled in Security Settings');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'capture');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const sessionId = randomUUID();
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { captureScreen } = await import('./capture/screen.js');
        const { target, targetId, region, format, prompt } = request.body ?? {};

        const result = await captureScreen({
          target: target ? { type: target, id: targetId, region } : undefined,
          format: format ?? 'png',
        });

        let description: string | null = null;
        if (getAllowMultimodal() && analyzeImage) {
          try {
            const vr = await analyzeImage({
              imageBase64: result.imageBase64,
              mimeType: result.mimeType,
              prompt: prompt ?? 'Describe what you see on this screen in detail.',
            });
            description = vr.description;
          } catch {
            // Vision analysis is best-effort
          }
        }

        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'screenshot',
          userId,
          roleId,
          true,
          sessionId
        );
        bridgeRecord(bridge, sessionId, 'screenshot', target ?? 'display', targetId ?? 'primary');

        return { ...result, description };
      } catch (err) {
        auditLog(
          auditLogger,
          'capture.failed',
          'capture.screen',
          'screenshot',
          userId,
          roleId,
          false,
          sessionId,
          sanitizeError(err)
        );
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Window list ─────────────────────────────────────────────────────────────

  app.get('/api/v1/desktop/windows', async (request, reply: FastifyReply) => {
    if (!getAllowDesktopControl()) {
      return sendError(reply, 403, 'Desktop Control is not enabled');
    }
    const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'capture');
    if (denied) return denied;
    try {
      const { listWindows } = await import('./capture/windows.js');
      const windows = await listWindows();
      return { windows };
    } catch (err) {
      return reply.code(500).send({ error: sanitizeError(err) });
    }
  });

  // ── Display list ─────────────────────────────────────────────────────────────

  app.get('/api/v1/desktop/displays', async (request, reply: FastifyReply) => {
    if (!getAllowDesktopControl()) {
      return sendError(reply, 403, 'Desktop Control is not enabled');
    }
    const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'capture');
    if (denied) return denied;
    try {
      const { listDisplays } = await import('./capture/windows.js');
      const displays = await listDisplays();
      return { displays };
    } catch (err) {
      return reply.code(500).send({ error: sanitizeError(err) });
    }
  });

  // ── Camera capture ──────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/camera',
    async (
      request: FastifyRequest<{ Body: { deviceId?: string; prompt?: string } }>,
      reply: FastifyReply
    ) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      if (!getAllowCamera()) {
        return sendError(reply, 403, 'Camera capture is not enabled (allowCamera: false)');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.camera', 'capture');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const sessionId = randomUUID();
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { captureCamera } = await import('./capture/camera.js');
        const frame = await captureCamera(request.body?.deviceId);

        let description: string | null = null;
        if (getAllowMultimodal() && analyzeImage) {
          try {
            const vr = await analyzeImage({
              imageBase64: frame.imageBase64,
              mimeType: frame.mimeType,
              prompt: request.body?.prompt ?? 'Describe what you see in this camera frame.',
            });
            description = vr.description;
          } catch {
            // Vision analysis best-effort
          }
        }

        auditLog(
          auditLogger,
          'capture.completed',
          'capture.camera',
          'camera_capture',
          userId,
          roleId,
          true,
          sessionId
        );
        bridgeRecord(
          bridge,
          sessionId,
          'camera_capture',
          'camera',
          request.body?.deviceId ?? 'default'
        );

        return { ...frame, description };
      } catch (err) {
        auditLog(
          auditLogger,
          'capture.failed',
          'capture.camera',
          'camera_capture',
          userId,
          roleId,
          false,
          sessionId,
          sanitizeError(err)
        );
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Mouse move ──────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/mouse/move',
    async (request: FastifyRequest<{ Body: { x: number; y: number } }>, reply: FastifyReply) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { moveMouse } = await import('./actuator/input.js');
        await moveMouse(request.body.x, request.body.y);
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'mouse_move',
          userId,
          roleId,
          true,
          'actuator'
        );
        bridgeRecord(
          bridge,
          'actuator',
          'mouse_move',
          `${request.body.x},${request.body.y}`,
          'move'
        );
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Mouse click ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/mouse/click',
    async (
      request: FastifyRequest<{
        Body: {
          x?: number;
          y?: number;
          button?: 'left' | 'right' | 'middle';
          double?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { clickMouse } = await import('./actuator/input.js');
        const { x, y, button = 'left', double: dbl = false } = request.body ?? {};
        await clickMouse(x, y, button, dbl);
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'mouse_click',
          userId,
          roleId,
          true,
          'actuator'
        );
        bridgeRecord(
          bridge,
          'actuator',
          'mouse_click',
          `${x ?? 0},${y ?? 0}`,
          `${button}${dbl ? '_double' : ''}`
        );
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Mouse scroll ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/mouse/scroll',
    async (request: FastifyRequest<{ Body: { dx: number; dy: number } }>, reply: FastifyReply) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { scrollMouse } = await import('./actuator/input.js');
        await scrollMouse(request.body.dx, request.body.dy);
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'mouse_scroll',
          userId,
          roleId,
          true,
          'actuator'
        );
        bridgeRecord(
          bridge,
          'actuator',
          'mouse_scroll',
          `${request.body.dx},${request.body.dy}`,
          'scroll'
        );
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Type text ───────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/keyboard/type',
    async (
      request: FastifyRequest<{ Body: { text: string; delayMs?: number } }>,
      reply: FastifyReply
    ) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { typeText } = await import('./actuator/input.js');
        await typeText(request.body.text, request.body.delayMs ?? 0);
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'keyboard_type',
          userId,
          roleId,
          true,
          'actuator'
        );
        bridgeRecord(
          bridge,
          'actuator',
          'keyboard_type',
          'keyboard',
          `${request.body.text.length} chars`
        );
        return { ok: true, charactersTyped: request.body.text.length };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Key press/release ────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/keyboard/key',
    async (
      request: FastifyRequest<{ Body: { combo: string; release?: boolean } }>,
      reply: FastifyReply
    ) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { pressKey, releaseKey } = await import('./actuator/input.js');
        if (request.body.release) {
          await releaseKey(request.body.combo);
        } else {
          await pressKey(request.body.combo);
        }
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'keyboard_key',
          userId,
          roleId,
          true,
          'actuator'
        );
        bridgeRecord(
          bridge,
          'actuator',
          'keyboard_key',
          request.body.combo,
          request.body.release ? 'release' : 'press'
        );
        return { ok: true, combo: request.body.combo };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Window focus ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/window/focus',
    async (request: FastifyRequest<{ Body: { windowId: string } }>, reply: FastifyReply) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();
      const { userId, roleId } = getAuthContext(request);

      try {
        const { focusWindow } = await import('./actuator/input.js');
        await focusWindow(request.body.windowId);
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'window_focus',
          userId,
          roleId,
          true,
          'actuator'
        );
        bridgeRecord(bridge, 'actuator', 'window_focus', request.body.windowId, 'focus');
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Window resize ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/window/resize',
    async (
      request: FastifyRequest<{
        Body: { windowId: string; x: number; y: number; width: number; height: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();
      const { userId, roleId } = getAuthContext(request);

      try {
        const { resizeWindow } = await import('./actuator/input.js');
        const { windowId, x, y, width, height } = request.body;
        await resizeWindow(windowId, { x, y, width, height });
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'window_resize',
          userId,
          roleId,
          true,
          'actuator'
        );
        bridgeRecord(bridge, 'actuator', 'window_resize', windowId, `${width}x${height}+${x}+${y}`);
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Clipboard read ────────────────────────────────────────────────────────────

  app.get('/api/v1/desktop/clipboard', async (request, reply: FastifyReply) => {
    if (!getAllowDesktopControl()) {
      return sendError(reply, 403, 'Desktop Control is not enabled');
    }
    const denied = await enforceCapturePermission(request, reply, 'capture.clipboard', 'capture');
    if (denied) return denied;

    const { userId, roleId } = getAuthContext(request);
    const auditLogger = getCaptureAuditLogger?.();
    const bridge = getTrainingBridge?.();

    try {
      const { readClipboard } = await import('./actuator/clipboard.js');
      const text = await readClipboard();
      auditLog(
        auditLogger,
        'capture.accessed',
        'capture.clipboard',
        'clipboard_read',
        userId,
        roleId,
        true,
        'clipboard'
      );
      bridgeRecord(bridge, 'clipboard', 'clipboard_read', 'clipboard', 'read');
      return { text };
    } catch (err) {
      return reply.code(500).send({ error: sanitizeError(err) });
    }
  });

  // ── Clipboard write ───────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/clipboard',
    async (request: FastifyRequest<{ Body: { text: string } }>, reply: FastifyReply) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(
        request,
        reply,
        'capture.clipboard',
        'configure'
      );
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { writeClipboard } = await import('./actuator/clipboard.js');
        await writeClipboard(request.body.text);
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.clipboard',
          'clipboard_write',
          userId,
          roleId,
          true,
          'clipboard'
        );
        bridgeRecord(bridge, 'clipboard', 'clipboard_write', 'clipboard', 'write');
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Input sequence ────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/desktop/input/sequence',
    async (request: FastifyRequest<{ Body: { steps: unknown[] } }>, reply: FastifyReply) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'configure');
      if (denied) return denied;

      const { userId, roleId } = getAuthContext(request);
      const auditLogger = getCaptureAuditLogger?.();
      const bridge = getTrainingBridge?.();

      try {
        const { executeSequence } = await import('./actuator/sequence.js');
        if (!Array.isArray(request.body?.steps) || request.body.steps.length === 0) {
          return sendError(reply, 400, "'steps' must be a non-empty array");
        }
        const result = await executeSequence(
          request.body.steps as Parameters<typeof executeSequence>[0]
        );
        auditLog(
          auditLogger,
          'capture.completed',
          'capture.screen',
          'input_sequence',
          userId,
          roleId,
          true,
          'sequence'
        );
        bridgeRecord(
          bridge,
          'sequence',
          'input_sequence',
          'multi',
          `${request.body.steps.length} steps`
        );
        return result;
      } catch (err) {
        auditLog(
          auditLogger,
          'capture.failed',
          'capture.screen',
          'input_sequence',
          userId,
          roleId,
          false,
          'sequence',
          sanitizeError(err)
        );
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Recording (108-E) ──────────────────────────────────────────────────────

  // Lazily import recording manager
  let recordingManager: import('./capture/recording.js').ScreenRecordingManager | null = null;
  async function getRecordingManager() {
    if (!recordingManager) {
      const { ScreenRecordingManager } = await import('./capture/recording.js');
      recordingManager = new ScreenRecordingManager();
    }
    return recordingManager;
  }

  app.post(
    '/api/v1/desktop/recording/start',
    async (
      request: FastifyRequest<{
        Body: {
          duration?: number;
          quality?: 'low' | 'medium' | 'high';
          region?: { x: number; y: number; width: number; height: number };
          consentId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      const denied = await enforceCapturePermission(request, reply, 'capture.screen', 'stream');
      if (denied) return denied;

      const { userId } = getAuthContext(request);
      try {
        const mgr = await getRecordingManager();
        const session = await mgr.startRecording(userId, {
          duration: request.body?.duration ?? 300,
          quality: request.body?.quality,
          region: request.body?.region,
          consentId: request.body?.consentId,
        });
        return reply.code(201).send(session);
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  app.post(
    '/api/v1/desktop/recording/stop',
    async (request: FastifyRequest<{ Body: { sessionId: string } }>, reply: FastifyReply) => {
      if (!getAllowDesktopControl()) {
        return sendError(reply, 403, 'Desktop Control is not enabled');
      }
      try {
        const mgr = await getRecordingManager();
        const session = await mgr.stopRecording(request.body?.sessionId);
        if (!session) return sendError(reply, 404, 'Recording session not found');
        return session;
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  app.get('/api/v1/desktop/recording/active', async (request, reply: FastifyReply) => {
    if (!getAllowDesktopControl()) {
      return sendError(reply, 403, 'Desktop Control is not enabled');
    }
    try {
      const mgr = await getRecordingManager();
      return { recordings: mgr.getActiveRecordings() };
    } catch (err) {
      return reply.code(500).send({ error: sanitizeError(err) });
    }
  });
}
