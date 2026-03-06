import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudWatchProvider } from './cloudwatch.js';
import type { SiemEvent } from './siem-forwarder.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeEvent(overrides: Partial<SiemEvent> = {}): SiemEvent {
  return {
    timestamp: '2026-03-05T00:00:00.000Z',
    source: 'audit-chain',
    event: 'auth_failure',
    severity: 'high',
    message: 'Auth failed',
    metadata: {},
    ...overrides,
  };
}

describe('CloudWatchProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should send events with SigV4 auth', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new CloudWatchProvider({
      region: 'us-east-1',
      logGroupName: '/secureyeoman/audit',
      logStreamName: 'siem-events',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret123',
    });

    await provider.send([makeEvent()]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://logs.us-east-1.amazonaws.com/');
    expect(opts.headers['X-Amz-Target']).toBe('Logs_20140328.PutLogEvents');
    expect(opts.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256/);

    const body = JSON.parse(opts.body);
    expect(body.logGroupName).toBe('/secureyeoman/audit');
    expect(body.logStreamName).toBe('siem-events');
    expect(body.logEvents).toHaveLength(1);
  });

  it('should include session token when provided', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new CloudWatchProvider({
      region: 'us-east-1',
      logGroupName: 'lg',
      logStreamName: 'ls',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret',
      sessionToken: 'session123',
    });

    await provider.send([makeEvent()]);
    expect(mockFetch.mock.calls[0][1].headers['X-Amz-Security-Token']).toBe('session123');
  });

  it('should throw on non-OK response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad request' });
    const provider = new CloudWatchProvider({
      region: 'us-east-1',
      logGroupName: 'lg',
      logStreamName: 'ls',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'secret',
    });

    await expect(provider.send([makeEvent()])).rejects.toThrow(
      'CloudWatch PutLogEvents returned 400'
    );
  });

  it('should throw when credentials are missing', async () => {
    const provider = new CloudWatchProvider({
      region: 'us-east-1',
      logGroupName: 'lg',
      logStreamName: 'ls',
    });

    // Clear env vars that might be set
    const origKey = process.env.AWS_ACCESS_KEY_ID;
    const origSecret = process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    try {
      await expect(provider.send([makeEvent()])).rejects.toThrow('AWS credentials required');
    } finally {
      if (origKey) process.env.AWS_ACCESS_KEY_ID = origKey;
      if (origSecret) process.env.AWS_SECRET_ACCESS_KEY = origSecret;
    }
  });
});
