import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SplunkHecProvider } from './splunk-hec.js';
import type { SiemEvent } from './siem-forwarder.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeEvent(overrides: Partial<SiemEvent> = {}): SiemEvent {
  return {
    timestamp: '2026-03-05T00:00:00.000Z',
    source: 'audit-chain',
    event: 'auth_failure',
    severity: 'high',
    message: 'Authentication failed',
    metadata: { ip: '1.2.3.4' },
    traceId: 'trace-1',
    spanId: 'span-1',
    ...overrides,
  };
}

describe('SplunkHecProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should send events to HEC endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new SplunkHecProvider({
      endpoint: 'https://splunk.local:8088/services/collector/event',
      token: 'test-token',
      index: 'main',
    });

    await provider.send([makeEvent()]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://splunk.local:8088/services/collector/event');
    expect(opts.headers.Authorization).toBe('Splunk test-token');
    const body = JSON.parse(opts.body);
    expect(body.event.event_type).toBe('auth_failure');
    expect(body.index).toBe('main');
  });

  it('should send multiple events as newline-delimited JSON', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new SplunkHecProvider({
      endpoint: 'https://splunk.local:8088/services/collector/event',
      token: 'tok',
    });

    await provider.send([makeEvent(), makeEvent({ event: 'auth_success' })]);

    const body = mockFetch.mock.calls[0][1].body;
    const lines = body.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('should throw on non-OK response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' });
    const provider = new SplunkHecProvider({
      endpoint: 'https://splunk.local:8088/services/collector/event',
      token: 'bad-tok',
    });

    await expect(provider.send([makeEvent()])).rejects.toThrow('Splunk HEC returned 403');
  });

  it('should use custom sourcetype when provided', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new SplunkHecProvider({
      endpoint: 'https://splunk.local:8088/services/collector/event',
      token: 'tok',
      sourceType: 'secureyeoman:audit',
    });

    await provider.send([makeEvent()]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sourcetype).toBe('secureyeoman:audit');
  });
});
