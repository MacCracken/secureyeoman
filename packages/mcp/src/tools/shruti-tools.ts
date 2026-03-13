/**
 * Shruti Tools — Rust-native DAW integration for MCP.
 *
 * Wraps Shruti's REST API as MCP tools so any MCP client can manage
 * audio sessions, tracks, mixing, analysis, and export through natural language.
 *
 * ## Configuration
 *   SHRUTI_URL     – Base URL of the Shruti instance (default: http://localhost:8050)
 *   SHRUTI_API_KEY – API key for authenticating with Shruti
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  jsonResponse,
  registerDisabledStub,
  createHttpClient,
} from './tool-utils.js';

const DISABLED_MSG = 'Shruti tools are disabled. Set MCP_EXPOSE_SHRUTI_TOOLS=true to enable.';

function getShrutiUrl(config: McpServiceConfig): string {
  return (
    (config as Record<string, unknown>).shrutiUrl ??
    process.env.SHRUTI_URL ??
    'http://localhost:8050'
  )
    .toString()
    .replace(/\/$/, '');
}

function getShrutiApiKey(config: McpServiceConfig): string | undefined {
  return ((config as Record<string, unknown>).shrutiApiKey as string) ?? process.env.SHRUTI_API_KEY;
}

async function shruti(
  config: McpServiceConfig,
  method: 'get' | 'post',
  path: string,
  body?: unknown
): Promise<unknown> {
  const apiKey = getShrutiApiKey(config);
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const client = createHttpClient(getShrutiUrl(config), headers);
  const res = await client[method](path, body);
  if (!res.ok) {
    const msg = (res.body as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new Error(`Shruti API error: ${msg}`);
  }
  return res.body;
}

export function registerShrutiTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!(config as Record<string, unknown>).exposeShrutiTools) {
    registerDisabledStub(server, middleware, 'shruti_status', DISABLED_MSG);
    return;
  }

  // ── Session Create ────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_session_create',
    {
      description:
        'Create a new audio session in Shruti DAW. ' +
        'Returns session info (name, sample rate, channels, path).',
      inputSchema: {
        name: z.string().describe('Session name'),
        sample_rate: z.number().optional().describe('Sample rate in Hz (default: 44100)'),
        channels: z.number().optional().describe('Number of audio channels (default: 2)'),
      },
    },
    wrapToolHandler('shruti_session_create', middleware, async (args: Record<string, unknown>) => {
      const result = await shruti(config, 'post', '/api/v1/session/create', {
        name: args.name,
        sample_rate: args.sample_rate ?? 44100,
        channels: args.channels ?? 2,
      });
      return jsonResponse(result);
    })
  );

  // ── Session Open ──────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_session_open',
    {
      description: 'Open an existing Shruti session by file path.',
      inputSchema: {
        path: z.string().describe('Path to the session file'),
      },
    },
    wrapToolHandler('shruti_session_open', middleware, async (args: Record<string, unknown>) => {
      const result = await shruti(config, 'post', '/api/v1/session/open', {
        path: args.path,
      });
      return jsonResponse(result);
    })
  );

  // ── Track Add ─────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_track_add',
    {
      description:
        'Add a track to the current Shruti session. ' + 'Types: audio, midi, bus, instrument.',
      inputSchema: {
        name: z.string().describe('Track name'),
        track_type: z
          .enum(['audio', 'midi', 'bus', 'instrument'])
          .optional()
          .describe('Track type (default: audio)'),
      },
    },
    wrapToolHandler('shruti_track_add', middleware, async (args: Record<string, unknown>) => {
      const result = await shruti(config, 'post', '/api/v1/tracks/add', {
        name: args.name,
        track_type: args.track_type ?? 'audio',
      });
      return jsonResponse(result);
    })
  );

  // ── Track List ────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_track_list',
    {
      description: 'List all tracks in the current Shruti session with gain, pan, mute/solo state.',
      inputSchema: {},
    },
    wrapToolHandler('shruti_track_list', middleware, async () => {
      const result = await shruti(config, 'get', '/api/v1/tracks/list');
      return jsonResponse(result);
    })
  );

  // ── Region Add ────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_region_add',
    {
      description: 'Place an audio file on a track at a specific timeline position (in frames).',
      inputSchema: {
        track_index: z.number().describe('Track index (0-based)'),
        file_path: z.string().describe('Path to the audio file (WAV, FLAC)'),
        position_frames: z
          .number()
          .optional()
          .describe('Position on the timeline in frames (default: 0)'),
      },
    },
    wrapToolHandler('shruti_region_add', middleware, async (args: Record<string, unknown>) => {
      const result = await shruti(config, 'post', '/api/v1/tracks/add_region', {
        track_index: args.track_index,
        file_path: args.file_path,
        position_frames: args.position_frames ?? 0,
      });
      return jsonResponse(result);
    })
  );

  // ── Transport ─────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_transport',
    {
      description:
        'Control Shruti transport: play, stop, pause, record, seek to position, or set tempo.',
      inputSchema: {
        action: z
          .enum(['play', 'stop', 'pause', 'record', 'seek', 'set_tempo'])
          .describe('Transport action'),
        position_frames: z
          .number()
          .optional()
          .describe('Seek position in frames (only for action=seek)'),
        bpm: z.number().optional().describe('Tempo in BPM (only for action=set_tempo)'),
      },
    },
    wrapToolHandler('shruti_transport', middleware, async (args: Record<string, unknown>) => {
      const action = args.action as string;

      if (action === 'seek') {
        const result = await shruti(config, 'post', '/api/v1/transport/seek', {
          position_frames: args.position_frames ?? 0,
        });
        return jsonResponse(result);
      }

      if (action === 'set_tempo') {
        const result = await shruti(config, 'post', '/api/v1/transport/tempo', {
          bpm: args.bpm ?? 120,
        });
        return jsonResponse(result);
      }

      const result = await shruti(config, 'post', '/api/v1/transport/control', { action });
      return jsonResponse(result);
    })
  );

  // ── Export ─────────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_export',
    {
      description:
        'Export/bounce the current Shruti session to an audio file. ' +
        'Supports WAV and FLAC at 16, 24, or 32-bit depth.',
      inputSchema: {
        path: z.string().describe('Output file path'),
        format: z.enum(['wav', 'flac']).optional().describe('Audio format (default: wav)'),
        bit_depth: z
          .union([z.literal(16), z.literal(24), z.literal(32)])
          .optional()
          .describe('Bit depth (default: 24)'),
      },
    },
    wrapToolHandler('shruti_export', middleware, async (args: Record<string, unknown>) => {
      const result = await shruti(config, 'post', '/api/v1/export', {
        path: args.path,
        format: args.format ?? 'wav',
        bit_depth: args.bit_depth ?? 24,
      });
      return jsonResponse(result);
    })
  );

  // ── Analyze ───────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_analyze',
    {
      description:
        'Run audio analysis on a track. Types: spectrum (FFT), dynamics (peak/RMS/LUFS), ' +
        'auto_mix (AI gain/pan/EQ suggestions), composition (structure/tempo suggestions).',
      inputSchema: {
        type: z.enum(['spectrum', 'dynamics', 'auto_mix', 'composition']).describe('Analysis type'),
        track_index: z
          .number()
          .optional()
          .describe('Track index for spectrum/dynamics analysis (0-based)'),
        fft_size: z.number().optional().describe('FFT size for spectrum analysis (default: 4096)'),
      },
    },
    wrapToolHandler('shruti_analyze', middleware, async (args: Record<string, unknown>) => {
      const type = args.type as string;

      if (type === 'auto_mix') {
        const result = await shruti(config, 'post', '/api/v1/analysis/auto_mix', {});
        return jsonResponse(result);
      }

      if (type === 'composition') {
        const result = await shruti(config, 'post', '/api/v1/analysis/composition', {});
        return jsonResponse(result);
      }

      const result = await shruti(config, 'post', `/api/v1/analysis/${type}`, {
        track_index: args.track_index ?? 0,
        fft_size: args.fft_size ?? 4096,
      });
      return jsonResponse(result);
    })
  );

  // ── Mix ───────────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_mix',
    {
      description:
        'Adjust track mixing: set gain (dB), pan (-1 to 1), mute, solo, or add an effect ' +
        '(eq, compressor, reverb, delay, limiter).',
      inputSchema: {
        track_index: z.number().describe('Track index (0-based)'),
        action: z
          .enum(['gain', 'pan', 'mute', 'unmute', 'solo', 'unsolo', 'add_effect'])
          .describe('Mixer action'),
        value: z.number().optional().describe('Value for gain (dB) or pan (-1.0 to 1.0)'),
        effect_type: z
          .enum(['eq', 'compressor', 'reverb', 'delay', 'limiter'])
          .optional()
          .describe('Effect type (only for action=add_effect)'),
      },
    },
    wrapToolHandler('shruti_mix', middleware, async (args: Record<string, unknown>) => {
      const action = args.action as string;
      const trackIndex = args.track_index as number;

      switch (action) {
        case 'gain': {
          const result = await shruti(config, 'post', '/api/v1/tracks/gain', {
            track_index: trackIndex,
            gain_db: args.value ?? 0,
          });
          return jsonResponse(result);
        }
        case 'pan': {
          const result = await shruti(config, 'post', '/api/v1/tracks/pan', {
            track_index: trackIndex,
            pan: args.value ?? 0,
          });
          return jsonResponse(result);
        }
        case 'mute': {
          const result = await shruti(config, 'post', '/api/v1/tracks/mute', {
            track_index: trackIndex,
            muted: true,
          });
          return jsonResponse(result);
        }
        case 'unmute': {
          const result = await shruti(config, 'post', '/api/v1/tracks/mute', {
            track_index: trackIndex,
            muted: false,
          });
          return jsonResponse(result);
        }
        case 'solo': {
          const result = await shruti(config, 'post', '/api/v1/tracks/solo', {
            track_index: trackIndex,
            soloed: true,
          });
          return jsonResponse(result);
        }
        case 'unsolo': {
          const result = await shruti(config, 'post', '/api/v1/tracks/solo', {
            track_index: trackIndex,
            soloed: false,
          });
          return jsonResponse(result);
        }
        case 'add_effect': {
          const result = await shruti(config, 'post', '/api/v1/mixer/add_effect', {
            track_index: trackIndex,
            effect_type: args.effect_type ?? 'eq',
          });
          return jsonResponse(result);
        }
        default:
          throw new Error(`Unknown mixer action: ${action}`);
      }
    })
  );

  // ── Edit ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'shruti_edit',
    {
      description:
        'Edit operations: undo, redo, split region at frame, trim region, set fade in/out.',
      inputSchema: {
        action: z.enum(['undo', 'redo', 'split', 'trim', 'fade']).describe('Edit action'),
        track_index: z.number().optional().describe('Track index (for split/trim/fade)'),
        region_index: z.number().optional().describe('Region index (for split/trim/fade)'),
        at_frame: z.number().optional().describe('Split position in frames (for split)'),
        start_frame: z.number().optional().describe('Trim start in frames (for trim)'),
        end_frame: z.number().optional().describe('Trim end in frames (for trim)'),
        fade_in_frames: z.number().optional().describe('Fade in duration in frames (for fade)'),
        fade_out_frames: z.number().optional().describe('Fade out duration in frames (for fade)'),
      },
    },
    wrapToolHandler('shruti_edit', middleware, async (args: Record<string, unknown>) => {
      const action = args.action as string;

      if (action === 'undo') {
        const result = await shruti(config, 'post', '/api/v1/undo', {});
        return jsonResponse(result);
      }
      if (action === 'redo') {
        const result = await shruti(config, 'post', '/api/v1/redo', {});
        return jsonResponse(result);
      }
      if (action === 'split') {
        const result = await shruti(config, 'post', '/api/v1/edit/split', {
          track_index: args.track_index,
          region_index: args.region_index,
          at_frame: args.at_frame,
        });
        return jsonResponse(result);
      }
      if (action === 'trim') {
        const result = await shruti(config, 'post', '/api/v1/edit/trim', {
          track_index: args.track_index,
          region_index: args.region_index,
          start_frame: args.start_frame,
          end_frame: args.end_frame,
        });
        return jsonResponse(result);
      }
      if (action === 'fade') {
        const result = await shruti(config, 'post', '/api/v1/edit/fade', {
          track_index: args.track_index,
          region_index: args.region_index,
          fade_in_frames: args.fade_in_frames ?? 0,
          fade_out_frames: args.fade_out_frames ?? 0,
        });
        return jsonResponse(result);
      }

      throw new Error(`Unknown edit action: ${action}`);
    })
  );
}
