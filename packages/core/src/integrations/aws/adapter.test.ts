import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AwsIntegration } from './adapter.js';
import type { IntegrationConfig } from '@secureyeoman/shared';
import type { IntegrationDeps } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Helpers ────────────────────────────────────────────────────────

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

function makeConfig(overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: 'aws_int_1',
    platform: 'aws',
    displayName: 'Test AWS',
    enabled: true,
    status: 'disconnected',
    config: {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      defaultLambda: 'my-function',
    },
    messageCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(onMessage = vi.fn().mockResolvedValue(undefined)): IntegrationDeps {
  return { logger: noopLogger(), onMessage };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AwsIntegration', () => {
  let adapter: AwsIntegration;

  beforeEach(() => {
    adapter = new AwsIntegration();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have platform "aws"', () => {
    expect(adapter.platform).toBe('aws');
  });

  it('should have rate limit of 10 per second', () => {
    expect(adapter.platformRateLimit).toEqual({ maxPerSecond: 10 });
  });

  it('should not be healthy before init', () => {
    expect(adapter.isHealthy()).toBe(false);
  });

  // ── init() ────────────────────────────────────────────────────────

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(adapter.init(makeConfig(), makeDeps())).resolves.not.toThrow();
    });

    it('should throw when accessKeyId is missing', async () => {
      const cfg = makeConfig({
        config: {
          secretAccessKey: 'wJalrXUtnFEMI',
          region: 'us-east-1',
        },
      });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'AWS integration requires accessKeyId and secretAccessKey'
      );
    });

    it('should throw when secretAccessKey is missing', async () => {
      const cfg = makeConfig({
        config: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          region: 'us-east-1',
        },
      });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow(
        'AWS integration requires accessKeyId and secretAccessKey'
      );
    });

    it('should throw when both credentials are missing', async () => {
      const cfg = makeConfig({ config: { region: 'us-east-1' } });
      await expect(adapter.init(cfg, makeDeps())).rejects.toThrow();
    });

    it('should default to us-east-1 when region is not specified', async () => {
      const cfg = makeConfig({
        config: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI',
        },
      });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
    });

    it('should initialize without defaultLambda', async () => {
      const cfg = makeConfig({
        config: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI',
          region: 'eu-west-1',
        },
      });
      await expect(adapter.init(cfg, makeDeps())).resolves.not.toThrow();
    });
  });

  // ── start() / stop() ──────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('should become healthy after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should be idempotent — calling start twice is safe', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await expect(adapter.start()).resolves.not.toThrow();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should throw if start is called before init', async () => {
      await expect(adapter.start()).rejects.toThrow('not initialized');
    });

    it('should become unhealthy after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should be safe to call stop without start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await expect(adapter.stop()).resolves.not.toThrow();
    });
  });

  // ── sendMessage() ─────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should invoke the Lambda function specified by chatId and return an ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{"statusCode":200}'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const id = await adapter.sendMessage('my-function', 'Hello Lambda');

      expect(id).toMatch(/^lambda-my-function-\d+$/);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('lambda.us-east-1.amazonaws.com');
      expect(url).toContain('/2015-03-31/functions/my-function/invocations');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.message).toBe('Hello Lambda');
    });

    it('should use defaultLambda when chatId is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      const id = await adapter.sendMessage('', 'Use default');

      expect(id).toMatch(/^lambda-my-function-\d+$/);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/functions/my-function/invocations');
    });

    it('should throw when no Lambda function name is available', async () => {
      const cfg = makeConfig({
        config: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI',
          region: 'us-east-1',
          // no defaultLambda
        },
      });
      await adapter.init(cfg, makeDeps());
      await adapter.start();

      await expect(adapter.sendMessage('', 'No function')).rejects.toThrow(
        'No Lambda function name provided and no defaultLambda configured'
      );
    });

    it('should throw when Lambda invocation fails with non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Function not found'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();

      await expect(adapter.sendMessage('my-function', 'Fail')).rejects.toThrow(
        'Lambda invocation failed'
      );
    });

    it('should include AWS4 Authorization header in the request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const id = await adapter.sendMessage('my-function', 'Test sig');

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toMatch(/^AWS4-HMAC-SHA256/);
      expect(opts.headers['x-amz-date']).toBeTruthy();
    });

    it('should include the region in the Lambda endpoint URL', async () => {
      const cfg = makeConfig({
        config: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI',
          region: 'ap-southeast-1',
          defaultLambda: 'my-fn',
        },
      });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('{}'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(cfg, makeDeps());
      await adapter.sendMessage('my-fn', 'Regional test');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('lambda.ap-southeast-1.amazonaws.com');
    });
  });

  // ── isHealthy() ───────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('should return false before start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      expect(adapter.isHealthy()).toBe(false);
    });

    it('should return true after start', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should return false after stop', async () => {
      await adapter.init(makeConfig(), makeDeps());
      await adapter.start();
      await adapter.stop();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  // ── testConnection() ─────────────────────────────────────────────

  describe('testConnection()', () => {
    const stsSuccessXml = `
      <GetCallerIdentityResponse>
        <GetCallerIdentityResult>
          <Arn>arn:aws:iam::123456789012:user/Alice</Arn>
          <Account>123456789012</Account>
          <UserId>AIDIODR4TAW7CSEXAMPLE</UserId>
        </GetCallerIdentityResult>
      </GetCallerIdentityResponse>
    `;

    it('should return ok=true with ARN and Account from STS', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(stsSuccessXml),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('arn:aws:iam::123456789012:user/Alice');
      expect(result.message).toContain('123456789012');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('sts.us-east-1.amazonaws.com');
      expect(url).toContain('GetCallerIdentity');
    });

    it('should include the region in the STS endpoint URL', async () => {
      const cfg = makeConfig({
        config: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI',
          region: 'eu-central-1',
        },
      });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(stsSuccessXml),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(cfg, makeDeps());
      await adapter.testConnection();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('sts.eu-central-1.amazonaws.com');
    });

    it('should return ok=false when STS returns a non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('<Error><Code>InvalidClientTokenId</Code></Error>'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('AWS STS error');
    });

    it('should return ok=false when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network error');
    });

    it('should return "unknown" for ARN and Account when XML tags are absent', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<NoArnsHere/>'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.init(makeConfig(), makeDeps());
      const result = await adapter.testConnection();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('unknown');
    });
  });
});
