import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureSentinelProvider } from './azure-sentinel.js';
import type { SiemEvent } from './siem-forwarder.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeEvent(overrides: Partial<SiemEvent> = {}): SiemEvent {
  return {
    timestamp: '2026-03-05T00:00:00.000Z',
    source: 'audit-chain',
    event: 'config_changed',
    severity: 'medium',
    message: 'Config updated',
    metadata: {},
    ...overrides,
  };
}

describe('AzureSentinelProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should send events to Data Collection API', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new AzureSentinelProvider({
      endpoint: 'https://dce.ingest.monitor.azure.com',
      ruleId: 'dcr-123',
      streamName: 'Custom-Events_CL',
      bearerToken: 'token123',
    });

    await provider.send([makeEvent()]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('dcr-123');
    expect(url).toContain('Custom-Events_CL');
    expect(opts.headers.Authorization).toBe('Bearer token123');

    const body = JSON.parse(opts.body);
    expect(body).toHaveLength(1);
    expect(body[0].DeviceVendor).toBe('SecureYeoman');
    expect(body[0].DeviceEventClassID).toBe('config_changed');
    expect(body[0].Severity).toBe(5); // medium = 5
  });

  it('should throw on non-OK response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' });
    const provider = new AzureSentinelProvider({
      endpoint: 'https://dce.ingest.monitor.azure.com',
      ruleId: 'dcr-123',
      streamName: 'Custom-Events_CL',
      bearerToken: 'bad',
    });

    await expect(provider.send([makeEvent()])).rejects.toThrow('Azure Sentinel API returned 403');
  });

  it('should map CEF severity correctly', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = new AzureSentinelProvider({
      endpoint: 'https://dce.ingest.monitor.azure.com',
      ruleId: 'r',
      streamName: 's',
      bearerToken: 't',
    });

    await provider.send([makeEvent({ severity: 'critical' })]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body[0].Severity).toBe(10);
  });
});
