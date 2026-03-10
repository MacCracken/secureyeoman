/**
 * Video Streaming MCP Tools — AI-accessible tools for real-time video streaming.
 *
 * Tools:
 *   video_stream_start    — start a streaming session (AGNOS, local camera, local screen)
 *   video_stream_stop     — stop a session
 *   video_stream_sessions — list active sessions
 *   video_stream_sources  — list available video sources
 *   video_stream_snapshot — capture a single frame from an active session
 *
 * All tools proxy to core REST endpoints under /api/v1/video/stream/*.
 * Gated on SecurityConfig.allowVideoStreaming + allowDesktopControl.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const NOT_ENABLED_MSG =
  'Video Streaming tools are not enabled. Enable Desktop Control and Video Streaming in Security Settings.';

function textResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
  };
}

export function registerVideoStreamTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  const guard = () => config.exposeDesktopControl;

  // ── video_stream_start ─────────────────────────────────────────────────

  server.registerTool(
    'video_stream_start',
    {
      description:
        'Start a real-time video streaming session. Sources: "agnos" (remote AGNOS screen recording), "local_camera" (local camera via ffmpeg), "local_screen" (local screenshot stream). Returns a session object with ID for WebSocket subscription at ws/video/:sessionId.',
      inputSchema: {
        source: z
          .enum(['agnos', 'local_camera', 'local_screen'])
          .describe('Video source to stream from'),
        fps: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe('Target frames per second (default: 5)'),
        maxDurationS: z
          .number()
          .int()
          .min(10)
          .max(1800)
          .optional()
          .describe('Maximum duration in seconds (default: 600, max: 1800)'),
        deviceId: z
          .string()
          .optional()
          .describe('Camera device ID (for local_camera source)'),
        enableVisionAnalysis: z
          .boolean()
          .optional()
          .describe('Enable AI vision analysis on frames (default: false)'),
        visionPrompt: z
          .string()
          .max(1000)
          .optional()
          .describe('Custom prompt for vision analysis'),
        visionAnalyzeEveryN: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Analyze every Nth frame to save cost (default: 10)'),
      },
    },
    wrapToolHandler('video_stream_start', middleware, async (args) => {
      if (!guard()) return { content: [{ type: 'text' as const, text: NOT_ENABLED_MSG }], isError: true };
      try {
        const result = await client.post('/api/v1/video/stream/start', args);
        await middleware.auditLogger.log({
          event: 'video_stream_start',
          level: 'info',
          message: `Video stream started: ${(args as Record<string, unknown>).source}`,
          metadata: { tool: 'video_stream_start', source: (args as Record<string, unknown>).source },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── video_stream_stop ──────────────────────────────────────────────────

  server.registerTool(
    'video_stream_stop',
    {
      description: 'Stop an active video streaming session by session ID.',
      inputSchema: {
        sessionId: z.string().describe('Session ID to stop'),
      },
    },
    wrapToolHandler('video_stream_stop', middleware, async (args) => {
      if (!guard()) return { content: [{ type: 'text' as const, text: NOT_ENABLED_MSG }], isError: true };
      try {
        const { sessionId } = args as { sessionId: string };
        const result = await client.post(`/api/v1/video/stream/${sessionId}/stop`, {});
        await middleware.auditLogger.log({
          event: 'video_stream_stop',
          level: 'info',
          message: `Video stream stopped: ${sessionId}`,
          metadata: { tool: 'video_stream_stop', sessionId },
        });
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── video_stream_sessions ──────────────────────────────────────────────

  server.registerTool(
    'video_stream_sessions',
    {
      description: 'List all active video streaming sessions with their status, source, FPS, and frame count.',
      inputSchema: {},
    },
    wrapToolHandler('video_stream_sessions', middleware, async () => {
      if (!guard()) return { content: [{ type: 'text' as const, text: NOT_ENABLED_MSG }], isError: true };
      try {
        const result = await client.get('/api/v1/video/stream/sessions');
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── video_stream_sources ───────────────────────────────────────────────

  server.registerTool(
    'video_stream_sources',
    {
      description:
        'List available video sources (AGNOS remote screen, local camera, local screen) with their availability status.',
      inputSchema: {},
    },
    wrapToolHandler('video_stream_sources', middleware, async () => {
      if (!guard()) return { content: [{ type: 'text' as const, text: NOT_ENABLED_MSG }], isError: true };
      try {
        const result = await client.get('/api/v1/video/stream/sources');
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );

  // ── video_stream_snapshot ──────────────────────────────────────────────

  server.registerTool(
    'video_stream_snapshot',
    {
      description:
        'Get the details of an active video stream session, including frame count and status. For a live frame, connect via WebSocket at ws/video/:sessionId.',
      inputSchema: {
        sessionId: z.string().describe('Session ID to query'),
      },
    },
    wrapToolHandler('video_stream_snapshot', middleware, async (args) => {
      if (!guard()) return { content: [{ type: 'text' as const, text: NOT_ENABLED_MSG }], isError: true };
      try {
        const { sessionId } = args as { sessionId: string };
        const result = await client.get(`/api/v1/video/stream/${sessionId}`);
        return textResponse(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    })
  );
}
