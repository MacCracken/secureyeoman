/**
 * Shruti MCP Tools — DAW operations exposed as native SY MCP tools.
 *
 * Tools:
 * - shruti_session:     Session management (create, info, save, close)
 * - shruti_tracks:      Track CRUD (add, list, remove, rename)
 * - shruti_mixer:       Mixer controls (gain, pan, mute, solo, effects)
 * - shruti_transport:   Playback control (play, stop, pause, record, seek, tempo)
 * - shruti_export:      Export audio (WAV, FLAC)
 * - shruti_analysis:    Audio analysis (spectrum, dynamics, auto-mix, composition)
 * - shruti_edit:        Non-destructive editing (split, trim, fade, undo/redo)
 */

import type { McpToolDef } from '@secureyeoman/shared';

export const SHRUTI_TOOL_DEFINITIONS: McpToolDef[] = [
  {
    name: 'shruti_session',
    description:
      'Manage Shruti DAW sessions. Actions: create (new session), info (get current session state), save, close.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'info', 'save', 'close'],
          description: 'Session action to perform',
        },
        name: { type: 'string', description: 'Session name (for create)' },
        sample_rate: {
          type: 'number',
          description: 'Sample rate in Hz (default: 44100)',
        },
      },
      required: ['action'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'shruti_tracks',
    description:
      'Manage audio and MIDI tracks. Actions: add, list, remove, rename. Track types: audio, midi, bus, instrument.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'list', 'remove', 'rename'],
          description: 'Track action',
        },
        name: { type: 'string', description: 'Track name (for add/rename)' },
        track_type: {
          type: 'string',
          enum: ['audio', 'midi', 'bus', 'instrument'],
          description: 'Track type (for add, default: audio)',
        },
        track_index: { type: 'number', description: 'Track index (for remove/rename)' },
      },
      required: ['action'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'shruti_mixer',
    description:
      'Control the mixer. Set gain (dB), pan (-1.0 to 1.0), mute, solo, or add effects (eq, compressor, reverb, delay, limiter) on a track.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['gain', 'pan', 'mute', 'solo', 'add_effect'],
          description: 'Mixer action',
        },
        track_index: { type: 'number', description: 'Target track index' },
        value: { type: 'number', description: 'Value (gain dB, pan -1..1, or boolean 0/1)' },
        effect_type: {
          type: 'string',
          enum: ['eq', 'compressor', 'reverb', 'delay', 'limiter'],
          description: 'Effect type (for add_effect)',
        },
      },
      required: ['action', 'track_index'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'shruti_transport',
    description:
      'Control playback transport. Actions: play, stop, pause, record, seek (to frame), tempo (set BPM).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['play', 'stop', 'pause', 'record', 'seek', 'tempo'],
          description: 'Transport action',
        },
        position_frames: { type: 'number', description: 'Position in frames (for seek)' },
        bpm: { type: 'number', description: 'Beats per minute (for tempo)' },
      },
      required: ['action'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'shruti_export',
    description:
      'Export the current session to audio file. Formats: wav (default), flac. Configurable bit depth (16, 24, 32).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Output file path' },
        format: {
          type: 'string',
          enum: ['wav', 'flac'],
          description: 'Output format (default: wav)',
        },
        bit_depth: {
          type: 'number',
          enum: [16, 24, 32],
          description: 'Bit depth (default: 24)',
        },
      },
      required: ['path'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'shruti_analysis',
    description:
      'Audio analysis tools. Actions: spectrum (FFT), dynamics (loudness/peaks), auto_mix (AI mixing suggestions), composition (AI composition suggestions).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['spectrum', 'dynamics', 'auto_mix', 'composition'],
          description: 'Analysis type',
        },
        track_index: { type: 'number', description: 'Track index (for spectrum/dynamics)' },
        fft_size: { type: 'number', description: 'FFT size (for spectrum, default: 4096)' },
      },
      required: ['action'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'shruti_edit',
    description:
      'Non-destructive audio editing. Actions: split (region at frame), trim (region boundaries), fade (in/out), undo, redo.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['split', 'trim', 'fade', 'undo', 'redo'],
          description: 'Edit action',
        },
        track_index: { type: 'number', description: 'Track index' },
        region_index: { type: 'number', description: 'Region index within track' },
        at_frame: { type: 'number', description: 'Frame position (for split)' },
        start_frame: { type: 'number', description: 'Trim start frame' },
        end_frame: { type: 'number', description: 'Trim end frame' },
        fade_in_frames: { type: 'number', description: 'Fade in duration in frames' },
        fade_out_frames: { type: 'number', description: 'Fade out duration in frames' },
      },
      required: ['action'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
];
