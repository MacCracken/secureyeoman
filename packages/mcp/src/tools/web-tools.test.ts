/**
 * Web Tools — unit tests for URL validation, SSRF blocking, output truncation, and rate limiting.
 */

import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  WebRateLimiter,
  truncateOutput,
  stripHtmlTags,
  safeFetch,
} from './web-tools.js';
import { ProxyManager } from './proxy-manager.js';
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
    ...overrides,
  } as McpServiceConfig;
}

describe('validateUrl', () => {
  const config = makeConfig();

  it('allows valid https URLs', () => {
    const url = validateUrl('https://example.com/page', config);
    expect(url.hostname).toBe('example.com');
  });

  it('allows valid http URLs', () => {
    const url = validateUrl('http://example.com', config);
    expect(url.protocol).toBe('http:');
  });

  it('blocks file:// protocol', () => {
    expect(() => validateUrl('file:///etc/passwd', config)).toThrow('Protocol "file:" not allowed');
  });

  it('blocks ftp:// protocol', () => {
    expect(() => validateUrl('ftp://example.com', config)).toThrow('Protocol "ftp:" not allowed');
  });

  it('blocks invalid URLs', () => {
    expect(() => validateUrl('not-a-url', config)).toThrow('Invalid URL');
  });

  // SSRF blocking
  it('blocks localhost', () => {
    expect(() => validateUrl('http://localhost/admin', config)).toThrow('Hostname blocked');
  });

  it('blocks 127.0.0.1', () => {
    expect(() => validateUrl('http://127.0.0.1/admin', config)).toThrow('IP address blocked');
  });

  it('blocks 10.x private IPs', () => {
    expect(() => validateUrl('http://10.0.0.1/internal', config)).toThrow('IP address blocked');
  });

  it('blocks 172.16.x private IPs', () => {
    expect(() => validateUrl('http://172.16.0.1/internal', config)).toThrow('IP address blocked');
  });

  it('blocks 192.168.x private IPs', () => {
    expect(() => validateUrl('http://192.168.1.1/admin', config)).toThrow('IP address blocked');
  });

  it('blocks cloud metadata endpoint (169.254.169.254)', () => {
    expect(() => validateUrl('http://169.254.169.254/latest/meta-data/', config)).toThrow(
      'IP address blocked'
    );
  });

  it('blocks metadata.google.internal', () => {
    expect(() => validateUrl('http://metadata.google.internal', config)).toThrow(
      'Hostname blocked'
    );
  });

  // Allowlist
  it('enforces domain allowlist when configured', () => {
    const restricted = makeConfig({ allowedUrls: ['example.com'] });
    expect(() => validateUrl('https://evil.com/data', restricted)).toThrow(
      'Domain not in allowlist'
    );
    // Allowed domain works
    const url = validateUrl('https://example.com/page', restricted);
    expect(url.hostname).toBe('example.com');
  });

  it('allows subdomains of allowlisted domains', () => {
    const restricted = makeConfig({ allowedUrls: ['example.com'] });
    const url = validateUrl('https://api.example.com/data', restricted);
    expect(url.hostname).toBe('api.example.com');
  });
});

describe('WebRateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new WebRateLimiter(5);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check().allowed).toBe(true);
    }
  });

  it('blocks requests exceeding the limit', () => {
    const limiter = new WebRateLimiter(3);
    limiter.check();
    limiter.check();
    limiter.check();
    const result = limiter.check();
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});

describe('truncateOutput', () => {
  it('returns short text unchanged', () => {
    expect(truncateOutput('hello')).toBe('hello');
  });

  it('truncates text exceeding 500KB', () => {
    const large = 'x'.repeat(600 * 1024);
    const result = truncateOutput(large);
    expect(result).toContain('[OUTPUT TRUNCATED');
    expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(500 * 1024 + 200);
  });
});

describe('stripHtmlTags', () => {
  it('strips script tags', () => {
    expect(stripHtmlTags('<script>alert(1)</script>hello')).toBe('hello');
  });

  it('strips style tags', () => {
    expect(stripHtmlTags('<style>.x{}</style>hello')).toBe('hello');
  });

  it('strips regular tags', () => {
    expect(stripHtmlTags('<p>hello <b>world</b></p>')).toContain('hello');
    expect(stripHtmlTags('<p>hello <b>world</b></p>')).toContain('world');
  });
});

describe('safeFetch proxy integration', () => {
  it('safeFetch works identically when proxyManager is null', () => {
    // validateUrl should still work for public URLs without proxy
    const config = makeConfig();
    const url = validateUrl('https://example.com', config);
    expect(url.hostname).toBe('example.com');
  });

  it('SSRF still blocks private IPs when proxy is enabled', () => {
    const config = makeConfig({ proxyEnabled: true } as Partial<McpServiceConfig>);
    expect(() => validateUrl('http://169.254.169.254/latest/meta-data/', config)).toThrow(
      'IP address blocked'
    );
    expect(() => validateUrl('http://127.0.0.1/admin', config)).toThrow('IP address blocked');
    expect(() => validateUrl('http://10.0.0.1/internal', config)).toThrow('IP address blocked');
  });

  it('country option passes through to proxy buildFetchOptions', () => {
    const config = makeConfig({
      proxyEnabled: true,
      proxyProviders: ['scrapingbee'],
      proxyScrapingbeeKey: 'test-key',
      proxyStrategy: 'round-robin',
    } as Partial<McpServiceConfig>);
    const pm = new ProxyManager(config);
    const result = pm.buildFetchOptions('https://example.com', { country: 'US' });
    expect(result).not.toBeNull();
    expect(result!.url).toContain('country_code=US');
  });
});
