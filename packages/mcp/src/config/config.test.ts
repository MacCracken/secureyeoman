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
});
