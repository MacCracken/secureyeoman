/**
 * Proxy Manager — unit tests for ProxyManager, providers, CAPTCHA detection, and fetchWithRetry.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ProxyManager,
  detectCaptcha,
  fetchWithRetry,
  RetryableError,
} from './proxy-manager.js';
import type { McpServiceConfig } from '@secureyeoman/shared';

function makeConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: true,
    coreUrl: 'http://127.0.0.1:18789',
    exposeFilesystem: false,
    allowedPaths: [],
    exposeWeb: true,
    allowedUrls: [],
    webRateLimitPerMinute: 10,
    exposeWebScraping: true,
    exposeWebSearch: true,
    webSearchProvider: 'duckduckgo',
    rateLimitPerTool: 30,
    logLevel: 'info',
    exposeBrowser: false,
    browserEngine: 'playwright',
    browserHeadless: true,
    browserMaxPages: 3,
    browserTimeoutMs: 30000,
    proxyEnabled: true,
    proxyProviders: [],
    proxyStrategy: 'round-robin',
    proxyMaxRetries: 3,
    proxyRetryBaseDelayMs: 1000,
    ...overrides,
  } as McpServiceConfig;
}

// ─── ProxyManager ────────────────────────────────────────────

describe('ProxyManager', () => {
  it('initializes with no providers when none configured', () => {
    const pm = new ProxyManager(makeConfig({ proxyProviders: [] }));
    expect(pm.providerCount).toBe(0);
    expect(pm.getNextProvider()).toBeNull();
  });

  it('initializes only providers with credentials', () => {
    const pm = new ProxyManager(
      makeConfig({
        proxyProviders: ['brightdata', 'scrapingbee', 'scraperapi'],
        proxyScrapingbeeKey: 'test-key',
        // brightdata and scraperapi have no credentials → skipped
      })
    );
    expect(pm.providerCount).toBe(1);
    expect(pm.providerNames).toEqual(['scrapingbee']);
  });

  it('initializes all providers when all have credentials', () => {
    const pm = new ProxyManager(
      makeConfig({
        proxyProviders: ['brightdata', 'scrapingbee', 'scraperapi'],
        proxyBrightdataUrl: 'http://user:pass@brd.superproxy.io:22225',
        proxyScrapingbeeKey: 'sb-key',
        proxyScraperapiKey: 'sa-key',
      })
    );
    expect(pm.providerCount).toBe(3);
    expect(pm.providerNames).toEqual(['brightdata', 'scrapingbee', 'scraperapi']);
  });

  describe('getNextProvider — round-robin', () => {
    it('cycles through providers in order', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scrapingbee', 'scraperapi'],
          proxyScrapingbeeKey: 'sb-key',
          proxyScraperapiKey: 'sa-key',
          proxyStrategy: 'round-robin',
        })
      );
      expect(pm.getNextProvider()?.name).toBe('scrapingbee');
      expect(pm.getNextProvider()?.name).toBe('scraperapi');
      expect(pm.getNextProvider()?.name).toBe('scrapingbee');
    });
  });

  describe('getNextProvider — random', () => {
    it('returns a valid provider', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scrapingbee', 'scraperapi'],
          proxyScrapingbeeKey: 'sb-key',
          proxyScraperapiKey: 'sa-key',
          proxyStrategy: 'random',
        })
      );
      const provider = pm.getNextProvider();
      expect(provider).not.toBeNull();
      expect(['scrapingbee', 'scraperapi']).toContain(provider!.name);
    });
  });

  describe('buildFetchOptions', () => {
    it('returns null when no providers available', () => {
      const pm = new ProxyManager(makeConfig({ proxyProviders: [] }));
      expect(pm.buildFetchOptions('https://example.com')).toBeNull();
    });

    it('returns rewritten URL for API-rewrite provider', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scrapingbee'],
          proxyScrapingbeeKey: 'test-key',
        })
      );
      const result = pm.buildFetchOptions('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.url).toContain('app.scrapingbee.com');
      expect(result!.url).toContain('api_key=test-key');
      expect(result!.url).toContain(encodeURIComponent('https://example.com'));
    });

    it('includes country for API-rewrite provider', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scrapingbee'],
          proxyScrapingbeeKey: 'test-key',
        })
      );
      const result = pm.buildFetchOptions('https://example.com', { country: 'US' });
      expect(result!.url).toContain('country_code=US');
    });

    it('returns original URL + proxy header for HTTP proxy provider', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['brightdata'],
          proxyBrightdataUrl: 'http://user:pass@brd.superproxy.io:22225',
        })
      );
      const result = pm.buildFetchOptions('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://example.com');
      expect(result!.headers['X-Proxy-Server']).toContain('brd.superproxy.io');
    });
  });

  describe('getPlaywrightProxyConfig', () => {
    it('returns null when no HTTP-proxy providers', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scrapingbee'],
          proxyScrapingbeeKey: 'test-key',
        })
      );
      expect(pm.getPlaywrightProxyConfig()).toBeNull();
    });

    it('returns proxy config for HTTP-proxy provider', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['brightdata'],
          proxyBrightdataUrl: 'http://user:pass@brd.superproxy.io:22225',
        })
      );
      const config = pm.getPlaywrightProxyConfig();
      expect(config).not.toBeNull();
      expect(config!.server).toContain('brd.superproxy.io');
      expect(config!.username).toBe('user');
      expect(config!.password).toBe('pass');
    });
  });
});

// ─── Provider URL Formatting ─────────────────────────────────

describe('Provider URL formatting', () => {
  describe('BrightDataProvider', () => {
    it('formats proxy URL without country', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['brightdata'],
          proxyBrightdataUrl: 'http://user:pass@brd.superproxy.io:22225',
        })
      );
      const result = pm.buildFetchOptions('https://example.com');
      expect(result!.headers['X-Proxy-Server']).toBe(
        'http://user:pass@brd.superproxy.io:22225'
      );
    });

    it('formats proxy URL with country', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['brightdata'],
          proxyBrightdataUrl: 'http://user:pass@brd.superproxy.io:22225',
        })
      );
      const result = pm.buildFetchOptions('https://example.com', { country: 'DE' });
      expect(result!.headers['X-Proxy-Server']).toContain('-country-de');
    });
  });

  describe('ScrapingBeeProvider', () => {
    it('formats API URL with key and target', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scrapingbee'],
          proxyScrapingbeeKey: 'mykey',
        })
      );
      const result = pm.buildFetchOptions('https://example.com/page');
      expect(result!.url).toContain('api_key=mykey');
      expect(result!.url).toContain(encodeURIComponent('https://example.com/page'));
    });

    it('includes country_code when provided', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scrapingbee'],
          proxyScrapingbeeKey: 'mykey',
        })
      );
      const result = pm.buildFetchOptions('https://example.com', { country: 'gb' });
      expect(result!.url).toContain('country_code=GB');
    });
  });

  describe('ScraperAPIProvider', () => {
    it('formats API URL with key and target', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scraperapi'],
          proxyScraperapiKey: 'sakey',
        })
      );
      const result = pm.buildFetchOptions('https://example.com/data');
      expect(result!.url).toContain('api.scraperapi.com');
      expect(result!.url).toContain('api_key=sakey');
      expect(result!.url).toContain(encodeURIComponent('https://example.com/data'));
    });

    it('includes country_code when provided', () => {
      const pm = new ProxyManager(
        makeConfig({
          proxyProviders: ['scraperapi'],
          proxyScraperapiKey: 'sakey',
        })
      );
      const result = pm.buildFetchOptions('https://example.com', { country: 'JP' });
      expect(result!.url).toContain('country_code=JP');
    });
  });
});

// ─── detectCaptcha ───────────────────────────────────────────

describe('detectCaptcha', () => {
  it('returns false for normal HTML', () => {
    expect(detectCaptcha('<html><body>Hello</body></html>', 200)).toBe(false);
  });

  it('returns false for 403 without CAPTCHA indicators', () => {
    expect(detectCaptcha('<html><body>Access Denied</body></html>', 403)).toBe(false);
  });

  it('returns true for reCAPTCHA on 403', () => {
    expect(detectCaptcha('<html><div class="g-recaptcha"></div></html>', 403)).toBe(true);
  });

  it('returns true for hCaptcha on 429', () => {
    expect(detectCaptcha('<html><div class="hcaptcha"></div></html>', 429)).toBe(true);
  });

  it('returns true for Cloudflare challenge on 403', () => {
    expect(detectCaptcha('<html><div id="cf-challenge-running"></div></html>', 403)).toBe(true);
  });

  it('returns true for challenge-platform on 403', () => {
    expect(detectCaptcha('<script src="/challenge-platform/abc.js"></script>', 403)).toBe(true);
  });

  it('returns true for "Verify you are human" on 403', () => {
    expect(detectCaptcha('<html><p>Verify you are human</p></html>', 403)).toBe(true);
  });

  it('returns true for "Just a moment" on 429', () => {
    expect(detectCaptcha('<html><title>Just a moment...</title></html>', 429)).toBe(true);
  });

  it('returns true for "Checking your browser" on 403', () => {
    expect(detectCaptcha('<html><p>Checking your browser before accessing</p></html>', 403)).toBe(
      true
    );
  });

  it('is case-insensitive', () => {
    expect(detectCaptcha('<html>RECAPTCHA</html>', 403)).toBe(true);
    expect(detectCaptcha('<html>JUST A MOMENT</html>', 429)).toBe(true);
  });

  it('returns false for 200 even with CAPTCHA text', () => {
    expect(detectCaptcha('<html>recaptcha documentation</html>', 200)).toBe(false);
  });

  it('returns false for 404 with CAPTCHA text', () => {
    expect(detectCaptcha('<html>captcha not found</html>', 404)).toBe(false);
  });
});

// ─── fetchWithRetry ──────────────────────────────────────────

describe('fetchWithRetry', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200 })
    );
    const result = await fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const result = await fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it('retries on 503', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const result = await fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it('retries on network errors (TypeError)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const result = await fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it('throws after max retries exhausted on 429', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    await expect(
      fetchWithRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('HTTP 429 after 3 attempts');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries exhausted on network error', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      fetchWithRetry(fn, { maxRetries: 1, baseDelayMs: 10 })
    ).rejects.toThrow('fetch failed');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 404', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    const result = await fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(404);
  });

  it('does not retry on 200', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const result = await fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
  });

  it('calls onCaptcha callback when CAPTCHA detected', async () => {
    const onCaptcha = vi.fn();
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response('recaptcha', { status: 403 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10, onCaptcha });
    expect(onCaptcha).toHaveBeenCalledWith(0);
  });

  it('retries on CAPTCHA detection and eventually throws', async () => {
    const fn = vi.fn().mockResolvedValue(
      new Response('<html>recaptcha challenge</html>', { status: 403 })
    );
    await expect(
      fetchWithRetry(fn, { maxRetries: 1, baseDelayMs: 10 })
    ).rejects.toThrow('CAPTCHA detected after 2 attempts');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('some other error'));
    await expect(
      fetchWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 })
    ).rejects.toThrow('some other error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects maxRetries=0 (no retries)', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    await expect(
      fetchWithRetry(fn, { maxRetries: 0, baseDelayMs: 10 })
    ).rejects.toThrow('HTTP 429 after 1 attempts');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
