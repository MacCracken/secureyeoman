/**
 * WsWarmup — Pre-acquire an OpenAI WebSocket connection and send a minimal
 * request to seed the `lastResponseId` chain before the first real user
 * message.  Reduces first-response latency for personality activations.
 *
 * Parallel to KvCacheWarmer (Ollama) — this handles the OpenAI WS path.
 */

import type { SecureLogger } from '../logging/logger.js';
import type { OpenAIWsTransport, WsServerEvent } from './transports/openai-ws-transport.js';

export interface WsWarmupConfig {
  /** Whether warm-up is enabled. Default: false. */
  enabled: boolean;
  /** Timeout for the warm-up request (ms). Default: 15 000. */
  timeoutMs?: number;
  /** Model to use for warm-up. Inherited from provider config when omitted. */
  model?: string;
}

export interface WsWarmupDeps {
  logger: SecureLogger;
  transport: OpenAIWsTransport;
  config: WsWarmupConfig;
}

export class WsWarmup {
  constructor(private readonly deps: WsWarmupDeps) {}

  get enabled(): boolean {
    return this.deps.config.enabled;
  }

  /**
   * Pre-acquire a connection for `sessionKey` and send a minimal
   * `response.create` with the system prompt and `max_output_tokens: 1`.
   * This forces OpenAI to load the model and tools, seeding
   * `lastResponseId` for subsequent incremental turns.
   */
  async warmup(
    sessionKey: string,
    opts: {
      model: string;
      systemPrompt?: string;
      tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
    }
  ): Promise<boolean> {
    if (!this.deps.config.enabled) return false;

    const timeoutMs = this.deps.config.timeoutMs ?? 15_000;
    const { logger, transport } = this.deps;

    try {
      const conn = await transport.acquire(sessionKey);

      const input: unknown[] = [];
      if (opts.systemPrompt) {
        input.push({
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: opts.systemPrompt }],
        });
      }
      // Minimal user message to trigger model loading
      input.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '.' }],
      });

      const payload: Record<string, unknown> = {
        type: 'response.create',
        response: {
          model: opts.model,
          modalities: ['text'],
          max_output_tokens: 1,
          input,
          ...(opts.tools?.length
            ? {
                tools: opts.tools.map((t) => ({
                  type: 'function',
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                })),
              }
            : {}),
        },
      };

      // Consume events until done or timeout
      const deadline = Date.now() + timeoutMs;
      for await (const event of transport.send(conn, payload)) {
        if (Date.now() > deadline) {
          logger.warn({ sessionKey }, 'WS warm-up timed out');
          transport.release(conn);
          return false;
        }

        if (isTerminal(event)) break;
      }

      transport.release(conn);

      logger.info(
        { sessionKey, model: opts.model, hasTools: !!opts.tools?.length },
        'WS connection warmed successfully'
      );
      return true;
    } catch (err) {
      logger.warn(
        {
          sessionKey,
          error: err instanceof Error ? err.message : String(err),
        },
        'WS warm-up error'
      );
      return false;
    }
  }
}

function isTerminal(event: WsServerEvent): boolean {
  return (
    event.type === 'response.completed' ||
    event.type === 'response.failed' ||
    event.type === 'response.cancelled' ||
    event.type === 'error'
  );
}
