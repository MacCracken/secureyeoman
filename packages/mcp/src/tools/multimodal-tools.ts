/**
 * Multimodal Tools — image generation, vision analysis, TTS, STT, job listing.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerMultimodalTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // 1. Image generation via DALL-E
  server.registerTool(
    'multimodal_generate_image',
    {
      description: 'Generate an image from a text prompt using DALL-E',
      inputSchema: {
        prompt: z.string().min(1).max(4000).describe('Image generation prompt'),
        size: z
          .enum(['1024x1024', '1024x1792', '1792x1024'])
          .default('1024x1024')
          .describe('Image size'),
        quality: z.enum(['standard', 'hd']).default('standard').describe('Image quality'),
        style: z.enum(['vivid', 'natural']).default('vivid').describe('Image style'),
      },
    },
    wrapToolHandler('multimodal_generate_image', middleware, async (args) => {
      const result = await client.post('/api/v1/multimodal/image/generate', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // 2. Vision analysis
  server.registerTool(
    'multimodal_analyze_image',
    {
      description: 'Analyze an image using vision AI',
      inputSchema: {
        imageBase64: z.string().describe('Base64-encoded image data'),
        mimeType: z
          .enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
          .describe('Image MIME type'),
        prompt: z.string().optional().describe('Analysis prompt/question about the image'),
      },
    },
    wrapToolHandler('multimodal_analyze_image', middleware, async (args) => {
      const result = await client.post('/api/v1/multimodal/vision/analyze', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // 3. Text-to-speech
  server.registerTool(
    'multimodal_speak',
    {
      description: 'Convert text to speech audio',
      inputSchema: {
        text: z.string().min(1).max(4096).describe('Text to speak'),
        voice: z
          .enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
          .default('alloy')
          .describe('Voice'),
      },
    },
    wrapToolHandler('multimodal_speak', middleware, async (args) => {
      const result = await client.post('/api/v1/multimodal/audio/speak', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // 4. Speech-to-text
  server.registerTool(
    'multimodal_transcribe',
    {
      description: 'Transcribe audio to text',
      inputSchema: {
        audioBase64: z.string().describe('Base64-encoded audio data'),
        format: z
          .enum(['ogg', 'mp3', 'wav', 'webm', 'm4a', 'flac'])
          .default('mp3')
          .describe('Audio format'),
        language: z.string().optional().describe('Language hint (ISO 639-1)'),
      },
    },
    wrapToolHandler('multimodal_transcribe', middleware, async (args) => {
      const result = await client.post('/api/v1/multimodal/audio/transcribe', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // 5. List multimodal jobs
  server.registerTool(
    'multimodal_jobs',
    {
      description: 'List multimodal processing jobs with optional filters',
      inputSchema: {
        type: z
          .enum(['vision', 'stt', 'tts', 'image_gen'])
          .optional()
          .describe('Filter by job type'),
        status: z
          .enum(['pending', 'running', 'completed', 'failed'])
          .optional()
          .describe('Filter by status'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max results'),
      },
    },
    wrapToolHandler('multimodal_jobs', middleware, async (args) => {
      const query: Record<string, string> = { limit: String(args.limit) };
      if (args.type) query.type = args.type;
      if (args.status) query.status = args.status;
      const result = await client.get('/api/v1/multimodal/jobs', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
