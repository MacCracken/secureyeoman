import { describe, it, expect, vi, beforeEach } from 'vitest';
import { manualDiscover, mdnsDiscover } from './discovery.js';

describe('manualDiscover', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array for no URLs', async () => {
    const peers = await manualDiscover([]);
    expect(peers).toEqual([]);
  });

  it('discovers a peer that responds with valid data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'peer-1',
        name: 'Test Peer',
        publicKey: 'pk-abc123',
        capabilities: [{ name: 'chat', description: 'Chat capability', version: '1.0' }],
      }),
    } as Response);

    const peers = await manualDiscover(['https://peer.example.com']);
    expect(peers).toHaveLength(1);
    expect(peers[0]!.id).toBe('peer-1');
    expect(peers[0]!.name).toBe('Test Peer');
    expect(peers[0]!.url).toBe('https://peer.example.com');
    expect(peers[0]!.trustLevel).toBe('untrusted');
    expect(peers[0]!.status).toBe('online');
    expect(peers[0]!.capabilities).toHaveLength(1);
  });

  it('skips peers that return non-ok responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
    } as Response);

    const peers = await manualDiscover(['https://peer.example.com']);
    expect(peers).toHaveLength(0);
  });

  it('skips unreachable peers (fetch throws)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const peers = await manualDiscover(['https://unreachable.example.com']);
    expect(peers).toHaveLength(0);
  });

  it('handles missing capabilities gracefully (defaults to empty array)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'peer-2',
        name: 'No Caps Peer',
        publicKey: 'pk-xyz',
        // capabilities omitted
      }),
    } as Response);

    const peers = await manualDiscover(['https://peer.example.com']);
    expect(peers).toHaveLength(1);
    expect(peers[0]!.capabilities).toEqual([]);
  });

  it('discovers multiple peers from multiple URLs', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'p1', name: 'Peer 1', publicKey: 'pk1', capabilities: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'p2', name: 'Peer 2', publicKey: 'pk2', capabilities: [] }),
      } as Response);

    const peers = await manualDiscover(['https://peer1.com', 'https://peer2.com']);
    expect(peers).toHaveLength(2);
    expect(peers[0]!.id).toBe('p1');
    expect(peers[1]!.id).toBe('p2');
  });

  it('continues after one failed peer', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'p2', name: 'Peer 2', publicKey: 'pk2', capabilities: [] }),
      } as Response);

    const peers = await manualDiscover(['https://bad.com', 'https://good.com']);
    expect(peers).toHaveLength(1);
    expect(peers[0]!.id).toBe('p2');
  });
});

describe('mdnsDiscover', () => {
  it('returns empty array (placeholder)', async () => {
    const peers = await mdnsDiscover();
    expect(peers).toEqual([]);
  });
});
