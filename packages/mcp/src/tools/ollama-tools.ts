/**
 * Ollama Tools — MCP tools for managing local Ollama models.
 *
 * Tools:
 *   ollama_pull  — Pull (download) a model from the Ollama registry
 *   ollama_rm    — Remove a locally downloaded Ollama model
 *
 * Both tools proxy through the core API's Ollama lifecycle endpoints.
 * They only work when the core is configured with provider = 'ollama'.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerOllamaTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── ollama_pull ───────────────────────────────────────────────
  server.registerTool(
    'ollama_pull',
    {
      description:
        'Pull (download) an Ollama model from the registry. ' +
        'Streams progress and returns a summary when complete. ' +
        'Only available when the core AI provider is set to ollama. ' +
        'Example model names: "llama3:8b", "mistral:7b-instruct-q4_K_M", "phi3:mini".',
      inputSchema: {
        model: z
          .string()
          .min(1)
          .describe('Model name with optional tag (e.g. "llama3:8b", "llama3:8b-instruct-q4_K_M")'),
      },
    },
    wrapToolHandler('ollama_pull', middleware, async (args) => {
      // Call the SSE pull endpoint and wait for completion
      // CoreApiClient.post reads the full response body as JSON,
      // so we just fire the request and let the server stream internally.
      // For MCP we want a summary result, not a raw SSE stream.
      const result = await client.post('/api/v1/model/ollama/pull', { model: args.model });
      const summary = result as { success?: boolean; error?: string };
      if (summary.error) {
        return {
          content: [{ type: 'text' as const, text: `Pull failed: ${summary.error}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, model: args.model }, null, 2),
          },
        ],
      };
    })
  );

  // ── ollama_rm ─────────────────────────────────────────────────
  server.registerTool(
    'ollama_rm',
    {
      description:
        'Remove a locally downloaded Ollama model to free disk space. ' +
        'Only available when the core AI provider is set to ollama. ' +
        'Returns 404 if the model is not found locally.',
      inputSchema: {
        model: z
          .string()
          .min(1)
          .describe('Model name to remove (e.g. "llama3:8b", "mistral:7b-instruct-q4_K_M")'),
      },
    },
    wrapToolHandler('ollama_rm', middleware, async (args) => {
      const encodedName = encodeURIComponent(String(args.model));
      await client.delete(`/api/v1/model/ollama/${encodedName}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, model: args.model }, null, 2),
          },
        ],
      };
    })
  );
}
