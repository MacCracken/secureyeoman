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
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Session name' },
          sample_rate: {
            type: 'number',
            description: 'Sample rate in Hz (default: 44100)',
            default: 44100,
          },
          channels: {
            type: 'number',
            description: 'Number of audio channels (default: 2)',
            default: 2,
          },
        },
        required: ['name'],
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
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the session file' },
        },
        required: ['path'],
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
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Track name' },
          track_type: {
            type: 'string',
            enum: ['audio', 'midi', 'bus', 'instrument'],
            description: 'Track type (default: audio)',
            default: 'audio',
          },
        },
        required: ['name'],
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
        type: 'object',
        properties: {
          track_index: { type: 'number', description: 'Track index (0-based)' },
          file_path: { type: 'string', description: 'Path to the audio file (WAV, FLAC)' },
          position_frames: {
            type: 'number',
            description: 'Position on the timeline in frames (default: 0)',
            default: 0,
          },
        },
        required: ['track_index', 'file_path'],
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
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['play', 'stop', 'pause', 'record', 'seek', 'set_tempo'],
            description: 'Transport action',
          },
          position_frames: {
            type: 'number',
            description: 'Seek position in frames (only for action=seek)',
          },
          bpm: {
            type: 'number',
            description: 'Tempo in BPM (only for action=set_tempo)',
          },
        },
        required: ['action'],
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
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Output file path' },
          format: {
            type: 'string',
            enum: ['wav', 'flac'],
            description: 'Audio format (default: wav)',
            default: 'wav',
          },
          bit_depth: {
            type: 'number',
            enum: [16, 24, 32],
            description: 'Bit depth (default: 24)',
            default: 24,
          },
        },
        required: ['path'],
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
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['spectrum', 'dynamics', 'auto_mix', 'composition'],
            description: 'Analysis type',
          },
          track_index: {
            type: 'number',
            description: 'Track index for spectrum/dynamics analysis (0-based)',
          },
          fft_size: {
            type: 'number',
            description: 'FFT size for spectrum analysis (default: 4096)',
            default: 4096,
          },
        },
        required: ['type'],
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
        type: 'object',
        properties: {
          track_index: { type: 'number', description: 'Track index (0-based)' },
          action: {
            type: 'string',
            enum: ['gain', 'pan', 'mute', 'unmute', 'solo', 'unsolo', 'add_effect'],
            description: 'Mixer action',
          },
          value: {
            type: 'number',
            description: 'Value for gain (dB) or pan (-1.0 to 1.0)',
          },
          effect_type: {
            type: 'string',
            enum: ['eq', 'compressor', 'reverb', 'delay', 'limiter'],
            description: 'Effect type (only for action=add_effect)',
          },
        },
        required: ['track_index', 'action'],
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
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['undo', 'redo', 'split', 'trim', 'fade'],
            description: 'Edit action',
          },
          track_index: { type: 'number', description: 'Track index (for split/trim/fade)' },
          region_index: { type: 'number', description: 'Region index (for split/trim/fade)' },
          at_frame: { type: 'number', description: 'Split position in frames (for split)' },
          start_frame: { type: 'number', description: 'Trim start in frames (for trim)' },
          end_frame: { type: 'number', description: 'Trim end in frames (for trim)' },
          fade_in_frames: { type: 'number', description: 'Fade in duration in frames (for fade)' },
          fade_out_frames: {
            type: 'number',
            description: 'Fade out duration in frames (for fade)',
          },
        },
        required: ['action'],
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
