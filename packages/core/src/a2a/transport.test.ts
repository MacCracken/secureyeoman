import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteDelegationTransport } from './transport.js';
import type { PeerAgent, A2AMessage } from './types.js';

const PEER: PeerAgent = {
  id: 'peer-1',
  name: 'Test Peer',
  url: 'https://peer.example.com',
  publicKey: 'pk-abc',
  trustLevel: 'verified',
  capabilities: [],
  lastSeen: 1000,
  status: 'online',
};

const MESSAGE: A2AMessage = {
  id: 'msg-1',
  type: 'a2a:delegate',
  fromPeerId: 'local',
  toPeerId: 'peer-1',
  payload: { task: 'do something' },
  timestamp: 1000,
};

function makeLogger() {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

describe('RemoteDelegationTransport.send', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when peer responds with ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const transport = new RemoteDelegationTransport({ logger: makeLogger() as any });
    const result = await transport.send(PEER, MESSAGE);
    expect(result).toBe(true);
  });

  it('sends POST to peer URL /api/v1/a2a/receive', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const transport = new RemoteDelegationTransport({ logger: makeLogger() as any });
    await transport.send(PEER, MESSAGE);
    expect(fetch).toHaveBeenCalledWith(
      'https://peer.example.com/api/v1/a2a/receive',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns false when peer responds with non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    const transport = new RemoteDelegationTransport({ logger: makeLogger() as any });
    const result = await transport.send(PEER, MESSAGE);
    expect(result).toBe(false);
  });

  it('returns false and logs warning when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const logger = makeLogger();
    const transport = new RemoteDelegationTransport({ logger: logger as any });
    const result = await transport.send(PEER, MESSAGE);
    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('sends JSON payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    const transport = new RemoteDelegationTransport({ logger: makeLogger() as any });
    await transport.send(PEER, MESSAGE);
    const call = vi.mocked(fetch).mock.calls[0]!;
    const body = call[1]?.body as string;
    expect(() => JSON.parse(body)).not.toThrow();
    const parsed = JSON.parse(body);
    expect(parsed.id).toBe('msg-1');
    expect(parsed.type).toBe('a2a:delegate');
  });
});
