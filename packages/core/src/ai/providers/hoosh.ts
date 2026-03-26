/**
 * Hoosh Gateway Provider
 *
 * Routes all LLM calls through the hoosh AI inference gateway, which provides:
 * - Multi-provider routing (OpenAI, Anthropic, Gemini, Ollama, Groq, Mistral, etc.)
 * - Configurable routing strategies (Priority, RoundRobin, LowestLatency)
 * - Token budget management
 * - Response caching and rate limiting
 * - Local-first with cloud fallback
 *
 * Uses OpenAI-compatible /v1/chat/completions endpoint.
 * This is the Phase 3 migration provider — replaces 16 individual provider SDKs
 * with a single HTTP call to hoosh.
 */

import type { AIRequest, AIResponse, AIStreamChunk, AIProviderName } from '@secureyeoman/shared';
import { BaseProvider, type ProviderConfig } from './base.js';
import { ProviderUnavailableError, InvalidResponseError } from '../errors.js';
import type { SecureLogger } from '../../logging/logger.js';
import type { AgnosClient } from '../../integrations/agnos/agnos-client.js';
import {
  type OAIChatResponse,
  mapMessagesToOAI,
  mapToolsToOAI,
  mapOAIResponse,
  mapOAIStreamChunk,
  buildOAIRequestBody,
  parseOAISSEStream,
} from './oai-compat.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8088';

export interface HooshProviderConfig {
  /** AgnosClient for token budget calls. Optional — skipped when absent. */
  agnosClient?: AgnosClient;
  /** Token budget project identifier. Default: 'secureyeoman'. */
  project?: string;
  /** Token budget pool name. Default: 'default'. */
  pool?: string;
}

export class HooshProvider extends BaseProvider {
  readonly name: AIProviderName = 'hoosh';
  private readonly baseUrl: string;
  private readonly agnosClient?: AgnosClient;
  private readonly tokenProject: string;
  private readonly tokenPool: string;

  constructor(
    config: ProviderConfig,
    logger?: SecureLogger,
    hooshConfig?: HooshProviderConfig
  ) {
    super(config, logger);
    this.baseUrl = config.model.baseUrl ?? DEFAULT_BASE_URL;
    this.agnosClient = hooshConfig?.agnosClient;
    this.tokenProject = hooshConfig?.project ?? 'secureyeoman';
    this.tokenPool = hooshConfig?.pool ?? 'default';
  }

  // ─── Chat ───────────────────────────────────────────────────

  protected async doChat(request: AIRequest): Promise<AIResponse> {
    const model = this.resolveModel(request);
    const body = buildOAIRequestBody(
      mapMessagesToOAI(request.messages),
      request.tools?.length ? mapToolsToOAI(request.tools) : undefined,
      model,
      this.resolveTemperature(request),
      this.resolveMaxTokens(request),
      false,
      request.stopSequences
    );

    await this.checkTokenBudget(body);

    const response = await this.fetchApi(body);
    const data = (await response.json()) as OAIChatResponse;
    const mapped = mapOAIResponse(data, model, 'hoosh');

    await this.reportTokenUsage(mapped.usage.totalTokens);

    return mapped;
  }

  async *chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown> {
    const model = this.resolveModel(request);
    const body = buildOAIRequestBody(
      mapMessagesToOAI(request.messages),
      request.tools?.length ? mapToolsToOAI(request.tools) : undefined,
      model,
      this.resolveTemperature(request),
      this.resolveMaxTokens(request),
      true,
      request.stopSequences
    );

    await this.checkTokenBudget(body);

    const response = await this.fetchApi(body);

    if (!response.body) {
      throw new InvalidResponseError('hoosh', 'No response body for streaming');
    }

    for await (const chunk of parseOAISSEStream(response.body.getReader(), new TextDecoder())) {
      yield* mapOAIStreamChunk(chunk);
    }
  }

  // ─── Gateway Discovery ──────────────────────────────────────

  /** Check if the hoosh gateway is reachable and healthy. */
  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** List models available through the hoosh gateway. */
  async listModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return [];

      const data = (await res.json()) as { data?: { id: string }[] };
      return data.data?.map((m) => m.id) ?? [];
    } catch {
      return [];
    }
  }

  // ─── HTTP ───────────────────────────────────────────────────

  private async fetchApi(body: Record<string, unknown>): Promise<Response> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.modelConfig.requestTimeoutMs),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderUnavailableError('hoosh', 429);
        }
        if (response.status >= 500) {
          throw new ProviderUnavailableError('hoosh', response.status);
        }
        throw new InvalidResponseError(
          'hoosh',
          `HTTP ${response.status}: ${await response.text().catch(() => '')}`
        );
      }

      return response;
    } catch (error) {
      if (error instanceof InvalidResponseError || error instanceof ProviderUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        throw new ProviderUnavailableError(
          'hoosh',
          undefined,
          error instanceof Error ? error : undefined
        );
      }
      throw error;
    }
  }

  // ─── Token Budget ───────────────────────────────────────────

  private async checkTokenBudget(body: Record<string, unknown>): Promise<void> {
    if (!this.agnosClient) return;

    try {
      const estimated = Math.ceil(JSON.stringify(body).length / 4);
      const check = await this.agnosClient.tokenCheck(this.tokenProject, estimated, this.tokenPool);

      if (!check.allowed) {
        throw new ProviderUnavailableError(
          'hoosh',
          429,
          new Error(
            `Token budget exceeded for pool "${this.tokenPool}" (remaining: ${check.remaining ?? 0})`
          )
        );
      }

      await this.agnosClient.tokenReserve(this.tokenProject, estimated, this.tokenPool);
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      this.logger?.debug?.(
        { error: err instanceof Error ? err.message : String(err) },
        'Token budget check failed (non-fatal)'
      );
    }
  }

  private async reportTokenUsage(actualTokens: number): Promise<void> {
    if (!this.agnosClient || actualTokens <= 0) return;

    try {
      await this.agnosClient.tokenReport(this.tokenProject, actualTokens, this.tokenPool);
    } catch {
      // Best-effort — don't block on reporting failures
    }
  }
}
