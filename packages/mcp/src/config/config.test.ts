import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

describe('config', () => {
  it('should load defaults when no env vars set', () => {
    const config = loadConfig({});
    expect(config.enabled).toBe(true);
    expect(config.port).toBe(3001);
    expect(config.host).toBe('127.0.0.1');
    expect(config.transport).toBe('streamable-http');
    expect(config.autoRegister).toBe(true);
    expect(config.coreUrl).toBe('http://127.0.0.1:18789');
    expect(config.exposeFilesystem).toBe(false);
    expect(config.allowedPaths).toEqual([]);
    expect(config.rateLimitPerTool).toBe(30);
    expect(config.logLevel).toBe('info');
  });

  it('should parse env vars', () => {
    const config = loadConfig({
      MCP_ENABLED: 'false',
      MCP_PORT: '4000',
      MCP_HOST: '0.0.0.0',
      MCP_TRANSPORT: 'sse',
      MCP_AUTO_REGISTER: 'false',
      MCP_CORE_URL: 'http://localhost:9999',
      SECUREYEOMAN_TOKEN_SECRET: 'a-test-token-secret-that-is-at-least-32-chars',
      MCP_EXPOSE_FILESYSTEM: 'true',
      MCP_ALLOWED_PATHS: '/tmp,/var/data',
      MCP_RATE_LIMIT_PER_TOOL: '50',
      MCP_LOG_LEVEL: 'debug',
    });

    expect(config.enabled).toBe(false);
    expect(config.port).toBe(4000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.transport).toBe('sse');
    expect(config.autoRegister).toBe(false);
    expect(config.coreUrl).toBe('http://localhost:9999');
    expect(config.tokenSecret).toBe('a-test-token-secret-that-is-at-least-32-chars');
    expect(config.exposeFilesystem).toBe(true);
    expect(config.allowedPaths).toEqual(['/tmp', '/var/data']);
    expect(config.rateLimitPerTool).toBe(50);
    expect(config.logLevel).toBe('debug');
  });

  it('should handle MCP_ENABLED=1 as true', () => {
    const config = loadConfig({ MCP_ENABLED: '1' });
    expect(config.enabled).toBe(true);
  });

  it('should handle invalid port gracefully', () => {
    const config = loadConfig({ MCP_PORT: 'abc' });
    expect(config.port).toBe(3001);
  });

  it('should throw on invalid transport', () => {
    expect(() => loadConfig({ MCP_TRANSPORT: 'invalid' })).toThrow();
  });

  it('should throw on invalid log level', () => {
    expect(() => loadConfig({ MCP_LOG_LEVEL: 'invalid' })).toThrow();
  });

  it('should throw on port out of range', () => {
    expect(() => loadConfig({ MCP_PORT: '80' })).toThrow();
  });

  it('should parse empty allowed paths', () => {
    const config = loadConfig({ MCP_ALLOWED_PATHS: '' });
    expect(config.allowedPaths).toEqual([]);
  });

  // ─── Web config defaults ─────────────────────────────────

  it('should default MCP_EXPOSE_WEB to false', () => {
    const config = loadConfig({});
    expect(config.exposeWeb).toBe(false);
  });

  it('should parse MCP_EXPOSE_WEB=true', () => {
    const config = loadConfig({ MCP_EXPOSE_WEB: 'true' });
    expect(config.exposeWeb).toBe(true);
  });

  it('should split MCP_ALLOWED_URLS on commas', () => {
    const config = loadConfig({
      MCP_ALLOWED_URLS: 'example.com, api.github.com ,docs.rs',
    });
    expect(config.allowedUrls).toEqual(['example.com', 'api.github.com', 'docs.rs']);
  });

  it('should default MCP_WEB_RATE_LIMIT to 10', () => {
    const config = loadConfig({});
    expect(config.webRateLimitPerMinute).toBe(10);
  });

  it('should default MCP_WEB_SEARCH_PROVIDER to duckduckgo', () => {
    const config = loadConfig({});
    expect(config.webSearchProvider).toBe('duckduckgo');
  });

  it('should accept serpapi as MCP_WEB_SEARCH_PROVIDER', () => {
    const config = loadConfig({ MCP_WEB_SEARCH_PROVIDER: 'serpapi' });
    expect(config.webSearchProvider).toBe('serpapi');
  });

  it('should accept tavily as MCP_WEB_SEARCH_PROVIDER', () => {
    const config = loadConfig({ MCP_WEB_SEARCH_PROVIDER: 'tavily' });
    expect(config.webSearchProvider).toBe('tavily');
  });

  it('should throw on invalid MCP_WEB_SEARCH_PROVIDER', () => {
    expect(() => loadConfig({ MCP_WEB_SEARCH_PROVIDER: 'google' })).toThrow();
  });

  // ─── Browser config defaults ──────────────────────────────

  it('should default MCP_EXPOSE_BROWSER to false', () => {
    const config = loadConfig({});
    expect(config.exposeBrowser).toBe(false);
  });

  it('should default MCP_BROWSER_ENGINE to playwright', () => {
    const config = loadConfig({});
    expect(config.browserEngine).toBe('playwright');
  });

  it('should default MCP_BROWSER_MAX_PAGES to 3', () => {
    const config = loadConfig({});
    expect(config.browserMaxPages).toBe(3);
  });

  it('should default MCP_BROWSER_TIMEOUT_MS to 30000', () => {
    const config = loadConfig({});
    expect(config.browserTimeoutMs).toBe(30000);
  });

  it('should parse browser config from env vars', () => {
    const config = loadConfig({
      MCP_EXPOSE_BROWSER: 'true',
      MCP_BROWSER_ENGINE: 'puppeteer',
      MCP_BROWSER_MAX_PAGES: '5',
      MCP_BROWSER_TIMEOUT_MS: '60000',
    });
    expect(config.exposeBrowser).toBe(true);
    expect(config.browserEngine).toBe('puppeteer');
    expect(config.browserMaxPages).toBe(5);
    expect(config.browserTimeoutMs).toBe(60000);
  });

  it('should throw on invalid MCP_BROWSER_ENGINE', () => {
    expect(() => loadConfig({ MCP_BROWSER_ENGINE: 'selenium' })).toThrow();
  });
});
