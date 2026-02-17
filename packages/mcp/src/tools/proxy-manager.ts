/**
 * Proxy Manager — provider-agnostic proxy rotation with CAPTCHA detection and retry logic.
 *
 * Supports Bright Data (HTTP proxy), ScrapingBee (API rewrite), and ScraperAPI (API rewrite).
 * Feature-gated behind MCP_PROXY_ENABLED (default: false).
 */

import type { McpServiceConfig } from '@secureyeoman/shared';

// ─── Types ───────────────────────────────────────────────────

export interface ProxyRequestOptions {
  country?: string;
}

export interface ProxyProvider {
  name: string;
  type: 'http-proxy' | 'api-rewrite';
  formatUrl(target: string, options?: ProxyRequestOptions): string;
  formatHeaders(options?: ProxyRequestOptions): Record<string, string>;
}

export interface FetchWithRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
  onCaptcha?: (attempt: number) => void;
}

// ─── Providers ───────────────────────────────────────────────

class BrightDataProvider implements ProxyProvider {
  readonly name = 'brightdata';
  readonly type = 'http-proxy' as const;
  private readonly proxyUrl: string;

  constructor(proxyUrl: string) {
    this.proxyUrl = proxyUrl;
  }

  formatUrl(target: string, options?: ProxyRequestOptions): string {
    if (options?.country) {
      const url = new URL(this.proxyUrl);
      const username = url.username;
      url.username = `${username}-country-${options.country.toLowerCase()}`;
      return url.href;
    }
    return this.proxyUrl;
  }

  formatHeaders(_options?: ProxyRequestOptions): Record<string, string> {
    return {};
  }
}

class ScrapingBeeProvider implements ProxyProvider {
  readonly name = 'scrapingbee';
  readonly type = 'api-rewrite' as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  formatUrl(target: string, options?: ProxyRequestOptions): string {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      url: target,
    });
    if (options?.country) {
      params.set('country_code', options.country.toUpperCase());
    }
    return `https://app.scrapingbee.com/api/v1/?${params}`;
  }

  formatHeaders(_options?: ProxyRequestOptions): Record<string, string> {
    return {};
  }
}

class ScraperAPIProvider implements ProxyProvider {
  readonly name = 'scraperapi';
  readonly type = 'api-rewrite' as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  formatUrl(target: string, options?: ProxyRequestOptions): string {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      url: target,
    });
    if (options?.country) {
      params.set('country_code', options.country.toUpperCase());
    }
    return `https://api.scraperapi.com/?${params}`;
  }

  formatHeaders(_options?: ProxyRequestOptions): Record<string, string> {
    return {};
  }
}

// ─── CAPTCHA Detection ───────────────────────────────────────

const CAPTCHA_PATTERNS = [
  /captcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /cf-challenge/i,
  /challenge-platform/i,
  /verify you are human/i,
  /just a moment/i,
  /checking your browser/i,
];

export function detectCaptcha(body: string, status: number): boolean {
  if (status !== 403 && status !== 429) return false;
  return CAPTCHA_PATTERNS.some((pattern) => pattern.test(body));
}

// ─── Retryable Error ─────────────────────────────────────────

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly isCaptcha: boolean = false
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

// ─── fetchWithRetry ──────────────────────────────────────────

export async function fetchWithRetry(
  fetchFn: () => Promise<Response>,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 15000,
    retryableStatuses = [429, 500, 502, 503],
    onCaptcha,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchFn();

      // Clone so we can read the body for CAPTCHA detection without consuming it
      const cloned = response.clone();
      const body = await cloned.text();

      if (detectCaptcha(body, response.status)) {
        onCaptcha?.(attempt);
        if (attempt < maxRetries) {
          await delay(computeDelay(attempt, baseDelayMs, maxDelayMs));
          continue;
        }
        throw new RetryableError(
          `CAPTCHA detected after ${maxRetries + 1} attempts`,
          response.status,
          true
        );
      }

      if (retryableStatuses.includes(response.status)) {
        if (attempt < maxRetries) {
          await delay(computeDelay(attempt, baseDelayMs, maxDelayMs));
          continue;
        }
        throw new RetryableError(
          `HTTP ${response.status} after ${maxRetries + 1} attempts`,
          response.status
        );
      }

      return response;
    } catch (err) {
      if (err instanceof RetryableError) throw err;

      // Network errors (TypeError from fetch) are retryable
      if (err instanceof TypeError || (err instanceof Error && err.name === 'TypeError')) {
        lastError = err;
        if (attempt < maxRetries) {
          await delay(computeDelay(attempt, baseDelayMs, maxDelayMs));
          continue;
        }
      } else {
        throw err;
      }
    }
  }

  throw lastError ?? new Error('fetchWithRetry exhausted all retries');
}

function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.min(exponential + jitter, maxDelayMs);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── ProxyManager ────────────────────────────────────────────

export class ProxyManager {
  private readonly providers: ProxyProvider[] = [];
  private readonly strategy: 'round-robin' | 'random';
  private roundRobinIndex = 0;

  constructor(config: McpServiceConfig) {
    this.strategy = config.proxyStrategy;

    for (const name of config.proxyProviders) {
      switch (name) {
        case 'brightdata':
          if (config.proxyBrightdataUrl) {
            this.providers.push(new BrightDataProvider(config.proxyBrightdataUrl));
          }
          break;
        case 'scrapingbee':
          if (config.proxyScrapingbeeKey) {
            this.providers.push(new ScrapingBeeProvider(config.proxyScrapingbeeKey));
          }
          break;
        case 'scraperapi':
          if (config.proxyScraperapiKey) {
            this.providers.push(new ScraperAPIProvider(config.proxyScraperapiKey));
          }
          break;
      }
    }
  }

  getNextProvider(): ProxyProvider | null {
    if (this.providers.length === 0) return null;

    if (this.strategy === 'random') {
      return this.providers[Math.floor(Math.random() * this.providers.length)]!;
    }

    // round-robin
    const provider = this.providers[this.roundRobinIndex % this.providers.length]!;
    this.roundRobinIndex++;
    return provider;
  }

  buildFetchOptions(
    targetUrl: string,
    options?: ProxyRequestOptions
  ): { url: string; headers: Record<string, string> } | null {
    const provider = this.getNextProvider();
    if (!provider) return null;

    const country = options?.country;
    const reqOpts: ProxyRequestOptions = { country };

    if (provider.type === 'api-rewrite') {
      return {
        url: provider.formatUrl(targetUrl, reqOpts),
        headers: provider.formatHeaders(reqOpts),
      };
    }

    // http-proxy: the proxy URL is the server, target is the actual URL
    return {
      url: targetUrl,
      headers: {
        ...provider.formatHeaders(reqOpts),
        'X-Proxy-Server': provider.formatUrl(targetUrl, reqOpts),
      },
    };
  }

  getPlaywrightProxyConfig(): { server: string; username?: string; password?: string } | null {
    // Only HTTP-proxy type providers work with Playwright
    const httpProxy = this.providers.find((p) => p.type === 'http-proxy');
    if (!httpProxy) return null;

    const proxyUrl = httpProxy.formatUrl('', {});
    try {
      const parsed = new URL(proxyUrl);
      return {
        server: `${parsed.protocol}//${parsed.host}`,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
      };
    } catch {
      return null;
    }
  }

  get providerCount(): number {
    return this.providers.length;
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }
}
