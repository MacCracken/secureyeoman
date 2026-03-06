import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElasticEcsProvider } from './elastic-ecs.js';
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
    metadata: {},
    traceId: 'trace-1',
    ...overrides,
  };
}

describe('ElasticEcsProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should send events via bulk API with API key auth', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new ElasticEcsProvider({
      endpoint: 'https://es.local:9200',
      index: 'secureyeoman-events',
      apiKey: 'base64key',
    });

    await provider.send([makeEvent()]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://es.local:9200/_bulk');
    expect(opts.headers.Authorization).toBe('ApiKey base64key');
    expect(opts.headers['Content-Type']).toBe('application/x-ndjson');

    const lines = opts.body.trim().split('\n');
    expect(lines).toHaveLength(2); // index action + doc
    const indexLine = JSON.parse(lines[0]);
    expect(indexLine.index._index).toBe('secureyeoman-events');
    const doc = JSON.parse(lines[1]);
    expect(doc['event.action']).toBe('auth_failure');
    expect(doc['event.severity']).toBe(3); // high = 3
    expect(doc['trace.id']).toBe('trace-1');
  });

  it('should support basic auth', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new ElasticEcsProvider({
      endpoint: 'https://es.local:9200',
      index: 'idx',
      username: 'elastic',
      password: 'changeme',
    });

    await provider.send([makeEvent()]);
    const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
    expect(authHeader).toMatch(/^Basic /);
  });

  it('should throw on non-OK response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const provider = new ElasticEcsProvider({
      endpoint: 'https://es.local:9200',
      index: 'idx',
    });

    await expect(provider.send([makeEvent()])).rejects.toThrow(
      'Elasticsearch bulk API returned 401'
    );
  });

  it('should map severity levels correctly', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new ElasticEcsProvider({
      endpoint: 'https://es.local:9200',
      index: 'idx',
    });

    await provider.send([makeEvent({ severity: 'critical' })]);
    const doc = JSON.parse(mockFetch.mock.calls[0][1].body.trim().split('\n')[1]);
    expect(doc['event.severity']).toBe(4);
  });
});
