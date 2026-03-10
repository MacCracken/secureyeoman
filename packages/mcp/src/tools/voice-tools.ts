/**
 * Voice Profile Tools — manage voice profiles for personality TTS output.
 *
 * Provides MCP tools to create, list, and assign voice profiles to
 * personalities. Voice profiles store provider-specific configuration
 * (e.g. ElevenLabs, Azure TTS, Google TTS) so personalities can speak
 * with consistent, customisable voices.
 *
 * ## Configuration
 *   MCP_EXPOSE_VOICE_TOOLS – Enable voice profile tools (default: true)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  jsonResponse,
  registerDisabledStub,
} from './tool-utils.js';

const DISABLED_MSG = 'Voice tools are disabled. Set MCP_EXPOSE_VOICE_TOOLS=true to enable.';

export function registerVoiceTools(
  server: McpServer,
  client: CoreApiClient,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!(config as Record<string, unknown>).exposeVoiceTools) {
    registerDisabledStub(server, middleware, 'voice_status', DISABLED_MSG);
    return;
  }

  // ── Create Voice Profile ────────────────────────────────────────────────────

  server.registerTool(
    'voice_profile_create',
    {
      description:
        'Create a new voice profile with a display name, TTS provider, provider-specific voice ID, ' +
        'and optional settings (speed, pitch, stability). Returns the created profile with its ID.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('Display name for the voice profile'),
        provider: z
          .enum(['elevenlabs', 'azure', 'google', 'openai', 'coqui'])
          .describe('TTS provider'),
        voiceId: z
          .string()
          .min(1)
          .max(500)
          .describe('Provider-specific voice identifier'),
        settings: z
          .object({
            speed: z.number().min(0.25).max(4).optional().describe('Speech speed multiplier'),
            pitch: z.number().min(-20).max(20).optional().describe('Pitch adjustment in semitones'),
            stability: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe('Voice stability (0=variable, 1=stable). ElevenLabs-specific.'),
          })
          .optional()
          .describe('Optional TTS settings'),
      },
    },
    wrapToolHandler('voice_profile_create', middleware, async (args) => {
      const result = await client.post('/api/v1/voice/profiles', {
        name: args.name,
        provider: args.provider,
        voiceId: args.voiceId,
        settings: args.settings ?? {},
      });
      return jsonResponse(result);
    })
  );

  // ── List Voice Profiles ─────────────────────────────────────────────────────

  server.registerTool(
    'voice_profile_list',
    {
      description:
        'List all voice profiles. Optionally filter by TTS provider. ' +
        'Returns an array of profiles with id, name, provider, voiceId, and settings.',
      inputSchema: {
        provider: z
          .enum(['elevenlabs', 'azure', 'google', 'openai', 'coqui'])
          .optional()
          .describe('Filter profiles by TTS provider'),
      },
    },
    wrapToolHandler('voice_profile_list', middleware, async (args) => {
      const qs = args.provider ? `?provider=${encodeURIComponent(args.provider)}` : '';
      const result = await client.get(`/api/v1/voice/profiles${qs}`);
      return jsonResponse(result);
    })
  );

  // ── Switch Voice Profile ────────────────────────────────────────────────────

  server.registerTool(
    'voice_profile_switch',
    {
      description:
        'Assign a voice profile to the current personality. The personality will use this ' +
        'voice for all subsequent TTS output until changed.',
      inputSchema: {
        profileId: z.string().min(1).describe('Voice profile ID to assign'),
      },
    },
    wrapToolHandler('voice_profile_switch', middleware, async (args) => {
      const result = await client.post('/api/v1/voice/profiles/switch', {
        profileId: args.profileId,
      });
      return jsonResponse(result);
    })
  );
}
