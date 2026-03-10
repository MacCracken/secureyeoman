/**
 * Video Stream Routes — REST + WebSocket API for real-time video streaming.
 *
 * REST endpoints:
 *   POST /api/v1/video/stream/start   — start a streaming session
 *   POST /api/v1/video/stream/:id/stop — stop a session
 *   GET  /api/v1/video/stream/sessions — list active sessions
 *   GET  /api/v1/video/stream/:id      — get session details
 *   GET  /api/v1/video/stream/sources  — list available video sources
 *
 * WebSocket endpoint (registered in GatewayServer):
 *   WS /ws/video/:sessionId — subscribe to frame stream
 *
 * All endpoints gate on SecurityConfig.allowVideoStreaming + allowDesktopControl.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../utils/errors.js';
import type {
  VideoStreamManager,
  VideoStreamConfig,
  VideoSource,
} from './capture/video-stream-manager.js';

export interface VideoStreamRoutesOpts {
  getAllowVideoStreaming: () => boolean;
  getAllowDesktopControl: () => boolean;
  getVideoStreamManager: () => VideoStreamManager | null;
  /** Check if AGNOS bridge is available. */
  isAgnosBridgeAvailable: () => boolean;
}

export function registerVideoStreamRoutes(app: FastifyInstance, opts: VideoStreamRoutesOpts): void {
  // ── Guards ───────────────────────────────────────────────────────────────

  function guardStreaming(reply: FastifyReply): boolean {
    if (!opts.getAllowVideoStreaming()) {
      sendError(
        reply,
        403,
        'Video streaming is disabled. Enable it in Security Settings → Video Streaming.'
      );
      return false;
    }
    if (!opts.getAllowDesktopControl()) {
      sendError(
        reply,
        403,
        'Desktop control must be enabled for video streaming. Enable it in Security Settings → Desktop Control.'
      );
      return false;
    }
    return true;
  }

  function getManager(reply: FastifyReply): VideoStreamManager | null {
    const mgr = opts.getVideoStreamManager();
    if (!mgr) {
      sendError(reply, 503, 'Video stream manager not initialized');
      return null;
    }
    return mgr;
  }

  function getUserId(request: FastifyRequest): string {
    const authUser = (request as unknown as Record<string, unknown>).authUser as
      | { id?: string; userId?: string }
      | undefined;
    return authUser?.id ?? authUser?.userId ?? 'anonymous';
  }

  // ── POST /api/v1/video/stream/start ──────────────────────────────────

  app.post(
    '/api/v1/video/stream/start',
    async (
      request: FastifyRequest<{
        Body: {
          source: VideoSource;
          fps?: number;
          maxDurationS?: number;
          agnosSessionId?: string;
          deviceId?: string;
          region?: { x: number; y: number; width: number; height: number };
          enableVisionAnalysis?: boolean;
          visionPrompt?: string;
          visionAnalyzeEveryN?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!guardStreaming(reply)) return;
      const mgr = getManager(reply);
      if (!mgr) return;

      const body = request.body;
      if (!body?.source) {
        return sendError(reply, 400, 'Missing required field: source');
      }

      const validSources: VideoSource[] = ['agnos', 'local_camera', 'local_screen'];
      if (!validSources.includes(body.source)) {
        return sendError(reply, 400, `Invalid source. Must be one of: ${validSources.join(', ')}`);
      }

      if (body.source === 'agnos' && !opts.isAgnosBridgeAvailable()) {
        return sendError(
          reply,
          503,
          'AGNOS video bridge is not available. Enable AGNOS in Connections → Ecosystem Services.'
        );
      }

      try {
        const config: VideoStreamConfig = {
          source: body.source,
          fps: body.fps,
          maxDurationS: body.maxDurationS,
          agnosSessionId: body.agnosSessionId,
          deviceId: body.deviceId,
          region: body.region,
          enableVisionAnalysis: body.enableVisionAnalysis,
          visionPrompt: body.visionPrompt,
          visionAnalyzeEveryN: body.visionAnalyzeEveryN,
        };

        const session = await mgr.startSession(getUserId(request), config);
        return reply.status(201).send({ session });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/video/stream/:id/stop ───────────────────────────────

  app.post(
    '/api/v1/video/stream/:id/stop',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!guardStreaming(reply)) return;
      const mgr = getManager(reply);
      if (!mgr) return;

      const session = await mgr.stopSession(request.params.id);
      if (!session) {
        return sendError(reply, 404, 'Session not found');
      }
      return reply.send({ session });
    }
  );

  // ── GET /api/v1/video/stream/sessions ────────────────────────────────

  app.get(
    '/api/v1/video/stream/sessions',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!guardStreaming(reply)) return;
      const mgr = getManager(reply);
      if (!mgr) return;

      return reply.send({ sessions: mgr.getActiveSessions() });
    }
  );

  // ── GET /api/v1/video/stream/:id ─────────────────────────────────────

  app.get(
    '/api/v1/video/stream/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!guardStreaming(reply)) return;
      const mgr = getManager(reply);
      if (!mgr) return;

      const session = mgr.getSession(request.params.id);
      if (!session) {
        return sendError(reply, 404, 'Session not found');
      }
      return reply.send({ session });
    }
  );

  // ── GET /api/v1/video/stream/sources ─────────────────────────────────

  app.get('/api/v1/video/stream/sources', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!guardStreaming(reply)) return;

    const sources: { id: VideoSource; name: string; available: boolean; description: string }[] = [
      {
        id: 'agnos',
        name: 'AGNOS Remote Screen',
        available: opts.isAgnosBridgeAvailable(),
        description: 'Stream screen frames from AGNOS daimon runtime (remote desktop recording).',
      },
      {
        id: 'local_camera',
        name: 'Local Camera',
        available: true,
        description: 'Capture frames from a local camera device via ffmpeg.',
      },
      {
        id: 'local_screen',
        name: 'Local Screen',
        available: true,
        description: 'Capture screenshots of the local display at configurable FPS.',
      },
    ];

    return reply.send({ sources });
  });
}
