import type { PeerAgent } from './types.js';

/**
 * Manual discovery — ping peer URLs and exchange info
 */
export async function manualDiscover(urls: string[]): Promise<PeerAgent[]> {
  const peers: PeerAgent[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(`${url}/.well-known/a2a-agent`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          id: string;
          name: string;
          publicKey: string;
          capabilities: { name: string; description: string; version: string }[];
        };
        peers.push({
          id: data.id,
          name: data.name,
          url,
          publicKey: data.publicKey,
          trustLevel: 'untrusted',
          capabilities: data.capabilities ?? [],
          lastSeen: Date.now(),
          status: 'online',
        });
      }
    } catch {
      // Skip unreachable peers
    }
  }
  return peers;
}

/**
 * mDNS discovery — placeholder (requires OS-level multicast)
 */
export async function mdnsDiscover(): Promise<PeerAgent[]> {
  // mDNS discovery requires platform-specific multicast DNS support.
  // This is a placeholder that returns empty results.
  // A full implementation would broadcast/listen for _friday-a2a._tcp service.
  return [];
}
