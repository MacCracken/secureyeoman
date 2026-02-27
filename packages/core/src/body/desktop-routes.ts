/**
 * Desktop Control Routes — REST API for body/capture and body/actuator drivers.
 *
 * All endpoints gate on:
 *   1. SecurityConfig.allowDesktopControl (or allowCamera for camera endpoint)
 *   2. JWT auth (via standard auth middleware applied globally)
 *
 * RBAC resource: 'desktop' action: 'control'
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError } from '../utils/errors.js';

interface DesktopRoutesOpts {
  getAllowDesktopControl: () => boolean;
  getAllowCamera: () => boolean;
  getAllowMultimodal: () => boolean;
  analyzeImage?: (req: {
    imageBase64: string;
    mimeType: string;
    prompt?: string;
  }) => Promise<{ description: string }>;
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerDesktopRoutes(app: FastifyInstance, opts: DesktopRoutesOpts): void {
  const { getAllowDesktopControl, getAllowCamera, getAllowMultimodal, analyzeImage } = opts;

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

        return { ...result, description };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Window list ─────────────────────────────────────────────────────────────

  app.get('/api/v1/desktop/windows', async (_req, reply: FastifyReply) => {
    if (!getAllowDesktopControl()) {
      return sendError(reply, 403, 'Desktop Control is not enabled');
    }
    try {
      const { listWindows } = await import('./capture/windows.js');
      const windows = await listWindows();
      return { windows };
    } catch (err) {
      return reply.code(500).send({ error: sanitizeError(err) });
    }
  });

  // ── Display list ─────────────────────────────────────────────────────────────

  app.get('/api/v1/desktop/displays', async (_req, reply: FastifyReply) => {
    if (!getAllowDesktopControl()) {
      return sendError(reply, 403, 'Desktop Control is not enabled');
    }
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

        return { ...frame, description };
      } catch (err) {
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
      try {
        const { moveMouse } = await import('./actuator/input.js');
        await moveMouse(request.body.x, request.body.y);
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
      try {
        const { clickMouse } = await import('./actuator/input.js');
        const { x, y, button = 'left', double: dbl = false } = request.body ?? {};
        await clickMouse(x, y, button, dbl);
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
      try {
        const { scrollMouse } = await import('./actuator/input.js');
        await scrollMouse(request.body.dx, request.body.dy);
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
      try {
        const { typeText } = await import('./actuator/input.js');
        await typeText(request.body.text, request.body.delayMs ?? 0);
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
      try {
        const { pressKey, releaseKey } = await import('./actuator/input.js');
        if (request.body.release) {
          await releaseKey(request.body.combo);
        } else {
          await pressKey(request.body.combo);
        }
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
      try {
        const { focusWindow } = await import('./actuator/input.js');
        await focusWindow(request.body.windowId);
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
      try {
        const { resizeWindow } = await import('./actuator/input.js');
        const { windowId, x, y, width, height } = request.body;
        await resizeWindow(windowId, { x, y, width, height });
        return { ok: true };
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );

  // ── Clipboard read ────────────────────────────────────────────────────────────

  app.get('/api/v1/desktop/clipboard', async (_req, reply: FastifyReply) => {
    if (!getAllowDesktopControl()) {
      return sendError(reply, 403, 'Desktop Control is not enabled');
    }
    try {
      const { readClipboard } = await import('./actuator/clipboard.js');
      const text = await readClipboard();
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
      try {
        const { writeClipboard } = await import('./actuator/clipboard.js');
        await writeClipboard(request.body.text);
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
      try {
        const { executeSequence } = await import('./actuator/sequence.js');
        if (!Array.isArray(request.body?.steps) || request.body.steps.length === 0) {
          return sendError(reply, 400, "'steps' must be a non-empty array");
        }
        const result = await executeSequence(
          request.body.steps as Parameters<typeof executeSequence>[0]
        );
        return result;
      } catch (err) {
        return reply.code(500).send({ error: sanitizeError(err) });
      }
    }
  );
}
