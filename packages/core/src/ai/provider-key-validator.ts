/**
 * ProviderKeyValidator — validates API keys for each AI provider (Phase 112).
 *
 * Uses provider-specific endpoints to verify key validity.
 */

import type { AIProviderName } from '@secureyeoman/shared';

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
  models?: string[];
}

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'localai']);

const PROVIDER_HEALTH_URLS: Record<string, string> = {
  ollama: '/api/tags',
  lmstudio: '/v1/models',
  localai: '/v1/models',
};

const PROVIDER_MODEL_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1/models',
  openai: 'https://api.openai.com/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  deepseek: 'https://api.deepseek.com/models',
  mistral: 'https://api.mistral.ai/v1/models',
  grok: 'https://api.x.ai/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
  opencode: 'https://api.opencode.ai/v1/models',
  letta: 'https://api.letta.com/v1/models',
};

export class ProviderKeyValidator {
  /**
   * Validate an API key for a specific provider.
   */
  async validate(
    provider: AIProviderName,
    apiKey: string,
    baseUrl?: string
  ): Promise<KeyValidationResult> {
    if (LOCAL_PROVIDERS.has(provider)) {
      return this.validateLocal(provider, baseUrl);
    }

    const url = PROVIDER_MODEL_URLS[provider];
    if (!url) {
      // Unknown provider — pass through as valid
      return { valid: true };
    }

    return this.validateCloud(provider, apiKey, baseUrl ?? url);
  }

  private async validateLocal(provider: string, baseUrl?: string): Promise<KeyValidationResult> {
    const defaults: Record<string, string> = {
      ollama: 'http://localhost:11434',
      lmstudio: 'http://localhost:1234',
      localai: 'http://localhost:8080',
    };
    const base = baseUrl ?? defaults[provider] ?? 'http://localhost:8080';
    const healthPath = PROVIDER_HEALTH_URLS[provider] ?? '/v1/models';

    try {
      const res = await fetch(`${base}${healthPath}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        return { valid: true };
      }
      return { valid: false, error: `Health check returned ${res.status}` };
    } catch (err) {
      return {
        valid: false,
        error: `Unreachable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async validateCloud(
    provider: string,
    apiKey: string,
    url: string
  ): Promise<KeyValidationResult> {
    try {
      const headers: Record<string, string> = {};

      // Provider-specific auth headers
      if (provider === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else if (provider === 'gemini') {
        // Gemini uses query param — append to URL
        const separator = url.includes('?') ? '&' : '?';
        const geminiUrl = `${url}${separator}key=${apiKey}`;
        const res = await fetch(geminiUrl, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = (await res.json()) as { models?: { name: string }[] };
          const models = (data.models ?? []).map((m) => m.name);
          return { valid: true, models };
        }
        return { valid: false, error: `API returned ${res.status}` };
      } else {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      // OpenRouter-specific headers
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://secureyeoman.com';
        headers['X-Title'] = 'SecureYeoman';
      }

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = (await res.json()) as { data?: { id: string }[] };
        const models = (data.data ?? []).map((m) => m.id);
        return { valid: true, models };
      }

      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: 'Invalid API key' };
      }

      return { valid: false, error: `API returned ${res.status}` };
    } catch (err) {
      return {
        valid: false,
        error: `Validation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
