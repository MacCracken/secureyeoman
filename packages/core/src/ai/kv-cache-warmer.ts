/**
 * KvCacheWarmer — on personality activation, POST to Ollama /api/chat
 * with keep_alive: '30m', num_predict: 1 to warm the KV cache.
 */

import type { SecureLogger } from '../logging/logger.js';

export interface KvCacheWarmerConfig {
  enabled: boolean;
  keepAlive: string;
}

export interface KvCacheWarmerDeps {
  logger: SecureLogger;
  ollamaBaseUrl: string;
  config: KvCacheWarmerConfig;
}

export class KvCacheWarmer {
  constructor(private readonly deps: KvCacheWarmerDeps) {}

  get enabled(): boolean {
    return this.deps.config.enabled;
  }

  /**
   * Warm the KV cache for a model + system prompt on Ollama.
   * Sends a minimal request with num_predict=1 and keep_alive to keep the model loaded.
   */
  async warmup(model: string, systemPrompt?: string): Promise<boolean> {
    if (!this.deps.config.enabled) return false;

    try {
      const baseUrl = this.deps.ollamaBaseUrl.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: 'hi' },
          ],
          stream: false,
          options: {
            num_predict: 1,
          },
          keep_alive: this.deps.config.keepAlive,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        this.deps.logger.warn(
          'KV cache warmup request failed',
          { model, status: response.status }
        );
        return false;
      }

      this.deps.logger.info(
        'KV cache warmed successfully',
        { model, keepAlive: this.deps.config.keepAlive }
      );
      return true;
    } catch (err) {
      this.deps.logger.warn(
        'KV cache warmup error',
        { model, error: err instanceof Error ? err.message : String(err) }
      );
      return false;
    }
  }
}
